import { describe, expect, it } from "vitest"
import { SEEDED_EXAMPLES } from "@/lib/examples"
import { huntReducer, initialHuntState } from "@/lib/machines/hunt"
import { dummyParsedEvent, huntToEvents } from "@/lib/pipeline/run-hunt"
import { resolveCenter } from "@/lib/pipeline/geocode"
import { centerFor, lookupCityCenter } from "@/lib/pipeline/polar"
import type { HuntRequest } from "@/schemas"

const baseReq: HuntRequest = {
  memory_text: SEEDED_EXAMPLES[0].memory_text,
  locale: "en",
  range_mi: 20,
  city_label: "Boston, MA",
}

describe("FR-2a confirm gate", () => {
  it("parse-only request emits parsed and issues zero Places calls", async () => {
    const orig = globalThis.fetch
    let places = 0
    globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
      if (String(args[0]).includes("places.googleapis.com")) places += 1
      return orig(...args)
    }) as typeof fetch
    try {
      const events = await huntToEvents(baseReq)
      expect(events.map((e) => e.type)).toEqual(["parsed"])
      expect(events.some((e) => e.type === "candidates")).toBe(false)
      expect(places).toBe(0)
    } finally {
      globalThis.fetch = orig
    }
  })

  it("STREAM_END after a named parse lands on S1B", () => {
    let s = huntReducer(initialHuntState, { type: "SUBMIT", request: baseReq })
    s = huntReducer(s, { type: "STREAM", event: dummyParsedEvent() })
    s = huntReducer(s, { type: "STREAM_END" })
    expect(s.phase).toBe("S1B_CONFIRM")
    expect(s.category_name).toBeTruthy()
  })

  it("clue re-parse with dish lands on S1B, not a hunt", () => {
    const vague: HuntRequest = {
      memory_text: "Missing home food.",
      locale: "en",
      range_mi: 20,
      city_label: "Washington, DC",
    }
    const emptyAnchors = {
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
      query_variants: [] as string[],
      fallback_ladder: [],
    }
    let s = huntReducer(initialHuntState, { type: "SUBMIT", request: vague })
    s = huntReducer(s, {
      type: "STREAM",
      event: {
        type: "parsed",
        category_name: "",
        confidence: 0,
        searchable: false,
        missing_required: ["dish_or_cuisine"],
        anchors: emptyAnchors,
      },
    })
    s = huntReducer(s, { type: "STREAM", event: { type: "need_clue", missing_required: ["dish_or_cuisine"] } })
    expect(s.phase).toBe("S2_NEED_CLUE")
    s = huntReducer(s, {
      type: "SUBMIT",
      request: {
        ...vague,
        memory_text: "Missing home food.\nThe dish or cuisine is: Chinese",
      },
    })
    s = huntReducer(s, {
      type: "STREAM",
      event: {
        type: "parsed",
        category_name: "Chinese",
        confidence: 0.7,
        searchable: true,
        missing_required: [],
        anchors: { ...emptyAnchors, cuisine: { value: "Chinese", confidence: 0.75 } },
      },
    })
    s = huntReducer(s, { type: "STREAM_END" })
    expect(s.phase).toBe("S1B_CONFIRM")
    expect(s.ranked).toEqual([])
  })

  it("confirmed parse does not stop on S1B", () => {
    let s = huntReducer(initialHuntState, {
      type: "SUBMIT",
      request: { ...baseReq, confirmed: true },
    })
    s = huntReducer(s, { type: "STREAM", event: dummyParsedEvent() })
    s = huntReducer(s, { type: "STREAM_END" })
    expect(s.phase).toBe("S1_DECODING")
  })

  it("Not quite RESET from S1B returns idle", () => {
    let s = huntReducer(initialHuntState, { type: "SUBMIT", request: baseReq })
    s = huntReducer(s, { type: "STREAM", event: dummyParsedEvent() })
    s = huntReducer(s, { type: "STREAM_END" })
    s = huntReducer(s, { type: "RESET" })
    expect(s.phase).toBe("S0_IDLE")
  })
})

describe("near / geocode", () => {
  it("rounds provided coords to 3 decimal places", async () => {
    const c = await resolveCenter("49 Main Street, MD", { lat: 39.1234, lng: -77.5678 })
    expect(c).toEqual({ lat: 39.123, lng: -77.568 })
  })

  it("uses the city table when coords are missing", async () => {
    const c = await resolveCenter("Boston, MA")
    expect(c).toEqual({ lat: 42.36, lng: -71.059 })
  })

  it("matches DC aliases instead of snapping to Boston", () => {
    expect(lookupCityCenter("washington.d.c")).toEqual({ lat: 38.907, lng: -77.037 })
    expect(lookupCityCenter("Washington DC")).toEqual({ lat: 38.907, lng: -77.037 })
    expect(centerFor("not-a-real-city")).toEqual({ lat: 38.907, lng: -77.037 })
  })

  it("unknown street addresses do not silently hunt Boston", async () => {
    const c = await resolveCenter("1600 Pennsylvania Avenue NW, Washington, DC")
    expect(c).not.toEqual({ lat: 42.36, lng: -71.059 })
  })
})

describe("SELECT_CANDIDATE", () => {
  it("locks another scored pin without eliminating the previous", () => {
    const ranked = [
      {
        id: "a",
        name: "A",
        distance: 1,
        bearing: 0,
        score: 90,
        evidence: [],
      },
      {
        id: "b",
        name: "B",
        distance: 2,
        bearing: 90,
        score: 70,
        evidence: [],
      },
    ]
    let s = huntReducer(initialHuntState, { type: "SUBMIT", request: { ...baseReq, confirmed: true } })
    s = huntReducer(s, {
      type: "STREAM",
      event: {
        type: "candidates",
        count: 2,
        blips: [
          { id: "a", bearing: 0, distance: 1, lat: 42.36, lng: -71.06 },
          { id: "b", bearing: 90, distance: 2, lat: 42.37, lng: -71.05 },
        ],
      },
    })
    s = huntReducer(s, {
      type: "STREAM",
      event: { type: "locked", ranked },
    })
    expect(s.locked_id).toBe("a")
    s = huntReducer(s, { type: "SELECT_CANDIDATE", id: "b" })
    expect(s.phase).toBe("S4_LOCKED")
    expect(s.locked_id).toBe("b")
    expect(s.blips.find((b) => b.id === "a")?.status).toBe("candidate")
    expect(s.blips.find((b) => b.id === "b")?.status).toBe("locked")
  })
})

describe("PATCH_ANCHORS", () => {
  it("edits confirm chips without ranking a restaurant", () => {
    let s = huntReducer(initialHuntState, { type: "SUBMIT", request: baseReq })
    s = huntReducer(s, { type: "STREAM", event: dummyParsedEvent() })
    s = huntReducer(s, { type: "STREAM_END" })
    expect(s.phase).toBe("S1B_CONFIRM")
    const next = {
      ...s.anchors!,
      dish: { value: "tomato omelette", confidence: 0.9 },
    }
    s = huntReducer(s, { type: "PATCH_ANCHORS", anchors: next })
    expect(s.phase).toBe("S1B_CONFIRM")
    expect(s.anchors?.dish?.value).toBe("tomato omelette")
    expect(s.ranked).toEqual([])
  })
})
