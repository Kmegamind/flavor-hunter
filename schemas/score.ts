/**
 * Memory Match + byte-verification. Pure. No I/O.
 * Spec: docs/10-pipeline-stages.md §4–§5, PRD FR-9 / FR-9a
 */
import type { AnchorSet, EvidenceLine } from "./index"

export function byteVerify(quote: string, corpus: string): boolean {
  if (!quote || !corpus) return false
  if (quote.trim().length === 0) return false
  return corpus.includes(quote)
}

export type WeightRow = { key: string; weight: number }

const GROUPS: { keys: (keyof AnchorSet)[]; budget: number }[] = [
  { keys: ["dish"], budget: 30 },
  { keys: ["sensory", "substyle"], budget: 30 },
  { keys: ["cuisine", "direction"], budget: 20 },
  { keys: ["person", "setting", "ritual", "price_band", "benchmark"], budget: 20 },
]

function supplied(anchors: AnchorSet, key: keyof AnchorSet): boolean {
  if (key === "sensory") return anchors.sensory.length > 0
  if (key === "negation") return false
  const v = anchors[key]
  return v !== null && v !== undefined
}

/** Split each rubric group equally across anchors the user actually supplied. */
export function rubricWeights(anchors: AnchorSet): WeightRow[] {
  const rows: WeightRow[] = []
  for (const g of GROUPS) {
    const present = g.keys.filter((k) => supplied(anchors, k))
    if (present.length === 0) continue
    const each = g.budget / present.length
    for (const k of present) rows.push({ key: k, weight: each })
  }
  return rows
}

export function memoryMatch(
  anchors: AnchorSet,
  evidence: EvidenceLine[],
): number | null {
  const rows = rubricWeights(anchors)
  const available = rows.reduce((s, r) => s + r.weight, 0)
  if (available === 0) return null
  const cited = new Set(
    evidence.filter((e) => e.verified).map((e) => e.anchor),
  )
  const earned = rows
    .filter((r) => cited.has(r.key))
    .reduce((s, r) => s + r.weight, 0)
  if (earned === 0) return null
  return Math.round(100 * Math.min(0.97, earned / available))
}

export type AnchorGap = { key: string; label: string; value: string }

function anchorDisplay(anchors: AnchorSet, key: string): string {
  if (key === "sensory") return anchors.sensory.map((s) => s.value).join(", ")
  if (key === "direction") return anchors.direction ?? ""
  const v = anchors[key as keyof AnchorSet]
  if (v && typeof v === "object" && "value" in v && typeof v.value === "string") return v.value
  return ""
}

/** Supplied rubric anchors with no verified evidence line (FR-9 gaps). */
export function unmatchedAnchors(anchors: AnchorSet, evidence: EvidenceLine[]): AnchorGap[] {
  const cited = new Set(evidence.filter((e) => e.verified).map((e) => e.anchor))
  return rubricWeights(anchors)
    .filter((r) => !cited.has(r.key))
    .map((r) => ({
      key: r.key,
      label: r.key,
      value: anchorDisplay(anchors, r.key),
    }))
}

/** Residual-gap copy for "Why not 100%?" (FR-9a). */
export function whyNotHundred(anchors: AnchorSet, evidence: EvidenceLine[]): string {
  const gaps = unmatchedAnchors(anchors, evidence)
  if (gaps.length === 0) return "never perfect — score is capped at 97%"
  const first = gaps[0]
  return `no evidence for ${first.value || first.label}`
}

/**
 * Drop any LLM quote that is not a literal substring of that candidate's website text.
 * Review lines are added separately by the handler (deterministic match) and must
 * pass byteVerify against the review body, never against menu_text.
 */
export function filterWebsiteQuotes(
  quotes: { anchor: string; quote: string; quote_en?: string }[],
  menuText: string,
): { anchor: string; quote: string; quote_en?: string; source: "website" }[] {
  const out: { anchor: string; quote: string; quote_en?: string; source: "website" }[] = []
  for (const q of quotes) {
    // Only `quote` is byte-verified. `quote_en` is a translation of a verified span,
    // never itself claimed to be present in the corpus.
    if (byteVerify(q.quote, menuText)) {
      out.push({
        anchor: q.anchor,
        quote: q.quote,
        ...(q.quote_en ? { quote_en: q.quote_en } : {}),
        source: "website",
      })
    }
  }
  return out
}
