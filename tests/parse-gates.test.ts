import { describe, expect, it } from "vitest"
import { parseHeuristic, stripNegationsFromSensory, assertNoAuthenticityField, fillMissingDishOrCuisine } from "@/lib/pipeline/parse-heuristic"
import { gate, placesKeyword } from "@/lib/pipeline/gate"
import { memoryMatch } from "@/schemas/score"
import { huntToEvents } from "@/lib/pipeline/run-hunt"
import { searchQueries } from "@/lib/pipeline/search-queries"
import cases from "@/schemas/harness-cases.json"

function req(city: string) {
  return {
    memory_text: "x",
    locale: "en",
    range_mi: 20 as const,
    city_label: city,
  }
}

describe("hard gates A2 A6 A9 A11 A12", () => {
  it("A2 names East Coast Chinese-American and stores cream cheese as negation", () => {
    const c = cases.cases.find((x) => x.id === "A2")!
    const parsed = stripNegationsFromSensory(parseHeuristic(c.memory_text))
    expect(parsed.searchable).toBe(true)
    expect(parsed.category_name.toLowerCase()).toMatch(/east coast chinese-american|chinese-american/)
    expect(parsed.anchors.negation.some((n) => /cream cheese/i.test(n.value))).toBe(true)
    expect(assertNoAuthenticityField(parsed)).toBe(true)
  })

  it("A6 parse may pass; memoryMatch with earned 0 is null (no %)", () => {
    const c = cases.cases.find((x) => x.id === "A6")!
    const parsed = gate(req(c.city_label), parseHeuristic(c.memory_text))
    expect(parsed.searchable).toBe(true)
    expect(parsed.anchors.cuisine?.value.toLowerCase()).toMatch(/mexican/)
    expect(memoryMatch(parsed.anchors, [])).toBeNull()
  })

  it("A9 puts bland/soggy only in negation[]", () => {
    const c = cases.cases.find((x) => x.id === "A9")!
    const parsed = stripNegationsFromSensory(parseHeuristic(c.memory_text))
    const neg = parsed.anchors.negation.map((n) => n.value.toLowerCase()).join(" ")
    expect(/bland|soggy|tortilla/.test(neg)).toBe(true)
    const sensory = parsed.anchors.sensory.map((s) => s.value.toLowerCase()).join(" ")
    expect(sensory).not.toMatch(/bland/)
    expect(sensory).not.toMatch(/soggy/)
  })

  it("A11 searches Boston and keeps Hunan as substyle, never as Places keyword", () => {
    const c = cases.cases.find((x) => x.id === "A11")!
    const parsed = gate(req(c.city_label), parseHeuristic(c.memory_text))
    expect(parsed.searchable).toBe(true)
    expect(parsed.anchors.substyle?.value).toMatch(/hunan/i)
    expect(parsed.anchors.dish).not.toBeNull()
    const kw = placesKeyword(parsed, c.city_label)
    expect(kw).not.toMatch(/hunan|changsha/i)
    expect(c.city_label).toBe("Boston, MA")
    const qs = searchQueries(parsed, c.city_label)
    expect(qs.join(" ")).not.toMatch(/hunan|changsha/i)
  })

  it("A12 emits query_variants and a ladder with relation; zero evidence offers two doors", async () => {
    const c = cases.cases.find((x) => x.id === "A12")!
    const parsed = gate(req(c.city_label), parseHeuristic(c.memory_text))
    expect(parsed.searchable).toBe(true)
    expect(parsed.anchors.query_variants.join(" ").toLowerCase()).toMatch(/mala tang/)
    expect(parsed.anchors.fallback_ladder[0]?.dish).toBe("spicy dry pot")
    expect(parsed.anchors.fallback_ladder.every((r) => r.relation.length > 0)).toBe(true)
    const events = await huntToEvents({
      memory_text: c.memory_text,
      locale: "zh-CN",
      range_mi: 20,
      city_label: c.city_label,
      confirmed: true,
    })
    expect(events.some((e) => e.type === "widen")).toBe(true)
    const sub = events.find((e) => e.type === "substitute")
    expect(sub?.type).toBe("substitute")
    if (sub?.type === "substitute") {
      expect(sub.to.dish).toBe("spicy dry pot")
      expect(sub.to.relation).toMatch(/Dry Pot Alley/)
      expect(sub.to.relation).toMatch(/closest match to malatang/)
      expect(sub.applied).toBe(false)
    }
  })
})

describe("NEED A CLUE dish_or_cuisine recovery", () => {
  it("A10 stays blocked until a dish or cuisine is named", () => {
    const blocked = parseHeuristic("Missing home food.")
    expect(blocked.searchable).toBe(false)
    expect(blocked.missing_required).toContain("dish_or_cuisine")
    expect(blocked.anchors.dish).toBeNull()
    expect(blocked.anchors.cuisine).toBeNull()
  })

  it("appends a cuisine clue and becomes searchable", () => {
    const parsed = parseHeuristic("Missing home food.\nThe dish or cuisine is: Chinese")
    expect(parsed.searchable).toBe(true)
    expect(parsed.anchors.cuisine?.value.toLowerCase()).toBe("chinese")
    expect(parsed.missing_required).not.toContain("dish_or_cuisine")
  })

  it("appends a dish clue and becomes searchable", () => {
    const parsed = parseHeuristic("Missing home food.\nThe dish or cuisine is: ramen")
    expect(parsed.searchable).toBe(true)
    expect(parsed.anchors.dish?.value.toLowerCase()).toMatch(/ramen/)
  })

  it("ignores a still-vague clue", () => {
    const parsed = fillMissingDishOrCuisine(
      parseHeuristic("Missing home food."),
      "Missing home food.\nThe dish or cuisine is: food",
    )
    expect(parsed.searchable).toBe(false)
    expect(parsed.missing_required).toContain("dish_or_cuisine")
  })
})
