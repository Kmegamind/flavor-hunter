import { NextRequest, NextResponse } from "next/server"
import {
  geocodeAddress,
  placeDetails,
  reverseGeocode,
  suggestPlaces,
} from "@/lib/pipeline/places-geo"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Body = {
  type?: string
  input?: string
  address?: string
  placeId?: string
  sessionToken?: string
  lat?: number
  lng?: number
  bias?: { lat: number; lng: number }
}

export async function POST(req: NextRequest) {
  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 })
  }
  const type = body.type
  if (type === "autocomplete") {
    const suggestions = await suggestPlaces(String(body.input ?? ""), body.sessionToken, body.bias)
    return NextResponse.json({ suggestions })
  }
  if (type === "details") {
    const place = await placeDetails(String(body.placeId ?? ""), body.sessionToken)
    return NextResponse.json({ place })
  }
  if (type === "geocode") {
    const place = await geocodeAddress(String(body.address ?? body.input ?? ""))
    return NextResponse.json({ place })
  }
  if (type === "reverse") {
    const lat = Number(body.lat)
    const lng = Number(body.lng)
    const place = await reverseGeocode(lat, lng)
    return NextResponse.json({
      place: place ?? {
        label: "Current location",
        lat,
        lng,
      },
    })
  }
  return NextResponse.json({ error: "bad_request" }, { status: 400 })
}
