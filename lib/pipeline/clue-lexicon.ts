/**
 * Agent 2 (deterministic half) — the Clue Digger.
 *
 * `review-match.ts` could only find phrases the user had already typed: it took each anchor's
 * `value` and looked for that substring. A user who said "sweet" got matches on "sweet", and
 * nothing else. The thing the product is actually for — finding the review that says
 * "tastes like the one my mom made" when the user never wrote those words — was structurally
 * impossible.
 *
 * This module supplies the missing vocabulary. Every phrase below was observed in the research
 * corpus (docs/01-user-research.md section 4, docs/04-taste-memory-archetypes.md): this is how
 * people actually talk about food they miss, not invented synonyms.
 *
 * Why deterministic rather than an LLM call: Google review bodies must not be transmitted to a
 * third-party model (03-tech-design.md section 11.3). Substring matching happens inside our own
 * request handler, and it is verbatim by construction — it cannot fabricate a quote, which makes
 * it the more trustworthy of the two evidence paths. The LLM half of Agent 2 works on the
 * restaurant's own website text, where no such restriction applies.
 */
import type { AnchorSet, Direction } from "@/schemas"

export type ClueEntry = {
  /** Which anchor this phrase corroborates. */
  anchor: keyof AnchorSet
  /** Lowercase needles, matched case-insensitively as substrings. */
  needles: string[]
  /** Only fire when the user's `direction` is one of these. Omit to always allow. */
  direction?: Direction[]
}

export const CLUE_LEXICON: ClueEntry[] = [
  {
    anchor: "direction",
    direction: ["family_home"],
    needles: [
      "tastes like home",
      "taste of home",
      "reminds me of home",
      "like back home",
      "just like home",
      "my mom made",
      "my mother made",
      "my mom used to",
      "my mother used to",
      "my mom\u2019s",
      "my mom\'s",
      "my mother\'s",
      "my grandma made",
      "my grandmother made",
      "my grandmother used to",
      "my grandma\'s",
      "my grandmother\'s",
      "my nonna",
      "my abuela",
      "my halmoni",
      "my lola",
      "home cooking",
      "home-style",
      "homestyle",
      "home style",
    ],
  },
  {
    anchor: "direction",
    direction: ["street_stall"],
    needles: ["street food", "street vendor", "night market", "food cart", "like a stall"],
  },
  {
    anchor: "direction",
    direction: ["americanized_chain", "diaspora_adapted"],
    needles: ["takeout classic", "old school", "americanized", "the way i grew up with"],
  },
  {
    anchor: "setting",
    needles: [
      "hole in the wall",
      "hole-in-the-wall",
      "family run",
      "family-run",
      "family owned",
      "family-owned",
      "no frills",
      "mom and pop",
      "mom-and-pop",
      "strip mall",
      "gas station",
    ],
  },
  {
    anchor: "substyle",
    needles: [
      "closest thing to",
      "closest to the real",
      "almost authentic",
      "the real deal",
      "regional",
    ],
  },
  {
    anchor: "person",
    needles: [
      "the owner is from",
      "owners are from",
      "the chef is from",
      "grew up in",
      "auntie",
      "uncle",
    ],
  },
]

function directionAllows(entry: ClueEntry, anchors: AnchorSet): boolean {
  if (!entry.direction) return true
  if (!anchors.direction) return false
  return entry.direction.includes(anchors.direction)
}

/** True when the user actually supplied the anchor this entry would corroborate. */
function anchorSupplied(anchors: AnchorSet, key: keyof AnchorSet): boolean {
  if (key === "sensory") return anchors.sensory.length > 0
  if (key === "direction") return anchors.direction !== null
  const v = anchors[key]
  return v !== null && v !== undefined
}

/**
 * Needles worth looking for, given what this user asked about.
 *
 * Gated on `anchorSupplied` deliberately: "reminds me of home" is only evidence if the memory
 * was about home cooking. Firing every entry regardless would fill the panel with lines that
 * answer a question nobody asked. It would not move the score — `rubricWeights` already ignores
 * anchors the user did not supply — but it would bury the lines that matter.
 */
export function clueNeedles(anchors: AnchorSet): { anchor: string; value: string }[] {
  const out: { anchor: string; value: string }[] = []
  const seen = new Set<string>()
  for (const entry of CLUE_LEXICON) {
    if (!anchorSupplied(anchors, entry.anchor)) continue
    if (!directionAllows(entry, anchors)) continue
    for (const n of entry.needles) {
      const key = `${String(entry.anchor)} ${n}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ anchor: String(entry.anchor), value: n })
    }
  }
  return out
}
