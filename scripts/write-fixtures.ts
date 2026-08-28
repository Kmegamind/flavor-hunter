import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { huntToEvents } from "../lib/pipeline/run-hunt"
import { a1LockedRanked } from "../lib/pipeline/fixture-data"
import type { HuntEvent } from "../schemas"

const outDir = join(process.cwd(), "public", "fixtures")
mkdirSync(outDir, { recursive: true })
mkdirSync(join(process.cwd(), "lib", "fixtures"), { recursive: true })

function withDelay(events: HuntEvent[], ms = 400): string {
  return events
    .map((ev, i) => JSON.stringify({ ...ev, _delay_ms: i === 0 ? 200 : ms }) + "\n")
    .join("")
}

async function main() {
  const a1 = (await huntToEvents({
    memory_text: "the sweet tomato and egg my grandmother used to make",
    locale: "en",
    range_mi: 20,
    city_label: "Boston, MA",
    confirmed: true,
  })).filter((e) => e.type !== "degraded")
  writeFileSync(join(outDir, "a1.ndjson"), withDelay(a1, 350))

  const a10 = await huntToEvents({
    memory_text: "Missing home food.",
    locale: "en",
    range_mi: 20,
    city_label: "Chennai, IN",
    confirmed: true,
  })
  writeFileSync(join(outDir, "a10.ndjson"), withDelay(a10, 400))

  const a6 = await huntToEvents({
    memory_text: "Mexican food, but everything I've tried here is bad",
    locale: "en",
    range_mi: 20,
    city_label: "Toronto, ON",
    confirmed: true,
  })
  writeFileSync(join(outDir, "a6.ndjson"), withDelay(a6, 350))

  const a1Live = await huntToEvents({
    memory_text: "the sweet tomato and egg my grandmother used to make",
    locale: "en",
    range_mi: 20,
    city_label: "Boston, MA",
    confirmed: true,
  })
  const degraded: HuntEvent[] = [
    { type: "degraded", reason: "live_search_unavailable" },
    ...a1Live.filter((e) => e.type !== "degraded"),
  ]
  writeFileSync(join(outDir, "degraded.ndjson"), withDelay(degraded, 350))

  const locked = a1.find((e) => e.type === "locked")
  const parsed = a1.find((e) => e.type === "parsed")
  writeFileSync(
    join(outDir, "a1-refine.json"),
    JSON.stringify(
      {
        anchors: parsed && parsed.type === "parsed" ? parsed.anchors : null,
        category_name: parsed && parsed.type === "parsed" ? parsed.category_name : "",
        ranked: locked && locked.type === "locked" ? locked.ranked : a1LockedRanked(),
      },
      null,
      2,
    ),
  )
  console.log("wrote fixtures to", outDir)
  const embedded = {
    a1: withDelay(a1, 350),
    a10: withDelay(a10, 400),
    a6: withDelay(a6, 350),
    degraded: withDelay(degraded, 350),
  }
  writeFileSync(
    join(process.cwd(), "lib", "fixtures", "embedded.ts"),
    `export const EMBEDDED: Record<string, string> = ${JSON.stringify(embedded, null, 2)}\n`,
  )
}

main()
