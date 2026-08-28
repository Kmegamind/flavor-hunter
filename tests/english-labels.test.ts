import { describe, expect, it } from "vitest"
import { directionLabel, hasCjk, readableQuote, showsOriginal } from "@/lib/pipeline/english-labels"
import { byteVerify, filterWebsiteQuotes } from "@/schemas/score"
import { matchReviewPhrases } from "@/lib/pipeline/review-match"
import { parseHeuristic } from "@/lib/pipeline/parse-heuristic"

describe("display language: a translation is never a quote", () => {
  it("reads the translation when one is supplied", () => {
    expect(readableQuote({ quote: "home-style tomato and egg (sweet)", quote_en: "home-style tomato and egg (sweet)" }))
      .toBe("home-style tomato and egg (sweet)")
  })

  it("falls back to the verbatim original — never to invented text", () => {
    // Regression: displayQuote() used to strip all CJK and, when nothing was left,
    // return the sentence "listed on the restaurant website" for the UI to render
    // inside quotation marks. That fabricated a quotation (PRD FR-9 blocker).
    for (const q of ["garlic stem stir fry", "red braised pork", "tonkotsu ramen spicy"]) {
      const out = readableQuote({ quote: q })
      expect(out).toBe(q)
      expect(out).not.toContain("listed on the restaurant website")
    }
  })

  it("never alters the quote it is given", () => {
    const q = "tonkotsu ramen spicy"
    expect(readableQuote({ quote: q, quote_en: "" })).toBe(q)
    expect(readableQuote({ quote: q, quote_en: "   " })).toBe(q)
  })

  it("shows the original as a receipt only when a real translation exists", () => {
    expect(showsOriginal({ quote: "家常番茄炒蛋", quote_en: "home-style tomato and egg" })).toBe(true)
    expect(showsOriginal({ quote: "Hunan kitchen" })).toBe(false)
    expect(showsOriginal({ quote: "same", quote_en: "same" })).toBe(false)
  })

  it("labels direction enums in English", () => {
    expect(directionLabel("family_home")).toBe("home cooking")
    expect(directionLabel("americanized_chain")).toBe("Americanized chain")
  })

  it("hasCjk still detects CJK, but nothing in the display path strips it", () => {
    expect(hasCjk("家常")).toBe(true)
    expect(hasCjk("galette")).toBe(false)
  })
})

describe("byte-verification governs quote, not translation", () => {
  const menu = "家常番茄炒蛋（甜口） · Hunan kitchen · home-style"

  it("keeps a CJK quote that is present, and carries its translation through", () => {
    const out = filterWebsiteQuotes(
      [{ anchor: "dish", quote: "家常番茄炒蛋（甜口）", quote_en: "home-style tomato and egg (sweet)" }],
      menu,
    )
    expect(out).toHaveLength(1)
    expect(out[0].quote).toBe("家常番茄炒蛋（甜口）")
    expect(out[0].quote_en).toBe("home-style tomato and egg (sweet)")
    expect(byteVerify(out[0].quote, menu)).toBe(true)
  })

  it("drops a quote that is not a verbatim span, however good the translation looks", () => {
    const out = filterWebsiteQuotes(
      [{ anchor: "dish", quote: "sweet scrambled egg with tomato", quote_en: "sweet scrambled egg with tomato" }],
      menu,
    )
    expect(out).toHaveLength(0)
  })
})

describe("review denominator is a real count", () => {
  const parsed = parseHeuristic("the tomato and egg my grandmother made, a little sweet")

  it("reports the number of reviews containing the phrase, not the line index", () => {
    const dish = parsed.anchors.dish?.value ?? ""
    expect(dish.length).toBeGreaterThan(0)
    const reviews = [
      { text: `their ${dish} is great` },
      { text: `best ${dish} in town` },
      { text: "nice patio, slow service" },
      { text: "good parking" },
      { text: "will come back" },
    ]
    const lines = matchReviewPhrases(parsed, reviews, "2026-08-28T00:00:00Z")
    const dishLines = lines.filter((l) => l.anchor === "dish")
    // Two reviews contain the phrase, so two readable clauses are returned — and both
    // are stamped with the true count, not with their own line index.
    expect(dishLines).toHaveLength(2)
    for (const l of dishLines) expect(l.denominator).toBe("2 of 5 available reviews")
    expect(new Set(dishLines.map((l) => l.quote)).size).toBe(2)
  })

  it("keeps distinct spans for the same anchor — the 'N people said it' case", () => {
    // The old preferLatinQuotes() collapsed these three to one, which made the
    // aggregate claim structurally impossible to produce.
    const p = {
      ...parsed,
      anchors: {
        ...parsed.anchors,
        sensory: [
          { value: "tastes like the one my mom made", confidence: 1 },
          { value: "reminds me of home", confidence: 1 },
          { value: "like my grandmother's", confidence: 1 },
        ],
      },
    }
    const reviews = [
      { text: "honestly it tastes like the one my mom made" },
      { text: "reminds me of home every time" },
      { text: "like my grandmother's, no exaggeration" },
      { text: "parking was fine" },
      { text: "good service" },
    ]
    const lines = matchReviewPhrases(p, reviews, "2026-08-28T00:00:00Z")
    const sens = lines.filter((l) => l.anchor === "sensory")
    expect(sens).toHaveLength(3)
    expect(new Set(sens.map((l) => l.quote)).size).toBe(3)
    for (const l of sens) expect(l.denominator).toBe("1 of 5 available reviews")
  })

  it("every emitted quote is a verbatim span of its review", () => {
    const reviews = [{ text: "the tomato and egg here is sweet, like home" }]
    const lines = matchReviewPhrases(parsed, reviews, "2026-08-28T00:00:00Z")
    expect(lines.length).toBeGreaterThan(0)
    for (const l of lines) expect(reviews[0].text.includes(l.quote)).toBe(true)
  })
})
