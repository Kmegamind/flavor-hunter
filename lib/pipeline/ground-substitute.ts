import type { FallbackRung, ParsedEnvelope, SubstituteOffer } from "@/schemas"
import { nextLadderRung } from "@/lib/pipeline/search-queries"
import type { InternalCandidate } from "@/lib/pipeline/fixture-data"

const SYNONYMS: Record<string, string[]> = {
  "spicy dry pot": ["spicy dry pot", "dry pot", "mala xiangguo", "xiangguo", "xiang guo", "麻辣香锅"],
  "maocai": ["maocai", "mao cai", "冒菜"],
  "sichuan hot pot": ["sichuan hot pot", "hot pot", "hotpot", "huoguo", "火锅"],
  "savoury crêpe": ["savoury crêpe", "savory crepe", "crepe", "crêpe", "galette"],
  "savoury crepe": ["savoury crepe", "crepe", "galette"],
}

function needlesFor(rung: FallbackRung): string[] {
  const key = (rung.dish || rung.cuisine || "").toLowerCase()
  const extra = SYNONYMS[key] ?? []
  return [...new Set([key, ...extra])].filter((n) => n.length >= 3)
}

function haystack(c: InternalCandidate): string {
  return `${c.name} ${c.menu_text} ${(c.reviews ?? []).map((r) => r.text).join(" ")}`.toLowerCase()
}

/** Dish rungs match name/menu/reviews. Cuisine-only rungs need the cuisine word in that text (not Place types). */
export function listingMatchesRung(c: InternalCandidate, rung: FallbackRung): boolean {
  const hay = haystack(c)
  if (rung.dish) {
    return needlesFor(rung).some((n) => hay.includes(n.toLowerCase()))
  }
  const cuisine = (rung.cuisine ?? "").toLowerCase()
  return cuisine.length >= 3 && hay.includes(cuisine)
}

export function findGroundedRung(
  parsed: ParsedEnvelope,
  candidates: InternalCandidate[],
  applied?: SubstituteOffer | null,
): { rung: FallbackRung; hit: InternalCandidate } | null {
  const used = new Set(
    [applied?.dish, applied?.cuisine].filter((s): s is string => Boolean(s)).map((s) => s.toLowerCase()),
  )
  for (const rung of parsed.anchors.fallback_ladder ?? []) {
    if (!rung.relation) continue
    const key = (rung.dish || rung.cuisine || "").toLowerCase()
    if (key && used.has(key)) continue
    const hit = candidates.find((c) => listingMatchesRung(c, rung))
    if (hit) return { rung, hit }
  }
  return null
}

export function groundedRelation(from: string, placeName: string): string {
  return `found nearby at ${placeName} — closest match to ${from}`
}

export function rungSearchQueries(rung: FallbackRung): string[] {
  const out: string[] = []
  if (rung.dish) out.push(rung.dish, ...needlesFor(rung))
  if (rung.cuisine) out.push(rung.cuisine)
  const seen = new Set<string>()
  return out.filter((s) => {
    const k = s.trim().toLowerCase()
    if (!k || seen.has(k)) return false
    seen.add(k)
    return true
  })
}

export function nextUnusedRung(
  parsed: ParsedEnvelope,
  applied?: SubstituteOffer | null,
): FallbackRung | null {
  return nextLadderRung(parsed.anchors.fallback_ladder, applied)
}
