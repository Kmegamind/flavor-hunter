import type { PlaceSuggestion, ResolvedPlace } from "@/lib/pipeline/places-geo"

async function postGeo(body: Record<string, unknown>): Promise<Response> {
  return fetch("/api/geo", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

export async function fetchPlaceSuggestions(
  input: string,
  sessionToken: string,
  bias?: { lat: number; lng: number },
): Promise<PlaceSuggestion[]> {
  try {
    const res = await postGeo({ type: "autocomplete", input, sessionToken, bias })
    if (!res.ok) return []
    const json = (await res.json()) as { suggestions?: PlaceSuggestion[] }
    return json.suggestions ?? []
  } catch {
    return []
  }
}

export async function fetchPlaceDetails(
  placeId: string,
  sessionToken: string,
): Promise<ResolvedPlace | null> {
  try {
    const res = await postGeo({ type: "details", placeId, sessionToken })
    if (!res.ok) return null
    const json = (await res.json()) as { place?: ResolvedPlace | null }
    return json.place ?? null
  } catch {
    return null
  }
}

export async function fetchGeocode(address: string): Promise<ResolvedPlace | null> {
  try {
    const res = await postGeo({ type: "geocode", address })
    if (!res.ok) return null
    const json = (await res.json()) as { place?: ResolvedPlace | null }
    return json.place ?? null
  } catch {
    return null
  }
}

export async function fetchReverse(lat: number, lng: number): Promise<ResolvedPlace | null> {
  try {
    const res = await postGeo({ type: "reverse", lat, lng })
    if (!res.ok) return null
    const json = (await res.json()) as { place?: ResolvedPlace | null }
    return json.place ?? null
  } catch {
    return null
  }
}

export function newSessionToken(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID()
  return `fh-${Date.now()}-${Math.random().toString(16).slice(2)}`
}
