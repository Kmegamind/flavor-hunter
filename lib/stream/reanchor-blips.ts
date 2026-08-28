import type { HuntEvent } from "@/schemas"
import { round3 } from "@/lib/pipeline/polar"

/** Implicit center baked into embedded a1/degraded fixture NDJSON. */
export const FIXTURE_CENTER = { lat: 42.36, lng: -71.059 }

export function reanchorEvent(
  event: HuntEvent,
  to: { lat: number; lng: number },
  from: { lat: number; lng: number } = FIXTURE_CENTER,
): HuntEvent {
  const dLat = to.lat - from.lat
  const dLng = to.lng - from.lng
  if (Math.abs(dLat) < 1e-9 && Math.abs(dLng) < 1e-9) return event

  const shift = (lat: number, lng: number) => ({
    lat: round3(lat + dLat),
    lng: round3(lng + dLng),
  })

  if (event.type === "candidates") {
    return {
      ...event,
      blips: event.blips.map((b) => {
        if (!Number.isFinite(b.lat) || !Number.isFinite(b.lng)) return b
        return { ...b, ...shift(b.lat, b.lng) }
      }),
    }
  }
  return event
}

export function reanchorEvents(
  events: HuntEvent[],
  to: { lat: number; lng: number },
  from?: { lat: number; lng: number },
): HuntEvent[] {
  return events.map((e) => reanchorEvent(e, to, from))
}
