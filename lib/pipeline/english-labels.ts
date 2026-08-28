/**
 * Display-language helpers.
 *
 * Deliberately small. An earlier version of this module translated evidence quotes
 * through a hardcoded phrase table, stripped any CJK that survived, and — when nothing
 * was left — returned the invented sentence "listed on the restaurant website" for the UI
 * to render inside quotation marks. That fabricated a quotation, which PRD FR-9 makes a
 * release blocker, and it silently destroyed the verbatim property that server-side
 * byte-verification had just established.
 *
 * The rule now: **a translation is not a quote.**
 *   - `EvidenceLine.quote`     verbatim, original language, never altered
 *   - `EvidenceLine.quote_en`  a translation, produced by the evidence LLM, labelled as one
 *   - missing `quote_en`       show `quote`. Never a placeholder.
 *
 * English-first display is achieved by *asking* for English (`category_name` in
 * prompts/parse.md, `quote_en` in prompts/evidence.md), not by mangling text afterwards.
 */
import type { Direction, EvidenceLine } from "@/schemas"

const CJK = /[㐀-鿿]/

export function hasCjk(s: string): boolean {
  return CJK.test(s)
}

/** What the user reads. Falls back to the original — never to invented text. */
export function readableQuote(ev: Pick<EvidenceLine, "quote" | "quote_en">): string {
  const en = ev.quote_en?.trim()
  return en && en.length > 0 ? en : ev.quote
}

/** True when the original should also be shown as the receipt beneath the reading line. */
export function showsOriginal(ev: Pick<EvidenceLine, "quote" | "quote_en">): boolean {
  const en = ev.quote_en?.trim()
  return Boolean(en && en.length > 0 && en !== ev.quote)
}

export function directionLabel(d: Direction | string): string {
  const map: Record<string, string> = {
    family_home: "home cooking",
    street_stall: "street stall",
    restaurant_formal: "sit-down restaurant",
    diaspora_adapted: "diaspora",
    americanized_chain: "Americanized chain",
  }
  return map[d] ?? String(d).replaceAll("_", " ")
}
