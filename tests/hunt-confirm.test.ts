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

describe("the confidence bar", () => {
  it("keeps the near-misses visible instead of reporting nothing", () => {
    // A single weak evidence line used to be enough to present a 25% match as the answer.
    // Now the offers come first and the ranking follows, labelled with the real number.
    const s = huntReducer(
      { ...initialHuntState, phase: "S8_NO_ANSWER" },
      {
        type: "STREAM",
        event: {
          type: "locked",
          below_bar: true,
          best_score: 31,
          ranked: [
            { id: "c0", name: "Some Place", distance: 2, bearing: 10, score: 31, evidence: [] },
          ],
        } as never,
      },
    )
    expect(s.below_bar).toBe(true)
    expect(s.best_score).toBe(31)
    expect(s.ranked).toHaveLength(1)
    // Phase stays where it was: the doors are the headline, not a locked target.
    expect(s.phase).toBe("S8_NO_ANSWER")
  })

  it("locks normally at or above the bar", () => {
    // From S3, the realistic prior phase — the reducer drops events that do not belong to
    // the phase it is in, so starting at S0_IDLE would test nothing.
    const s = huntReducer(
      { ...initialHuntState, phase: "S3_HUNTING" },
      {
        type: "STREAM",
        event: {
          type: "locked",
          ranked: [
            { id: "c1", name: "Good Place", distance: 1, bearing: 0, score: 63, evidence: [] },
          ],
        } as never,
      },
    )
    expect(s.below_bar).toBeFalsy()
    expect(s.phase).toBe("S4_LOCKED")
    expect(s.locked_id).toBe("c1")
  })
})

describe("the reason arrives after the lock", () => {
  it("is not swallowed by the post-lock guard", () => {
    // The guard was written when every event arrived before `locked`. Streaming the reason
    // afterwards meant it hit `illegal()` and vanished, with no symptom beyond a card that
    // never grew a paragraph.
    const locked = huntReducer(
      { ...initialHuntState, phase: "S3_HUNTING" },
      {
        type: "STREAM",
        event: {
          type: "locked",
          ranked: [
            { id: "c1", name: "Good Place", distance: 1, bearing: 0, score: 63, evidence: [] },
          ],
        } as never,
      },
    )
    expect(locked.phase).toBe("S4_LOCKED")
    expect(locked.ranked[0].reason).toBeUndefined()

    const withReason = huntReducer(locked, {
      type: "STREAM",
      event: {
        type: "reason",
        id: "c1",
        reason: "The menu lists it and two reviews agree.",
        reason_source: "written",
      } as never,
    })
    expect(withReason.ranked[0].reason).toContain("two reviews agree")
    expect(withReason.ranked[0].reason_source).toBe("written")
    // The lock itself is untouched.
    expect(withReason.phase).toBe("S4_LOCKED")
    expect(withReason.locked_id).toBe("c1")
  })

  it("ignores a reason for a candidate that is not on screen", () => {
    const s = huntReducer(
      {
        ...initialHuntState,
        phase: "S4_LOCKED",
        ranked: [{ id: "c1", name: "A", distance: 1, bearing: 0, score: 60, evidence: [] }] as never,
      },
      {
        type: "STREAM",
        event: { type: "reason", id: "c9", reason: "x", reason_source: "written" } as never,
      },
    )
    expect(s.ranked[0].reason).toBeUndefined()
  })
})

describe("the name arrives before the anchors", () => {
  it("shows the headline from `interpreted`, then fills in from `parsed`", () => {
    // Naming is roughly half the parse stage and is the only part the user is waiting for.
    // Emitting it early puts the headline on screen without making anything faster.
    const named = huntReducer(
      { ...initialHuntState, phase: "S1_DECODING" },
      {
        type: "STREAM",
        event: {
          type: "interpreted",
          category_name: "Breton Buckwheat Galette",
          category_name_native: null,
          confidence: 0.95,
          reasoning: "darker batter implies buckwheat, which makes it a galette",
        } as never,
      },
    )
    expect(named.category_name).toBe("Breton Buckwheat Galette")
    expect(named.interpreting).toBe(true)
    expect(named.anchors).toBeNull()

    const full = huntReducer(named, {
      type: "STREAM",
      event: {
        type: "parsed",
        category_name: "Breton Buckwheat Galette",
        confidence: 0.95,
        searchable: true,
        missing_required: [],
        anchors: {
          dish: { value: "buckwheat galette", confidence: 0.9 },
          cuisine: null, substyle: null, sensory: [], direction: null, person: null,
          setting: null, price_band: null, ritual: null, benchmark: null,
          negation: [], query_variants: [], fallback_ladder: [],
        },
      } as never,
    })
    expect(full.interpreting).toBe(false)
    expect(full.anchors?.dish?.value).toBe("buckwheat galette")
  })
})
