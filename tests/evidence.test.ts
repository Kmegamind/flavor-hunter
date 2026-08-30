import { describe, expect, it } from "vitest"
import type { AnchorSet, ParsedEnvelope } from "@/schemas"
import { filterWebsiteQuotes } from "@/schemas/score"
import { evidenceLlmUserPayload } from "@/lib/pipeline/evidence"

describe("the evidence call is told what the rubric pays for", () => {
  const env = (a: Partial<AnchorSet>): ParsedEnvelope =>
    ({
      intent: "find_restaurant",
      category_name: "galette",
      category_confidence: 0.9,
      searchable: true,
      missing_required: [],
      anchors: {
        dish: null, cuisine: null, substyle: null, sensory: [], direction: null,
        person: null, setting: null, price_band: null, ritual: null, benchmark: null,
        negation: [], query_variants: [], fallback_ladder: [], ...a,
      },
    }) as ParsedEnvelope

  it("ranks the supplied anchors by what they are worth", () => {
    const p = evidenceLlmUserPayload(
      env({
        dish: { value: "galette", confidence: 0.9 },
        price_band: { value: "cheap", confidence: 0.5 },
        cuisine: { value: "French", confidence: 0.9 },
      }),
      [],
    ) as { anchor_priority: { anchor: string; points: number }[] }

    expect(p.anchor_priority[0]).toEqual({ anchor: "dish", points: 30 })
    // cuisine has its 20-point group to itself here (no direction supplied); price_band has
    // the whole 20-point tail group. Order matters more than the exact split.
    const pts = p.anchor_priority.map((r) => r.points)
    expect(pts).toEqual([...pts].sort((a, b) => b - a))
  })

  it("omits anchors the user never supplied, so they are not searched for", () => {
    const p = evidenceLlmUserPayload(
      env({ dish: { value: "galette", confidence: 0.9 } }),
      [],
    ) as { anchor_priority: { anchor: string }[] }
    expect(p.anchor_priority.map((r) => r.anchor)).toEqual(["dish"])
  })

  it("weights never override byte-verification", () => {
    // The whole risk of telling a model what an anchor is worth: it invents the expensive one.
    // filterWebsiteQuotes is downstream of the prompt and does not consult weights at all.
    const menu = "buckwheat galette with ham"
    expect(filterWebsiteQuotes([
      { anchor: "dish", quote: "buckwheat galette", source: "website" },
      { anchor: "dish", quote: "authentic Breton galette complete", source: "website" },
    ] as never, menu).map((e) => e.quote)).toEqual(["buckwheat galette"])
  })
})
