import { describe, expect, it } from "vitest"
import { refine } from "@/lib/refine"
import type { AnchorSet, RankedCandidate } from "@/schemas"

const anchors: AnchorSet = {
  dish: { value: "tomato and egg", confidence: 0.9 },
  cuisine: { value: "Chinese", confidence: 0.8 },
  substyle: null,
  sensory: [{ value: "sweet", confidence: 0.8 }],
  direction: "family_home",
  person: { value: "grandmother", confidence: 0.9 },
  setting: null,
  price_band: null,
  ritual: null,
  benchmark: null,
  negation: [],
  query_variants: [],
  fallback_ladder: [],
}

const ranked: RankedCandidate[] = [
  {
    id: "c7",
    name: "Hunan Kitchen",
    distance: 2.3,
    bearing: 210,
    score: 94,
    evidence: [
      {
        anchor: "dish",
        quote: "home-style tomato and egg (sweet)",
        source: "website",
        mechanism: "llm_extracted",
        source_name: "example.invalid",
        fetched_at: "t",
        verified: true,
      },
    ],
  },
]

describe("refine", () => {
  it("issues no I/O and may lower the score", () => {
    const before = ranked[0].score
    const out = refine({
      anchors,
      category_name: "sweet-style home-cooked tomato and egg",
      ranked,
      correction: { kind: "nl", text: "too sour" },
    })
    expect(out.locked_id).toBeTruthy()
    expect(out.ranked[0].score === null || (before !== null && out.ranked[0].score! <= before!)).toBe(true)
    expect(out.anchors.negation.some((n) => n.value === "sour")).toBe(true)
  })
})
