/**
 * Offline harvester for data/reddit-corpus.json.
 *
 * Reddit is deliberately NOT a runtime dependency: the API's approval gate and rate limits have
 * no business inside a request that a judge might make. This script runs on a laptop, produces a
 * static JSON file, and that file is what ships.
 *
 * It does not scrape. It reads threads through the agent-reach CLI, which uses an existing,
 * authenticated browser session the operator already controls:
 *
 *     opencli reddit read <post_id> -f yaml
 *
 * Usage:
 *     npx tsx scripts/harvest-reddit.ts            # print candidate entries for review
 *     npx tsx scripts/harvest-reddit.ts --write    # merge into data/reddit-corpus.json
 *
 * Every emitted entry is reviewed by a human before it lands. The corpus is quoted verbatim with
 * a permalink in the product, so a wrong attribution is a correctness bug, not a cosmetic one —
 * and restaurant names inside free-form comment prose are exactly the kind of thing a heuristic
 * gets subtly wrong. This script proposes; a person accepts.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { join } from "node:path"

/** The recurring "where do you go for your home country's food?" threads, verified 2026-08-27. */
const THREADS = [
  { id: "1stt3oe", subreddit: "r/boston", city: "Boston" },
  { id: "10hu54r", subreddit: "r/AskNYC", city: "New York" },
  { id: "1vyrpgo", subreddit: "r/FoodNYC", city: "New York" },
  { id: "1kl5qj4", subreddit: "r/washingtondc", city: "Washington" },
  { id: "1du8cjy", subreddit: "r/AskLosAngeles", city: "Los Angeles" },
  { id: "1ubhv9c", subreddit: "r/askTO", city: "Toronto" },
  { id: "t1buwg", subreddit: "r/washingtondc", city: "Washington" },
  { id: "14sv2gn", subreddit: "r/SeattleWA", city: "Seattle" },
] as const

const CORPUS = join(process.cwd(), "data/reddit-corpus.json")

function readThread(id: string): string {
  try {
    return execFileSync("opencli", ["reddit", "read", id, "-f", "yaml"], {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      timeout: 180_000,
    })
  } catch (err) {
    console.error(`  ! ${id}: ${(err as Error).message.split("\n")[0]}`)
    return ""
  }
}

/**
 * Comments that look like a named recommendation.
 *
 * Intentionally shallow. The signal is "a short comment that leads with a proper noun", which
 * is how these threads answer the question. Anything cleverer would produce confident garbage,
 * and the review step exists precisely because this step should stay dumb.
 */
function candidateComments(yaml: string): { text: string; score: number }[] {
  const out: { text: string; score: number }[] = []
  const blocks = yaml.split(/^- author:/m).slice(1)
  for (const b of blocks) {
    const scoreMatch = b.match(/^\s+score:\s*(\d+)/m)
    const score = scoreMatch ? Number(scoreMatch[1]) : 0
    const textMatch = b.match(/text:\s*(?:>-?\s*\n)?([\s\S]*?)(?=\n\s+type:)/)
    if (!textMatch) continue
    const text = textMatch[1].replace(/\s+/g, " ").trim()
    if (text.length < 12 || text.length > 400) continue
    if (score < 20) continue
    if (!/^[A-Z][A-Za-z'’\-]+(\s+[A-Z0-9][A-Za-z'’\-]*){0,4}/.test(text)) continue
    out.push({ text, score })
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 12)
}

function main() {
  const write = process.argv.includes("--write")
  const proposals: Record<string, unknown>[] = []

  for (const th of THREADS) {
    console.log(`\n== ${th.subreddit} / ${th.id} (${th.city}) ==`)
    const yaml = readThread(th.id)
    if (!yaml) continue
    for (const c of candidateComments(yaml)) {
      const restaurant = (c.text.match(/^[A-Z][\w'’\-]*(?:\s+[A-Z0-9][\w'’\-]*){0,3}/) ?? [""])[0].trim()
      console.log(`  [${String(c.score).padStart(4)}] ${restaurant}  <- ${c.text.slice(0, 110)}`)
      proposals.push({
        restaurant,
        city: th.city,
        quote: c.text,
        subreddit: th.subreddit,
        thread: "",
        url: `https://www.reddit.com/${th.subreddit}/comments/${th.id}/`,
        upvotes: c.score,
        _needs_review: true,
      })
    }
  }

  console.log(`\n${proposals.length} proposals.`)
  if (!write) {
    console.log("Nothing written. Review the list above, then re-run with --write.")
    return
  }
  const existing = existsSync(CORPUS)
    ? (JSON.parse(readFileSync(CORPUS, "utf8")) as { entries?: unknown[] })
    : { entries: [] }
  const merged = {
    ...existing,
    entries: [...(existing.entries ?? []), ...proposals],
  }
  writeFileSync(CORPUS, `${JSON.stringify(merged, null, 2)}\n`)
  console.log(`Merged into ${CORPUS}. Every new row carries _needs_review: true — strip it only`)
  console.log("after checking the restaurant name against the comment it came from.")
}

main()
