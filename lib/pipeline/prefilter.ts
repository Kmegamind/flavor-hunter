/**
 * Stage-1.5 — drop candidates that cannot be the answer, before paying for stage 2.
 *
 * Stage 1 returns up to 18 places with their Places `types` attached, and stage 2 then spends a
 * Place Details call on every one of them plus a website fetch on the top eight. That is the
 * bulk of a hunt's latency, and a good part of it is spent on candidates that a single field
 * already ruled out: a Chinese restaurant will not be serving the Breton galette someone asked
 * for, and no amount of reading its reviews will change that.
 *
 * The rule is deliberately timid: **drop only on a positive contradiction, never on the absence
 * of a match.** A Breton crêperie may be typed `french_restaurant`, or `cafe`, or plain
 * `restaurant` — and one of the strongest results in the research corpus was a taqueria inside a
 * petrol station. Requiring a positive type match would delete exactly the small, oddly
 * categorised places this product exists to find. So a candidate is only dropped when it claims a
 * *different* cuisine and none of ours.
 */
import type { ParsedEnvelope } from "@/schemas"

type Candidate = { id: string; name: string; types: string[] }

/**
 * Places' cuisine-specific restaurant types, grouped by the cuisine word a parse would produce.
 * Only cuisines with a dedicated Places type are listed — anything else has no signal here and
 * is therefore never used to drop.
 */
const CUISINE_TYPES: Record<string, string[]> = {
  french: ["french_restaurant"],
  chinese: ["chinese_restaurant"],
  japanese: ["japanese_restaurant", "ramen_restaurant", "sushi_restaurant"],
  korean: ["korean_restaurant"],
  thai: ["thai_restaurant"],
  vietnamese: ["vietnamese_restaurant"],
  indian: ["indian_restaurant"],
  indonesian: ["indonesian_restaurant"],
  mexican: ["mexican_restaurant"],
  brazilian: ["brazilian_restaurant"],
  italian: ["italian_restaurant", "pizza_restaurant"],
  greek: ["greek_restaurant"],
  spanish: ["spanish_restaurant"],
  turkish: ["turkish_restaurant"],
  lebanese: ["lebanese_restaurant", "middle_eastern_restaurant"],
  american: ["american_restaurant", "hamburger_restaurant"],
}

/** Every cuisine-specific type, for spotting a candidate that claims some other cuisine. */
const ALL_CUISINE_TYPES = new Set(Object.values(CUISINE_TYPES).flat())

/**
 * Types that say "this is not a place you eat a meal".
 *
 * Kept short on purpose. `gas_station` is *not* here: one of the best answers in the research
 * was a taqueria in a Gaithersburg petrol station, and a filter that cannot find that place has
 * misunderstood the product.
 */
const NON_FOOD = new Set([
  "lodging",
  "hotel",
  "car_repair",
  "car_dealer",
  "bank",
  "atm",
  "pharmacy",
  "hospital",
  "gym",
  "hair_care",
  "clothing_store",
  "hardware_store",
  "real_estate_agency",
])

const FOOD_HINT = /restaurant|food|cafe|coffee|bakery|bar|meal_|deli|creperie/

function expectedTypes(parsed: ParsedEnvelope): string[] {
  const words = [parsed.anchors.cuisine?.value, parsed.anchors.substyle?.value]
    .filter(Boolean)
    .map((s) => (s as string).toLowerCase())
  const out = new Set<string>()
  for (const w of words) {
    for (const [key, types] of Object.entries(CUISINE_TYPES)) {
      if (w.includes(key)) types.forEach((t) => out.add(t))
    }
  }
  return [...out]
}

export type PrefilterDrop = { id: string; name: string; reason: string }

/**
 * Split candidates into those worth paying for and those already ruled out.
 *
 * `dropped` carries a human reason so the interface can show the elimination rather than have
 * candidates silently disappear — the hunt is supposed to be legible, and a filter the user
 * cannot see is just a smaller result set with no explanation.
 */
export function prefilterCandidates<T extends Candidate>(
  parsed: ParsedEnvelope,
  candidates: T[],
): { keep: T[]; dropped: PrefilterDrop[] } {
  const expected = expectedTypes(parsed)
  const keep: T[] = []
  const dropped: PrefilterDrop[] = []

  for (const c of candidates) {
    const types = (c.types ?? []).map((t) => t.toLowerCase())

    const nonFood = types.some((t) => NON_FOOD.has(t))
    const anyFood = types.some((t) => FOOD_HINT.test(t))
    if (nonFood && !anyFood) {
      dropped.push({ id: c.id, name: c.name, reason: "not a place that serves food" })
      continue
    }

    if (expected.length > 0) {
      const matchesOurs = types.some((t) => expected.includes(t))
      const claimsAnother = types.some((t) => ALL_CUISINE_TYPES.has(t) && !expected.includes(t))
      // Only a positive contradiction drops: it says it is another cuisine, and never ours.
      if (!matchesOurs && claimsAnother) {
        const other = types.find((t) => ALL_CUISINE_TYPES.has(t)) ?? "another cuisine"
        dropped.push({
          id: c.id,
          name: c.name,
          reason: `listed as ${other.replace(/_/g, " ")}`,
        })
        continue
      }
    }

    keep.push(c)
  }

  // A filter that empties the field has told us it was wrong, not that there is no answer.
  if (keep.length === 0) return { keep: candidates, dropped: [] }
  return { keep, dropped }
}
