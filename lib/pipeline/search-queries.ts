import type { ParsedEnvelope, SubstituteOffer } from "@/schemas"

/** Open item in docs/00-index.md: too many variants multiply Stage-1 cost. */
export const VARIANT_CAP = 5

const ORIGINISH = /hunan|changsha|sichuan|guangdong/i

function uniqFold(xs: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of xs) {
    const s = raw.trim()
    if (!s) continue
    const k = s.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(s)
  }
  return out
}

/**
 * Stage-1 Text Search strings (PRD FR-1). Never includes memory-origin geography (A11).
 * An accepted substitute replaces the dish, not the original variant list (PRD FR-4b-2).
 */
export function searchQueries(
  parsed: ParsedEnvelope,
  searchCity: string,
  substitute?: SubstituteOffer,
): string[] {
  if (substitute?.dish || substitute?.cuisine) {
    return uniqFold([substitute.dish ?? "", substitute.cuisine ?? ""]).slice(0, VARIANT_CAP)
  }
  const dish = parsed.anchors.dish?.value ?? ""
  const cuisine = parsed.anchors.cuisine?.value ?? ""
  const sub = parsed.anchors.substyle?.value ?? ""
  const subOk = sub && !ORIGINISH.test(sub) ? sub : ""
  const primary = [dish || cuisine, subOk].filter(Boolean).join(" ")
  const variants = parsed.anchors.query_variants ?? []
  const city = searchCity.toLowerCase()
  const all = uniqFold([primary, dish, cuisine, ...variants]).filter((q) => {
    if (ORIGINISH.test(q) && !ORIGINISH.test(city)) return false
    return true
  })
  return (all.length ? all : uniqFold([primary || dish || cuisine])).slice(0, VARIANT_CAP)
}

/** First unused ladder rung. One door at a time (PRD FR-4b-2). */
export function nextLadderRung(
  ladder: ParsedEnvelope["anchors"]["fallback_ladder"],
  applied?: SubstituteOffer | null,
): ParsedEnvelope["anchors"]["fallback_ladder"][number] | null {
  const used = new Set(
    [applied?.dish, applied?.cuisine].filter((s): s is string => Boolean(s)).map((s) => s.toLowerCase()),
  )
  for (const r of ladder ?? []) {
    if (!r.relation) continue
    const key = (r.dish || r.cuisine || "").toLowerCase()
    if (key && used.has(key)) continue
    return r
  }
  return null
}

export function nextRangeMi(from: number): number | null {
  if (from === 45) return null
  if (from === 20) return 45
  if (from === 10) return 20
  return 10
}
