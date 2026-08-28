import type { EvidenceLine, ParsedEnvelope } from "@/schemas"
import { hasCjk } from "@/lib/pipeline/english-labels"
import { clueNeedles } from "@/lib/pipeline/clue-lexicon"

const SCALAR_KEYS = ["dish", "cuisine", "substyle", "person", "setting", "ritual", "benchmark"] as const

const MAX_QUOTE = 110

/**
 * Grow a match out to its surrounding clause.
 *
 * A needle-length span reads as a fragment: matching "home-style" yields the quote
 * "home-style", where what the reader wants is "tastes like the one my mom made". The
 * returned string is still a literal slice of `hay`, so byte-verification is unaffected —
 * only the window changed.
 */
function expandToClause(hay: string, start: number, end: number): string {
  const isBreak = (c: string) => c === "." || c === "!" || c === "?" || c === "\n" || c === ";"
  // Walk to the real sentence boundaries first, with no cap. Capping relative to the
  // needle made the window slide: two needles inside one clause produced two slightly
  // different quotes that exact-match dedupe could not collapse, and both started
  // mid-word. Boundaries first, truncation second, so the window is the same wherever
  // in the clause the match landed.
  let a = start
  let b = end
  while (a > 0 && !isBreak(hay[a - 1])) a--
  while (b < hay.length && !isBreak(hay[b])) b++
  const clause = hay.slice(a, b).trim()
  if (clause.length <= MAX_QUOTE) return clause
  const cut = clause.slice(0, MAX_QUOTE)
  const lastSpace = cut.lastIndexOf(" ")
  return (lastSpace > MAX_QUOTE * 0.6 ? cut.slice(0, lastSpace) : cut).trim()
}

function spanIn(hay: string, needle: string): string | null {
  if (!needle) return null
  const i = hay.toLowerCase().indexOf(needle.toLowerCase())
  if (i < 0) return null
  return expandToClause(hay, i, i + needle.length)
}

function phrases(parsed: ParsedEnvelope): { anchor: string; value: string }[] {
  const out: { anchor: string; value: string }[] = []
  for (const k of SCALAR_KEYS) {
    const v = parsed.anchors[k]
    if (v && "value" in v && v.value) out.push({ anchor: k, value: v.value })
  }
  for (const s of parsed.anchors.sensory) out.push({ anchor: "sensory", value: s.value })
  for (const q of parsed.anchors.query_variants ?? []) {
    if (hasCjk(q)) continue
    out.push({ anchor: parsed.anchors.dish ? "dish" : "cuisine", value: q })
  }
  // Agent 2: phrases the user never typed but that express what they asked for.
  out.push(...clueNeedles(parsed.anchors))
  return out
}

/**
 * Server-side substring match over Place Details reviews (≤5). No LLM (PRD FR-6b, §11.3).
 *
 * Two-pass so the denominator is true. The previous single pass wrote
 * `${lines.length + 1} of ${n}`, where `lines.length` was a running total of evidence lines
 * across *all* anchors — so the third line printed claimed "3 of 5 reviews" even when only
 * one review mentioned it. That is a false quantitative claim, which is exactly the class of
 * error FR-9 exists to prevent. Now: count the reviews that actually contain the phrase,
 * then stamp that count on every line derived from it.
 */
export function matchReviewPhrases(
  parsed: ParsedEnvelope,
  reviews: { text: string; date?: string }[],
  fetched_at: string,
  placeName = "",
): EvidenceLine[] {
  const sliced = reviews.slice(0, 5)
  const n = sliced.length
  if (n === 0) return []

  const lines: EvidenceLine[] = []
  const seen = new Set<string>()

  const nameLower = placeName.toLowerCase()

  for (const { anchor, value } of phrases(parsed)) {
    // A needle contained in the restaurant's own name matches its every mention.
    // "French" against "Emmy French Corner" turned "Emmy French Corner has so many
    // delicious pastries" into cuisine evidence, and that noise pushed a pastry shop
    // above an actual Breton creperie. The name is not evidence about the food.
    if (nameLower && value.length < 24 && nameLower.includes(value.toLowerCase())) continue
    // Pass 1 — which reviews contain this phrase?
    const hits: { span: string; date?: string }[] = []
    for (const rev of sliced) {
      const span = spanIn(rev.text, value)
      if (span) hits.push({ span, date: rev.date })
    }
    if (hits.length === 0) continue

    // Pass 2 — emit every hit, all stamped with the real count.
    const denominator = `${hits.length} of ${n} available review${n === 1 ? "" : "s"}`
    for (const h of hits) {
      const key = `${anchor}\u0000${h.span}`
      if (seen.has(key)) continue
      seen.add(key)
      lines.push({
        anchor,
        quote: h.span,
        source: "google_review",
        mechanism: "deterministic_match",
        source_name: "Google",
        fetched_at,
        ...(h.date ? { source_date: h.date } : {}),
        denominator,
        verified: true,
      })
    }
  }
  return lines
}
