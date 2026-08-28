import type { EvidenceLine, RankedCandidate } from "@/schemas"

export type InternalCandidate = {
  id: string
  place_id?: string
  name: string
  lat: number
  lng: number
  types: string[]
  price_level?: number
  website?: string
  address?: string
  menu_text: string
  reviews: { text: string; date?: string }[]
}

/** Seeded Boston A1 set — used when Places is unavailable (NFR-3). Not a Places cache. */
export const A1_BOSTON: InternalCandidate[] = [
  {
    id: "c0",
    name: "East Ocean",
    lat: 42.351,
    lng: -71.06,
    types: ["chinese_restaurant"],
    menu_text: "General Tso chicken. Hot and sour soup.",
    address: "10 Main Street",
    reviews: [{ text: "a bit too acidic for me" }],
  },
  {
    id: "c1",
    name: "Golden Wok",
    lat: 42.365,
    lng: -71.07,
    types: ["chinese_restaurant"],
    menu_text: "Banquet style seafood.",
    reviews: [{ text: "fancy plating" }],
  },
  {
    id: "c2",
    name: "Lucky Garden",
    lat: 42.34,
    lng: -71.08,
    types: ["chinese_restaurant"],
    menu_text: "Sichuan dry pot.",
    reviews: [{ text: "very spicy regional Sichuan" }],
  },
  {
    id: "c3",
    name: "Joy Taste",
    lat: 42.37,
    lng: -71.05,
    types: ["meal_takeaway"],
    menu_text: "Panda-style orange chicken.",
    reviews: [{ text: "chain vibes" }],
  },
  {
    id: "c4",
    name: "Red Lantern",
    lat: 42.355,
    lng: -71.045,
    types: ["chinese_restaurant"],
    menu_text: "Tomato egg stir fry.",
    reviews: [{ text: "good but not home style" }],
  },
  {
    id: "c5",
    name: "Mei Mei",
    lat: 42.348,
    lng: -71.1,
    types: ["chinese_restaurant"],
    menu_text: "Dumplings.",
    reviews: [],
  },
  {
    id: "c6",
    name: "Home Style",
    lat: 42.38,
    lng: -71.09,
    types: ["chinese_restaurant"],
    menu_text: "Northern wheat dishes.",
    reviews: [],
  },
  {
    id: "c7",
    name: "Hunan Kitchen",
    lat: 42.349,
    lng: -71.063,
    types: ["chinese_restaurant"],
    website: "https://example.invalid/hunan-kitchen",
    menu_text:
      "sweet home-style tomato and egg. Hunan home cooking. Chinese. About: operators from Hunan.",
    address: "12 Beach Street",
    reviews: [
      { text: "tastes like the one my grandmother made", date: "2026-03" },
      { text: "friendly staff" },
    ],
  },
]

function cloneAt(
  city: { lat: number; lng: number },
  rows: Omit<InternalCandidate, "lat" | "lng">[],
): InternalCandidate[] {
  return rows.map((r, i) => ({
    ...r,
    lat: city.lat + (i % 3) * 0.01 - 0.01,
    lng: city.lng + Math.floor(i / 3) * 0.01 - 0.01,
    address: r.address ?? `${10 + i * 2} Main Street`,
  }))
}

/** Pick a labelled demo set. This is NFR-3 insurance, not a Places cache. */
export function pickFixture(
  parsed: {
    category_name: string
    anchors: {
      dish: { value: string } | null
      cuisine: { value: string } | null
      ritual: { value: string } | null
    }
  },
  center?: { lat: number; lng: number },
): InternalCandidate[] {
  const pin = center ?? { lat: 42.36, lng: -71.059 }
  const dish = (parsed.anchors.dish?.value ?? "").toLowerCase()
  const cuisine = (parsed.anchors.cuisine?.value ?? "").toLowerCase()
  const cat = parsed.category_name.toLowerCase()
  const blob = `${cat} ${dish} ${cuisine}`

  if (parsed.anchors.ritual) {
    return cloneAt(pin, [
      {
        id: "p0",
        name: "Counter Three",
        types: ["restaurant"],
        menu_text: "free pickled veggies if you ordered three or more. tacos.",
        reviews: [{ text: "the pickle-and-beer ritual is real" }],
      },
    ])
  }
  if (/xiangguo|spicy dry pot/.test(blob) && !/malatang/.test(dish)) {
    return cloneAt(pin, [
      {
        id: "x1",
        name: "Dry Pot Alley",
        types: ["chinese_restaurant"],
        website: "https://example.invalid/dry-pot",
        address: "88 Beach Street",
        menu_text: "spicy dry pot. no broth.",
        reviews: [{ text: "spicy dry pot, not a soup" }],
      },
    ])
  }
  if (/mala|malatang/.test(blob)) {
    return cloneAt(pin, [
      {
        id: "x0",
        name: "Hot Pot House",
        types: ["chinese_restaurant"],
        menu_text: "house dumplings. tea. no specialty soup listed.",
        reviews: [{ text: "nice staff" }],
      },
      {
        id: "x1",
        name: "Dry Pot Alley",
        types: ["chinese_restaurant"],
        address: "88 Beach Street",
        menu_text: "spicy dry pot. no broth.",
        reviews: [{ text: "spicy dry pot, not a soup" }],
      },
    ])
  }
  if (/hell ramen|jigoku|tonkotsu/.test(blob)) {
    return cloneAt(pin, [
      {
        id: "h0",
        name: "Zuoying Hell Noodles",
        types: ["ramen_restaurant"],
        website: "https://example.invalid/zuoying-hell",
        menu_text: "hell ramen. extra hot. spicy tonkotsu pork-bone broth.",
        reviews: [{ text: "the hell ramen from Zuoying, super spicy tonkotsu" }],
      },
    ])
  }
  if (/galette|sarrasin|cr[eê]pe/.test(blob)) {
    return cloneAt(pin, [
      {
        id: "g0",
        name: "Breton Counter",
        types: ["restaurant"],
        website: "https://example.invalid/breton",
        menu_text: "galette de sarrasin with asparagus. buckwheat crepe.",
        reviews: [{ text: "savoury galette, asparagus" }],
      },
    ])
  }
  if (/mexican/.test(cuisine) && !parsed.anchors.dish) {
    return cloneAt(pin, [
      { id: "m0", name: "Casa Norte", types: ["mexican_restaurant"], menu_text: "Tacos al pastor.", reviews: [{ text: "fine" }] },
      { id: "m1", name: "El Paso Grill", types: ["mexican_restaurant"], menu_text: "Burrito bowls.", reviews: [] },
    ])
  }
  if (/taco/.test(dish)) {
    return cloneAt(pin, [
      { id: "t0", name: "Corn & Fire", types: ["mexican_restaurant"], menu_text: "tacos on handmade tortillas.", reviews: [{ text: "not soggy — crisp" }] },
    ])
  }
  if (/chinese-american|fried rice|crab rangoon|char siu/.test(blob)) {
    return cloneAt(pin, [
      { id: "e0", name: "Empire Takeout", types: ["chinese_restaurant"], menu_text: "bright yellow fried rice. crab rangoon.", reviews: [{ text: "huge egg rolls" }] },
      { id: "e1", name: "Panda Box", types: ["meal_takeaway"], menu_text: "orange chicken.", reviews: [] },
    ])
  }
  if (/azorean/.test(blob)) {
    return cloneAt(pin, [
      { id: "z0", name: "Ilha Verde", types: ["restaurant"], menu_text: "Azorean fish stew. operators from Terceira.", reviews: [{ text: "not Brazilian" }] },
    ])
  }
  if (/cevapi|bosnian/.test(blob)) {
    return cloneAt(pin, [
      { id: "b0", name: "Sarajevo Grill", types: ["restaurant"], menu_text: "cevapi with kajmak.", reviews: [{ text: "the Bosnian place" }] },
    ])
  }
  if (/randy|donut/.test(blob)) {
    return cloneAt(pin, [
      { id: "d0", name: "Night Owl Donuts", types: ["bakery"], menu_text: "Cambodian-American donuts, closer to frosted bread.", reviews: [] },
      { id: "d1", name: "Randy's", types: ["bakery"], menu_text: "the original Randy's.", reviews: [] },
    ])
  }
  if (/ramen/.test(blob)) {
    return cloneAt(pin, [
      { id: "r0", name: "Noodle Hour", types: ["ramen_restaurant"], menu_text: "late night ramen until 2am.", reviews: [] },
    ])
  }
  return A1_BOSTON.map((c, i) => ({
    ...c,
    lat: pin.lat + (i % 3) * 0.01 - 0.01,
    lng: pin.lng + Math.floor(i / 3) * 0.01 - 0.01,
    address: c.address ?? `${10 + i * 2} Main Street`,
  }))
}

export function a1LockedRanked(): RankedCandidate[] {
  const fetched_at = new Date().toISOString()
  const evidence: EvidenceLine[] = [
    {
      anchor: "dish",
      quote: "sweet home-style tomato and egg",
      source: "website",
      mechanism: "llm_extracted",
      source_name: "restaurant website",
      fetched_at,
      verified: true,
    },
    {
      anchor: "direction",
      quote: "tastes like the one my grandmother made",
      source: "google_review",
      mechanism: "deterministic_match",
      source_name: "Google",
      fetched_at,
      source_date: "2026-03",
      denominator: "2 of 5 available reviews",
      verified: true,
    },
    {
      anchor: "substyle",
      quote: "operators from Hunan",
      source: "website",
      mechanism: "llm_extracted",
      source_name: "restaurant website",
      fetched_at,
      verified: true,
    },
  ]
  return [
    {
      id: "c7",
      name: "Hunan Kitchen",
      distance: 2.3,
      bearing: 210,
      score: 94,
      address: "12 Beach Street",
      evidence,
    },
    {
      id: "c4",
      name: "Red Lantern",
      distance: 3.1,
      bearing: 95,
      score: 41,
      address: "41 Beach Street",
      evidence: [],
    },
  ]
}
