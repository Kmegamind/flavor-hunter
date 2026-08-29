import type { AnchorSet, Direction, ParsedEnvelope } from "@/schemas"

export const emptyAnchors = (): AnchorSet => ({
  dish: null,
  cuisine: null,
  substyle: null,
  sensory: [],
  direction: null,
  person: null,
  setting: null,
  price_band: null,
  ritual: null,
  benchmark: null,
  negation: [],
  query_variants: [],
  fallback_ladder: [],
})

function cv(value: string, confidence = 0.85) {
  return { value, confidence }
}

function envelope(
  partial: Partial<ParsedEnvelope> & Pick<ParsedEnvelope, "category_name" | "anchors">,
): ParsedEnvelope {
  const intent = partial.intent ?? "find_restaurant"
  const hasDish = partial.anchors.dish !== null
  const hasCuisine = partial.anchors.cuisine !== null
  const searchable =
    partial.searchable ??
    (intent === "find_restaurant" && (hasDish || hasCuisine))
  return {
    intent,
    category_name: partial.category_name,
    category_confidence: partial.category_confidence ?? 0.8,
    anchors: partial.anchors,
    searchable,
    missing_required: partial.missing_required ?? (searchable ? [] : ["dish_or_cuisine"]),
  }
}

/**
 * Deterministic parser for the 12-archetype harness and seeded demos.
 * Live Gemini is used when GEMINI_API_KEY is set; this is the fallback
 * and the harness oracle so A2/A6/A9/A11/A12 do not depend on model drift.
 */
export function parseHeuristic(memoryText: string): ParsedEnvelope {
  const t = memoryText.trim()
  const lower = t.toLowerCase()

  if (/how do i cook|recipe for|how to make/.test(lower)) {
    const a = emptyAnchors()
    return envelope({
      intent: "find_recipe",
      category_name: "recipe",
      category_confidence: 0.9,
      anchors: a,
      searchable: false,
      missing_required: ["intent"],
    })
  }

  if (/^missing home food\.?$/i.test(t) || lower === "missing home food") {
    return envelope({
      category_name: "",
      category_confidence: 0,
      anchors: emptyAnchors(),
      searchable: false,
      missing_required: ["dish_or_cuisine"],
    })
  }

  if (/mala ?tang|malatang|northeastern spicy hot pot/.test(lower)) {
    const a = emptyAnchors()
    a.dish = cv("malatang")
    a.cuisine = cv("Chinese")
    a.substyle = cv("Northeastern")
    a.direction = "street_stall"
    a.query_variants = ["malatang", "mala tang", "spicy hot pot", "Chinese hot soup"]
    a.fallback_ladder = [
      { dish: "spicy dry pot", relation: "same heat and mala seasoning, served dry instead of in broth" },
      { dish: "maocai", relation: "same Sichuan-style mala, different format" },
      { dish: "Sichuan hot pot", relation: "same flavour profile, different format" },
      { cuisine: "Sichuan", relation: "same regional cuisine, broader category" },
      { cuisine: "Chinese", relation: "same national cuisine, least specific" },
    ]
    return envelope({
      category_name: "Northeastern malatang",
      category_confidence: 0.9,
      anchors: a,
    })
  }

  if (/hell ramen|jigoku|tonkotsu/.test(lower) && /ramen|tonkotsu|jigoku/.test(lower)) {
    const a = emptyAnchors()
    a.dish = cv("hell ramen")
    a.cuisine = cv("Japanese")
    if (/zuoying|kaohsiung/.test(lower)) a.substyle = cv("Kaohsiung", 0.7)
    a.sensory = [
      /extra hot|super spicy|spicy/.test(lower) ? cv("extra hot", 0.85) : null,
      /tonkotsu/.test(lower) ? cv("tonkotsu broth", 0.85) : null,
    ].filter(Boolean) as AnchorSet["sensory"]
    if (/americanized|americanised/.test(lower)) {
      a.negation = [{ field: "direction", value: "americanized_chain" }]
    }
    a.query_variants = ["hell ramen", "jigoku ramen", "spicy tonkotsu ramen", "ramen"]
    return envelope({
      category_name: "Hell ramen",
      category_confidence: 0.86,
      anchors: a,
    })
  }

  if (/cr[eê]pe|galette|sarrasin/.test(lower)) {
    const a = emptyAnchors()
    a.dish = cv("galette de sarrasin", 0.55)
    a.cuisine = cv("French", 0.6)
    a.substyle = cv("Breton", 0.55)
    a.sensory = [
      /asparagus/.test(lower) ? cv("asparagus", 0.4) : null,
      /savoury|savory/.test(lower) ? cv("savoury", 0.6) : null,
      /darker|buckwheat/.test(lower) ? cv("buckwheat batter", 0.55) : null,
    ].filter(Boolean) as AnchorSet["sensory"]
    if (/sweet (dessert|kind|crepe)/.test(lower)) {
      a.negation = [{ field: "sensory", value: "sweet dessert kind" }]
    }
    a.query_variants = ["galette de sarrasin", "buckwheat crepe", "savoury crepe", "galette"]
    a.fallback_ladder = [
      { dish: "savoury crêpe", relation: "same Breton street food, wheat instead of buckwheat" },
    ]
    return envelope({
      category_name: "galette de sarrasin",
      category_confidence: /i think|maybe|not sure/.test(lower) ? 0.45 : 0.7,
      anchors: a,
    })
  }

  if (/bright yellow fried rice|crab rangoon|char siu/.test(lower)) {
    const a = emptyAnchors()
    a.dish = cv("fried rice / char siu / crab rangoon / egg rolls")
    a.cuisine = cv("Chinese-American")
    a.sensory = [
      cv("bright yellow", 0.8),
      cv("bright red", 0.8),
      cv("huge egg rolls", 0.75),
    ]
    a.direction = "americanized_chain"
    a.setting = cv("small town", 0.55)
    a.negation = [{ field: "dish", value: "cream cheese only crab rangoon" }]
    return envelope({
      category_name: "East Coast Chinese-American",
      category_confidence: 0.86,
      anchors: a,
    })
  }

  if (/azorean/.test(lower)) {
    const a = emptyAnchors()
    a.cuisine = cv("Portuguese")
    a.substyle = cv("Azorean")
    a.negation = [{ field: "cuisine", value: "Brazilian" }]
    if (/not portuguese/.test(lower)) a.negation.push({ field: "cuisine", value: "Portuguese (mainland)" })
    return envelope({
      category_name: "Azorean",
      category_confidence: 0.88,
      anchors: a,
    })
  }

  if (/randy/.test(lower)) {
    const a = emptyAnchors()
    a.dish = cv("donut")
    a.substyle = cv("Cambodian-American", 0.6)
    a.benchmark = cv("Randy's")
    a.negation = [{ field: "sensory", value: "frosted bread" }]
    a.direction = "diaspora_adapted"
    return envelope({
      category_name: "Cambodian-American donut",
      category_confidence: 0.7,
      anchors: a,
    })
  }

  if (/cevapi|ćevapi|bosnian/.test(lower)) {
    const a = emptyAnchors()
    a.dish = cv("cevapi")
    a.cuisine = cv("Bosnian")
    a.direction = "restaurant_formal"
    return envelope({
      category_name: "Bosnian ćevapi",
      category_confidence: 0.82,
      anchors: a,
    })
  }

  if (/mexican food/.test(lower) && /bad|disappoint|silence/.test(lower)) {
    const a = emptyAnchors()
    a.cuisine = cv("Mexican")
    a.direction = "street_stall"
    a.negation = [{ field: "setting", value: "local options already tried" }]
    return envelope({
      category_name: "Mexican",
      category_confidence: 0.75,
      anchors: a,
    })
  }

  if (/americanized chinese|not authentic sichuan/.test(lower)) {
    const a = emptyAnchors()
    a.cuisine = cv("Chinese-American")
    a.direction = "americanized_chain"
    a.negation = [{ field: "cuisine", value: "Sichuan" }]
    return envelope({
      category_name: "Americanized Chinese takeout",
      category_confidence: 0.84,
      anchors: a,
    })
  }

  if (/pickled veggies|three or more/.test(lower)) {
    const a = emptyAnchors()
    a.ritual = cv("free pickled veggies if you ordered three or more", 0.7)
    a.setting = cv("joint / counter", 0.45)
    a.cuisine = cv("Mexican", 0.4)
    return envelope({
      category_name: "the place with the pickle-and-beer ritual",
      category_confidence: 0.45,
      anchors: a,
    })
  }

  if (/bland and soggy|tortillas were weird/.test(lower)) {
    const a = emptyAnchors()
    a.dish = cv("tacos")
    a.negation = [
      { field: "sensory", value: "bland" },
      { field: "sensory", value: "soggy" },
      { field: "sensory", value: "weird tortillas" },
    ]
    return envelope({
      category_name: "tacos (not bland/soggy)",
      category_confidence: 0.55,
      anchors: a,
    })
  }

  if (/hunan/i.test(t) && /tomato/i.test(t)) {
    const a = emptyAnchors()
    a.dish = cv("tomato and egg")
    a.cuisine = cv("Chinese")
    a.substyle = cv("Hunan")
    a.direction = "family_home"
    a.person = cv("grandmother", 0.9)
    a.setting = cv("home kitchen", 0.7)
    a.query_variants = ["tomato and egg", "tomato egg", "scrambled egg with tomato"]
    return envelope({
      category_name: "Hunan home-style tomato and egg",
      category_confidence: 0.9,
      anchors: a,
    })
  }

  if (/tomato and egg|grandmother|grandma|sweet tomato/.test(lower)) {
    const a = emptyAnchors()
    a.dish = cv("tomato and egg")
    a.cuisine = cv("Chinese")
    a.direction = "family_home"
    a.person = cv("grandmother")
    a.sensory = [/sweet/.test(lower) ? cv("sweet") : null].filter(Boolean) as AnchorSet["sensory"]
    if (/not (the )?restaurant/.test(lower)) {
      a.negation = [{ field: "direction", value: "restaurant_formal" }]
    }
    a.query_variants = ["tomato and egg", "tomato egg"]
    return envelope({
      category_name: "sweet-style home-cooked tomato and egg",
      category_confidence: 0.88,
      anchors: a,
    })
  }

  if (/ramen/.test(lower)) {
    const a = emptyAnchors()
    a.dish = cv("ramen")
    a.cuisine = cv("Japanese")
    a.ritual = cv("2am", 0.5)
    a.query_variants = ["ramen", "late night ramen"]
    return envelope({
      category_name: "late-night ramen",
      category_confidence: 0.7,
      anchors: a,
    })
  }

  return fillMissingDishOrCuisine(
    envelope({
      category_name: "",
      category_confidence: 0,
      anchors: genericAnchors(t),
      searchable: false,
      missing_required: ["dish_or_cuisine"],
    }),
    memoryText,
  )
}

const PLACE_TO_CUISINE: [RegExp, string][] = [
  [/\bfrance\b|\bfrench\b|\bparis\b|\bbrittany\b|\bbretagne\b/i, "French"],
  [/\blao\b|\blaos\b|\blaotian\b/i, "Laotian"],
  [/\bethiopian?\b|\bethiopia\b/i, "Ethiopian"],
  [/\bsan diego\b|\btijuana\b|\bbaja\b|\bcarne asada\b|\btaqueria\b/i, "Mexican"],
  [/\btexas\b|\btex-?mex\b|\baustin\b/i, "Tex-Mex"],
  [/\bsalvadoran?\b|\bel salvador\b|\bpupusa/i, "Salvadoran"],
  [/\bkorean?\b|\bseoul\b/i, "Korean"],
  [/\bjapan(ese)?\b|\btokyo\b|\bosaka\b|\bramen\b|\btonkotsu\b/i, "Japanese"],
  [/\bviet(namese)?\b|\bsaigon\b|\bhanoi\b|\bpho\b/i, "Vietnamese"],
  [/\bsichuan\b|\bchengdu\b|\bhunan\b|\bchinese\b/i, "Chinese"],
]

const SENSORY_WORDS = [
  "savoury", "savory", "sweet", "sour", "salty", "spicy", "hot",
  "smoky", "crispy", "crunchy", "thin", "thick", "dark", "chewy", "rich", "greasy",
]

const DISH_WORDS = [
  "crepe", "crepes", "galette", "taco", "tacos", "ramen", "laab", "larb",
  "sticky rice", "pupusa", "pho", "dumpling", "dumplings", "noodle", "noodles",
  "stew", "curry", "kebab", "donut", "doughnut", "bread", "soup", "rice",
]

/**
 * Last-resort extractor for a memory none of the specific branches recognised.
 *
 * Every branch above is a regex tuned to one demo string, so any sentence a real user
 * writes falls through to here with nothing extracted. That was fine while the seeded
 * chips *were* the demo strings; once they became natural sentences, the no-API-key path
 * produced zero anchors and every chip hit the clue gate instead of demoing the product.
 *
 * This does not attempt to be the parser — that is Gemini's job, and a phrase table will
 * never name a galette. It extracts only what a regex can honestly claim from English
 * prose, so the offline path degrades to something usable instead of nothing.
 */
export function genericAnchors(text: string): AnchorSet {
  const a = emptyAnchors()
  const lower = text.toLowerCase()

  for (const [re, cuisine] of PLACE_TO_CUISINE) {
    if (re.test(text)) {
      a.cuisine = cv(cuisine, 0.5)
      break
    }
  }

  for (const d of DISH_WORDS) {
    if (new RegExp(`\\b${d}\\b`, "i").test(lower)) {
      a.dish = cv(d, 0.45)
      break
    }
  }

  for (const s of SENSORY_WORDS) {
    if (new RegExp(`\\b${s}\\b`, "i").test(lower)) {
      a.sensory.push(cv(s, 0.5))
    }
    if (a.sensory.length >= 3) break
  }

  const person = lower.match(/\bmy (mom|mum|mother|grandma|grandmother|dad|father|family|aunt|auntie)\b/)
  if (person) {
    a.person = cv(person[1] === "mum" ? "mom" : person[1], 0.7)
    a.direction = "family_home"
  }

  // "not the sweet kind", "nothing like the version here", "not a Thai restaurant"
  for (const m of lower.matchAll(/\b(?:not|nothing like)\s+(?:the\s+|a\s+|an\s+)?([a-z][a-z \-]{2,28}?)(?=[,.;]|$| with | on )/g)) {
    const value = m[1].trim()
    if (value.length < 3) continue
    a.negation.push({ field: "sensory", value })
    if (a.negation.length >= 2) break
  }

  if (/\bhole in the wall\b|\blittle shops?\b|\bstall\b|\bstreet\b|\bcart\b/.test(lower)) {
    a.setting = cv("small independent", 0.5)
  }

  return a
}

const CUISINE_WORDS = [
  "chinese",
  "japanese",
  "korean",
  "thai",
  "vietnamese",
  "mexican",
  "italian",
  "french",
  "indian",
  "ethiopian",
  "taiwanese",
  "sichuan",
  "cantonese",
  "malaysian",
  "filipino",
  "peruvian",
  "turkish",
  "greek",
  "spanish",
  "portuguese",
  "american",
]

export function lastClueChunk(text: string): string {
  const tagged = text.match(/the dish or cuisine is:\s*([^\n]+)/i)
  if (tagged?.[1]) return tagged[1].trim()
  const parts = text
    .split(/[.\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
  return parts[parts.length - 1] ?? text.trim()
}

/** Shared with parse.ts: an answer this thin is not an answer. */
export function tooVagueClue(s: string): boolean {
  const t = s.toLowerCase().replace(/[?!.,]/g, "").trim()
  if (t.length < 2) return true
  if (/^(missing\s+)?home\s+food$/.test(t)) return true
  if (
    /^(food|meal|dinner|lunch|something|anything|idk|n\/a|home|missing|yes|no|ok|okay|please)$/.test(
      t,
    )
  ) {
    return true
  }
  return false
}

/**
 * After a NEED A CLUE follow-up, recover dish/cuisine from a short answer
 * ("Chinese", "ramen") even when the original memory was empty.
 */
export function fillMissingDishOrCuisine(parsed: ParsedEnvelope, memoryText: string): ParsedEnvelope {
  if (parsed.intent !== "find_restaurant") return parsed
  if (parsed.anchors.dish || parsed.anchors.cuisine) {
    const missing = parsed.missing_required.filter((m) => m !== "dish_or_cuisine")
    const category_name =
      parsed.category_name ||
      parsed.anchors.dish?.value ||
      parsed.anchors.cuisine?.value ||
      ""
    return {
      ...parsed,
      category_name,
      searchable: missing.length === 0,
      missing_required: missing,
    }
  }
  const chunk = lastClueChunk(memoryText)
  const hay = `${chunk} ${memoryText}`.toLowerCase()
  for (const c of CUISINE_WORDS) {
    if (!new RegExp(`\\b${c}\\b`, "i").test(hay)) continue
    const cuisine = c.charAt(0).toUpperCase() + c.slice(1)
    return envelope({
      ...parsed,
      category_name: parsed.category_name || cuisine,
      category_confidence: Math.max(parsed.category_confidence, 0.7),
      anchors: {
        ...parsed.anchors,
        cuisine: { value: cuisine, confidence: 0.75 },
      },
      searchable: true,
      missing_required: [],
    })
  }
  if (tooVagueClue(chunk) || chunk.split(/\s+/).length > 8) return parsed
  const dish = chunk.replace(/^(it'?s|its|maybe|probably|like)\s+/i, "").trim()
  if (tooVagueClue(dish)) return parsed
  return envelope({
    ...parsed,
    category_name: parsed.category_name || dish,
    category_confidence: Math.max(parsed.category_confidence, 0.6),
    anchors: {
      ...parsed.anchors,
      dish: { value: dish, confidence: 0.7 },
      query_variants: dish ? [dish] : parsed.anchors.query_variants,
    },
    searchable: true,
    missing_required: [],
  })
}

export function stripNegationsFromSensory(parsed: ParsedEnvelope): ParsedEnvelope {
  const negVals = parsed.anchors.negation.map((n) => n.value.toLowerCase())
  const sensory = parsed.anchors.sensory.filter(
    (s) => !negVals.some((n) => s.value.toLowerCase().includes(n) || n.includes(s.value.toLowerCase())),
  )
  return { ...parsed, anchors: { ...parsed.anchors, sensory } }
}

export function assertNoAuthenticityField(obj: unknown): boolean {
  const json = JSON.stringify(obj).toLowerCase()
  return !/"authenticity"\s*:/.test(json)
}

export function directionFrom(parsed: ParsedEnvelope): Direction | null {
  return parsed.anchors.direction
}
