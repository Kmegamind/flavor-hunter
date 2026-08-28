"use client"

import { useEffect, useId, useRef, useState } from "react"
import type { PlaceSuggestion } from "@/lib/pipeline/places-geo"
import {
  fetchGeocode,
  fetchPlaceDetails,
  fetchPlaceSuggestions,
  fetchReverse,
  newSessionToken,
} from "@/lib/geo-client"
import { round3 } from "@/lib/pipeline/polar"

type GeoStatus = "idle" | "acquiring" | "ok" | "manual" | "denied"

export type NearPatch = {
  city_label?: string
  coords?: { lat: number; lng: number } | null
  location_mode?: "current" | "custom"
  geo_status?: GeoStatus
}

export function NearLocation({
  cityLabel,
  coords,
  locationMode,
  geoStatus,
  onPatch,
  onLog,
}: {
  cityLabel: string
  coords: { lat: number; lng: number } | null
  locationMode: "current" | "custom"
  geoStatus: GeoStatus
  onPatch: (patch: NearPatch) => void
  onLog: (line: string) => void
}) {
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const sessionRef = useRef(newSessionToken())
  const geoWatchRef = useRef<number | null>(null)
  const skipBlurRef = useRef(false)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([])
  /**
   * Ask the Permissions API up front.
   *
   * Once a user denies location the browser stops prompting, so the button was a dead
   * control: tapping it produced no dialog, no visible change, and one line in a status
   * bar nobody is looking at. Knowing the state before the tap lets the button say so.
   */
  const [blocked, setBlocked] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!navigator.permissions?.query) return
    void navigator.permissions
      .query({ name: "geolocation" as PermissionName })
      .then((status) => {
        if (cancelled) return
        const sync = () => setBlocked(status.state === "denied")
        sync()
        status.addEventListener("change", sync)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const q = cityLabel.trim()
    if (q.length < 2 || locationMode === "current") {
      setSuggestions([])
      setOpen(false)
      return
    }
    const t = window.setTimeout(() => {
      void fetchPlaceSuggestions(q, sessionRef.current, coords ?? undefined).then((rows) => {
        setSuggestions(rows)
        setActive(0)
        setOpen(rows.length > 0)
      })
    }, 220)
    return () => window.clearTimeout(t)
  }, [cityLabel, locationMode])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [])

  const applyPlace = (place: { label: string; lat: number; lng: number }, mode: "current" | "custom") => {
    onPatch({
      city_label: place.label,
      coords: { lat: round3(place.lat), lng: round3(place.lng) },
      location_mode: mode,
      geo_status: mode === "current" ? "ok" : "manual",
    })
    setSuggestions([])
    setOpen(false)
    sessionRef.current = newSessionToken()
  }

  const pickSuggestion = async (row: PlaceSuggestion) => {
    skipBlurRef.current = true
    const place =
      (await fetchPlaceDetails(row.placeId, sessionRef.current)) ?? (await fetchGeocode(row.text))
    if (place) {
      applyPlace(place, "custom")
      onLog(`GEO LOCK · ${place.label}`)
      return
    }
    onPatch({ city_label: row.text, location_mode: "custom", geo_status: "manual" })
    setSuggestions([])
    setOpen(false)
  }

  const resolveTyped = async () => {
    const q = cityLabel.trim()
    if (!q) return
    const place = await fetchGeocode(q)
    if (!place) {
      onLog("ADDRESS NOT FOUND · TRY A PICK FROM THE LIST")
      return
    }
    applyPlace(place, "custom")
    onLog(`GEO LOCK · ${place.label}`)
  }

  const requestGeo = () => {
    skipBlurRef.current = true
    if (geoWatchRef.current) window.clearTimeout(geoWatchRef.current)
    onPatch({ geo_status: "acquiring" })
    onLog("GEO LOCK · ACQUIRING")
    if (!window.isSecureContext) {
      onPatch({ geo_status: "manual", location_mode: "custom" })
      onLog("LOCATION NEEDS HTTPS · TYPE AN ADDRESS")
      return
    }
    if (!navigator.geolocation) {
      onPatch({ geo_status: "manual", location_mode: "custom" })
      onLog("LOCATION UNAVAILABLE · TYPE AN ADDRESS")
      return
    }
    geoWatchRef.current = window.setTimeout(() => {
      onPatch({ geo_status: "manual", location_mode: "custom" })
      onLog("LOCATION TIMEOUT · TYPE AN ADDRESS")
    }, 12000)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        if (geoWatchRef.current) window.clearTimeout(geoWatchRef.current)
        const lat = round3(pos.coords.latitude)
        const lng = round3(pos.coords.longitude)
        onPatch({
          geo_status: "ok",
          location_mode: "current",
          coords: { lat, lng },
        })
        const place = await fetchReverse(lat, lng)
        applyPlace(place ?? { label: "Current location", lat, lng }, "current")
        onLog(`GEO LOCK · ${place?.label ?? "CURRENT LOCATION"}`)
      },
      (err) => {
        if (geoWatchRef.current) window.clearTimeout(geoWatchRef.current)
        onPatch({ geo_status: "manual", location_mode: "custom" })
        if (err.code === 1) {
        setBlocked(true)
        onPatch({ geo_status: "denied" })
        onLog("LOCATION BLOCKED · ALLOW IT IN THE BROWSER, THEN TAP AGAIN")
      }
        else if (err.code === 3) onLog("LOCATION TIMEOUT · TYPE AN ADDRESS")
        else onLog("LOCATION FAIL · TYPE AN ADDRESS")
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 15_000 },
    )
  }

  return (
    <div className="near-field" ref={rootRef}>
      <span className="meta-k">near</span>
      <span className="near-row">
        <input
          aria-label="near"
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={open}
          title={cityLabel}
          value={cityLabel}
          onChange={(e) => {
            onPatch({
              city_label: e.target.value,
              location_mode: "custom",
              coords: null,
              geo_status: "manual",
            })
          }}
          onFocus={() => {
            if (suggestions.length) setOpen(true)
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" && suggestions.length) {
              e.preventDefault()
              setOpen(true)
              setActive((i) => (i + 1) % suggestions.length)
            } else if (e.key === "ArrowUp" && suggestions.length) {
              e.preventDefault()
              setActive((i) => (i - 1 + suggestions.length) % suggestions.length)
            } else if (e.key === "Enter") {
              e.preventDefault()
              if (open && suggestions[active]) void pickSuggestion(suggestions[active])
              else void resolveTyped()
            } else if (e.key === "Escape") {
              setOpen(false)
            }
          }}
          onBlur={() => {
            window.setTimeout(() => {
              if (skipBlurRef.current) {
                skipBlurRef.current = false
                return
              }
              if (!cityLabel.trim() || coords) return
              void resolveTyped()
            }, 180)
          }}
          placeholder="address, neighborhood, or city"
          autoComplete="off"
        />
        <button
          type="button"
          className={`geo${locationMode === "current" && geoStatus === "ok" ? " on" : ""}${
            blocked ? " blocked" : ""
          }`}
          onClick={() => (blocked ? setShowHelp(true) : requestGeo())}
          disabled={geoStatus === "acquiring"}
          title={
            blocked
              ? "Your browser is blocking location for this site. Allow it in site settings, then tap again."
              : "Use your device location"
          }
        >
          {geoStatus === "acquiring"
            ? "locating…"
            : blocked
              ? "location blocked"
              : locationMode === "current" && geoStatus === "ok"
                ? "located"
                : "current location"}
        </button>
      </span>
      {blocked && (
        <p className="geo-hint">
          Location is blocked.{" "}
          <button type="button" className="geo-link" onClick={() => setShowHelp(true)}>
            how to allow it
          </button>
        </p>
      )}
      {showHelp && (
        <div
          className="geo-modal"
          role="dialog"
          aria-modal="true"
          aria-label="How to allow location"
          onClick={() => setShowHelp(false)}
        >
          <div className="geo-modal-box" onClick={(e) => e.stopPropagation()}>
            <p className="geo-modal-k">LOCATION BLOCKED</p>
            <p>
              This site was denied location access earlier, and browsers stop asking once that
              happens — which is why the button no longer opens a prompt. Re-allowing it is a
              browser setting, so it has to be done here rather than in the app:
            </p>
            <ol>
              <li>
                <b>Chrome / Edge</b> — click the icon at the left of the address bar (a slider or
                a tune icon) → <b>Location</b> → <b>Allow</b>, then reload.
              </li>
              <li>
                <b>Safari</b> — Safari menu → <b>Settings for This Website…</b> →{" "}
                <b>Location: Allow</b>.
              </li>
              <li>
                <b>iOS Safari</b> — Settings app → Safari → Location → <b>Ask</b>, then reload.
              </li>
            </ol>
            <p className="geo-modal-alt">
              Or skip it entirely: type an address above. Nothing in the hunt needs your device
              location — it only saves you the typing, and coordinates are rounded to about 100 m
              before they are sent and are never stored on a server.
            </p>
            <button type="button" className="geo-modal-close" onClick={() => setShowHelp(false)}>
              got it
            </button>
          </div>
        </div>
      )}
      {open && suggestions.length > 0 && (
        <ul id={listId} className="place-list" role="listbox">
          {suggestions.map((row, i) => (
            <li key={row.placeId} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                className={i === active ? "on" : undefined}
                onMouseDown={(e) => {
                  e.preventDefault()
                  skipBlurRef.current = true
                }}
                onClick={() => void pickSuggestion(row)}
              >
                <strong>{row.mainText}</strong>
                {row.secondaryText ? <span>{row.secondaryText}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
