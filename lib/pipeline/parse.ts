import { readFileSync } from "fs"
import { join } from "path"
import { ParsedEnvelope } from "@/schemas"
import {
  parseHeuristic,
  stripNegationsFromSensory,
  fillMissingDishOrCuisine,
  lastClueChunk,
} from "@/lib/pipeline/parse-heuristic"
import { geminiGenerate, geminiKey } from "@/lib/pipeline/gemini"

function promptText(): string {
  try {
    return readFileSync(join(process.cwd(), "prompts/parse.md"), "utf8")
  } catch {
    return "Parse the food memory into the JSON schema."
  }
}

export async function parseMemory(
  memoryText: string,
  locale: string,
  cityLabel: string,
): Promise<ParsedEnvelope> {
  const combined = await parseOnce(memoryText, locale, cityLabel)
  if (combined.anchors.dish || combined.anchors.cuisine) return combined

  const clue = lastClueChunk(memoryText).trim()
  if (!clue || clue.toLowerCase() === memoryText.trim().toLowerCase()) return combined

  const fromClue = await parseOnce(clue, locale, cityLabel)
  if (!fromClue.anchors.dish && !fromClue.anchors.cuisine) return combined

  return postParse(
    {
      ...combined,
      category_name: fromClue.category_name || combined.category_name,
      category_confidence: Math.max(combined.category_confidence, fromClue.category_confidence),
      anchors: {
        ...combined.anchors,
        dish: fromClue.anchors.dish ?? combined.anchors.dish,
        cuisine: fromClue.anchors.cuisine ?? combined.anchors.cuisine,
        query_variants: uniqStr([
          ...(fromClue.anchors.query_variants ?? []),
          ...(combined.anchors.query_variants ?? []),
        ]).slice(0, 5),
      },
      searchable: true,
      missing_required: combined.missing_required.filter((m) => m !== "dish_or_cuisine"),
    },
    memoryText,
    cityLabel,
  )
}

/**
 * Every path back to the phrase table is announced.
 *
 * These fallbacks used to be silent, and the cost was concrete: the configured model had been
 * retired for new users, every call returned 404, and the pipeline ran on a hardcoded phrase
 * table for a whole session with no visible symptom — the output simply looked plausible. A
 * fallback that cannot be observed is indistinguishable from the real thing working.
 */
function heuristicFallback(
  why: string,
  memoryText: string,
  cityLabel: string,
): ParsedEnvelope {
  console.warn(`[parse] falling back to heuristic: ${why}`)
  return postParse(parseHeuristic(memoryText), memoryText, cityLabel)
}

type Loose = Record<string, unknown>

/**
 * Normalise model output before validation.
 *
 * A model asked for `{value, confidence}` will sometimes return the bare string, and will omit
 * arrays it found nothing for. Both are reasonable readings of the instruction and neither is
 * worth discarding an otherwise correct parse over — the alternative is what actually happened
 * here: `anchors.dish: Expected object, received string` sent the whole envelope to the phrase
 * table, silently, and the demo ran on a hardcoded lookup while looking fine.
 *
 * This coerces shape only. It never invents a value, and anything it cannot read stays `null`
 * so the searchability gate still sees the truth.
 */
function coerceEnvelope(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw
  const env = { ...(raw as Loose) }

  if (env.category_name_native === null) delete env.category_name_native

  const a = { ...((env.anchors as Loose) ?? {}) }
  const SCALARS = [
    "dish", "cuisine", "substyle", "person",
    "setting", "price_band", "ritual", "benchmark",
  ] as const

  for (const k of SCALARS) {
    const v = a[k]
    if (v === undefined) a[k] = null
    else if (typeof v === "string") a[k] = v.trim() ? { value: v.trim(), confidence: 0.6 } : null
  }

  a.sensory = coerceCvArray(a.sensory)
  a.negation = coerceNegation(a.negation)
  if (!Array.isArray(a.query_variants)) a.query_variants = []
  if (!Array.isArray(a.fallback_ladder)) a.fallback_ladder = []
  if (a.direction === undefined) a.direction = null

  env.anchors = a
  return env
}

function coerceCvArray(v: unknown): unknown[] {
  if (!Array.isArray(v)) return []
  return v
    .map((item) =>
      typeof item === "string"
        ? item.trim()
          ? { value: item.trim(), confidence: 0.6 }
          : null
        : item,
    )
    .filter(Boolean)
}

function coerceNegation(v: unknown): unknown[] {
  if (!Array.isArray(v)) return []
  return v
    .map((item) => {
      if (typeof item === "string") return item.trim() ? { field: "sensory", value: item.trim() } : null
      if (item && typeof item === "object") {
        const o = item as Loose
        if (!o.field && o.value) return { field: "sensory", value: o.value }
      }
      return item
    })
    .filter(Boolean)
}

async function parseOnce(
  memoryText: string,
  locale: string,
  cityLabel: string,
): Promise<ParsedEnvelope> {
  const key = geminiKey()
  if (!key) return heuristicFallback("no GEMINI_API_KEY", memoryText, cityLabel)

  try {
    const text = await geminiGenerate(
      promptText(),
      JSON.stringify({ memory_text: memoryText, locale, city_label: cityLabel }),
      2000,
    )
    if (!text) return heuristicFallback("model returned no text", memoryText, cityLabel)
    const jsonStart = text.indexOf("{")
    const jsonEnd = text.lastIndexOf("}")
    if (jsonStart < 0) return heuristicFallback("no JSON object in response", memoryText, cityLabel)
    const raw = coerceEnvelope(JSON.parse(text.slice(jsonStart, jsonEnd + 1)))
    const parsed = ParsedEnvelope.safeParse(raw)
    if (!parsed.success) {
      const issues = parsed.error.issues
        .slice(0, 6)
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ")
      return heuristicFallback(`schema rejected the envelope — ${issues}`, memoryText, cityLabel)
    }
    return postParse(parsed.data, memoryText, cityLabel)
  } catch (err) {
    return heuristicFallback(`threw: ${(err as Error).message}`, memoryText, cityLabel)
  }
}

/** Handler post-conditions from docs/10-pipeline-stages.md §2.1 */
function postParse(parsed: ParsedEnvelope, memoryText: string, cityLabel: string): ParsedEnvelope {
  let next = fillMissingDishOrCuisine(stripNegationsFromSensory(parsed), memoryText)
  if (next.intent !== "find_restaurant") {
    next = { ...next, searchable: false, missing_required: unique([...next.missing_required, "intent"]) }
  }
  if (!next.anchors.dish && !next.anchors.cuisine) {
    next = {
      ...next,
      searchable: false,
      missing_required: unique([...next.missing_required, "dish_or_cuisine"]),
    }
  }
  const sub = next.anchors.substyle?.value ?? ""
  if (
    sub &&
    cityLabel &&
    sub.toLowerCase() === cityLabel.toLowerCase() &&
    !memoryText.toLowerCase().includes(cityLabel.toLowerCase())
  ) {
    next = { ...next, anchors: { ...next.anchors, substyle: null } }
  }
  const originish = /hunan|changsha|sichuan|guangdong/i
  const variants = (next.anchors.query_variants ?? [])
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .filter((s) => !(originish.test(s) && !originish.test(cityLabel)))
    .slice(0, 5)
  const ladder = (next.anchors.fallback_ladder ?? []).filter(
    (r) => Boolean(r.relation) && Boolean(r.dish || r.cuisine),
  )
  next = { ...next, anchors: { ...next.anchors, query_variants: variants, fallback_ladder: ladder } }
  return next
}

function uniqStr(xs: string[]) {
  const seen = new Set<string>()
  const out: string[] = []
  for (const s of xs) {
    const k = s.trim().toLowerCase()
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(s.trim())
  }
  return out
}

function unique<T>(xs: T[]): T[] {
  return [...new Set(xs)]
}
