# Flavor Hunter — Frontend Stack & Feature Map

| Field | Value |
|---|---|
| Status | v1.1 |
| Date | 2026-08-27 |
| Scope | Mobile-first web app · tracker-device UI language |
| Supersedes | `03-tech-design.md` §3 rows for Map / Animation / Styling |
| Upstream | `02-prd.md` · `05-product-overview.md` |
| Companion | `07-tracker-simulation-and-assets.md` — device behaviours, scout states, asset manifest |
| Contracts | NDJSON payloads and polar rule: `08-system-design.md` §4. Machines: `09-frontend-machines.md` |
| Visual | v1.3 pixel handheld — cyan device chrome, title plate, HUD rulers, corner mini-radar, LED ticker, arcade keys, **over a Google dark-styled basemap**. No Marvel IP |

---

## 0. The premise, and one lucky alignment

Three requirements arrived from different directions and point at the same build:

| Requirement | Source |
|---|---|
| Places content may only sit on a **Google** basemap | Terms compliance (`03` §11.2) |
| Tracker-device aesthetic — an instrument, not an atlas | Product/visual direction |
| Blips must mean something the user can act on | Product (PRD FR-6a) |
| Mobile viewport, 60 fps on a mid-tier phone | This document |

**Revised 2026-08-27.** An earlier version of this section argued for no basemap at all —
"a tracker doesn't render streets." That was an aesthetic preference, and it lost to a
harder point: **a contact at 041° / 2.3 mi means nothing to someone looking for dinner.**
Without geography the scope is informationally empty, i.e. a themed loading screen.

So: **Google Maps JS API + Cloud-based Maps Styling + Advanced Markers, camera locked
during the hunt.** The styling feature exists precisely to produce a fully custom dark map
inside Google's own renderer (it is what Sony shipped for the Spidey Tracker), and locking
the camera during S3 means the canvas overlay never has to synchronise with a moving map.
Two things come free: the range ring becomes geographically true rather than symbolic, and
the scout runs across a real city instead of a void.

> **IP / genre:** Spidey Tracker is the right *rhythm* — waiting becomes hunting; pins
> light as the sweep passes; a live log is the X-feed analogue; sound is a toggle.
> Do not use Marvel/Sony assets, the spider emblem, Ned, or Fold Moments.
> **MapLibre + Places is prohibited** (`03` §11.2) — the basemap must be Google's.
> Name the thing Flavor Hunter.

### 0.1 Genre mapping we take / we refuse

| Take | Refuse |
|---|---|
| Dark field, neon signal, cyan proof, amber assumption | Spider red/blue brand pair |
| Confirmed / rumored / eliminated pin states | MapLibre / Mapbox as the basemap |
| Sweep lights pins as it passes; lock pulse rings | Web-slinger silhouette, web motif |
| Radar log (intel terminal) | Live X/Twitter feed |
| Sound toggle; filter chips on the assumption card | EventSource; 360° map pitch |
| Evidence panel as the “unlock” after lock | Character host / product placement |

Pin states (after evidence, and during hunt as far as we honestly know):

| State | Colour | Meaning |
|---|---|---|
| Unresolved | `--signal` dim | Detected, not yet evaluated |
| Rumored | `--proof` (cyan) | Candidate in play, evidence still thin / `score == null` |
| Confirmed | `--signal` full | Memory Match ≥ 70 and earned > 0 — the lock |
| Eliminated | `--reject` | Struck through, stays on the field |

---

## 1. Frontend Stack Decisions

| Layer | Choice | Why this, on mobile | Rejected |
|---|---|---|---|
| Framework | **Next.js 15, App Router** | Unchanged. The server Route Handler is the API proxy (keys stay server-side) and the same repo ships the client. | Vite SPA + separate API — two deploys for no gain. Vanilla/Preact — would split the trusted proxy |
| Rendering | **Client-rendered app shell**, no SSR for the hunt | Everything interesting is post-interaction. SSR buys nothing and complicates streaming. | Full SSR / RSC streaming for the radar — added complexity, zero benefit |
| Streaming | **`fetch()` + `ReadableStream`**, NDJSON lines | **Correction to `03-tech-design.md`: `EventSource` cannot POST.** The memory text is a POST body, so SSE-via-EventSource is out. `fetch` + a streamed body also survives Wi-Fi↔cellular handoff better and lets us cancel cleanly on unmount. | `EventSource` — GET-only. WebSocket — bidirectional infra we don't need |
| Radar rendering | **Canvas 2D** for the dynamic layer | 40 blips + a rotating sweep gradient + per-blip pulses is fill-rate work. On mobile Safari, 40 animated SVG nodes with filters janks; one canvas with a single RAF loop does not. | SVG for everything — jank. WebGL/Three — bundle cost and complexity for 2D rings |
| Static scope art | **Inline SVG / CSS**, painted once | Rings, graticule, tick marks never animate. Keep them out of the RAF loop entirely. | Redrawing rings every frame — wasted fill |
| DOM animation | **Framer Motion**, for panels and text only | Sheet snapping, assumption chips, evidence type-in, number transitions. **Never used for the canvas.** | Motion driving the radar — wrong tool, per-node overhead |
| Styling | **Tailwind CSS** + CSS custom properties for the palette | Palette lives in one token file so the whole aesthetic can be retuned in one place | Styled-components — runtime cost |
| Type | **JetBrains Mono** (HUD, log, score) + **Inter** (quotes / body) | Monospace is the intel-terminal voice. Score uses tabular figures + glow, not a seven-segment webfont (DSEG is a third family we do not ship). Subset to Latin + the CJK glyphs actually used. | DSEG — extra request, novelty type. Full CJK face — hundreds of KB |
| Icons | **Lucide**, tree-shaken | Small, consistent stroke weight suits HUD linework | Icon fonts |
| Sheet | **Vaul** (or hand-rolled) | Native-feeling drag/snap bottom sheet; this is the whole mobile results surface | A modal — wrong pattern on mobile |
| State | **Three `useReducer` machines**: `HuntMachine`, `SheetMachine`, `SettingsMachine` (the last hydrated from and persisted to `localStorage`) | The app is a state machine (§3). Model it as one. Refinement is a pure reducer over already-fetched candidates — that's what makes it instant and offline-proof. | Redux/Zustand — unnecessary. Scattered `useState` — the phase logic will rot |
| PWA | **Manifest + icons + standalone display.** No offline service worker | "It's an app" for ~30 minutes of work: installable, no browser chrome, correct splash. A caching service worker is skipped — we have nothing cacheable (terms) and it risks serving stale demo state. | Full offline SW — conflicts with §11.1 and adds a debugging surface |
| Haptics | `navigator.vibrate()` on TARGET LOCKED, feature-detected | Free on Android. **Not supported in iOS Safari** — treat as enhancement, never as feedback the UX depends on. | Relying on it for confirmation |
| Audio | WebAudio tones, **muted by default**, unmute toggle in the strip | Detect / eliminate / lock. First tap on the speaker arms the context. | Autoplay — blocked, and hostile |
| Testing | **Vitest** for the reducer + the 10-archetype parser harness | The reducer and the parser are where correctness lives. The radar is verified by eye. | E2E/Playwright — not worth it at this timescale |
| Map | **Google Maps JS API + Cloud-based Maps Styling + Advanced Markers**, camera locked during S3 | Blips need geography to mean anything (FR-6a). Styling gives the custom dark look inside Google's renderer; locking the camera removes overlay/camera sync. | ~~MapLibre / Mapbox~~ prohibited with Places content. ~~No map~~ legal but informationally empty |

### 1.1 The one decision to get right

**Split the render into a DOM layer and a canvas layer, and never let them fight.**

Text, numbers, and anything tappable are DOM — selectable, accessible, screen-reader
legible, and re-rendered only when data changes. The sweep, blips, and trails are one
canvas with a single `requestAnimationFrame` loop that reads from a mutable ref and
**never triggers React re-renders**. Blip positions are written into that ref by the
stream handler.

Getting this wrong is the most likely way this app ends up at 20 fps on a phone, which
would destroy the one thing the product is selling.

## 2. Visual Language Spec

### 2.1 Palette (CSS custom properties, retune in one file)

Neon orange is the hunt (heat, just-plated). Cyan is the only colour that means
**byte-verified evidence**. Amber is assumption / thin evidence. Do not reintroduce
spider red-blue.

```css
--scope-void:      #0A0E14;   /* near-black navy — has depth */
--scope-deep:      #0D141C;   /* panels, sheet */
--grid-faint:      #1A2430;   /* rings */
--grid-live:       #2A3A4A;   /* active ring, hairlines */

--signal:          #FF3D00;   /* hunt, sweep, confirmed lock */
--signal-dim:      #8A2200;   /* trails, unresolved glow */
--lock:            #FFC400;   /* reticle, ? assumptions, rumored-high */
--proof:           #00E5FF;   /* verified quotes — the only cyan in the app */
--reject:          #37474F;   /* eliminated */

--text-hi:         #E0E0E0;
--text-telemetry:  #78909C;
```

If cyan appears for decoration, the evidence panel stops meaning anything.

### 2.2 Motion

- **Mechanical, not playful.** Stepped/linear easing, `cubic-bezier(.2,0,.1,1)`. No
  spring overshoot, no bounce — instruments don't bounce.
- **Sweep:** 2.4 s per revolution, constant angular velocity. Blips **ignite** when the
  sweep passes (the Spidey “sighting lights up” beat) and decay over ~800 ms.
- **Eliminations:** blip goes `--reject`, a 1px strike, stays at ~20% — field-narrowing
  is the point.
- **Lock:** four brackets + **two expanding pulse rings** (320 ms), then a 120 ms
  scanline. Thumbnail frame.
- **Evidence quotes** type in, one line at a time, after lock — not during the hunt.
- **`prefers-reduced-motion`:** static scope, instant state cuts, no sweep, no pulse,
  no typewriter (dump the quote).

### 2.3 Mobile layout (single screen, four bands)

```
┌─────────────────────────────┐  ← safe-area-inset-top
│ SCANNING   18 ▸ 3      ♪    │  telemetry + sound     40px
├─────────────────────────────┤
│ 00:03  ▶ EVALUATING …       │  RADAR LOG             72px
│ 00:04    ✓ "sweet" 2/5      │  JetBrains Mono
├─────────────────────────────┤
│         ╭─────────╮         │
│      ╭──┤   🐕    ├──╮      │  THE SCOPE             38dvh
│      │  ╰─────────╯  │      │  canvas: sweep, pins,
│       ╲   ·  ✕  ·   ╱       │  dog, lock pulse
│                             │
├─────────────────────────────┤
│ DECODED INTENT / EVIDENCE   │  SHEET                 flex
│ chips = FR-10 filters       │
│ 94  MEMORY MATCH            │
│ ✓ verbatim quote            │
└─────────────────────────────┘  ← actions in thumb zone
```

The radar log is the X-feed analogue. Header does **not** show a running stopwatch
(`06` §6); log lines may carry `mm:ss` stamps relative to submit — those are event
labels, not a wait clock.

Non-negotiables on mobile:

- **`100dvh`, never `100vh`**. Device column max-width 430px on desktop.
- `env(safe-area-inset-*)` on the strip and the action row.
- Every tap target ≥ 44×44 px.
- **No hover states carry meaning.**
- Primary action in the bottom third.
- Canvas backing store capped at `min(devicePixelRatio, 2)`.

### 2.4 Performance budget

| Metric | Budget |
|---|---|
| JS shipped before first paint | ≤ 200 KB gzipped |
| Radar first frame after submit | ≤ 500 ms |
| Sweep frame rate, mid-tier Android | 60 fps target, 30 fps floor |
| Max simultaneous blips | 40 (matches the 18-candidate cap + decoys) |
| React re-renders during sweep | **0** |
| Fonts | 2 families, subset, `display: swap` |

---

## 3. State Machine

One screen, nine states. This is the app.

```
                    ┌──────────┐
          ┌────────▶│  S0 IDLE │◀────────── reset
          │         └────┬─────┘
          │              │ submit memory
          │              ▼
          │         ┌──────────────┐
          │         │ S1 DECODING  │  assumption card streams in
          │         └───┬──────┬───┘
          │             │      │ searchable = false
          │  searchable │      ▼
          │   ┌─────────▼──────────┐
          │   │ S1b CONFIRM        │  the naming beat · "Hunt it"
          │   │ nothing spent yet  │  ← zero API calls before this
          │   └─────────┬──────────┘
          │             │  ┌──────────────────┐
          │             │  │ S2 NEED_CLUE     │  3 buttons
          │             │  └────────┬─────────┘
          │             │           │ one clue given
          │             │◀──────────┘
          │             ▼
          │       ┌──────────────┐
          │       │ S3 HUNTING   │  sweep + eliminations + radar log
          │       └──┬────┬───┬──┘
          │          │    │   │ all candidates E=0
          │   locked │    │   ▼
          │          │    │  ┌──────────────────┐
          │          │    │  │ S8 NO_ANSWER     │  widen / insufficient
          │          │    │  └────────┬─────────┘
          │          │    │           │ widen
          │          │    │◀──────────┘
          │          │    │ any hard failure / 429
          │          │    ▼
          │          │  ┌──────────────────┐
          │          │  │ S7 DEGRADED      │  cached example + banner
          │          │  └────────┬─────────┘
          │          ▼           │
          │    ┌──────────────┐  │
          │    │ S4 LOCKED    │◀─┘
          │    └──┬────────┬──┘
          │       │        │ tap evidence row
          │       │        ▼
          │       │   ┌──────────────────┐
          │       │   │ S5 EVIDENCE      │  full quote, source, time
          │       │   └────────┬─────────┘
          │       │◀───────────┘
          │       │ "Not quite"
          │       ▼
          │  ┌──────────────────┐
          │  │ S6 REFINING      │  local re-rank, 0 requests
          │  └────────┬─────────┘
          │           │ re-locked (score may go UP or DOWN)
          └───────────┴──────────▶ S4
```

**S6 never leaves the device.** It's a reducer over candidates already in memory — which
is why the second act of the demo cannot fail, whatever the network is doing.

---

## 4. Feature Map

### 4.1 Feature → state → component → tech

| # | Feature (`05-product-overview.md`) | State | Component | Rendered by |
|---|---|---|---|---|
| F1 | Describe a memory | S0 | `MemoryInput` + `ExampleChips` | DOM |
| F2 | **It names the thing** | S1b | `CategoryName` + `ConfirmBar` — its own beat, largest type in the app | DOM · Motion |
| F3 | Visible assumptions | S1→S4 | `AssumptionCard` → filter chips | DOM · Motion |
| F4 | One-clue request | S2 | `ClueRequest` (3 buttons) | DOM |
| F5 | Visible hunt | S3 | `Scope` = `RingsSVG` + `RadarCanvas` + `TelemetryStrip` + **`RadarLog`** | **Canvas + DOM** |
| F5a | **The scout** — the dog embodies the hunt | all | `Scout` (inside `RadarCanvas`) | Canvas · sprite atlas |
| F5b | Proximity tone · boot self-test · sound toggle | S0/S3/S4 | `Sonar`, `BootSequence` | WebAudio + DOM |
| F6 | Auditable score | S4 | `MemoryMatchScore` + `RubricBreakdown` | DOM · Motion numbers |
| F7 | Verbatim evidence | S4/S5 | `EvidenceList` → `EvidenceRow[]` → `QuoteSheet` | DOM · type-in |
| F8 | "Not quite" → re-rank | S6 | `RefineBar` + chips as filters | DOM, local reducer |
| F9 | Admits no answer | S8 | `WidenNotice` / `InsufficientEvidence` | DOM + canvas radius anim |
| F10 | Stores nothing server-side | all | `PrivacyLine` (footer of sheet) | DOM |
| F11 | **Location + range setting** | S0 | `LocationChip` → `SettingsSheet` | DOM · `localStorage` |
| F11a | Range is the scope's RANGE knob | S0/S3 | `RingsSVG` bound to `range` state | SVG, animated |
| F9a | Widen offer (never automatic) | S8 | `WidenOffer` | DOM |
| — | Degraded mode | S7 | `DegradedBanner` | DOM |

### 4.2 Component tree

```
<App>                               device column, max 430px
├── <BootSequence>
├── <TelemetryStrip>              phase · counts · sound toggle
├── <RadarLog>                    intel feed — mm:ss + ✓/✗  (the X-feed analogue)
├── <Scope>                       ← 38dvh
│   ├── <RingsSVG>
│   ├── <RadarCanvas>             RAF · sweep · pins · trails · scout · pulse rings
│   │   └── (Scout)
│   └── <ScopeOverlay>            locked target label only
└── <BottomSheet>
    ├── <MemoryInput>             S0
    │   ├── <ExampleChips>
    │   └── <LocationChip>
    ├── <SettingsSheet>
    ├── <ClueRequest>             S2
    ├── <AssumptionCard>          S1+  chips = FR-10 filters
    ├── <ResultPanel>             S4
    │   ├── <CategoryName>
    │   ├── <MemoryMatchScore>
    │   ├── <RubricBreakdown>
    │   ├── <EvidenceList>
    │   └── <NextCandidates>      P1
    ├── <RefineBar>
    ├── <WidenOffer>
    ├── <DegradedBanner>
    └── <PrivacyLine>
```

### 4.3 Canvas render layers (bottom → top)

| L | Layer | Updates | Owner |
|---|---|---|---|
| 0 | Vignette | static | CSS |
| 1 | Rings, graticule, bearing ticks | static | SVG |
| 2 | Sweep gradient wedge | every frame | Canvas |
| 3 | Blip trails (decay) | every frame | Canvas |
| 4 | Pins: unresolved / rumored / confirmed / eliminated | on stream event + sweep ignite | Canvas · `props` atlas |
| 4.5 | **Scout sprite** | every frame | Canvas · `hound` atlas |
| 5 | Lock brackets + **pulse rings** + scanline | during lock | Canvas |
| 6 | Locked target label | on lock | DOM |
| 7 | Strip, radar log, sheet | on data change | DOM |

### 4.4 Stream event → UI contract

The single dependency between backend and frontend. **Payload schemas, the additive `broadened` event, and `widen.applied: false` (offer only — rings expand on the next hunt) are frozen in `08-system-design.md` §4.3.** This table is the product-facing summary.

| NDJSON event | Payload | UI effect |
|---|---|---|
| `parsed` | `{category_name, confidence, anchors}` | S1 · assumption chips in, `?` on low confidence |
| `need_clue` | `{missing_required}` | S2 · three buttons, **stream ends, zero API cost** |
| `candidates` | `{count, blips:[{bearing, distance}]}` | S3 · pins appear, sweep starts, log: SIGNALS DETECTED |
| `evaluated` | `{id, score_partial}` | pin → rumored (cyan); log: EVALUATING |
| `eliminated` | `{id, reason}` | pin struck; log: ✗ ELIMINATED |
| `widen` | `{from_mi, to_mi, why}` | S8 · offer in sheet |
| `locked` | `{ranked:[{id, name, score, evidence[]}]}` | S4 · pulse + log: TARGET LOCKED |
| `degraded` | `{reason}` | S7 · banner; hunt still visually completes |

**Both coordinate systems.** The client receives `lat/lng` (to place Advanced Markers on the
Google basemap) **and** `bearing/distance` (used by the canvas overlay and the radar log).
Compliance rests on the basemap being Google's — a build-time fact, one Map ID — rather than
on withholding coordinates payload by payload. See `08` §3.3.

---

## 5. Build Order (frontend)

| Block | Deliverable | Done when |
|---|---|---|
| A | Shell: `100dvh`, safe areas, palette tokens, fonts, sheet with 3 snaps | Sheet drags correctly on a real phone |
| B | `Scope`: rings + canvas RAF sweep, pin ignite, 40 fake blips | 60 fps on a mid-tier Android, 0 React re-renders |
| B2 | `Scout`: atlas loader + sprite state machine | Scout traverses candidates and points on lock |
| C | `TelemetryStrip` + `RadarLog` + stream client + mock NDJSON | Full S0→S4 replays from a local fixture file |
| D | `AssumptionCard` chips, `ClueRequest` | Archetypes A2 / A8 / A10 render correctly from fixtures |
| E | `ResultPanel`, evidence type-in, score + rubric | Score is hand-verifiable on screen |
| F | Lock pulse + `point` pose + haptic + proximity tone | **This frame is the thumbnail** |
| G | Chips + `RefineBar` + local re-rank reducer | < 100 ms, 0 requests, score free to fall |
| H | `prefers-reduced-motion`, PWA manifest, `DegradedBanner` | Works with network disabled and motion reduced |

**Blocks A–C run entirely on a mock fixture file — no backend needed.**

---

## 6. Redundancy Audit (what is deliberately absent)

The test for any number on screen: **what can the user do with it?** If the answer is
nothing, it is a developer metric wearing a UI costume. Three failed:

| Removed | Why |
|---|---|
| Elapsed-time readout in the header (`live · 7.4s`) | A stopwatch marks the wait *as* a wait. Liveness is the log + `fetched 2s ago` on evidence. |
| Signal-strength bars | The user cannot act on them. Debug telemetry. |
| Bearing in degrees (`BRG 041°`) | The scout's position on the scope already conveys direction. |

Retained, because each is real information:

| Kept | Why |
|---|---|
| Converging count (`18 ▸ 12 ▸ 3`) | The field is narrowing. |
| Radar log `mm:ss` stamps | Event labels in the intel feed, not a wait clock. |
| Distance (`2.3 mi`) | Actionable: how far the answer is. |
| `CACHED EXAMPLE` banner | Degraded mode only. |
| Evidence timestamps (`fetched 2s ago`) | Trust, at the moment it matters. |
| Denominators (`2 of 5 available`) | Honest scope. |

**Pacing is carried by animation, not by a header clock.** The sweep turns, pins ignite, the scout runs, the log ticks.
