import { describe, expect, it } from "vitest"
import { FIXTURE_CENTER, reanchorEvent } from "@/lib/stream/reanchor-blips"

describe("reanchorBlips", () => {
  it("offsets candidate blips from Boston to the user center", () => {
    const dc = { lat: 38.907, lng: -77.037 }
    const out = reanchorEvent(
      {
        type: "candidates",
        count: 1,
        blips: [{ id: "c0", bearing: 0, distance: 1, lat: 42.351, lng: -71.06 }],
      },
      dc,
      FIXTURE_CENTER,
    )
    expect(out.type).toBe("candidates")
    if (out.type !== "candidates") return
    expect(out.blips[0]?.lat).toBeCloseTo(42.351 + (dc.lat - FIXTURE_CENTER.lat), 2)
    expect(out.blips[0]?.lng).toBeCloseTo(-71.06 + (dc.lng - FIXTURE_CENTER.lng), 2)
  })

  it("leaves non-candidate events unchanged", () => {
    const ev = { type: "need_clue" as const, missing_required: ["dish_or_cuisine" as const] }
    expect(reanchorEvent(ev, { lat: 38.907, lng: -77.037 })).toBe(ev)
  })
})
