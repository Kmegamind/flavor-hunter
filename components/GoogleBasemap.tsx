"use client"

import { useEffect, useRef, useState } from "react"
import type { HuntBlip } from "@/lib/machines/hunt"

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID

export function mapsEnabled() {
  return Boolean(KEY)
}

/**
 * Imperative handles for the on-screen map controls.
 *
 * Pinch-zoom is undiscoverable inside a drawn device bezel — nothing about the frame says
 * "this part is a live map". A module-level handle keeps the buttons in the Tracker chrome
 * where they belong, without threading a ref through it.
 */
let mapHandle: {
  getZoom?: () => number | undefined
  setZoom?: (z: number) => void
  panTo?: (p: { lat: number; lng: number }) => void
} | null = null

let mapHome: { lat: number; lng: number } | null = null

export function mapZoom(delta: number) {
  const z = mapHandle?.getZoom?.()
  if (typeof z === "number") mapHandle?.setZoom?.(z + delta)
}

export function mapRecenter() {
  if (mapHome) mapHandle?.panTo?.(mapHome)
}

function loadScript(key: string): Promise<void> {
  const w = window as unknown as { google?: { maps?: unknown } }
  if (w.google?.maps) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-fh-maps]")
    if (existing) {
      existing.addEventListener("load", () => resolve())
      existing.addEventListener("error", () => reject(new Error("maps script")))
      return
    }
    const s = document.createElement("script")
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&v=weekly&libraries=marker`
    s.async = true
    s.dataset.fhMaps = "1"
    s.onload = () => resolve()
    s.onerror = () => reject(new Error("maps script"))
    document.head.appendChild(s)
  })
}

function isClusterPhase(phase: string) {
  return (
    phase === "S4_LOCKED" ||
    phase === "S5_EVIDENCE" ||
    phase === "S6_REFINING" ||
    phase === "S8_NO_ANSWER"
  )
}

export function GoogleBasemap({
  center,
  rangeMi,
  blips,
  lockedId,
  phase,
  interactive = false,
  onSelect,
}: {
  center: { lat: number; lng: number }
  rangeMi: number
  blips: HuntBlip[]
  lockedId: string | null
  phase: string
  interactive?: boolean
  onSelect?: (id: string) => void
}) {
  const elRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<{
    setOptions: (o: Record<string, unknown>) => void
    fitBounds: (b: unknown, pad?: unknown) => void
    panTo?: (p: { lat: number; lng: number }) => void
  } | null>(null)
  const markersRef = useRef<
    Map<string, { map: unknown; position: unknown; addEventListener?: (ev: string, fn: () => void) => void }>
  >(new Map())
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!KEY || !elRef.current) return
    let cancelled = false
    void loadScript(KEY).then(() => {
      if (cancelled || !elRef.current || mapRef.current) return
      const g = (window as unknown as { google: { maps: Record<string, unknown> } }).google.maps as {
        Map: new (el: HTMLElement, opts: Record<string, unknown>) => {
          setOptions: (o: Record<string, unknown>) => void
          fitBounds: (b: unknown, pad?: unknown) => void
          panTo: (p: { lat: number; lng: number }) => void
          getZoom: () => number | undefined
          setZoom: (z: number) => void
        }
        Circle: new (opts: Record<string, unknown>) => { getBounds: () => unknown }
      }
      const hunting = phase === "S3_HUNTING" || phase === "S7_DEGRADED" || phase === "S1_DECODING"
      const map = new g.Map(elRef.current, {
        center,
        mapId: MAP_ID || undefined,
        disableDefaultUI: true,
        gestureHandling: hunting ? "none" : "greedy",
        keyboardShortcuts: false,
        clickableIcons: false,
        backgroundColor: "#071426",
      })
      const circle = new g.Circle({
        center,
        radius: rangeMi * 1609.34,
      })
      const bounds = circle.getBounds()
      if (bounds) map.fitBounds(bounds)
      mapRef.current = map
      mapHandle = map as unknown as typeof mapHandle
      mapHome = center
      setReady(true)
    })
    return () => {
      cancelled = true
    }
    // Map instance is created once; later center/range changes pan via the fitBounds effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const hunting = phase === "S3_HUNTING" || phase === "S7_DEGRADED" || phase === "S1_DECODING"
    map.setOptions({ gestureHandling: hunting ? "none" : "greedy" })
  }, [phase])

  useEffect(() => {
    const map = mapRef.current
    const g = (
      window as unknown as {
        google?: {
          maps?: {
            LatLngBounds?: new () => { extend: (p: { lat: number; lng: number }) => void }
            Circle?: new (opts: Record<string, unknown>) => { getBounds: () => unknown }
            marker?: {
              AdvancedMarkerElement: new (o: Record<string, unknown>) => {
                map: unknown
                position: unknown
                addEventListener: (ev: string, fn: () => void) => void
              }
            }
          }
        }
      }
    ).google
    if (!map || !g?.maps?.marker || !MAP_ID || !KEY) return
    const Adv = g.maps.marker.AdvancedMarkerElement
    const seen = new Set(blips.map((b) => b.id))
    for (const [id, m] of markersRef.current) {
      if (!seen.has(id)) {
        m.map = null
        markersRef.current.delete(id)
      }
    }
    for (const b of blips) {
      if (!Number.isFinite(b.lat) || !Number.isFinite(b.lng)) continue
      const pin = document.createElement("div")
      pin.className = `fh-pin ${b.status}${b.id === lockedId ? " locked" : ""}`
      pin.title = b.id
      let m = markersRef.current.get(b.id)
      if (!m) {
        m = new Adv({
          map,
          position: { lat: b.lat, lng: b.lng },
          content: pin,
          gmpClickable: true,
        })
        m.addEventListener?.("gmp-click", () => onSelectRef.current?.(b.id))
        markersRef.current.set(b.id, m)
      } else {
        m.position = { lat: b.lat, lng: b.lng }
        m.map = map
        if (m && "content" in m) (m as { content: HTMLElement }).content = pin
      }
    }
  }, [blips, lockedId, ready])

  useEffect(() => {
    const map = mapRef.current
    const g = (window as unknown as { google?: { maps?: Record<string, unknown> } }).google
    if (!map || !g?.maps || !ready) return
    const Maps = g.maps as {
      LatLngBounds: new () => { extend: (p: { lat: number; lng: number }) => void; isEmpty?: () => boolean }
      Circle: new (opts: Record<string, unknown>) => { getBounds: () => unknown }
    }
    const pad = { top: 36, right: 36, bottom: 160, left: 36 }
    if (isClusterPhase(phase)) {
      const pts = blips.filter((b) => Number.isFinite(b.lat) && Number.isFinite(b.lng))
      if (pts.length === 0) return
      const bounds = new Maps.LatLngBounds()
      for (const p of pts) bounds.extend({ lat: p.lat, lng: p.lng })
      map.fitBounds(bounds, pad)
      return
    }
    mapHome = center
    map.panTo?.(center)
    const circle = new Maps.Circle({
      center,
      radius: rangeMi * 1609.34,
    })
    const bounds = circle.getBounds()
    if (bounds) map.fitBounds(bounds, pad)
  }, [blips, center.lat, center.lng, phase, rangeMi, ready])

  if (!KEY) return null
  return <div id="gmap" className={interactive ? "live" : undefined} ref={elRef} aria-hidden />
}
