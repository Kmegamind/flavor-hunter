import type { HuntRequest, ParsedEnvelope } from "@/schemas"
import { searchQueries } from "@/lib/pipeline/search-queries"

export function gate(req: HuntRequest, parsed: ParsedEnvelope): ParsedEnvelope {
  const missing: ParsedEnvelope["missing_required"] = []
  if (!req.city_label && !req.coords) missing.push("location")
  if (parsed.intent !== "find_restaurant") missing.push("intent")
  const hasDish = parsed.anchors.dish !== null
  const hasCuisine = parsed.anchors.cuisine !== null
  if (!hasDish && !hasCuisine) missing.push("dish_or_cuisine")
  const searchable = missing.length === 0
  return { ...parsed, missing_required: missing, searchable }
}

/** Places keyword must never include memory-origin geography (A11). */
export function placesKeyword(parsed: ParsedEnvelope, searchCity: string): string {
  return searchQueries(parsed, searchCity)[0] ?? ""
}
