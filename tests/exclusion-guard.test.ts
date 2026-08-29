import { describe, expect, it } from "vitest"
import { enforceExclusions, markExcludedCandidates } from "@/lib/pipeline/exclusion-guard"
import type { AnchorSet, ParsedEnvelope, RankedCandidate } from "@/schemas"

const anchors = (a: Partial<AnchorSet>): AnchorSet => ({
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
  ...a,
})

const envelope = (a: Partial<AnchorSet>): ParsedEnvelope =>
  ({
    intent: "find_restaurant",
    category_name: "laab and sticky rice",
    category_confidence: 0.9,
    anchors: anchors(a),
    searchable: true,
    missing_required: [],
  }) as ParsedEnvelope

describe("an exclusion must not end up in a positive anchor", () => {
  it("drops a cuisine the user explicitly ruled out", () => {
    // The shipped Lao example: "...not a Thai restaurant with a couple of Lao dishes."
    // Reading that as an interest in Thai food ranks Thai places up — the opposite of the ask.
    const { parsed, violations } = enforceExclusions(
      envelope({
        cuisine: { value: "Thai", confidence: 0.8 },
        negation: [{ field: "cuisine", value: "Thai restaurant" }],
      }),
    )
    expect(parsed.anchors.cuisine).toBeNull()
    expect(violations).toHaveLength(1)
    expect(violations[0]).toMatchObject({ where: "anchor", anchor: "cuisine" })
  })

  it("keeps the exclusion itself — it is the more reliable of the two statements", () => {
    const { parsed } = enforceExclusions(
      envelope({
        cuisine: { value: "Thai", confidence: 0.8 },
        negation: [{ field: "cuisine", value: "Thai" }],
      }),
    )
    expect(parsed.anchors.negation).toHaveLength(1)
  })

  it("strips an excluded term from sensory and from the search variants", () => {
    const { parsed, violations } = enforceExclusions(
      envelope({
        dish: { value: "crepe", confidence: 0.9 },
        sensory: [
          { value: "savoury", confidence: 0.9 },
          { value: "sweet dessert kind", confidence: 0.5 },
        ],
        query_variants: ["galette", "sweet dessert crepe"],
        negation: [{ field: "sensory", value: "sweet dessert" }],
      }),
    )
    expect(parsed.anchors.sensory.map((s) => s.value)).toEqual(["savoury"])
    expect(parsed.anchors.query_variants).toEqual(["galette"])
    expect(violations.length).toBeGreaterThanOrEqual(2)
  })

  it("will not offer the excluded thing back as a substitute", () => {
    // "You didn't want a Thai restaurant — how about a Thai restaurant?"
    const { parsed, violations } = enforceExclusions(
      envelope({
        dish: { value: "laab", confidence: 0.9 },
        fallback_ladder: [
          { cuisine: "Thai", relation: "neighbouring cuisine" },
          { cuisine: "Vietnamese", relation: "neighbouring cuisine" },
        ],
        negation: [{ field: "cuisine", value: "Thai" }],
      }),
    )
    expect(parsed.anchors.fallback_ladder.map((r) => r.cuisine)).toEqual(["Vietnamese"])
    expect(violations.some((v) => v.where === "fallback_ladder")).toBe(true)
  })

  it("does nothing when there is nothing to exclude", () => {
    const env = envelope({ dish: { value: "laab", confidence: 0.9 } })
    const { parsed, violations } = enforceExclusions(env)
    expect(violations).toEqual([])
    expect(parsed.anchors.dish?.value).toBe("laab")
  })

  it("matches whole words, so it does not invent violations", () => {
    // "lao" must not fire on "jalapeño"; a two-letter term must not fire at all.
    const { violations } = enforceExclusions(
      envelope({
        dish: { value: "jalapeño poppers", confidence: 0.9 },
        negation: [{ field: "cuisine", value: "lao" }],
      }),
    )
    expect(violations).toEqual([])
  })
})

describe("a candidate matching an exclusion must be marked", () => {
  const cand = (p: Partial<RankedCandidate>): RankedCandidate =>
    ({
      id: "c0",
      name: "Bangkok Garden",
      lat: 0,
      lng: 0,
      distance: 1,
      bearing: 0,
      score: 60,
      evidence: [],
      ...p,
    }) as RankedCandidate

  it("marks a candidate whose name carries the excluded term", () => {
    const { ranked, marked } = markExcludedCandidates(
      envelope({ negation: [{ field: "cuisine", value: "Bangkok" }] }),
      [cand({})],
    )
    expect(marked).toBe(1)
    expect(ranked[0].excluded_by).toContain("Bangkok")
  })

  it("marks on evidence text too, not only the name", () => {
    const { ranked } = markExcludedCandidates(
      envelope({ negation: [{ field: "direction", value: "buffet" }] }),
      [
        cand({
          name: "Vientiane Kitchen",
          evidence: [
            {
              anchor: "dish",
              quote: "all you can eat buffet daily",
              source: "website",
              mechanism: "llm_extracted",
              source_name: "example.com",
              fetched_at: "2026-08-28T00:00:00Z",
              verified: true,
            },
          ],
        }),
      ],
    )
    expect(ranked[0].excluded_by).toContain("buffet")
  })

  it("leaves an existing reason alone", () => {
    const { ranked } = markExcludedCandidates(
      envelope({ negation: [{ field: "cuisine", value: "Bangkok" }] }),
      [cand({ excluded_by: "wrong cuisine type" })],
    )
    expect(ranked[0].excluded_by).toBe("wrong cuisine type")
  })

  it("marks nothing when no candidate matches", () => {
    const { marked } = markExcludedCandidates(
      envelope({ negation: [{ field: "cuisine", value: "Thai" }] }),
      [cand({ name: "Vientiane Kitchen" })],
    )
    expect(marked).toBe(0)
  })
})

describe("an exclusion clause that also names the wanted thing", () => {
  it("does not drop the cuisine the user is actually asking for", () => {
    // Production, verbatim: the parser returned the whole clause as the exclusion value.
    // Because it mentions Lao, matching on all of it dropped `cuisine: "Lao"` and the hunt
    // locked a Korean restaurant at 43% on a single evidence line.
    const { parsed, violations } = enforceExclusions(
      envelope({
        dish: { value: "laab and sticky rice", confidence: 0.9 },
        cuisine: { value: "Lao", confidence: 0.95 },
        query_variants: ["laab", "larb", "sticky rice", "Lao food"],
        negation: [{ field: "cuisine", value: "Thai restaurant with a couple of Lao dishes" }],
      }),
    )
    expect(parsed.anchors.cuisine?.value).toBe("Lao")
    expect(parsed.anchors.query_variants).toContain("Lao food")
    expect(violations).toEqual([])
  })

  it("still drops the thing the clause actually excludes", () => {
    const { parsed } = enforceExclusions(
      envelope({
        cuisine: { value: "Thai", confidence: 0.8 },
        negation: [{ field: "cuisine", value: "Thai restaurant with a couple of Lao dishes" }],
      }),
    )
    expect(parsed.anchors.cuisine).toBeNull()
  })
})
