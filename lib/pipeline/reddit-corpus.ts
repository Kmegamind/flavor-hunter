/**
 * Agent 2, third substrate — the Reddit corpus.
 *
 * Why this exists. The product's flagship claim was always of the shape "N people said it
 * tastes like home". Google Place Details caps at five reviews, so that sentence was never
 * reachable from Google alone — a five-review ceiling cannot produce a seven-person chorus, and
 * pretending otherwise is exactly the pressure toward fabrication the whole design refuses.
 *
 * But that sentence is precisely what the city subreddits contain. "Immigrants of Boston: which
 * restaurant has the best version of your country's food?" (631 upvotes) and its siblings in
 * NYC, LA, DC and Toronto are, structurally, a restaurant to "tastes like home" mapping written
 * by the people who would know. See docs/01-user-research.md finding F6 — one commenter compiled
 * an entire thread into a shared Google Map by hand, which is the strongest demand evidence in
 * the corpus and also proof that nobody has built this.
 *
 * Three properties worth naming:
 *   - It is not Google Maps Content, so none of the section 11.3 constraints apply.
 *   - It is quoted with attribution and a permalink, so a judge can check any line.
 *   - Reddit is not a runtime dependency. The corpus is harvested offline into
 *     data/reddit-corpus.json; the API's approval gate and rate limits never touch a request.
 *
 * Matching is deliberately strict. A false "Redditors named this place" would be worse than no
 * line at all, so a name must clear a length floor and match on word boundaries.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { EvidenceLine } from "@/schemas"

export type RedditMention = {
  restaurant: string
  city: string
  cuisine_hint?: string
  quote: string
  subreddit: string
  thread: string
  url: string
  upvotes: number
}

/** Names shorter than this are too collision-prone to match on. */
const MIN_NAME = 5

let cache: RedditMention[] | null = null

export function loadCorpus(): RedditMention[] {
  if (cache) return cache
  try {
    const raw = readFileSync(join(process.cwd(), "data/reddit-corpus.json"), "utf8")
    const parsed = JSON.parse(raw) as { entries?: RedditMention[] }
    cache = parsed.entries ?? []
  } catch {
    cache = []
  }
  return cache
}

/** For tests: run the matcher against a supplied corpus instead of the file. */
export function setCorpusForTest(entries: RedditMention[] | null): void {
  cache = entries
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

/**
 * Does `placeName` refer to the same restaurant as `mentionName`?
 *
 * Google names carry suffixes the commenter would not type ("Niceys Eatery" vs "niceys",
 * "Club Bosna Restaurant" vs "Club Bosna"), so containment in either direction counts — but
 * only on whole words, and only once the shorter name is long enough to be distinctive.
 */
export function namesMatch(placeName: string, mentionName: string): boolean {
  const a = norm(placeName)
  const b = norm(mentionName)
  if (!a || !b) return false
  const shorter = a.length <= b.length ? a : b
  if (shorter.length < MIN_NAME) return false
  if (a === b) return true
  const wordBounded = (hay: string, needle: string) =>
    new RegExp(`(^| )${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( |$)`).test(hay)
  return wordBounded(a, b) || wordBounded(b, a)
}

/** Mentions of one restaurant. City is a soft filter — a match elsewhere is not evidence here. */
export function mentionsFor(placeName: string, cityLabel: string): RedditMention[] {
  const cityKey = norm(cityLabel).split(" ")[0] ?? ""
  return loadCorpus().filter((m) => {
    if (!namesMatch(placeName, m.restaurant)) return false
    if (!cityKey) return true
    return norm(m.city).includes(cityKey) || cityKey.includes(norm(m.city).split(" ")[0] ?? "")
  })
}

/**
 * Evidence lines from the corpus.
 *
 * The anchor is `substyle` — what a Reddit thread corroborates is not that a dish exists but
 * that people from that food culture consider this the version worth naming. Every line shares
 * the true count, which is what finally makes the aggregate sentence honest.
 */
export function redditEvidence(
  placeName: string,
  cityLabel: string,
  fetched_at: string,
): EvidenceLine[] {
  const hits = mentionsFor(placeName, cityLabel)
  if (hits.length === 0) return []
  const n = hits.length
  const subs = [...new Set(hits.map((h) => h.subreddit))]
  const where = subs.length === 1 ? subs[0] : "city subreddits"
  const denominator = `${n} ${n === 1 ? "person" : "people"} in ${where} named this place`
  return hits.map((m) => ({
    anchor: "substyle",
    quote: m.quote,
    source: "reddit" as const,
    mechanism: "deterministic_match" as const,
    source_name: m.subreddit,
    source_url: m.url,
    fetched_at,
    denominator,
    verified: true as const,
  }))
}
