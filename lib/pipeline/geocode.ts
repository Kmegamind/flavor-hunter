import { DEFAULT_CENTER, lookupCityCenter, round3 } from "@/lib/pipeline/polar"
import { geocodeAddress } from "@/lib/pipeline/places-geo"

/**
 * Resolve a hunt centre: client coords, known city table, or Places geocode
 * of a typed street / neighborhood / city.
 */
export async function resolveCenter(
  cityLabel: string,
  coords?: { lat: number; lng: number },
): Promise<{ lat: number; lng: number }> {
  if (coords) return { lat: round3(coords.lat), lng: round3(coords.lng) }
  const table = lookupCityCenter(cityLabel)
  if (table) return table
  const geo = await geocodeAddress(cityLabel)
  if (geo) return { lat: geo.lat, lng: geo.lng }
  return DEFAULT_CENTER
}
