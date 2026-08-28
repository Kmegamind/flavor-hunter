import { HuntRequest, type HuntEvent, type ParsedEnvelope, type SubstituteOffer } from "@/schemas"
import { gate } from "@/lib/pipeline/gate"
import { parseMemory } from "@/lib/pipeline/parse"
import { huntCandidates, probeNearbyName } from "@/lib/pipeline/hunt"
import { scoreCandidates } from "@/lib/pipeline/evidence"
import { writeReason } from "@/lib/pipeline/reason"
import { unmatchedAnchors } from "@/schemas/score"
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
  const parsed0 = await parseMemory(req.memory_text, req.locale, req.city_label)
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

  const ranked = await scoreCandidates(parsed, candidates, center, req.city_label)
  const anyScore = ranked.some((r) => r.score !== null)

  if (!anyScore) {
    const next = nextRangeMi(req.range_mi)
    if (next !== null) {
      send({
        type: "widen",
        from_mi: req.range_mi,
        to_mi: next,
        why: "nothing within range clears the evidence bar",
        applied: false,
      })
    } else {
      send({
        type: "widen",
        from_mi: req.range_mi,
        to_mi: null,
        why: "nothing within range clears the evidence bar",
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
    return
  }

  // Agent ③ — write the reason for the top candidate only. Ranks 2+ get the
  // deterministic template, which needs no call.
  const withReason = await attachReasons(parsed, ranked)
  send({ type: "locked", ranked: withReason })
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
