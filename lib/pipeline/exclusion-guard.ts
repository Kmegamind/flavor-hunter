/**
 * Exclusion guard — the other half of the hole `guardReason` covers.
 *
 * `guardReason` stops prose from asserting a quantity nobody verified. Nothing was watching
 * the mirror-image failure: an exclusion that gets extracted and then quietly ignored.
 *
 * The case that motivated it is real and is one of the shipped examples:
 *
 *     "...not a Thai restaurant with a couple of Lao dishes on the menu."
 *
 * Read carelessly that sentence mentions Thai food, and a parser that lets "Thai" reach a
 * positive anchor will rank Thai restaurants **up** — the precise opposite of the request. In
 * Washington DC, where a lot of Lao cooking is sold under Thai signage, that is not an edge
 * case; it is the main failure path for that query, and it fails while looking like it worked.
 *
 * Two assertions, at the two points where the failure could enter:
 *
 *   1. after parsing  — no excluded term may appear in a positive anchor
 *   2. after evidence — a candidate whose text matches an exclusion must carry `excluded_by`
 *
 * Violations are repaired, not thrown. A hunt that half-works is more useful than a stack
 * trace, and the repair is logged so the failure is visible rather than absorbed.
 */
import type { AnchorSet, EvidenceLine, ParsedEnvelope, RankedCandidate } from "@/schemas"

/** Anchors a user could plausibly be excluding — the ones an exclusion could contaminate. */
const POSITIVE_KEYS = [
  "dish",
  "cuisine",
  "substyle",
  "person",
  "setting",
  "ritual",
  "benchmark",
] as const

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9㐀-鿿]+/g, " ").trim()
}

function wordIn(haystack: string, needle: string): boolean {
  if (needle.length < 3) return false
  return new RegExp(`(^| )${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( |$)`).test(haystack)
}

/**
 * Do these two strings refer to the same excluded thing?
 *
 * Checked in **both directions**, because an exclusion is usually a phrase while the anchor it
 * contaminates is one word inside it: the user writes "not a Thai restaurant" and the parser
 * files `cuisine: "Thai"`. A one-way check asked whether "Thai" contains "Thai restaurant",
 * which is false, and the contaminated anchor sailed through — the exact bug this module exists
 * to catch, reproduced inside the module meant to catch it.
 *
 * Whole words only. Plain substring matching would fire on "lao" inside "jalapeño" once accents
 * are stripped, and a guard that invents violations is worse than none.
 */
const HEAD_WORDS = 3

/**
 * The excluded thing, not the sentence it was written in.
 *
 * Found in production: the parser returned the whole clause as the exclusion value —
 * `"Thai restaurant with a couple of Lao dishes"` — and because that clause *mentions* Lao,
 * matching against all of it dropped `cuisine: "Lao"`, the very thing the user wanted. The hunt
 * then locked a Korean restaurant at 43% on one evidence line.
 *
 * What is excluded is the head of the phrase: "Thai restaurant". Everything after it is the
 * user explaining what they mean, and it routinely names the thing they *do* want.
 */
function exclusionHead(value: string): string {
  return norm(value).split(" ").slice(0, HEAD_WORDS).join(" ")
}

function containsTerm(a: string, b: string): boolean {
  const x = norm(a)
  const y = exclusionHead(b)
  if (!x || !y) return false
  return wordIn(x, y) || wordIn(y, x)
}

export type ExclusionViolation = { where: string; anchor: string; term: string }

/**
 * Assertion 1 — an excluded term must not be sitting in a positive anchor.
 *
 * Returns the cleaned envelope plus whatever it had to strip, so the caller can log it.
 */
export function enforceExclusions(parsed: ParsedEnvelope): {
  parsed: ParsedEnvelope
  violations: ExclusionViolation[]
} {
  const exclusions = parsed.anchors.negation ?? []
  if (exclusions.length === 0) return { parsed, violations: [] }

  const violations: ExclusionViolation[] = []
  const anchors: AnchorSet = { ...parsed.anchors }

  for (const key of POSITIVE_KEYS) {
    const cv = anchors[key]
    if (!cv || typeof cv !== "object" || !("value" in cv)) continue
    for (const ex of exclusions) {
      if (!containsTerm(cv.value, ex.value)) continue
      violations.push({ where: "anchor", anchor: key, term: ex.value })
      // Drop the contaminated anchor rather than the exclusion: the user said what they did
      // not want, and that statement is the more reliable of the two.
      ;(anchors as Record<string, unknown>)[key] = null
      break
    }
  }

  anchors.sensory = anchors.sensory.filter((s) => {
    const bad = exclusions.find((ex) => containsTerm(s.value, ex.value))
    if (bad) violations.push({ where: "sensory", anchor: "sensory", term: bad.value })
    return !bad
  })

  anchors.query_variants = (anchors.query_variants ?? []).filter((v) => {
    const bad = exclusions.find((ex) => containsTerm(v, ex.value))
    if (bad) violations.push({ where: "query_variants", anchor: "query_variants", term: bad.value })
    return !bad
  })

  // A ladder rung that offers the excluded thing back is the substitution version of the same
  // mistake: "you didn't want a Thai restaurant — how about a Thai restaurant?"
  anchors.fallback_ladder = (anchors.fallback_ladder ?? []).filter((r) => {
    const label = `${r.dish ?? ""} ${r.cuisine ?? ""}`
    const bad = exclusions.find((ex) => containsTerm(label, ex.value))
    if (bad) violations.push({ where: "fallback_ladder", anchor: "fallback_ladder", term: bad.value })
    return !bad
  })

  return { parsed: { ...parsed, anchors }, violations }
}

/**
 * Assertion 2 — a candidate that matches an exclusion must be marked.
 *
 * Checks the candidate's own name and its verified evidence, which is all the text the server
 * is allowed to hold at this point. A match without `excluded_by` gets one, so the interface
 * can show the user why a place they might have expected is not the answer.
 */
export function markExcludedCandidates(
  parsed: ParsedEnvelope,
  ranked: RankedCandidate[],
): { ranked: RankedCandidate[]; marked: number } {
  const exclusions = parsed.anchors.negation ?? []
  if (exclusions.length === 0) return { ranked, marked: 0 }

  let marked = 0
  const out = ranked.map((c) => {
    if (c.excluded_by) return c
    const hay = [c.name, ...c.evidence.map((e: EvidenceLine) => e.quote)].join(" · ")
    const hit = exclusions.find((ex) => containsTerm(hay, ex.value))
    if (!hit) return c
    marked += 1
    return { ...c, excluded_by: `excluded: ${hit.value}` }
  })
  return { ranked: out, marked }
}
