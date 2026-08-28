import { describe, expect, it } from "vitest"
import { parseHeuristic } from "@/lib/pipeline/parse-heuristic"
import { findGroundedRung, listingMatchesRung } from "@/lib/pipeline/ground-substitute"
import { huntToEvents } from "@/lib/pipeline/run-hunt"
import type { InternalCandidate } from "@/lib/pipeline/fixture-data"

const dryPot: InternalCandidate = {
  id: "x1",
  name: "Dry Pot Alley",
  lat: 42.36,
  lng: -71.06,
  types: ["chinese_restaurant"],
  menu_text: "spicy dry pot xiangguo. no broth.",
  reviews: [{ text: "spicy dry pot, not a soup" }],
}

const dumplingsOnly: InternalCandidate = {
  id: "x0",
  name: "North Tea House",
  lat: 42.36,
  lng: -71.05,
  types: ["chinese_restaurant"],
  menu_text: "house dumplings. tea. no specialty soup listed.",
  reviews: [{ text: "nice staff" }],
}

describe("grounded substitute", () => {
  it("matches spicy dry pot from nearby menu text, not from the ladder alone", () => {
    const parsed = parseHeuristic("I want proper northeastern malatang, the spicy hot pot kind")
    const rung = parsed.anchors.fallback_ladder[0]!
    expect(rung.dish).toBe("spicy dry pot")
    expect(listingMatchesRung(dryPot, rung)).toBe(true)
    expect(listingMatchesRung(dumplingsOnly, rung)).toBe(false)
    expect(findGroundedRung(parsed, [dumplingsOnly])).toBeNull()
    const hit = findGroundedRung(parsed, [dumplingsOnly, dryPot])
    expect(hit?.hit.name).toBe("Dry Pot Alley")
  })

  it("A12 copy names the nearby listing instead of dumping the parser relation", async () => {
    const events = await huntToEvents({
      memory_text: "I want proper northeastern malatang, the spicy hot pot kind",
      locale: "zh-CN",
      range_mi: 20,
      city_label: "Boston, MA",
      confirmed: true,
    })
    const sub = events.find((e) => e.type === "substitute")
    expect(sub?.type).toBe("substitute")
    if (sub?.type === "substitute") {
      expect(sub.to.dish).toBe("spicy dry pot")
      expect(sub.to.relation).toBe("found nearby at Dry Pot Alley — closest match to malatang")
      expect(sub.to.relation).not.toMatch(/same flavour profile/)
    }
  })
})
