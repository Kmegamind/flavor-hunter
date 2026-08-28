import { describe, expect, it } from "vitest"
import { clueNeedles } from "@/lib/pipeline/clue-lexicon"
import { matchReviewPhrases } from "@/lib/pipeline/review-match"
import type { AnchorSet, ParsedEnvelope } from "@/schemas"

const emptyAnchors: AnchorSet = {
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
}

const parsed = (a: Partial<AnchorSet>): ParsedEnvelope =>
  ({
    intent: "find_restaurant",
    category_name: "sweet home-style tomato and egg",
    category_confidence: 0.9,
    anchors: { ...emptyAnchors, ...a },
    searchable: true,
    missing_required: [],
  }) as ParsedEnvelope

describe("Agent 2: finds phrases the user never typed", () => {
  it("matches a nostalgia phrase the memory did not contain", () => {
    // The memory said "home cooking". The review says something else entirely, and the
    // old anchor-value matching could never have found it.
    const p = parsed({
      dish: { value: "tomato and egg", confidence: 0.9 },
      direction: "family_home",
    })
    const reviews = [{ text: "Honestly this tastes like the one my mom made when I was small." }]
    const lines = matchReviewPhrases(p, reviews, "2026-08-28T00:00:00Z")
    const dir = lines.filter((l) => l.anchor === "direction")
    expect(dir.length).toBeGreaterThan(0)
    expect(dir[0].quote).toContain("my mom made")
  })

  it("returns a readable clause, still verbatim from the review", () => {
    const p = parsed({ direction: "family_home", dish: { value: "x", confidence: 1 } })
    const text = "Service was slow. It reminds me of home in a way nothing else here does. Parking is fine."
    const lines = matchReviewPhrases(p, [{ text }], "2026-08-28T00:00:00Z")
    const dir = lines.find((l) => l.anchor === "direction")
    expect(dir).toBeDefined()
    // A whole clause, not the bare needle...
    expect(dir!.quote.length).toBeGreaterThan("reminds me of home".length)
    // ...and still a literal slice of the source, so byte-verification holds.
    expect(text.includes(dir!.quote)).toBe(true)
    // Clause boundaries respected: the neighbouring sentences are not dragged in.
    expect(dir!.quote).not.toContain("Service was slow")
    expect(dir!.quote).not.toContain("Parking")
  })

  it("stays silent about anchors the user did not supply", () => {
    // No `direction` in the memory, so home-cooking phrases are not this user's question.
    const p = parsed({ dish: { value: "tomato and egg", confidence: 0.9 } })
    const lines = matchReviewPhrases(p, [{ text: "tastes like home, truly" }], "2026-08-28T00:00:00Z")
    expect(lines.some((l) => l.anchor === "direction")).toBe(false)
  })

  it("gates street-stall vocabulary on the direction actually asked for", () => {
    const home = clueNeedles({ ...emptyAnchors, direction: "family_home" })
    const stall = clueNeedles({ ...emptyAnchors, direction: "street_stall" })
    expect(home.some((n) => n.value === "reminds me of home")).toBe(true)
    expect(home.some((n) => n.value === "night market")).toBe(false)
    expect(stall.some((n) => n.value === "night market")).toBe(true)
    expect(stall.some((n) => n.value === "reminds me of home")).toBe(false)
  })

  it("produces no needles for an empty anchor set", () => {
    expect(clueNeedles(emptyAnchors)).toEqual([])
  })

  it("aggregates across reviews with a true count", () => {
    const p = parsed({ direction: "family_home", dish: { value: "x", confidence: 1 } })
    const reviews = [
      { text: "tastes like the one my mom made" },
      { text: "it reminds me of home" },
      { text: "great parking" },
    ]
    const lines = matchReviewPhrases(p, reviews, "2026-08-28T00:00:00Z")
    const dir = lines.filter((l) => l.anchor === "direction")
    expect(dir).toHaveLength(2)
    for (const l of dir) expect(l.denominator).toBe("1 of 3 available reviews")
  })
})

describe("a needle inside the restaurant's own name is not evidence", () => {
  it("ignores a cuisine word that the place is simply called", () => {
    // Found by running the real pipeline: "French" matched "Emmy French Corner has so
    // many delicious pastries", and that noise ranked a pastry shop above a Breton
    // creperie. A name is not a statement about the food.
    const p = parsed({ cuisine: { value: "French", confidence: 0.9 } })
    const reviews = [{ text: "Emmy French Corner has so many different delicious pastries" }]
    const withName = matchReviewPhrases(p, reviews, "2026-08-28T00:00:00Z", "Emmy French Corner")
    expect(withName.filter((l) => l.anchor === "cuisine")).toHaveLength(0)
  })

  it("still matches the same word for a place not named after it", () => {
    const p = parsed({ cuisine: { value: "French", confidence: 0.9 } })
    const reviews = [{ text: "the most convincing French cooking I have had here" }]
    const lines = matchReviewPhrases(p, reviews, "2026-08-28T00:00:00Z", "MAISON BREIZH")
    expect(lines.filter((l) => l.anchor === "cuisine").length).toBeGreaterThan(0)
  })
})
