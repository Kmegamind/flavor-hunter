import { afterEach, describe, expect, it } from "vitest"
import {
  loadCorpus,
  mentionsFor,
  namesMatch,
  redditEvidence,
  setCorpusForTest,
  type RedditMention,
} from "@/lib/pipeline/reddit-corpus"

const mention = (p: Partial<RedditMention>): RedditMention => ({
  restaurant: "Club Bosna",
  city: "Boston",
  quote: "the only Yugoslavian restaurant in greater Boston area",
  subreddit: "r/boston",
  thread: "t",
  url: "https://www.reddit.com/r/boston/comments/1stt3oe/",
  upvotes: 283,
  ...p,
})

afterEach(() => setCorpusForTest(null))

describe("the shipped corpus", () => {
  it("loads, and every entry carries attribution a judge can check", () => {
    const corpus = loadCorpus()
    expect(corpus.length).toBeGreaterThan(5)
    for (const m of corpus) {
      expect(m.quote.trim().length).toBeGreaterThan(0)
      expect(m.subreddit.startsWith("r/")).toBe(true)
      expect(m.url).toMatch(/^https:\/\/www\.reddit\.com\/r\//)
      expect(m.restaurant.trim().length).toBeGreaterThan(0)
      expect(m.city.trim().length).toBeGreaterThan(0)
    }
  })

  it("finds a real entry by name and city", () => {
    const hits = mentionsFor("Club Bosna", "Boston, MA")
    expect(hits).toHaveLength(1)
    expect(hits[0].subreddit).toBe("r/boston")
  })
})

describe("name matching is strict, because a false chorus is worse than none", () => {
  it("tolerates the suffixes Google adds that a commenter would not type", () => {
    expect(namesMatch("Club Bosna Restaurant", "Club Bosna")).toBe(true)
    expect(namesMatch("Niceys Eatery", "Niceys")).toBe(true)
    expect(namesMatch("Thip Khao", "Thip khao")).toBe(true)
  })

  it("refuses names too short to be distinctive", () => {
    expect(namesMatch("Yak", "Yak")).toBe(false)
    expect(namesMatch("Pho 79", "Pho")).toBe(false)
  })

  it("will not match on a partial word", () => {
    expect(namesMatch("Republic Cantinas Grill", "Republican")).toBe(false)
    expect(namesMatch("Natasha's Kitchen", "Natas")).toBe(false)
  })

  it("does not accept a match from the wrong city", () => {
    expect(mentionsFor("Club Bosna", "Chicago, IL")).toHaveLength(0)
  })
})

describe("aggregate evidence — the sentence Google alone could never produce", () => {
  it("counts the people who named the place, with the subreddit and a permalink", () => {
    setCorpusForTest([
      mention({ quote: "tastes like my grandmother's" }),
      mention({ quote: "closest thing to home I have found here" }),
      mention({ quote: "the only one that gets it right" }),
    ])
    const lines = redditEvidence("Club Bosna", "Boston, MA", "2026-08-28T00:00:00Z")
    expect(lines).toHaveLength(3)
    for (const l of lines) {
      expect(l.source).toBe("reddit")
      expect(l.mechanism).toBe("deterministic_match")
      expect(l.denominator).toBe("3 people in r/boston named this place")
      expect(l.source_url).toContain("reddit.com")
      expect(l.verified).toBe(true)
    }
    // Every quote is distinct — nothing collapses the chorus to one voice.
    expect(new Set(lines.map((l) => l.quote)).size).toBe(3)
  })

  it("says person, not people, when there is one", () => {
    setCorpusForTest([mention({})])
    const lines = redditEvidence("Club Bosna", "Boston", "2026-08-28T00:00:00Z")
    expect(lines[0].denominator).toBe("1 person in r/boston named this place")
  })

  it("credits city subreddits when the mentions span more than one", () => {
    setCorpusForTest([
      mention({ subreddit: "r/boston" }),
      mention({ subreddit: "r/AskNewEngland", quote: "second this" }),
    ])
    const lines = redditEvidence("Club Bosna", "Boston", "2026-08-28T00:00:00Z")
    expect(lines[0].denominator).toBe("2 people in city subreddits named this place")
  })

  it("returns nothing rather than something when the corpus has no mention", () => {
    setCorpusForTest([])
    expect(redditEvidence("Some Other Place", "Boston", "2026-08-28T00:00:00Z")).toEqual([])
  })
})
