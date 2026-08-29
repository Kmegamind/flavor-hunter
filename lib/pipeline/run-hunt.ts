import { HuntRequest, type HuntEvent, type ParsedEnvelope, type SubstituteOffer } from "@/schemas"
import { gate } from "@/lib/pipeline/gate"
import { parseMemory } from "@/lib/pipeline/parse"
import { huntCandidates, probeNearbyName } from "@/lib/pipeline/hunt"
import { scoreCandidates } from "@/lib/pipeline/evidence"
import { writeReason } from "@/lib/pipeline/reason"
import { unmatchedAnchors } from "@/schemas/score"
import { markExcludedCandidates } from "@/lib/pipeline/exclusion-guard"
import { resolveCenter } from "@/lib/pipeline/geocode"
import { a1LockedRanked } from "@/lib/pipeline/fixture-data"
import { nextRangeMi } from "@/lib/pipeline/search-queries"
import {
  findGroundedRung,
  groundedRelation,
  nextUnusedRung,
  rungSearchQueries,
} from "@/lib/pipeline/ground-substitute"

function applySubstitute(parsed: ParsedEnvelope, sub?: SubstituteOffer): ParsedEnvelope {
  if (!sub?.dish && !sub?.cuisine) return parsed
  const anchors = { ...parsed.anchors }
  if (sub.dish) {
    anchors.dish = { value: sub.dish, confidence: 0.8 }
    anchors.query_variants = [sub.dish]
  }
  if (sub.cuisine) anchors.cuisine = { value: sub.cuisine, confidence: 0.7 }
  return {
    ...parsed,
    category_name: sub.dish ?? sub.cuisine ?? parsed.category_name,
    anchors,
  }
}

export async function streamHunt(
  raw: unknown,
  send: (ev: HuntEvent) => void,
): Promise<void> {
  const req = HuntRequest.parse(raw)
  // The name goes out the moment it exists, not when the whole envelope is ready. Nothing
  // downstream depends on the user having seen it, so there is no reason to make them wait
  // for the mapping call as well.
  const parsed0 = await parseMemory(req.memory_text, req.locale, req.city_label, (i) =>
    send({
      type: "interpreted",
      category_name: i.category_name,
      category_name_native: i.category_name_native ?? null,
      confidence: i.category_confidence,
      reasoning: i.reasoning,
    }),
  )
  const parsed = applySubstitute(gate(req, parsed0), req.substitute)

  send({
    type: "parsed",
    category_name: parsed.category_name,
    confidence: parsed.category_confidence,
    anchors: parsed.anchors,
    searchable: parsed.searchable,
    missing_required: parsed.missing_required,
  })

  if (!parsed.searchable) {
    send({ type: "need_clue", missing_required: parsed.missing_required })
    return
  }

  if (!req.confirmed) return

  const center = await resolveCenter(req.city_label, req.coords)
  const { candidates } = await huntCandidates(
    parsed,
    req.city_label,
    req.range_mi,
    center,
    send,
    req.substitute,
  )

  const scored = await scoreCandidates(parsed, candidates, center, req.city_label)
  const guard = markExcludedCandidates(parsed, scored)
  if (guard.marked > 0) {
    console.warn(`[exclusions] ${guard.marked} candidate(s) matched an exclusion and were marked`)
  }
  const ranked = guard.ranked
/**
 * Below this, the best candidate is not an answer.
 *
 * The condition used to be "did anything score at all", which meant a single weak evidence
 * line was enough to present a 25% match as the result. A quarter of what someone asked for
 * is indistinguishable from a miss, and dressing it up as a locked target is the same failure
 * as inventing a number — it just hides behind arithmetic that happens to be correct.
 *
 * At or above the bar the ranking is shown as usual. Below it the two doors come first, and
 * the near-misses are still listed underneath: the honest reading is "nothing here really
 * matches, and here is the closest thing anyway", not silence.
 */
const CONFIDENT_MATCH = 50

  const best = ranked.reduce<number>((m, r) => (r.score !== null && r.score > m ? r.score : m), 0)
  const anyScore = ranked.some((r) => r.score !== null)
  const confident = anyScore && best >= CONFIDENT_MATCH

  if (!confident) {
    const next = nextRangeMi(req.range_mi)
    if (next !== null) {
      send({
        type: "widen",
        from_mi: req.range_mi,
        to_mi: next,
        why: whyText(best, anyScore, req.range_mi),
        applied: false,
      })
    } else {
      send({
        type: "widen",
        from_mi: req.range_mi,
        to_mi: null,
        why: whyText(best, anyScore, req.range_mi),
        applied: false,
      })
    }
    const from = parsed.anchors.dish?.value ?? parsed.category_name
    const local = findGroundedRung(parsed, candidates, req.substitute)
    if (local) {
      send({
        type: "substitute",
        from,
        to: {
          ...(local.rung.dish ? { dish: local.rung.dish } : {}),
          ...(local.rung.cuisine ? { cuisine: local.rung.cuisine } : {}),
          relation: groundedRelation(from, local.hit.name),
        },
        applied: false,
      })
      return
    }
    const rung = nextUnusedRung(parsed, req.substitute)
    if (rung) {
      const placeName = await probeNearbyName(rungSearchQueries(rung), center, req.range_mi)
      if (placeName) {
        send({
          type: "substitute",
          from,
          to: {
            ...(rung.dish ? { dish: rung.dish } : {}),
            ...(rung.cuisine ? { cuisine: rung.cuisine } : {}),
            relation: groundedRelation(from, placeName),
          },
          applied: false,
        })
      }
    }
    // Option B: the doors come first, but the near-misses are still shown. Withholding them
    // would be a different kind of dishonesty — the user asked a question and there *is* a
    // closest answer, it simply is not a good one.
    if (anyScore) {
      const withReason = await attachReasons(parsed, ranked)
      send({ type: "locked", ranked: withReason, below_bar: true, best_score: best })
    }
    return
  }

  // Lock first, explain second.
  //
  // Agent 3 is the slowest call in the pipeline and the only one whose output nothing else
  // depends on. Awaiting it before `locked` meant the target — the moment the whole hunt has
  // been building to — sat behind five to eight seconds of prose generation. Now the lock
  // lands immediately and the paragraph arrives after it.
  send({ type: "locked", ranked })
  await streamReason(parsed, ranked, send)
}

/** Say what was actually found, not a blanket "nothing". */
function whyText(best: number, anyScore: boolean, rangeMi: number): string {
  if (!anyScore) return `nothing within ${rangeMi} mi has any supporting evidence`
  return `the closest match within ${rangeMi} mi is only ${best}%`
}

async function streamReason(
  parsed: ParsedEnvelope,
  ranked: Awaited<ReturnType<typeof scoreCandidates>>,
  send: (ev: HuntEvent) => void,
): Promise<void> {
  if (ranked.length === 0) return
  const top = ranked[0]
  const gaps = unmatchedAnchors(parsed.anchors, top.evidence).map((g) => ({
    key: g.key,
    label: g.label,
  }))
  const r = await writeReason({
    categoryName: parsed.category_name,
    restaurant: top.name,
    score: top.score,
    evidence: top.evidence,
    gaps,
  })
  send({ type: "reason", id: top.id, reason: r.text, reason_source: r.source })
}

async function attachReasons(
  parsed: ParsedEnvelope,
  ranked: Awaited<ReturnType<typeof scoreCandidates>>,
) {
  if (ranked.length === 0) return ranked
  const out = [...ranked]
  const top = out[0]
  const gaps = unmatchedAnchors(parsed.anchors, top.evidence).map((g) => ({
    key: g.key,
    label: g.label,
  }))
  const r = await writeReason({
    categoryName: parsed.category_name,
    restaurant: top.name,
    score: top.score,
    evidence: top.evidence,
    gaps,
  })
  out[0] = { ...top, reason: r.text, reason_source: r.source }
  return out
}

export async function huntToEvents(raw: unknown): Promise<HuntEvent[]> {
  const events: HuntEvent[] = []
  await streamHunt(raw, (ev) => events.push(ev))
  return events
}

export function dummyParsedEvent(): HuntEvent {
  return {
    type: "parsed",
    category_name: "sweet-style home-cooked tomato and egg",
    confidence: 0.88,
    searchable: true,
    missing_required: [],
    anchors: {
      dish: { value: "tomato and egg", confidence: 0.9 },
      cuisine: { value: "Chinese", confidence: 0.85 },
      substyle: null,
      sensory: [{ value: "sweet", confidence: 0.8 }],
      direction: "family_home",
      person: { value: "grandmother", confidence: 0.9 },
      setting: null,
      price_band: null,
      ritual: null,
      benchmark: null,
      negation: [],
      query_variants: ["tomato and egg", "sweet tomato and egg"],
      fallback_ladder: [],
    },
  }
}

export { a1LockedRanked }
