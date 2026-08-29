"use client"

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react"
import { RadarCanvas, type ScopeSnapshot } from "@/components/RadarCanvas"
import { GoogleBasemap, mapRecenter, mapZoom, mapsEnabled } from "@/components/GoogleBasemap"
import { HoundTitle } from "@/components/HoundTitle"
import { NearLocation } from "@/components/NearLocation"
import { DEFAULT_MEMORY, SEEDED_EXAMPLES } from "@/lib/examples"
import { fetchGeocode } from "@/lib/geo-client"
import { huntReducer, initialHuntState } from "@/lib/machines/hunt"
import { refine } from "@/lib/refine"
import { huntStream, loadFixture, replayNdjson } from "@/lib/stream/client"
import { EMBEDDED } from "@/lib/fixtures/embedded"
import { DEFAULT_CENTER, lookupCityCenter } from "@/lib/pipeline/polar"
import { unmatchedAnchors, whyNotHundred } from "@/schemas/score"
import { directionLabel, readableQuote, showsOriginal } from "@/lib/pipeline/english-labels"
import type { AnchorSet, EvidenceLine, HuntEvent, HuntRequest, RangeMi } from "@/schemas"

function patchAnchorValue(anchors: AnchorSet, field: string, value: string): AnchorSet {
  const next = { value, confidence: 0.9 }
  if (field === "dish") return { ...anchors, dish: next }
  if (field === "cuisine") return { ...anchors, cuisine: next }
  if (field === "substyle") return { ...anchors, substyle: next }
  if (field === "person") return { ...anchors, person: next }
  if (field === "setting") return { ...anchors, setting: next }
  if (field.startsWith("sensory.")) {
    const i = Number(field.split(".")[1])
    return {
      ...anchors,
      sensory: anchors.sensory.map((s, idx) => (idx === i ? next : s)),
    }
  }
  return anchors
}

function sourceLabel(ev: EvidenceLine) {
  if (ev.source === "google_review") return "Google"
  if (ev.source === "reddit") return ev.source_name
  const name = ev.source_name
  if (!name || name.endsWith(".invalid")) return "restaurant website"
  return name
}

function sourceKind(ev: EvidenceLine) {
  if (ev.source === "google_review") return "review"
  if (ev.source === "reddit") return "reddit"
  return "menu"
}

const FIXTURE_BUILD = Object.keys(EMBEDDED).join(",")

const SETTINGS_KEY = "fh.settings.v2"
const RANGES: RangeMi[] = [5, 10, 20, 45]
const SIG = "#FF3D00"
const LOCK = "#FFC400"
const PROOF = "#7CFF6B"

type Settings = {
  location_mode: "current" | "custom"
  city_label: string
  coords: { lat: number; lng: number } | null
  range_mi: RangeMi
  geo_status: "idle" | "acquiring" | "ok" | "manual" | "denied"
  audio_unmuted: boolean
}

const DEFAULT_SETTINGS: Settings = {
  location_mode: "custom",
  city_label: "Washington, DC",
  coords: null,
  range_mi: 20,
  geo_status: "idle",
  audio_unmuted: false,
}

function loadSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return DEFAULT_SETTINGS
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_SETTINGS
  }
}

function poseFor(phase: string, wait: boolean, sniff: boolean): string {
  if (wait) return "alert"
  if (phase === "S0_IDLE") return "sit"
  if (phase === "S1_DECODING" || phase === "S1B_CONFIRM") return "alert"
  if (phase === "S2_NEED_CLUE") return "tilt"
  if (phase === "S3_HUNTING" || phase === "S7_DEGRADED") return sniff ? "sniff" : "run"
  if (phase === "S4_LOCKED" || phase === "S5_EVIDENCE") return "point"
  if (phase === "S6_REFINING") return "shake"
  if (phase === "S8_NO_ANSWER") return "sad"
  return "sit"
}

function collarFor(phase: string) {
  if (phase === "S4_LOCKED" || phase === "S5_EVIDENCE") return PROOF
  if (phase === "S3_HUNTING") return SIG
  return LOCK
}

const NOSE = "....... ..www.. .wnnnw. .wnlnw. .wnnnw. ..nnn.. .......".replace(/ /g, "")
const STAR = "...s... s.sss.s .sssss. sssssss .sssss. s.sss.s ...s...".replace(/ /g, "")

function composeMemoryWithClue(original: string, clue: string): string {
  const line = `The dish or cuisine is: ${clue.trim()}`
  const stripped = original.replace(/\n?The dish or cuisine is:\s*[^\n]*/gi, "").trim()
  return stripped ? `${stripped}\n${line}` : line
}

function huntCenter(req: HuntRequest): { lat: number; lng: number } {
  return req.coords ?? lookupCityCenter(req.city_label) ?? DEFAULT_CENTER
}

function PixelGrid({ className, cells }: { className: string; cells: string }) {
  return (
    <span className={className} aria-hidden>
      {cells.split("").map((ch, i) => (
        <span key={i} className={ch === "." ? undefined : ch} />
      ))}
    </span>
  )
}

export function Tracker({ fixturePrefetch }: { fixturePrefetch?: string }) {
  const [hunt, dispatch] = useReducer(huntReducer, initialHuntState)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [memory, setMemory] = useState(DEFAULT_MEMORY)
  const [clue, setClue] = useState("")
  const [clueHint, setClueHint] = useState<string | null>(null)
  const [log, setLog] = useState("SCOPE OK · SCENT ARRAY OK")
  const [intelOpen, setIntelOpen] = useState(true)
  const exRef = useRef<HTMLDivElement>(null)
  const [exIndex, setExIndex] = useState(0)
  const [placeOpen, setPlaceOpen] = useState(false)

  const scrollExample = (dir: -1 | 1) => {
    const el = exRef.current
    if (!el) return
    const next = Math.min(Math.max(exIndex + dir, 0), SEEDED_EXAMPLES.length - 1)
    el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" })
    setExIndex(next)
  }
  const [booted, setBooted] = useState(false)
  const [settingsReady, setSettingsReady] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [resultView, setResultView] = useState<"list" | "card">("list")
  const [reduced, setReduced] = useState(false)
  const lastCenterRef = useRef(DEFAULT_CENTER)
  const abortRef = useRef<AbortController | null>(null)
  const huntGen = useRef(0)
  const clueAttemptRef = useRef(false)
  const bootGeocodedRef = useRef(false)
  const miniRef = useRef<HTMLCanvasElement>(null)
  const lastEventAt = useRef(0)
  const sniffRef = useRef<string | null>(null)
  const waitRef = useRef(false)
  const audioRef = useRef<{ ctx: AudioContext | null; unmuted: boolean }>({ ctx: null, unmuted: false })
  const scopeRef = useRef<ScopeSnapshot>({
    blips: [],
    sniff_id: null,
    wait: false,
    locked_id: null,
    pose: "sleep",
    flip: false,
    collar: SIG,
    range_mi: 20,
    reduced_motion: false,
    phase: "S0_IDLE",
    use_map: false,
  })

  useEffect(() => {
    setSettings(loadSettings())
    setSettingsReady(true)
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    setReduced(mq.matches)
    const onMq = () => setReduced(mq.matches)
    mq.addEventListener("change", onMq)
    if ("serviceWorker" in navigator) {
      const local = ["localhost", "127.0.0.1"].includes(location.hostname)
      if (local) {
        void navigator.serviceWorker.getRegistrations().then((regs) => {
          for (const r of regs) void r.unregister()
        })
        void caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      } else {
        navigator.serviceWorker.register("/sw.js").catch(() => {})
      }
    }
    const t = [
      window.setTimeout(() => setLog("GEO LOCK · NEAR / RANGE"), 400),
      window.setTimeout(() => {
        setLog("HOUND AWAKE · SCAN STANDBY")
        setBooted(true)
      }, 900),
    ]
    return () => {
      t.forEach(clearTimeout)
      mq.removeEventListener("change", onMq)
    }
  }, [])

  const persistSettings = (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch }))

  useEffect(() => {
    if (!settingsReady) return
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        location_mode: settings.location_mode,
        city_label: settings.city_label,
        coords: settings.coords,
        range_mi: settings.range_mi,
        audio_unmuted: settings.audio_unmuted,
      }),
    )
  }, [settings, settingsReady])

  useEffect(() => {
    if (!settingsReady || bootGeocodedRef.current || settings.geo_status === "acquiring") return
    if (!settings.city_label.trim() || settings.coords) return
    bootGeocodedRef.current = true
    let cancelled = false
    void (async () => {
      const table = lookupCityCenter(settings.city_label)
      if (table) {
        if (!cancelled) {
          persistSettings({ coords: table })
          setLog(`CENTER · ${settings.city_label}`)
        }
        return
      }
      const place = await fetchGeocode(settings.city_label)
      if (cancelled || !place) return
      persistSettings({ city_label: place.label, coords: { lat: place.lat, lng: place.lng } })
      setLog(`CENTER · ${place.label}`)
    })()
    return () => {
      cancelled = true
    }
  }, [settingsReady, settings.city_label, settings.coords, settings.geo_status])

  useEffect(() => {
    if (!settingsReady || hunt.phase !== "S0_IDLE") return
    const coords = settings.coords
    if (!coords) return
    setLog(`CENTER · ${settings.city_label}`)
  }, [settingsReady, settings.coords, settings.city_label, hunt.phase])

  const beep = useCallback((f: number, d: number, type: OscillatorType = "square", g = 0.05) => {
    if (!audioRef.current.unmuted) return
    const ctx = audioRef.current.ctx
    if (!ctx) return
    const o = ctx.createOscillator()
    const gn = ctx.createGain()
    o.type = type
    o.frequency.value = f
    gn.gain.value = g
    gn.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + d)
    o.connect(gn)
    gn.connect(ctx.destination)
    o.start()
    o.stop(ctx.currentTime + d)
  }, [])

  useEffect(() => {
    sniffRef.current =
      hunt.phase === "S3_HUNTING" || hunt.phase === "S7_DEGRADED"
        ? hunt.blips.filter((b) => b.status === "candidate").at(-1)?.id ?? null
        : hunt.locked_id
    const silent =
      (hunt.phase === "S3_HUNTING" || hunt.phase === "S7_DEGRADED") &&
      performance.now() - lastEventAt.current > 400 &&
      hunt.blips.length > 0 &&
      !hunt.locked_id
    waitRef.current = silent
    scopeRef.current = {
      blips: hunt.blips,
      sniff_id: waitRef.current ? null : sniffRef.current,
      wait: waitRef.current,
      locked_id: hunt.locked_id,
      pose: poseFor(hunt.phase, waitRef.current, Boolean(sniffRef.current && hunt.phase !== "S4_LOCKED")),
      flip: false,
      collar: collarFor(hunt.phase),
      range_mi: hunt.request?.range_mi ?? settings.range_mi,
      reduced_motion: reduced,
      phase: hunt.phase,
      use_map: mapsEnabled(),
    }
  }, [hunt, reduced, settings.range_mi])

  useEffect(() => {
    if (!settings.audio_unmuted || !hunt.locked_id) return
    const locked = hunt.blips.find((b) => b.id === hunt.locked_id)
    if (!locked) return
    const max = hunt.request?.range_mi ?? 20
    const n = Math.min(1, locked.distance / max)
    const interval = 140 + 760 * n * n
    const id = window.setInterval(() => beep(880, 0.05, "square", 0.03), interval)
    return () => clearInterval(id)
  }, [beep, hunt.blips, hunt.locked_id, hunt.request, settings.audio_unmuted])

  useEffect(() => {
    if (hunt.phase === "S1B_CONFIRM" && hunt.category_name) {
      setLog(`CONFIRM NAME · ${hunt.category_name}
                {hunt.interpreting && <span className="still-reading"> · reading the rest…</span>}`)
    }
  }, [hunt.phase, hunt.category_name])

  const runRequest = useCallback(
    async (req: HuntRequest, fixtureName?: string) => {
      const gen = ++huntGen.current
      abortRef.current?.abort()
      const abort = new AbortController()
      abortRef.current = abort
      dispatch({ type: "SUBMIT", request: req })
      setLog("SCAN INITIATED")
      const onEvent = (ev: HuntEvent) => {
        if (gen !== huntGen.current) return
        lastEventAt.current = performance.now()
        dispatch({ type: "STREAM", event: ev })
        if (ev.type === "parsed") setLog(`MEMORY PARSED · ${ev.category_name || "—"}`)
        if (ev.type === "candidates") {
          setLog(`${ev.count} SIGNALS DETECTED`)
          beep(440, 0.05)
        }
        if (ev.type === "evaluated") setLog(`▶ EVALUATING ${ev.id}`)
        if (ev.type === "eliminated") {
          setLog(`✗ ${ev.reason}`)
          beep(180, 0.09, "sawtooth", 0.04)
        }
        if (ev.type === "locked") {
          const top = ev.ranked.find((r) => r.score !== null)
          setLog(`TARGET LOCKED · ${top?.name ?? ""} · MATCH ${top?.score ?? "—"}`)
          beep(523, 0.08)
          window.setTimeout(() => beep(784, 0.18), 90)
        }
        if (ev.type === "widen") setLog("NO MATCH IN RANGE · TWO DOORS")
        if (ev.type === "substitute") setLog(`NEAR MISS · ${ev.to.dish ?? ev.to.cuisine ?? ""}`)
        if (ev.type === "need_clue") {
          setLog("NEED ONE MORE CLUE")
          if (clueAttemptRef.current) {
            setClueHint("Still need a dish or cuisine — try “ramen” or “Chinese”.")
            clueAttemptRef.current = false
          }
        }
        if (ev.type === "degraded") setLog(`LIVE SEARCH UNAVAILABLE · ${ev.reason}`)
      }
      const offline = typeof navigator !== "undefined" && navigator.onLine === false
      const reanchorTo = huntCenter(req)
      const replayOpts = { pacing: true as const, signal: abort.signal, reanchorTo }
      try {
        if (fixtureName || offline) {
          const name = fixtureName || "a1"
          const text = await loadFixture(name)
          await replayNdjson(text, onEvent, replayOpts)
        } else {
          await huntStream(req, abort.signal, onEvent)
        }
        if (gen !== huntGen.current) return
        dispatch({ type: "STREAM_END" })
      } catch {
        if (abort.signal.aborted || gen !== huntGen.current) return
        try {
          const text = await loadFixture("degraded")
          await replayNdjson(text, onEvent, replayOpts)
        } catch {
          if (gen !== huntGen.current) return
          dispatch({ type: "STREAM", event: { type: "degraded", reason: "network" } })
        }
      }
    },
    [beep],
  )

  const autoStarted = useRef(false)
  useEffect(() => {
    if (!fixturePrefetch || autoStarted.current || !booted) return
    autoStarted.current = true
    const reqs: Record<string, HuntRequest> = {
      a1: {
        memory_text: "the sweet tomato and egg my grandmother used to make",
        locale: "en",
        range_mi: 20,
        city_label: "Boston, MA",
      },
      a10: {
        memory_text: "Missing home food.",
        locale: "en",
        range_mi: 20,
        city_label: "Chennai, IN",
      },
      a6: {
        memory_text: "Mexican food, but everything I've tried here is bad",
        locale: "en",
        range_mi: 20,
        city_label: "Toronto, ON",
      },
      degraded: {
        memory_text: "the sweet tomato and egg my grandmother used to make",
        locale: "en",
        range_mi: 20,
        city_label: "Boston, MA",
      },
    }
    void runRequest(reqs[fixturePrefetch] ?? reqs.a1, fixturePrefetch)
  }, [booted, fixturePrefetch, runRequest])

  const submitMemory = (
    text: string,
    city?: string,
    range?: RangeMi,
    locale = "en",
    extra?: Pick<HuntRequest, "substitute" | "confirmed">,
    coordsOverride?: { lat: number; lng: number },
  ) => {
    void (async () => {
      const fromHunt = Boolean(city && hunt.request)
      let cityLabel = city ?? settings.city_label
      let coords =
        coordsOverride ?? (fromHunt ? hunt.request?.coords : settings.coords) ?? undefined
      if (!coords && cityLabel.trim()) {
        const place = await fetchGeocode(cityLabel)
        if (place) {
          coords = { lat: place.lat, lng: place.lng }
          if (!fromHunt) {
            cityLabel = place.label
            persistSettings({
              city_label: place.label,
              coords,
              location_mode: settings.location_mode === "current" ? "current" : "custom",
            })
          }
        }
      }
      if (!coords) {
        const table = lookupCityCenter(cityLabel)
        if (table) coords = table
      }
      const req: HuntRequest = {
        memory_text: text,
        locale,
        range_mi: range ?? settings.range_mi,
        city_label: cityLabel,
        coords,
        substitute: extra?.substitute,
        confirmed: extra?.confirmed,
      }
      void runRequest(req)
    })()
  }

  const onRestart = () => {
    abortRef.current?.abort()
    dispatch({ type: "RESET" })
    setMemory("")
    setClue("")
    setClueHint(null)
    setLog("HOUND AWAKE · SCAN STANDBY")
    setEditing(null)
    setResultView("list")
  }

  const submitClue = () => {
    const trimmed = clue.trim()
    if (!trimmed) {
      setClueHint("Type a dish or cuisine first.")
      return
    }
    clueAttemptRef.current = true
    setClueHint(null)
    const original = hunt.request?.memory_text ?? memory
    submitMemory(composeMemoryWithClue(original, trimmed))
  }

  const confirmHunt = () => {
    const text = hunt.request?.memory_text ?? memory
    submitMemory(
      text,
      hunt.request?.city_label,
      hunt.request?.range_mi,
      hunt.request?.locale ?? "en",
      {
        confirmed: true,
        ...(hunt.request?.substitute ? { substitute: hunt.request.substitute } : {}),
      },
      hunt.request?.coords,
    )
  }

  const onNotQuiteRephrase = () => {
    abortRef.current?.abort()
    dispatch({ type: "RESET" })
    setClue("")
    setClueHint(null)
    setEditing(null)
    setLog("HOUND AWAKE · SCAN STANDBY")
  }

  const onNotQuite = () => {
    if (hunt.phase !== "S4_LOCKED" && hunt.phase !== "S5_EVIDENCE") return
    if (!hunt.anchors || !hunt.category_name) return
    dispatch({ type: "REFINE" })
    setLog("FILTER · TOO SOUR · LOCAL RE-RANK · 0 REQUESTS")
    const out = refine({
      anchors: hunt.anchors,
      category_name: hunt.category_name,
      ranked: hunt.ranked,
      correction: { kind: "nl", text: "too sour" },
    })
    dispatch({
      type: "REFINE_DONE",
      ranked: out.ranked,
      locked_id: out.locked_id,
      anchors: out.anchors,
    })
    const top = out.ranked.find((r) => r.id === out.locked_id)
    setLog(`TARGET RE-ACQUIRED · MATCH ${top?.score ?? "—"}`)
  }

  useEffect(() => {
    if (
      hunt.phase === "S0_IDLE" ||
      hunt.phase === "S1_DECODING" ||
      hunt.phase === "S1B_CONFIRM" ||
      hunt.phase === "S3_HUNTING"
    ) {
      setResultView("list")
    }
    if (hunt.phase === "S1B_CONFIRM") {
      setClue("")
      setClueHint(null)
      clueAttemptRef.current = false
    }
  }, [hunt.phase])

  const openCandidate = (id: string) => {
    if (hunt.phase !== "S4_LOCKED" && hunt.phase !== "S5_EVIDENCE") return
    dispatch({ type: "SELECT_CANDIDATE", id })
    setResultView("card")
  }

  const scored = useMemo(
    () => hunt.ranked.filter((r) => r.score !== null).slice().sort((a, b) => (b.score ?? 0) - (a.score ?? 0)),
    [hunt.ranked],
  )
  const locked = hunt.ranked.find((r) => r.id === hunt.locked_id) ?? hunt.ranked[0]
  const gaps = hunt.anchors && locked ? unmatchedAnchors(hunt.anchors, locked.evidence) : []
  const whyNot = hunt.anchors && locked ? whyNotHundred(hunt.anchors, locked.evidence) : ""
  const chipConfidence = (c: number) => (c < 0.7 ? "q" : "ok")

  const chips = useMemo(() => {
    if (!hunt.anchors) return []
    const a = hunt.anchors
    const rows: { field: string; label: string; value: string; c: number }[] = []
    if (a.dish) rows.push({ field: "dish", label: "dish", value: a.dish.value, c: a.dish.confidence })
    if (a.cuisine) rows.push({ field: "cuisine", label: "cuisine", value: a.cuisine.value, c: a.cuisine.confidence })
    if (a.substyle) rows.push({ field: "substyle", label: "substyle", value: a.substyle.value, c: a.substyle.confidence })
    if (a.direction) rows.push({ field: "direction", label: "direction", value: directionLabel(a.direction), c: 0.8 })
    if (a.person) rows.push({ field: "person", label: "person", value: a.person.value, c: a.person.confidence })
    a.sensory.forEach((s, i) => rows.push({ field: `sensory.${i}`, label: "sensory", value: s.value, c: s.confidence }))
    return rows
  }, [hunt.anchors])

  const toggleSound = () => {
    const next = !settings.audio_unmuted
    persistSettings({ audio_unmuted: next })
    audioRef.current.unmuted = next
    if (next) {
      audioRef.current.ctx =
        audioRef.current.ctx ?? new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      void audioRef.current.ctx.resume()
      beep(880, 0.08, "square", 0.04)
    }
  }

  const editChip = (field: string, value: string) => {
    if (!hunt.anchors) {
      setEditing(null)
      return
    }
    if (hunt.phase === "S1B_CONFIRM") {
      dispatch({ type: "PATCH_ANCHORS", anchors: patchAnchorValue(hunt.anchors, field, value) })
      setEditing(null)
      return
    }
    setEditing(null)
  }

  const mapCenter =
    hunt.request?.coords ??
    settings.coords ??
    lookupCityCenter(hunt.request?.city_label ?? settings.city_label) ??
    lastCenterRef.current
  lastCenterRef.current = mapCenter
  /**
   * The map is touchable except while the radar is actually running.
   *
   * It used to be interactive only after a lock, which meant that on the idle screen —
   * the one place a user might want to look around before searching — the map had
   * `pointer-events: none` and simply did not respond. The camera lock that FR-6a calls
   * for belongs to the hunt itself (S1/S1B/S3/S7), where the canvas overlay must not
   * have to chase a moving camera. Everywhere else, let people pan.
   */
  const mapInteractive = !(
    hunt.phase === "S1_DECODING" ||
    hunt.phase === "S1B_CONFIRM" ||
    hunt.phase === "S3_HUNTING" ||
    hunt.phase === "S7_DEGRADED"
  )

  return (
    <div id="page" data-fixtures={FIXTURE_BUILD}>
      <div id="device">
        <div id="titleplate">
          <HoundTitle
            pose={poseFor(hunt.phase, waitRef.current, Boolean(sniffRef.current && hunt.phase !== "S4_LOCKED"))}
            collar={collarFor(hunt.phase)}
          />
          <h1>FLAVOR HUNTER</h1>
        </div>
        <div className="corner tl" title="nose">
          <PixelGrid className="px-nose" cells={NOSE} />
        </div>
        <div className="corner tr" title="star">
          <PixelGrid className="px-star" cells={STAR} />
        </div>
        <div id="tabs">
          <div className="tab c">HOT</div>
          <div className="tab r">COLD</div>
        </div>
        <div id="screen">
          <div className="ruler-x" />
          <div className="ruler-y" />
          <GoogleBasemap
            center={mapCenter}
            rangeMi={hunt.request?.range_mi ?? settings.range_mi}
            blips={hunt.blips}
            lockedId={hunt.locked_id}
            phase={hunt.phase}
            interactive={mapInteractive}
            onSelect={openCandidate}
          />
          <RadarCanvas scopeRef={scopeRef} miniRef={miniRef} />
          {mapsEnabled() && mapInteractive && (
            <div id="mapctl">
              <button type="button" aria-label="Zoom in" onClick={() => mapZoom(1)}>
                +
              </button>
              <button type="button" aria-label="Zoom out" onClick={() => mapZoom(-1)}>
                −
              </button>
              <button type="button" aria-label="Recenter" onClick={() => mapRecenter()}>
                ⌖
              </button>
            </div>
          )}
          <div id="miniwrap">
            <canvas id="mini" ref={miniRef} width={118} height={118} />
          </div>
          <button
            id="intel-toggle"
            type="button"
            className={intelOpen ? undefined : "closed"}
            aria-expanded={intelOpen}
            aria-controls="intel"
            onClick={() => setIntelOpen((v) => !v)}
          >
            {intelOpen ? "▾ hide panel" : "▴ panel"}
          </button>
          <div
            id="intel"
            className={[
              hunt.phase === "S0_IDLE" ? "idle-sheet" : "",
              intelOpen ? "" : "collapsed",
            ]
              .filter(Boolean)
              .join(" ") || undefined}
            hidden={!intelOpen}
          >
            {hunt.degraded && (
              <div className="banner">
                Live search unavailable — showing a cached example
                {hunt.degraded_reason ? ` (${hunt.degraded_reason})` : ""}
              </div>
            )}
            {hunt.phase === "S0_IDLE" && (
              <>
                <div className="k">{booted ? "WHAT TASTE ARE YOU HUNTING?" : "TRACKER v1"}</div>
                <h2>{booted ? "describe a memory…" : "Booting scent array…"}</h2>
                {!placeOpen ? (
                  <button
                    type="button"
                    className="place-chip"
                    onClick={() => setPlaceOpen(true)}
                  >
                    ◎ {settings.city_label} · {settings.range_mi} mi
                    <span className="place-chip-edit">edit</span>
                  </button>
                ) : (
                <div className="meta">
                  <NearLocation
                    cityLabel={settings.city_label}
                    coords={settings.coords}
                    locationMode={settings.location_mode}
                    geoStatus={settings.geo_status}
                    onPatch={persistSettings}
                    onLog={setLog}
                  />
                  <label>
                    range
                    <select
                      value={settings.range_mi}
                      onChange={(e) => persistSettings({ range_mi: Number(e.target.value) as RangeMi })}
                    >
                      {RANGES.map((r) => (
                        <option key={r} value={r}>
                          {r} mi
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="place-done"
                    onClick={() => setPlaceOpen(false)}
                  >
                    done
                  </button>
                </div>
                )}
                <textarea
                  value={memory}
                  onChange={(e) => setMemory(e.target.value)}
                  onFocus={(e) => {
                    // Select the seeded memory so the first keystroke replaces it. Clearing
                    // on focus would erase the example before it has been read.
                    if (e.target.value === DEFAULT_MEMORY) e.target.select()
                  }}
                  aria-label="Your food memory"
                  rows={3}
                />
                <div className="ex-head">
                  <span className="mute try-k">or try one of these</span>
                  <span className="ex-nav">
                    <button
                      type="button"
                      aria-label="Previous example"
                      disabled={exIndex === 0}
                      onClick={() => scrollExample(-1)}
                    >
                      ‹
                    </button>
                    <span className="ex-dots" aria-hidden>
                      {SEEDED_EXAMPLES.map((ex, i) => (
                        <i key={ex.id} className={i === exIndex ? "on" : undefined} />
                      ))}
                    </span>
                    <button
                      type="button"
                      aria-label="Next example"
                      disabled={exIndex === SEEDED_EXAMPLES.length - 1}
                      onClick={() => scrollExample(1)}
                    >
                      ›
                    </button>
                  </span>
                </div>
                <div
                  className="examples"
                  ref={exRef}
                  onScroll={(e) => {
                    const el = e.currentTarget
                    if (el.clientWidth === 0) return
                    const i = Math.round(el.scrollLeft / el.clientWidth)
                    if (i !== exIndex) setExIndex(i)
                  }}
                >
                  {SEEDED_EXAMPLES.map((ex, i) => (
                    <button
                      key={ex.id}
                      type="button"
                      className="example"
                      onClick={() => {
                        setMemory(ex.memory_text)
                        submitMemory(ex.memory_text, undefined, undefined, ex.locale)
                      }}
                    >
                      <span className="example-k">example {i + 1}</span>
                      <span className="example-t">{ex.memory_text}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
            {(hunt.phase === "S1_DECODING" ||
              hunt.phase === "S1B_CONFIRM" ||
              hunt.phase === "S3_HUNTING" ||
              hunt.phase === "S7_DEGRADED") && (
              <>
                <div className="k">{hunt.phase === "S1B_CONFIRM" ? "THIS DISH" : "DECODED INTENT"}</div>
                <h2>{hunt.category_name || "decoding…"}</h2>
                {hunt.request?.substitute && (
                  <p className="mute">
                    Trying {hunt.request.substitute.dish ?? hunt.request.substitute.cuisine} —{" "}
                    {hunt.request.substitute.relation}
                  </p>
                )}
                <div className="chips">
                  {chips.map((ch) => (
                    <span key={ch.field} className={`chip ${chipConfidence(ch.c)}`}>
                      {ch.label} · {ch.value} {ch.c < 0.7 ? "?" : "✓"}
                      {hunt.phase === "S1B_CONFIRM" && ch.field !== "direction" && (
                        <button type="button" className="change" onClick={() => setEditing(ch.field)}>
                          [change]
                        </button>
                      )}
                    </span>
                  ))}
                </div>
                {hunt.phase === "S1B_CONFIRM" && editing && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      const fd = new FormData(e.currentTarget)
                      editChip(editing, String(fd.get("v") || ""))
                    }}
                  >
                    <input name="v" defaultValue={chips.find((c) => c.field === editing)?.value} autoFocus />
                  </form>
                )}
                {hunt.phase === "S1B_CONFIRM" && (
                  <div className="doors">
                    <button type="button" className="arcade mini" onClick={confirmHunt}>
                      Hunt it
                    </button>
                    <button type="button" className="arcade mini ghost" onClick={onNotQuiteRephrase}>
                      not quite — let me rephrase
                    </button>
                  </div>
                )}
              </>
            )}
            {hunt.phase === "S2_NEED_CLUE" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  submitClue()
                }}
              >
                <div className="k">NEED A CLUE</div>
                <h2>What dish or cuisine is this?</h2>
                <p className="mute">Missing: {hunt.missing_required.join(", ")}</p>
                <input
                  value={clue}
                  onChange={(e) => setClue(e.target.value)}
                  placeholder="tomato and egg"
                  autoFocus
                />
                {clueHint && <p className="mute">{clueHint}</p>}
                <button type="submit" className="arcade mini">
                  ADD CLUE
                </button>
              </form>
            )}
            {(hunt.phase === "S4_LOCKED" || hunt.phase === "S5_EVIDENCE" || hunt.phase === "S6_REFINING") &&
              locked &&
              resultView === "list" && (
              <>
                <div className="k">NEARBY MATCHES</div>
                <h2>{hunt.category_name}</h2>
                <p className="mute">{scored.length} ranked · tap a pin or a row</p>
                <div className="rank-list">
                  {scored.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      className={`rank-row${r.id === hunt.locked_id ? " sel" : ""}`}
                      onClick={() => openCandidate(r.id)}
                    >
                      <span className="nm">
                        {r.name}
                        {r.address ? <span className="addr">{r.address}</span> : null}
                      </span>
                      <span className="sc">{r.score}</span>
                      <span className="mi">{r.distance} mi</span>
                    </button>
                  ))}
                </div>
              </>
            )}
            {(hunt.phase === "S4_LOCKED" || hunt.phase === "S5_EVIDENCE" || hunt.phase === "S6_REFINING") &&
              locked &&
              resultView === "card" && (
              <>
                <button
                  type="button"
                  className="link"
                  onClick={() => {
                    if (hunt.phase === "S5_EVIDENCE") dispatch({ type: "CLOSE_EVIDENCE" })
                    setResultView("list")
                  }}
                >
                  ← list
                </button>
                <div className="k">PROOF</div>
                <h2>{locked.name}</h2>
                {locked.address ? <p className="mute addr-line">{locked.address}</p> : null}
                <div>
                  {locked.score === null ? (
                    <span className="mute">insufficient evidence</span>
                  ) : (
                    <>
                      <span className="score">{locked.score}</span>{" "}
                      <span className="k"> MEMORY MATCH</span>
                    </>
                  )}
                </div>
                {locked.limited_evidence && <div className="banner">limited evidence · no restaurant website</div>}
                <p className="mute">
                  {locked.distance} mi · Why not 100%? → {whyNot}
                </p>
                {locked.reason && (
                  <>
                    <div className="k gap-k">Why this one</div>
                    <p className="reason">{locked.reason}</p>
                  </>
                )}
                <div className="k gap-k">Matched this dish</div>
                <div id="evs">
                  {locked.evidence.length === 0 && <p className="mute">no matching quotes yet</p>}
                  {locked.evidence.map((ev, i) => (
                    <button
                      type="button"
                      className="ev"
                      key={`${ev.quote}-${i}`}
                      onClick={() => dispatch({ type: "OPEN_EVIDENCE", index: i })}
                    >
                      <span style={{ color: PROOF }}>✓</span> {ev.anchor}
                      <div className="qline">
                        {sourceKind(ev)}: “{readableQuote(ev)}”
                        {ev.denominator ? ` · ${ev.denominator}` : ""}
                      </div>
                      {showsOriginal(ev) && (
                        <div className="qsrc">
                          translated from “{ev.quote}”
                        </div>
                      )}
                      <div className="qsrc">
                        {ev.source_url ? (
                          <a href={ev.source_url} target="_blank" rel="noreferrer noopener">
                            {sourceLabel(ev)} ↗
                          </a>
                        ) : (
                          sourceLabel(ev)
                        )}
                      </div>
                    </button>
                  ))}
                </div>
                {gaps.length > 0 && (
                  <>
                    <div className="k gap-k">Not fully met</div>
                    {gaps.map((g) => (
                      <div className="ev miss" key={g.key}>
                        <span style={{ color: "#3d5566" }}>✗</span> {g.label}
                        {g.value ? ` · ${g.key === "direction" ? directionLabel(g.value) : g.value}` : ""}
                        <div className="qline">no evidence found</div>
                      </div>
                    ))}
                  </>
                )}
                {hunt.phase === "S5_EVIDENCE" && hunt.evidence_index !== null && locked.evidence[hunt.evidence_index] && (
                  <div className="quote-full">
                    <div className="k">HAND-AUDITABLE</div>
                    <p>“{readableQuote(locked.evidence[hunt.evidence_index])}”</p>
                    {showsOriginal(locked.evidence[hunt.evidence_index]) && (
                      <p className="qsrc">translated from “{locked.evidence[hunt.evidence_index].quote}”</p>
                    )}
                    <button type="button" onClick={() => dispatch({ type: "CLOSE_EVIDENCE" })}>
                      close
                    </button>
                  </div>
                )}
                {hunt.ranked.filter((r) => r.score !== null && r.id !== hunt.locked_id).length > 0 && (
                  <button type="button" className="link" onClick={() => dispatch({ type: "TRY_NEXT" })}>
                    Try the next one
                  </button>
                )}
              </>
            )}
            {hunt.below_bar && hunt.ranked.length > 0 && (
              <div className="below-bar">
                <b>Nothing here really matches.</b> The closest is {hunt.best_score}%, under the
                50% we treat as a match. Widen the search or try a substitute above — or look at
                the near-misses below.
              </div>
            )}
            {hunt.phase === "S8_NO_ANSWER" && (
              <>
                <div className="k">NO MATCH</div>
                <h2>
                  No {hunt.substitute_offer?.from || hunt.category_name || "match"} within{" "}
                  {hunt.request?.range_mi ?? 20} mi
                </h2>
                <p className="mute">{hunt.widen_offer?.why}</p>
                <div className="doors">
                  {hunt.widen_offer?.to_mi && (
                    <button
                      type="button"
                      className="arcade mini"
                      onClick={() =>
                        hunt.request &&
                        submitMemory(
                          hunt.request.memory_text,
                          hunt.request.city_label,
                          hunt.widen_offer!.to_mi as RangeMi,
                          hunt.request.locale,
                          hunt.request.substitute
                            ? { confirmed: true, substitute: hunt.request.substitute }
                            : { confirmed: true },
                          hunt.request.coords,
                        )
                      }
                    >
                      Search {hunt.widen_offer.to_mi} mi
                      <span className="door-rel">same dish, further</span>
                    </button>
                  )}
                  {hunt.substitute_offer && (
                    <button
                      type="button"
                      className="arcade mini"
                      onClick={() =>
                        hunt.request &&
                        submitMemory(
                          hunt.request.memory_text,
                          hunt.request.city_label,
                          hunt.request.range_mi,
                          hunt.request.locale,
                          { confirmed: true, substitute: hunt.substitute_offer!.to },
                          hunt.request.coords,
                        )
                      }
                    >
                      Try {hunt.substitute_offer.to.dish ?? hunt.substitute_offer.to.cuisine} instead
                      <span className="door-rel">{hunt.substitute_offer.to.relation}</span>
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
        <div id="ticker">
          <div id="log">
            {locked ? (
              <span className="tick-lock">
                <b>{locked.name}</b>
                {locked.address ? <span className="tick-addr"> · {locked.address}</span> : null}
                <span className="tick-num">
                  {" · "}
                  {locked.distance} mi
                  {locked.score !== null ? ` · ${locked.score}% match` : " · insufficient evidence"}
                </span>
              </span>
            ) : (
              log
            )}
          </div>
          <button
            id="snd"
            className={settings.audio_unmuted ? "" : "off"}
            type="button"
            aria-label={settings.audio_unmuted ? "Sound on" : "Sound off"}
            onClick={toggleSound}
          >
            {settings.audio_unmuted ? "♫" : "♪"}
          </button>
        </div>
      </div>
      <div id="actions">
        <button className="arcade ghost" type="button" onClick={onRestart}>
          RESTART
        </button>
        <button
          className="arcade"
          type="button"
          onClick={() => {
            if (hunt.phase === "S0_IDLE") submitMemory(memory || SEEDED_EXAMPLES[0].memory_text)
            else if (hunt.phase === "S1B_CONFIRM") confirmHunt()
            else if (hunt.phase === "S2_NEED_CLUE") submitClue()
            else onNotQuite()
          }}
        >
          {hunt.phase === "S0_IDLE"
            ? "HUNT"
            : hunt.phase === "S1B_CONFIRM"
              ? "HUNT IT"
              : hunt.phase === "S2_NEED_CLUE"
                ? "ADD CLUE"
                : "NOT QUITE"}
        </button>
      </div>
      <div id="tag">
        <strong>
          Point us at a memory.
          <br />
          We&apos;ll bring back an address.
        </strong>
      </div>
    </div>
  )
}
