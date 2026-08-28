import type { HuntEvent, ParsedEnvelope, SubstituteOffer } from "@/schemas"
import { pickFixture, type InternalCandidate } from "@/lib/pipeline/fixture-data"
import { searchQueries } from "@/lib/pipeline/search-queries"
import { centerFor, toPolar } from "@/lib/pipeline/polar"

function toBlip(center: { lat: number; lng: number }, h: { id: string; lat: number; lng: number }) {
  const p = toPolar(center, { lat: h.lat, lng: h.lng })
  return { id: h.id, bearing: p.bearing, distance: p.distance, lat: h.lat, lng: h.lng }
}

const DETAILS_CONC = 6
const WEB_CONC = 4
const WEB_TIMEOUT_MS = 2500
const CAP = 18

export type HuntProgress = (ev: HuntEvent) => void

function placesKey(): string | undefined {
  const key = process.env.GOOGLE_PLACES_API_KEY?.trim()
  return key || undefined
}

async function mapPool<T, R>(
  items: T[],
  conc: number,
  fn: (item: T, i: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  async function worker() {
    while (i < items.length) {
      const idx = i++
      out[idx] = await fn(items[idx], idx)
    }
  }
  await Promise.all(Array.from({ length: Math.min(conc, items.length) }, worker))
  return out
}

type TextHit = {
  id: string
  name: string
  lat: number
  lng: number
  types: string[]
  address?: string
}

export async function huntCandidates(
  parsed: ParsedEnvelope,
  cityLabel: string,
  rangeMi: number,
  coords: { lat: number; lng: number } | undefined,
  onEvent: HuntProgress,
  substitute?: SubstituteOffer,
): Promise<{ candidates: InternalCandidate[]; degraded: boolean }> {
  const key = placesKey()
  const center = centerFor(cityLabel, coords)
  const queries = searchQueries(parsed, cityLabel, substitute)

  if (!key) {
    onEvent({ type: "degraded", reason: "live_search_unavailable" })
    return fixtureHunt(parsed, center, onEvent)
  }

  try {
    const hits = await textSearchVariants(key, queries, center, rangeMi)
    if (hits.length === 0) {
      onEvent({ type: "broadened", dropped: "dish", now: parsed.anchors.cuisine?.value ?? queries[0] ?? "" })
    }
    const capped = hits.slice(0, CAP)
    onEvent({
      type: "candidates",
      count: capped.length,
      blips: capped.map((h) => toBlip(center, h)),
    })
    const detailed = await mapPool(capped, DETAILS_CONC, async (h) => {
      const d = await placeDetails(key, h)
      onEvent({ type: "evaluated", id: h.id })
      return d
    })
    const top8 = detailed.slice(0, 8)
    await mapPool(top8, WEB_CONC, async (c) => {
      if (!c.website) return c
      c.menu_text = await fetchWebsite(c.website)
      return c
    })
    cheapEliminate(parsed, detailed, onEvent)
    return { candidates: detailed, degraded: false }
  } catch {
    onEvent({ type: "degraded", reason: "places_unavailable" })
    return fixtureHunt(parsed, center, onEvent)
  }
}

function cheapEliminate(
  parsed: ParsedEnvelope,
  candidates: InternalCandidate[],
  onEvent: HuntProgress,
) {
  const bench = parsed.anchors.benchmark?.value.toLowerCase()
  for (const c of candidates) {
    if (bench && c.name.toLowerCase().includes(bench.replace(/'s$/, ""))) {
      onEvent({ type: "eliminated", id: c.id, reason: "already tried (benchmark)" })
    }
  }
}

async function fixtureHunt(
  parsed: ParsedEnvelope,
  center: { lat: number; lng: number },
  onEvent: HuntProgress,
): Promise<{ candidates: InternalCandidate[]; degraded: boolean }> {
  const list = pickFixture(parsed, center).map((c) => ({ ...c }))
  onEvent({
    type: "candidates",
    count: list.length,
      blips: list.map((h) => toBlip(center, h)),
  })
  for (const c of list) {
    onEvent({ type: "evaluated", id: c.id })
  }
  cheapEliminate(parsed, list, onEvent)
  return { candidates: list, degraded: true }
}

async function textSearchVariants(
  key: string,
  queries: string[],
  center: { lat: number; lng: number },
  rangeMi: number,
): Promise<TextHit[]> {
  const seen = new Set<string>()
  const hits: TextHit[] = []
  const qlist = queries.length ? queries : [""]
  for (const q of qlist) {
    if (!q) continue
    const batch = await textSearch(key, q, center, rangeMi)
    for (const h of batch) {
      if (seen.has(h.id)) continue
      seen.add(h.id)
      hits.push(h)
      if (hits.length >= CAP) return hits
    }
  }
  return hits
}

async function textSearch(
  key: string,
  textQuery: string,
  center: { lat: number; lng: number },
  rangeMi: number,
): Promise<TextHit[]> {
  const meters = Math.round(rangeMi * 1609.34)
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.location,places.types,places.formattedAddress,places.shortFormattedAddress",
    },
    body: JSON.stringify({
      textQuery,
      maxResultCount: CAP,
      locationBias: {
        circle: {
          center: { latitude: center.lat, longitude: center.lng },
          radius: meters,
        },
      },
    }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => "")
    throw new Error(`text search ${res.status}${detail.slice(0, 80)}`)
  }
  const body = (await res.json()) as {
    places?: {
      id: string
      displayName?: { text?: string }
      location?: { latitude: number; longitude: number }
      types?: string[]
      formattedAddress?: string
      shortFormattedAddress?: string
    }[]
  }
  return (body.places ?? []).map((p) => ({
    id: p.id,
    name: p.displayName?.text ?? p.id,
    lat: p.location?.latitude ?? center.lat,
    lng: p.location?.longitude ?? center.lng,
    types: p.types ?? [],
    address: p.shortFormattedAddress || p.formattedAddress,
  }))
}

/** Silent inventory check for a substitute rung. No hunt events. */
export async function probeNearbyName(
  queries: string[],
  center: { lat: number; lng: number },
  rangeMi: number,
): Promise<string | null> {
  const key = placesKey()
  if (!key) return null
  try {
    for (const q of queries) {
      if (!q.trim()) continue
      const batch = await textSearch(key, q, center, rangeMi)
      if (batch[0]?.name) return batch[0].name
    }
  } catch {
    return null
  }
  return null
}

async function placeDetails(key: string, hit: TextHit): Promise<InternalCandidate> {
  try {
    const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(hit.id)}`, {
      headers: {
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask":
          "id,displayName,location,types,websiteUri,priceLevel,formattedAddress,shortFormattedAddress,reviews.text,reviews.publishTime",
      },
    })
    if (!res.ok) {
      return {
        id: hit.id,
        name: hit.name,
        lat: hit.lat,
        lng: hit.lng,
        types: hit.types,
        address: hit.address,
        menu_text: "",
        reviews: [],
      }
    }
    const p = (await res.json()) as {
      id?: string
      displayName?: { text?: string }
      location?: { latitude: number; longitude: number }
      types?: string[]
      websiteUri?: string
      priceLevel?: string
      formattedAddress?: string
      shortFormattedAddress?: string
      reviews?: { text?: { text?: string }; publishTime?: string }[]
    }
    const priceMap: Record<string, number> = {
      PRICE_LEVEL_FREE: 0,
      PRICE_LEVEL_INEXPENSIVE: 1,
      PRICE_LEVEL_MODERATE: 2,
      PRICE_LEVEL_EXPENSIVE: 3,
      PRICE_LEVEL_VERY_EXPENSIVE: 4,
    }
    return {
      id: p.id ?? hit.id,
      name: p.displayName?.text ?? hit.name,
      lat: p.location?.latitude ?? hit.lat,
      lng: p.location?.longitude ?? hit.lng,
      types: p.types ?? hit.types,
      website: p.websiteUri,
      price_level: p.priceLevel ? priceMap[p.priceLevel] : undefined,
      address: p.shortFormattedAddress || p.formattedAddress || hit.address,
      menu_text: "",
      reviews: (p.reviews ?? [])
        .map((r) => ({
          text: r.text?.text ?? "",
          date: r.publishTime?.slice(0, 7),
        }))
        .filter((r) => r.text.length > 0)
        .slice(0, 5),
    }
  } catch {
    return {
      id: hit.id,
      name: hit.name,
      lat: hit.lat,
      lng: hit.lng,
      types: hit.types,
      address: hit.address,
      menu_text: "",
      reviews: [],
    }
  }
}

async function fetchWebsite(url: string): Promise<string> {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), WEB_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: ac.signal, headers: { "user-agent": "FlavorHunter/1.0" } })
    const html = await res.text()
    return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").slice(0, 8000)
  } catch {
    return ""
  } finally {
    clearTimeout(t)
  }
}
