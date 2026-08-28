import { describe, expect, it } from "vitest"
import { allowedNumbers, guardReason, templateReason } from "@/lib/pipeline/reason"
import type { EvidenceLine } from "@/schemas"

const line = (p: Partial<EvidenceLine>): EvidenceLine => ({
  anchor: "dish",
  quote: "home-style tomato and egg",
  source: "website",
  mechanism: "llm_extracted",
  source_name: "example.com",
  fetched_at: "2026-08-28T00:00:00Z",
  verified: true,
  ...p,
})

const evidence: EvidenceLine[] = [
  line({}),
  line({
    anchor: "direction",
    quote: "tastes like the one my mom made",
    source: "google_review",
    mechanism: "deterministic_match",
    source_name: "Google",
    denominator: "3 of 5 available reviews",
  }),
]

describe("guardReason: prose may not smuggle in unverified quantities", () => {
  it("allows numbers that appear in a denominator or the score", () => {
    expect(allowedNumbers(evidence, 94)).toEqual(new Set([94, 3, 5]))
    expect(guardReason("Three of the five reviews describe it as home-style.", evidence, 94).ok).toBe(true)
  })

  it("rejects an inflated count — the exact failure the product must not ship", () => {
    const r = guardReason("Seven reviewers say it tastes like home.", evidence, 94)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.why).toContain("seven")
  })

  it("rejects a digit nobody verified", () => {
    expect(guardReason("12 reviews mention the sweetness.", evidence, 94).ok).toBe(false)
  })

  it("rejects certainty overclaims", () => {
    expect(guardReason("This is perfectly what you described.", evidence, 94).ok).toBe(false)
    expect(guardReason("A 100% match for your memory.", evidence, 94).ok).toBe(false)
  })

  it("rejects empty prose", () => {
    expect(guardReason("   ", evidence, 94).ok).toBe(false)
  })

  it("passes prose with no numbers at all", () => {
    expect(guardReason("The menu lists the sweet home-style version you described.", evidence, 94).ok).toBe(true)
  })
})

describe("templateReason: the deterministic floor", () => {
  it("needs no API key and states only what the evidence shows", () => {
    const r = templateReason(evidence, [{ key: "ritual", label: "family-style serving" }], "sweet tomato and egg")
    expect(r.source).toBe("template")
    expect(r.text).toContain("sweet tomato and egg")
    expect(r.text).toContain("3 of 5 reviews")
    expect(r.text).toContain("No evidence either way on family-style serving")
  })

  it("passes its own guard", () => {
    const r = templateReason(evidence, [], "sweet tomato and egg")
    expect(guardReason(r.text, evidence, 94).ok).toBe(true)
  })

  it("refuses to invent a reason when there is no evidence", () => {
    const r = templateReason([], [{ key: "dish", label: "the dish" }], "anything")
    expect(r.text).toBe("Not enough evidence to say why.")
    expect(r.source).toBe("none")
  })

  it("names the gap rather than quietly omitting it", () => {
    const r = templateReason(evidence, [{ key: "person", label: "who cooks it" }], "x")
    expect(r.text).toContain("who cooks it")
  })
})

describe("the guard reads assertions, not quotations", () => {
  it("does not trip on a number word inside a verbatim quote", () => {
    const t = 'Three of the five reviews say the same thing: “tastes like the one my mom made”.'
    expect(guardReason(t, evidence, 94).ok).toBe(true)
  })

  it("still trips when the writer asserts the number outside a quote", () => {
    const t = 'One review says “tastes like the one my mom made”, and seven others agree.'
    expect(guardReason(t, evidence, 94).ok).toBe(false)
  })
})
