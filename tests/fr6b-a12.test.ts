import { describe, expect, it } from "vitest"
import { parseHeuristic } from "@/lib/pipeline/parse-heuristic"
import { evidenceLlmUserPayload } from "@/lib/pipeline/evidence"
import { matchReviewPhrases } from "@/lib/pipeline/review-match"
import { searchQueries, nextLadderRung, VARIANT_CAP } from "@/lib/pipeline/search-queries"
import { DEFAULT_MEMORY, SEEDED_EXAMPLES } from "@/lib/examples"
import type { InternalCandidate } from "@/lib/pipeline/fixture-data"

describe("FR-6b dual-substrate", () => {
  it("never puts review text in the evidence LLM payload", () => {
    const parsed = parseHeuristic("I want proper northeastern malatang, the spicy hot pot kind")
    const marker = "UNIQUE_REVIEW_BODY_SHOULD_NOT_LEAVE_THE_HANDLER"
    const candidates: InternalCandidate[] = [
      {
        id: "c0",
        name: "No Site Kitchen",
        lat: 42.35,
        lng: -71.06,
        types: ["chinese_restaurant"],
        menu_text: "dumplings",
        reviews: [{ text: marker }],
      },
    ]
    const payload = JSON.stringify(evidenceLlmUserPayload(parsed, candidates))
    expect(payload).not.toContain(marker)
    expect(payload).not.toMatch(/"reviews"/)
  })

  it("matches review phrases deterministically and tags mechanism", () => {
    const parsed = parseHeuristic("I want proper northeastern malatang, the spicy hot pot kind")
    const lines = matchReviewPhrases(
      parsed,
      [
        { text: "best malatang in town", date: "2026-01" },
        { text: "friendly staff" },
      ],
      "t",
    )
    expect(lines.length).toBeGreaterThan(0)
    expect(lines.every((l) => l.source === "google_review")).toBe(true)
    expect(lines.every((l) => l.mechanism === "deterministic_match")).toBe(true)
    expect(lines.every((l) => l.source_name === "Google")).toBe(true)
    expect("best malatang in town".includes(lines[0].quote)).toBe(true)
  })
})

describe("FR-1 query_variants + FR-4b-2 ladder", () => {
  it("searches more than the user's spelling and caps breadth", () => {
    const parsed = parseHeuristic("I want proper northeastern malatang, the spicy hot pot kind")
    const qs = searchQueries(parsed, "Boston, MA")
    expect(qs.some((q) => /mala/i.test(q))).toBe(true)
    expect(qs.length).toBeGreaterThan(1)
    expect(qs.length).toBeLessThanOrEqual(VARIANT_CAP)
  })

  it("offers one unused rung with a required relation", () => {
    const parsed = parseHeuristic("I want proper northeastern malatang, the spicy hot pot kind")
    const first = nextLadderRung(parsed.anchors.fallback_ladder, null)
    expect(first?.dish).toBe("spicy dry pot")
    expect(first?.relation).toBeTruthy()
    const second = nextLadderRung(parsed.anchors.fallback_ladder, first ?? undefined)
    expect(second?.dish).toBe("maocai")
  })
})

describe("FR-4c seeded examples", () => {
  /**
   * Asserts what the requirement cares about, not the copy. An earlier version hardcoded
   * chip labels and capped length at 120 chars — which failed whenever the copy changed, and
   * the cap itself pushed the examples toward telegraphic fragments the parser cannot use.
   */
  it("the prefilled memory teaches the granularity, in one or two sentences", () => {
    expect(DEFAULT_MEMORY.length).toBeGreaterThan(90)
    expect(DEFAULT_MEMORY.length).toBeLessThan(280)
    const sentences = DEFAULT_MEMORY.split(/[.!?]+\s/).filter((s) => s.trim().length > 0)
    expect(sentences.length).toBeLessThanOrEqual(2)
  })

  it("the prefilled memory is the naming case: it never says the word", () => {
    expect(DEFAULT_MEMORY.toLowerCase()).not.toMatch(/galette/)
    expect(DEFAULT_MEMORY.toLowerCase()).toMatch(/savoury|savory/)
  })

  it("shows two examples in full, with no city or range pinned", () => {
    expect(SEEDED_EXAMPLES).toHaveLength(2)
    for (const ex of SEEDED_EXAMPLES) {
      expect(ex.locale).toBe("en")
      expect(ex.memory_text.length).toBeGreaterThan(90)
      expect(ex.memory_text.length).toBeLessThan(280)
      // A11: examples fill the memory field only. Pinning a city here would make the
      // memory's origin double as the search location.
      expect(ex).not.toHaveProperty("city_label")
      expect(ex).not.toHaveProperty("range_mi")
    }
  })

  it("every seeded memory is searchable and carries more than a bare dish name", () => {
    for (const text of [DEFAULT_MEMORY, ...SEEDED_EXAMPLES.map((e) => e.memory_text)]) {
      const p = parseHeuristic(text)
      expect(p.intent).toBe("find_restaurant")
      const a = p.anchors
      const richness =
        (a.dish ? 1 : 0) +
        (a.cuisine ? 1 : 0) +
        (a.substyle ? 1 : 0) +
        (a.person ? 1 : 0) +
        (a.setting ? 1 : 0) +
        (a.direction ? 1 : 0) +
        a.sensory.length +
        a.negation.length
      expect(richness).toBeGreaterThanOrEqual(2)
      expect(JSON.stringify(p).toLowerCase()).not.toMatch(/"authenticity"\s*:/)
    }
  })

  it("the Lao example states an exclusion, not an interest in Thai food", () => {
    // The pipeline rule this guards: "not a Thai restaurant with a couple of Lao dishes"
    // must become a filter. Reading it as a cuisine signal would rank Thai places up —
    // the exact opposite of what was asked.
    const lao = SEEDED_EXAMPLES.find((e) => e.id === "lao")
    expect(lao).toBeDefined()
    expect(lao!.memory_text.toLowerCase()).toMatch(/not a thai restaurant/)
    const p = parseHeuristic(lao!.memory_text)
    const positives = JSON.stringify([p.anchors.cuisine, p.anchors.substyle]).toLowerCase()
    expect(positives).not.toMatch(/thai/)
  })
})
