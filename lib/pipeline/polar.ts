/** Server-only polar conversion. Client never sees place lat/lng. */

const R_KM = 6371

export function haversineMi(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const p1 = (lat1 * Math.PI) / 180
  const p2 = (lat2 * Math.PI) / 180
  const dp = ((lat2 - lat1) * Math.PI) / 180
  const dl = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  const km = 2 * R_KM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return km * 0.621371
}

export function bearingDeg(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const Δλ = ((lng2 - lng1) * Math.PI) / 180
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  const θ = Math.atan2(y, x)
  return (θ * 180) / Math.PI < 0 ? (θ * 180) / Math.PI + 360 : (θ * 180) / Math.PI
}

export type Polar = { bearing: number; distance: number }

export function toPolar(
  center: { lat: number; lng: number },
  place: { lat: number; lng: number },
): Polar {
  return {
    bearing: bearingDeg(center.lat, center.lng, place.lat, place.lng),
    distance: haversineMi(center.lat, center.lng, place.lat, place.lng),
  }
}

/** Demo centers when the client omits coords (seeded examples). */
export const CITY_CENTERS: Record<string, { lat: number; lng: number }> = {
  "Boston, MA": { lat: 42.36, lng: -71.059 },
  "Seattle, WA": { lat: 47.606, lng: -122.332 },
  "Los Angeles, CA": { lat: 34.052, lng: -118.244 },
  "New York, NY": { lat: 40.713, lng: -74.006 },
  "Toronto, ON": { lat: 43.653, lng: -79.383 },
  "Washington, DC": { lat: 38.907, lng: -77.037 },
  "Washington DC": { lat: 38.907, lng: -77.037 },
  "Washington, D.C.": { lat: 38.907, lng: -77.037 },
  "Chennai, IN": { lat: 13.083, lng: 80.27 },
  "Kaohsiung, Taiwan": { lat: 22.627, lng: 120.301 },
}

export const DEFAULT_CENTER = CITY_CENTERS["Washington, DC"]

export function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}

function normPlace(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "")
}

/** Exact or punctuation-insensitive match against the demo city table. */
export function lookupCityCenter(cityLabel: string): { lat: number; lng: number } | null {
  const exact = CITY_CENTERS[cityLabel]
  if (exact) return exact
  const want = normPlace(cityLabel)
  if (!want) return null
  for (const [label, center] of Object.entries(CITY_CENTERS)) {
    if (normPlace(label) === want) return center
  }
  return null
}

export function centerFor(cityLabel: string, coords?: { lat: number; lng: number }) {
  if (coords) return { lat: round3(coords.lat), lng: round3(coords.lng) }
  return lookupCityCenter(cityLabel) ?? DEFAULT_CENTER
}
