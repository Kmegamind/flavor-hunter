import { describe, expect, it } from "vitest"
import { prefilterCandidates } from "@/lib/pipeline/prefilter"
import type { AnchorSet, ParsedEnvelope } from "@/schemas"

const env = (a: Partial<AnchorSet>): ParsedEnvelope =>
  ({
    intent: "find_restaurant",
    category_name: "x",
    category_confidence: 0.9,
    searchable: true,
    missing_required: [],
    anchors: {
      dish: null, cuisine: null, substyle: null, sensory: [], direction: null,
      person: null, setting: null, price_band: null, ritual: null, benchmark: null,
      negation: [], query_variants: [], fallback_ladder: [], ...a,
    },
  }) as ParsedEnvelope

const c = (id: string, name: string, types: string[]) => ({ id, name, types })

describe("prefilter drops only on positive contradiction", () => {
  const french = env({ cuisine: { value: "French", confidence: 0.9 } })

  it("drops a place that claims a different cuisine and never ours", () => {
    const { keep, dropped } = prefilterCandidates(french, [
      c("a", "Creperie", ["french_restaurant", "restaurant"]),
      c("b", "Panda Wok", ["chinese_restaurant", "restaurant"]),
    ])
    expect(keep.map((k) => k.id)).toEqual(["a"])
    expect(dropped[0]).toMatchObject({ id: "b" })
    expect(dropped[0].reason).toContain("chinese restaurant")
  })

  it("keeps a place with no cuisine type at all", () => {
    // A Breton creperie is often typed `cafe` or plain `restaurant`. Requiring a positive
    // match would delete exactly the small, oddly categorised places this product is for.
    const { keep, dropped } = prefilterCandidates(french, [
      c("a", "Chez Nowhere", ["cafe", "restaurant"]),
      c("b", "Unlabelled", ["restaurant"]),
    ])
    expect(keep).toHaveLength(2)
    expect(dropped).toHaveLength(0)
  })

  it("keeps a taqueria inside a petrol station", () => {
    // From the research corpus: "it's out in a gas station in Gaithersburg and it's legit."
    const mex = env({ cuisine: { value: "Mexican", confidence: 0.9 } })
    const { keep } = prefilterCandidates(mex, [
      c("a", "Taco Bar el Guero", ["gas_station", "mexican_restaurant"]),
    ])
    expect(keep).toHaveLength(1)
  })

  it("drops a place that serves no food", () => {
    const { keep, dropped } = prefilterCandidates(french, [
      c("a", "Hotel Lobby", ["lodging", "hotel"]),
      c("b", "Bistro", ["restaurant"]),
    ])
    expect(keep.map((k) => k.id)).toEqual(["b"])
    expect(dropped[0].reason).toContain("serves food")
  })

  it("keeps a hotel that also has a restaurant", () => {
    const { keep } = prefilterCandidates(french, [
      c("a", "Hotel with Bistro", ["lodging", "french_restaurant"]),
    ])
    expect(keep).toHaveLength(1)
  })

  it("does nothing when the parse has no cuisine to compare against", () => {
    const { keep, dropped } = prefilterCandidates(env({}), [
      c("a", "Panda Wok", ["chinese_restaurant"]),
      c("b", "Creperie", ["french_restaurant"]),
    ])
    expect(keep).toHaveLength(2)
    expect(dropped).toHaveLength(0)
  })

  it("returns everything rather than an empty field", () => {
    // A filter that removes every candidate has told us it was wrong, not that there is
    // no answer — the hunt should proceed and let the evidence decide.
    const { keep, dropped } = prefilterCandidates(french, [
      c("a", "Panda Wok", ["chinese_restaurant"]),
      c("b", "Seoul BBQ", ["korean_restaurant"]),
    ])
    expect(keep).toHaveLength(2)
    expect(dropped).toHaveLength(0)
  })
})
