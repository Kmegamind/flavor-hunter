import { lookupCityCenter, round3 } from "@/lib/pipeline/polar"

export type PlaceSuggestion = {
  placeId: string
  text: string
  mainText: string
  secondaryText: string
}

export type ResolvedPlace = {
  label: string
  lat: number
  lng: number
}

function placesKey(): string | undefined {
  const key = process.env.GOOGLE_PLACES_API_KEY?.trim()
  return key || undefined
}

export async function suggestPlaces(
  input: string,
  sessionToken?: string,
  bias?: { lat: number; lng: number },
): Promise<PlaceSuggestion[]> {
  const key = placesKey()
  const q = input.trim()
  if (!key || q.length < 2) return []
  try {
    const body: Record<string, unknown> = {
      input: q.slice(0, 120),
      languageCode: "en",
    }
    if (sessionToken) body.sessionToken = sessionToken
    if (bias) {
      body.locationBias = {
        circle: {
          center: { latitude: bias.lat, longitude: bias.lng },
          radius: 30_000,
        },
      }
    }
    const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask":
          "suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat",
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) return []
    const json = (await res.json()) as {
      suggestions?: {
        placePrediction?: {
          placeId?: string
          text?: { text?: string }
          structuredFormat?: {
            mainText?: { text?: string }
            secondaryText?: { text?: string }
          }
        }
      }[]
    }
    return (json.suggestions ?? [])
      .map((s) => {
        const p = s.placePrediction
        if (!p?.placeId) return null
        const text = p.text?.text?.trim() ?? ""
        const mainText = p.structuredFormat?.mainText?.text?.trim() || text
        const secondaryText = p.structuredFormat?.secondaryText?.text?.trim() ?? ""
        if (!text && !mainText) return null
        return { placeId: p.placeId, text: text || mainText, mainText, secondaryText }
      })
      .filter((s): s is PlaceSuggestion => Boolean(s))
      .slice(0, 6)
  } catch {
    return []
  }
}

export async function placeDetails(
  placeId: string,
  sessionToken?: string,
): Promise<ResolvedPlace | null> {
  const key = placesKey()
  const id = placeId.trim()
  if (!key || !id) return null
  try {
    const url = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`)
    if (sessionToken) url.searchParams.set("sessionToken", sessionToken)
    const res = await fetch(url, {
      headers: {
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "id,formattedAddress,location,displayName,shortFormattedAddress",
      },
    })
    if (!res.ok) return null
    const p = (await res.json()) as {
      formattedAddress?: string
      shortFormattedAddress?: string
      displayName?: { text?: string }
      location?: { latitude?: number; longitude?: number }
    }
    const lat = p.location?.latitude
    const lng = p.location?.longitude
    if (typeof lat !== "number" || typeof lng !== "number") return null
    const label =
      p.formattedAddress?.trim() ||
      p.shortFormattedAddress?.trim() ||
      p.displayName?.text?.trim() ||
      id
    return { label, lat: round3(lat), lng: round3(lng) }
  } catch {
    return null
  }
}

export async function geocodeAddress(address: string): Promise<ResolvedPlace | null> {
  const table = lookupCityCenter(address)
  if (table) return { label: address.trim(), lat: table.lat, lng: table.lng }
  const key = placesKey()
  const q = address.trim()
  if (!key || !q) return null
  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask":
          "places.formattedAddress,places.shortFormattedAddress,places.displayName,places.location",
      },
      body: JSON.stringify({ textQuery: q.slice(0, 200), maxResultCount: 1 }),
    })
    if (!res.ok) return null
    const body = (await res.json()) as {
      places?: {
        formattedAddress?: string
        shortFormattedAddress?: string
        displayName?: { text?: string }
        location?: { latitude?: number; longitude?: number }
      }[]
    }
    const p = body.places?.[0]
    if (!p) return null
    const lat = p.location?.latitude
    const lng = p.location?.longitude
    if (typeof lat !== "number" || typeof lng !== "number") return null
    const label =
      p.formattedAddress?.trim() ||
      p.shortFormattedAddress?.trim() ||
      p.displayName?.text?.trim() ||
      q
    return { label, lat: round3(lat), lng: round3(lng) }
  } catch {
    return null
  }
}

export async function reverseGeocode(lat: number, lng: number): Promise<ResolvedPlace | null> {
  const key = placesKey()
  if (!key || !Number.isFinite(lat) || !Number.isFinite(lng)) return null
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${encodeURIComponent(key)}`,
    )
    if (res.ok) {
      const body = (await res.json()) as {
        status?: string
        results?: { formatted_address?: string; geometry?: { location?: { lat: number; lng: number } } }[]
      }
      const hit = body.results?.[0]
      if (body.status === "OK" && hit?.formatted_address) {
        const loc = hit.geometry?.location
        return {
          label: hit.formatted_address,
          lat: round3(typeof loc?.lat === "number" ? loc.lat : lat),
          lng: round3(typeof loc?.lng === "number" ? loc.lng : lng),
        }
      }
    }
  } catch {
    /* try nearby place next */
  }
  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "places.formattedAddress,places.shortFormattedAddress,places.location",
      },
      body: JSON.stringify({
        maxResultCount: 1,
        locationRestriction: {
          circle: {
            center: { latitude: lat, longitude: lng },
            radius: 80,
          },
        },
      }),
    })
    if (!res.ok) return null
    const body = (await res.json()) as {
      places?: {
        formattedAddress?: string
        shortFormattedAddress?: string
        location?: { latitude?: number; longitude?: number }
      }[]
    }
    const p = body.places?.[0]
    const label = p?.formattedAddress?.trim() || p?.shortFormattedAddress?.trim()
    if (!p || !label) return null
    return {
      label,
      lat: round3(p.location?.latitude ?? lat),
      lng: round3(p.location?.longitude ?? lng),
    }
  } catch {
    return null
  }
}
