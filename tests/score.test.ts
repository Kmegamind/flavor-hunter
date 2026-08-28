import { describe, expect, it } from "vitest"
import { byteVerify, memoryMatch, rubricWeights, unmatchedAnchors, whyNotHundred } from "@/schemas/score"
import type { AnchorSet, EvidenceLine } from "@/schemas"

const anchors: AnchorSet = {
  dish: { value: "tomato and egg", confidence: 0.9 },
  cuisine: { value: "Chinese", confidence: 0.8 },
  substyle: { value: "Hunan", confidence: 0.7 },
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

describe("byteVerify + memoryMatch", () => {
  it("accepts only literal substrings", () => {
    expect(byteVerify("home-style tomato and egg (sweet)", "menu home-style tomato and egg (sweet) end")).toBe(true)
    expect(byteVerify("sweet-style", "menu home-style tomato and egg (sweet)")).toBe(false)
  })

  it("returns null when earned is 0 — never a 0%", () => {
    expect(memoryMatch(anchors, [])).toBeNull()
  })

  it("caps at 97 and is hand-auditable from weights", () => {
    const rows = rubricWeights(anchors)
    const available = rows.reduce((s, r) => s + r.weight, 0)
    const evidence: EvidenceLine[] = [
      {
        anchor: "dish",
        quote: "tomato",
        source: "website",
        mechanism: "llm_extracted",
        source_name: "x",
        fetched_at: "t",
        verified: true,
      },
      {
        anchor: "sensory",
        quote: "sweet",
        source: "website",
        mechanism: "llm_extracted",
        source_name: "x",
        fetched_at: "t",
        verified: true,
      },
    ]
    const earned = rows.filter((r) => ["dish", "sensory"].includes(r.key)).reduce((s, r) => s + r.weight, 0)
    expect(memoryMatch(anchors, evidence)).toBe(Math.round(100 * Math.min(0.97, earned / available)))
  })
})

describe("FR-9 residual gap", () => {
  it("lists supplied anchors with no verified quote", () => {
    const evidence: EvidenceLine[] = [
      {
        anchor: "dish",
        quote: "tomato",
        source: "website",
        mechanism: "llm_extracted",
        source_name: "x",
        fetched_at: "t",
        verified: true,
      },
    ]
    const gaps = unmatchedAnchors(anchors, evidence)
    expect(gaps.some((g) => g.key === "dish")).toBe(false)
    expect(gaps.some((g) => g.key === "person")).toBe(true)
    expect(whyNotHundred(anchors, evidence)).toMatch(/no evidence for/)
  })

  it("explains the 97% cap when every supplied anchor is cited", () => {
    const keys = rubricWeights(anchors).map((r) => r.key)
    const evidence: EvidenceLine[] = keys.map((anchor) => ({
      anchor,
      quote: anchor,
      source: "website" as const,
      mechanism: "llm_extracted" as const,
      source_name: "x",
      fetched_at: "t",
      verified: true as const,
    }))
    expect(unmatchedAnchors(anchors, evidence)).toHaveLength(0)
    expect(whyNotHundred(anchors, evidence)).toMatch(/capped at 97/)
  })
})
