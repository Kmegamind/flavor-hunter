import type { EvidenceLine, ParsedEnvelope, RankedCandidate } from "@/schemas"
import { filterWebsiteQuotes, memoryMatch, rubricWeights } from "@/schemas/score"
import type { InternalCandidate } from "@/lib/pipeline/fixture-data"
import { toPolar } from "@/lib/pipeline/polar"
import { geminiGenerate, geminiKey } from "@/lib/pipeline/gemini"
import { matchReviewPhrases } from "@/lib/pipeline/review-match"
import { redditEvidence } from "@/lib/pipeline/reddit-corpus"
import { hasCjk } from "@/lib/pipeline/english-labels"
import { readFileSync } from "fs"
import { join } from "path"

function hostOf(website?: string): string {
  if (!website) return "restaurant website"
  try {
    const host = new URL(website).host
    if (host.endsWith(".invalid")) return "restaurant website"
    return host
  } catch {
    return "restaurant website"
  }
}

function evidencePrompt(): string {
  try {
    return readFileSync(join(process.cwd(), "prompts/evidence.md"), "utf8")
  } catch {
    return "Quote verbatim substrings of menu_text only."
  }
}

function heuristicWebsiteQuotes(parsed: ParsedEnvelope, menu: string) {
  const guesses: { anchor: string; quote: string }[] = []
  const tryAdd = (anchor: string, quote: string | undefined | null) => {
    if (quote && menu.includes(quote) && !guesses.some((g) => g.quote === quote && g.anchor === anchor)) {
      guesses.push({ anchor, quote })
    }
  }
  tryAdd("dish", parsed.anchors.dish?.value)
  tryAdd("cuisine", parsed.anchors.cuisine?.value)
  tryAdd("substyle", parsed.anchors.substyle?.value)
  tryAdd("ritual", parsed.anchors.ritual?.value)
  tryAdd("setting", parsed.anchors.setting?.value)
  tryAdd("person", parsed.anchors.person?.value)
  tryAdd("benchmark", parsed.anchors.benchmark?.value)
  for (const s of parsed.anchors.sensory) tryAdd("sensory", s.value)
  for (const v of parsed.anchors.query_variants ?? []) {
    if (hasCjk(v)) continue
    tryAdd("dish", v)
  }
  if (parsed.anchors.substyle && menu.includes("operators from Hunan")) {
    tryAdd("substyle", "operators from Hunan")
  }
  if (parsed.anchors.direction === "family_home") {
    tryAdd("direction", "home-style")
    tryAdd("direction", "home cooking")
  }
  return filterWebsiteQuotes(guesses, menu)
}

/**
 * What each anchor is worth, highest first, for the evidence call to read.
 *
 * The scoring rubric already lived in `schemas/score.ts`, but the model doing the looking had
 * no idea it existed. It spent equal effort on `dish` (30 points) and `price_band` (a quarter
 * of a 20-point group, so 4), and with one batched call across up to eight candidates that
 * attention is a real budget being spent evenly on unequal things.
 *
 * This is search order, not a reward signal — see the "Where to spend your attention" section
 * of prompts/evidence.md, which is emphatic that a missing high-weight quote beats an invented
 * one. Byte-verification remains the backstop either way.
 */
function anchorPriority(parsed: ParsedEnvelope) {
  return rubricWeights(parsed.anchors)
    .map((r) => ({ anchor: r.key, points: Math.round(r.weight * 10) / 10 }))
    .sort((a, b) => b.points - a.points)
}

/** LLM payload: website + Places metadata only. Review bodies must never appear. */
export function evidenceLlmUserPayload(parsed: ParsedEnvelope, candidates: InternalCandidate[]) {
  return {
    anchors: parsed.anchors,
    anchor_priority: anchorPriority(parsed),
    candidates: candidates.map((c) => ({
      id: c.id,
      name: c.name,
      places_meta: { types: c.types, price_level: c.price_level ?? null },
      menu_text: c.menu_text,
    })),
  }
}

/**
 * Drop exact (anchor, quote) duplicates, keep everything else.
 *
 * Replaces `preferLatinQuotes`, which kept exactly one line per anchor and so made
 * "3 reviews say it tastes like home" structurally impossible to produce — the aggregate
 * claim is the emotional core of the product's "why this one". Website lines sort ahead of
 * review lines; within an anchor, original order is preserved.
 */
function dedupeEvidence(lines: EvidenceLine[]): EvidenceLine[] {
  const seen = new Set<string>()
  const out: EvidenceLine[] = []
  const rank = (e: EvidenceLine) =>
    e.source === "website" ? 0 : e.source === "places_meta" ? 1 : e.source === "reddit" ? 2 : 3
  for (const e of [...lines].sort((a, b) => rank(a) - rank(b))) {
    const key = `${e.anchor}\u0000${e.quote}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(e)
  }
  return out
}

export async function scoreCandidates(
  parsed: ParsedEnvelope,
  candidates: InternalCandidate[],
  center: { lat: number; lng: number },
  cityLabel = "",
): Promise<RankedCandidate[]> {
  const fetched_at = new Date().toISOString()
  const key = geminiKey()
  let llmQuotes: Record<string, { anchor: string; quote: string; quote_en?: string }[]> = {}

  if (key) {
    try {
      llmQuotes = await callEvidenceLlm(parsed, candidates)
    } catch {
      llmQuotes = {}
    }
  }

  const ranked: RankedCandidate[] = candidates.map((c) => {
    const polar = toPolar(center, { lat: c.lat, lng: c.lng })
    const fromLlm = filterWebsiteQuotes(llmQuotes[c.id] ?? [], c.menu_text)
    const fromHeu = heuristicWebsiteQuotes(parsed, c.menu_text)
    const websiteLines: EvidenceLine[] = [
      ...fromLlm.map((q) => ({
        anchor: q.anchor,
        quote: q.quote,
        ...(q.quote_en ? { quote_en: q.quote_en } : {}),
        source: "website" as const,
        mechanism: "llm_extracted" as const,
        source_name: hostOf(c.website),
        fetched_at,
        verified: true as const,
      })),
      ...fromHeu
        .filter((q) => !fromLlm.some((m) => m.quote === q.quote && m.anchor === q.anchor))
        .map((q) => ({
          anchor: q.anchor,
          quote: q.quote,
          source: "website" as const,
          mechanism: "deterministic_match" as const,
          source_name: hostOf(c.website),
          fetched_at,
          verified: true as const,
        })),
    ]
    const reviewLines = matchReviewPhrases(parsed, c.reviews, fetched_at, c.name)
    const redditLines = redditEvidence(c.name, cityLabel, fetched_at)
    const evidence = dedupeEvidence([...websiteLines, ...reviewLines, ...redditLines])
    const score = memoryMatch(parsed.anchors, evidence)
    return {
      id: c.id,
      name: c.name,
      distance: Math.round(polar.distance * 10) / 10,
      bearing: Math.round(polar.bearing),
      score,
      limited_evidence: !c.website || !c.menu_text,
      ...(c.address ? { address: c.address } : {}),
      evidence,
    }
  })

  ranked.sort((a, b) => {
    if (a.score === null && b.score === null) return 0
    if (a.score === null) return 1
    if (b.score === null) return -1
    return b.score - a.score
  })
  return ranked
}

async function callEvidenceLlm(
  parsed: ParsedEnvelope,
  candidates: InternalCandidate[],
): Promise<Record<string, { anchor: string; quote: string; quote_en?: string }[]>> {
  const text = await geminiGenerate(
    evidencePrompt(),
    JSON.stringify(evidenceLlmUserPayload(parsed, candidates)),
    2000,
  )
  if (!text) return {}
  const start = text.indexOf("[")
  const end = text.lastIndexOf("]")
  if (start < 0) return {}
  const arr = JSON.parse(text.slice(start, end + 1)) as {
    id: string
    evidence?: { anchor: string; quote: string; quote_en?: string }[]
  }[]
  const map: Record<string, { anchor: string; quote: string; quote_en?: string }[]> = {}
  for (const item of arr) map[item.id] = item.evidence ?? []
  return map
}
