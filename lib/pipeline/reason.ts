/**
 * Agent ③ (second half) — the Reason Writer.
 *
 * The pipeline could already find a restaurant and compute a score, but nothing wrote the
 * *reason*, and the reason is the product: "94%" is a number, not an answer. This module
 * produces the paragraph under WHY THIS ONE.
 *
 * Two layers, deliberately:
 *   - `templateReason()`  deterministic, assembled from verified evidence lines. Always
 *                         available, always true, needs no API key. This is the floor.
 *   - `writeReason()`     an LLM lift over the same material, gated by `guardReason()`.
 *
 * `guardReason()` exists because prose is the easiest place in the whole system to smuggle
 * in a claim nobody verified. It rejects any paragraph containing a number that is not in
 * the evidence denominators or the score — which is precisely how "seven people said it
 * tastes like home" would appear when only one did.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { EvidenceLine } from "@/schemas"
import { geminiGenerate, geminiKey } from "@/lib/pipeline/gemini"
import { readableQuote } from "@/lib/pipeline/english-labels"

export type ReasonGap = { key: string; label: string }
export type ReasonSource = "written" | "template" | "none"
export type ReasonResult = { text: string; source: ReasonSource }

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
}

/** Every number the prose is allowed to contain. */
export function allowedNumbers(evidence: EvidenceLine[], score: number | null): Set<number> {
  const ok = new Set<number>()
  if (score !== null) ok.add(score)
  for (const e of evidence) {
    for (const m of (e.denominator ?? "").matchAll(/\d+/g)) ok.add(Number(m[0]))
  }
  return ok
}

/**
 * Strip quoted spans before checking numbers.
 *
 * The guard polices the writer's own assertions, not the evidence it cites. A verbatim
 * quotation has already been byte-verified, and review text routinely contains number
 * words — "tastes like the one my mom made" would otherwise trip a check on "one".
 */
export function withoutQuotedSpans(text: string): string {
  return text
    .replace(/“[^”]*”/g, " ")
    .replace(/"[^"]*"/g, " ")
    .replace(/‘[^’]*’/g, " ")
}

/**
 * Reject prose that asserts a quantity the evidence does not support.
 * Digits and spelled-out numbers are both checked, outside quotations.
 */
export function guardReason(
  text: string,
  evidence: EvidenceLine[],
  score: number | null,
): { ok: true } | { ok: false; why: string } {
  const t = text.trim()
  if (!t) return { ok: false, why: "empty" }
  if (t.length > 700) return { ok: false, why: "too long" }
  if (/\b(100%|perfectly|guaranteed)\b/i.test(t)) return { ok: false, why: "overclaims certainty" }

  const ok = allowedNumbers(evidence, score)
  const assertions = withoutQuotedSpans(t)
  for (const m of assertions.matchAll(/\d+/g)) {
    const n = Number(m[0])
    if (!ok.has(n)) return { ok: false, why: `unsupported number ${n}` }
  }
  for (const [word, n] of Object.entries(WORD_NUMBERS)) {
    const re = new RegExp(`\\b${word}\\b`, "i")
    if (re.test(assertions) && !ok.has(n)) {
      return { ok: false, why: `unsupported number word "${word}"` }
    }
  }
  return { ok: true }
}

/** Take the paragraph out of `{"reason": "..."}` if the model wrapped it. */
export function unwrapProse(raw: string): string {
  let s = raw.trim()
  if (s.startsWith("{")) {
    try {
      const obj = JSON.parse(s) as Record<string, unknown>
      const first = Object.values(obj).find((v) => typeof v === "string" && v.trim().length > 0)
      if (typeof first === "string") s = first
    } catch {
      const m = s.match(/"(?:reason|text|paragraph)"\s*:\s*"([\s\S]*?)"\s*}?\s*$/)
      if (m) s = m[1]
    }
  }
  return s.trim().replace(/^["“]|["”]$/g, "").trim()
}

function sentence(s: string): string {
  const t = s.trim()
  if (!t) return ""
  return t.endsWith(".") ? t : `${t}.`
}

/** Deterministic floor. Built only from verified lines, so it cannot overstate. */
export function templateReason(
  evidence: EvidenceLine[],
  gaps: ReasonGap[],
  categoryName: string,
): ReasonResult {
  if (evidence.length === 0) return { text: "Not enough evidence to say why.", source: "none" }

  const parts: string[] = []
  const site = evidence.filter((e) => e.source === "website")
  const reviews = evidence.filter((e) => e.source === "google_review")

  if (site.length > 0) {
    parts.push(sentence(`The restaurant's own page supports ${categoryName}: “${readableQuote(site[0])}”`))
  }
  if (reviews.length > 0) {
    const denom = reviews.find((r) => r.denominator)?.denominator
    const who = denom ? denom.replace(" available", "") : "a review"
    parts.push(sentence(`${who[0].toUpperCase()}${who.slice(1)} describe it the same way: “${readableQuote(reviews[0])}”`))
  }
  if (gaps.length > 0) {
    const labels = gaps.slice(0, 2).map((g) => g.label).join(" or ")
    parts.push(sentence(`No evidence either way on ${labels}`))
  }
  return { text: parts.join(" "), source: "template" }
}

function promptText(): string {
  try {
    return readFileSync(join(process.cwd(), "prompts/reason.md"), "utf8")
  } catch {
    return "Write 2-4 sentences explaining why this restaurant matches. Only claims traceable to the evidence."
  }
}

/** LLM lift. Falls back to the template on any failure or guard rejection. */
export async function writeReason(args: {
  categoryName: string
  restaurant: string
  score: number | null
  evidence: EvidenceLine[]
  gaps: ReasonGap[]
}): Promise<ReasonResult> {
  const fallback = templateReason(args.evidence, args.gaps, args.categoryName)
  if (args.evidence.length === 0) return fallback
  if (!geminiKey()) return fallback

  try {
    const payload = {
      category_name: args.categoryName,
      restaurant: args.restaurant,
      score: args.score,
      evidence: args.evidence.map((e) => ({
        anchor: e.anchor,
        quote: e.quote,
        ...(e.quote_en ? { quote_en: e.quote_en } : {}),
        source: e.source,
        denominator: e.denominator ?? null,
      })),
      gaps: args.gaps,
    }
    // 1500, not 600: gemini-3.x spends part of maxOutputTokens on thinking, and a 600
    // budget truncated the paragraph mid-sentence ("Two of the five.").
    const out = await geminiGenerate(promptText(), JSON.stringify(payload), 1500, false)
    if (!out) return fallback
    // Defensive: if a model still wraps the paragraph in an object, unwrap rather than
    // print braces at the user. Observed with responseMimeType: application/json set.
    const text = unwrapProse(out)
    const verdict = guardReason(text, args.evidence, args.score)
    if (!verdict.ok) return fallback
    return { text, source: "written" }
  } catch {
    return fallback
  }
}
