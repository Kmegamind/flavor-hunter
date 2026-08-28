# Flavor Hunter — Frontend Machines

| Field | Value |
|---|---|
| Status | Approved for build |
| Version | v1.0 |
| Date | 2026-08-27 |
| Purpose | Reducer specs, stream client, fixture replay, refine — what `06` named but did not specify |
| Upstream | `06-frontend-stack-and-feature-map.md` · `07-tracker-simulation-and-assets.md` · `08-system-design.md` |
| Does not replace | `06` (stack, tokens, component tree, canvas layers) · `07` (scout frames, assets) |

Visual language, component tree, and scout mapping stay in `06` / `07`. This document specifies **state, events, illegal transitions, and the two pure functions** the UI is allowed to run without the network.

Prototype [`../proto/entry-sim.html`](../proto/entry-sim.html) is a motion sketch. Do not copy its architecture.

On-screen numbers follow `06` §6, not `07` T4/T7: no elapsed timer, no signal bars, no bearing degrees. Direction is the scout's position. Distance in miles stays.

---

## 1. Three machines, one screen

```
HuntMachine       phase of the hunt (S0–S8) + candidates in memory
SheetMachine      bottom-sheet snap + which panel is showing
SettingsMachine   location mode, city, range — hydrated from localStorage
```

They do not share a store. `HuntMachine` may *read* settings at submit time. `SettingsMachine` does not know about a hunt. `SheetMachine` reacts to hunt phase with a small allowed table (§3.3).

Canvas (`RadarCanvas`) is **not** a machine. It reads a mutable `scopeRef` that the stream handler writes. The RAF loop never `dispatch`es.

---

## 2. HuntMachine

### 2.1 State

```ts
type HuntPhase =
  | "S0_IDLE"
  | "S1_DECODING"
  | "S2_NEED_CLUE"
  | "S3_HUNTING"
  | "S4_LOCKED"
  | "S5_EVIDENCE"
  | "S6_REFINING"
  | "S7_DEGRADED"
  | "S8_NO_ANSWER"

type HuntState = {
  phase: HuntPhase
  request: HuntRequest | null
  anchors: AnchorSet | null
  category_name: string | null
  category_confidence: number | null
  blips: Blip[]                 // polar, mutated into scopeRef as well
  ranked: RankedCandidate[]     // filled on locked; used by refine
  locked_id: string | null
  widen_offer: { from_mi: number; to_mi: number | null; why: string } | null
  substitute_offer: { from: string; to: { dish?: string; cuisine?: string; relation: string } } | null
  degraded: boolean
  degraded_reason: string | null
  abort: AbortController | null
  last_error: string | null
}

type Blip = {
  id: string
  bearing: number
  distance: number
  status: "unresolved" | "candidate" | "eliminated" | "locked"
  reason?: string
}
```

Initial: `phase: S0_IDLE`, everything else empty/`null`/`[]`/`false`.

### 2.2 Events

| Event | Payload | Legal from |
|---|---|---|
| `SUBMIT` | `HuntRequest` | S0, S2 (clue given), S8 (widen or substitute accept = new request), S4/S5 (new memory) |
| `STREAM_PARSED` | parsed payload | S1 |
| `STREAM_NEED_CLUE` | `{ missing_required }` | S1 |
| `STREAM_BROADENED` | `{ dropped, now }` | S3 |
| `STREAM_CANDIDATES` | `{ count, blips }` | S1, S3 |
| `STREAM_EVALUATED` | `{ id }` | S3 |
| `STREAM_ELIMINATED` | `{ id, reason }` | S3 |
| `STREAM_WIDEN` | `{ from_mi, to_mi, why, applied: false }` | S3 |
| `STREAM_LOCKED` | `{ ranked }` | S3, S7 (fixture) |
| `STREAM_DEGRADED` | `{ reason }` | S1, S3 |
| `STREAM_END` | — | any streaming phase |
| `STREAM_ABORT` | — | S1, S2, S3 |
| `OPEN_EVIDENCE` | `{ index }` | S4 |
| `CLOSE_EVIDENCE` | — | S5 |
| `REFINE` | `Correction` | S4, S5 |
| `REFINE_DONE` | `{ ranked, locked_id, anchors }` | S6 |
| `RESET` | — | any except mid-stream without abort |
| `TRY_NEXT` | — | S4 (score fell; next ranked with evidence) |

`SUBMIT` from S4 is a **new hunt**, not refine. It aborts nothing already finished; it clears `ranked` and starts a new stream.

### 2.3 Transition table

```
S0  SUBMIT            → S1   start fetch, store request, dog alert
S1  STREAM_PARSED     → S1   write anchors (stay until candidates or clue)
S1  STREAM_NEED_CLUE  → S2   abort remainder (server already ended)
S1  STREAM_CANDIDATES → S3   write blips, start sweep
S1  STREAM_DEGRADED   → S7   banner on; accept fixture events
S2  SUBMIT            → S1   new request = original memory + clue text
S2  RESET             → S0
S3  STREAM_EVALUATED  → S3   blip → candidate; scopeRef.sniff = id
S3  STREAM_ELIMINATED → S3   blip → eliminated
S3  STREAM_BROADENED  → S3   telemetry only
S3  STREAM_LOCKED     → S4   ranked, locked_id = ranked[0] with score≠null
S3  STREAM_WIDEN      → S8   widen_offer set; dog sad
S3  STREAM_SUBSTITUTE → S8   substitute_offer set; relation shown; may accompany widen
S3  STREAM_DEGRADED   → S7
S4  OPEN_EVIDENCE     → S5
S4  REFINE            → S6
S4  SUBMIT            → S1   new hunt
S4  TRY_NEXT          → S4   locked_id = next ranked with score≠null
S4  RESET             → S0
S5  CLOSE_EVIDENCE    → S4
S5  REFINE            → S6
S6  REFINE_DONE       → S4   score may be lower; locked_id may change
S7  STREAM_LOCKED     → S4   still degraded: true (banner remains)
S7  RESET             → S0   clears degraded
S8  SUBMIT            → S1   widen: range_mi = offer.to_mi. substitute: same range, HuntRequest.substitute = rung. Memory text unchanged.
S8  RESET             → S0
```

After `STREAM_LOCKED` in S7, phase becomes S4 with `degraded: true`. The banner component keys off the flag, not the phase.

### 2.4 Illegal transitions (assert in the reducer)

The reducer returns the previous state unchanged and `console.assert`s in dev if any of these fire:

| From | Event | Why |
|---|---|---|
| S0 | any `STREAM_*` | no stream exists |
| S2 | `STREAM_CANDIDATES` / `EVALUATED` / `LOCKED` | clue path issued zero Places calls; a candidate here is a bug |
| S4 / S5 / S6 | `STREAM_*` | hunt stream already ended |
| S6 | `SUBMIT` | refine is local; a POST from S6 is a bug. User must RESET or wait for REFINE_DONE then SUBMIT |
| S6 | `STREAM_*` | same |
| any | `STREAM_LOCKED` with every `score === 0` as a number | earned 0 must arrive as `widen` or `score: null`, never `0%` |
| S3 | `OPEN_EVIDENCE` / `REFINE` | nothing is locked yet |
| S8 | `REFINE` | no candidate set to re-rank |
| any | event that includes `lat` or `lng` on a blip | polar-only; drop the field, do not plot it |

`S6 never leaves the device` is an invariant: the refine path does not construct a `fetch`.

### 2.5 `scopeRef` writes (not React state)

On `STREAM_CANDIDATES` / `EVALUATED` / `ELIMINATED` / `LOCKED`, the stream handler writes:

```ts
scopeRef.current = {
  blips,
  sniff_id: string | null,   // candidate currently being evaluated
  wait: boolean,             // true while we have candidates but no event for >400 ms
                             // and we have not yet locked — evidence batch
  locked_id: string | null,
}
```

Set `wait: true` when the last Hunt-2 event has been seen *or* when 400 ms pass with no event after at least one `evaluated`. Clear `wait` on the next `eliminated` burst or `locked`. The canvas maps `wait` → dog `alert` hold (07 §3.1). Never invent sniff targets to fill the wait.

---

## 3. SheetMachine

### 3.1 State

```ts
type Snap = "peek" | "half" | "full"

type SheetPanel =
  | "memory"        // S0
  | "assumptions"   // S1+
  | "clue"          // S2
  | "result"        // S4 / S6 done
  | "quote"         // S5
  | "widen"         // S8
  | "settings"      // overlay, any idle-ish phase

type SheetState = {
  snap: Snap
  panel: SheetPanel
  quote_index: number | null
}
```

Snaps: peek 22% / half 55% / full 92% (`06` §2.3). User drag may change `snap` without changing `panel`.

### 3.2 Events

| Event | Effect |
|---|---|
| `DRAG_SNAP` | `{ snap }` user gesture |
| `SHOW_PANEL` | `{ panel, snap? }` |
| `OPEN_QUOTE` | `{ index }` → panel `quote`, snap `full` |
| `CLOSE_QUOTE` | back to `result`, snap `half` |
| `OPEN_SETTINGS` | panel `settings`, snap `full` (from S0 or LocationChip) |
| `CLOSE_SETTINGS` | previous panel |

### 3.3 Hunt phase → default sheet (allowed table)

| Hunt phase | Default panel | Default snap |
|---|---|---|
| S0 | `memory` | `half` |
| S1 | `assumptions` | `peek` |
| S2 | `clue` | `half` |
| S3 | `assumptions` | `peek` |
| S4 | `result` | `half` |
| S5 | `quote` | `full` |
| S6 | `result` | `half` (anchor deltas animate in place) |
| S7 | `result` after fixture lock | `half` + banner |
| S8 | `widen` | `half` |

Illegal: `panel: result` while phase is S0–S3 (except S7 fixture which is already locked). `panel: clue` only in S2.

---

## 4. SettingsMachine

### 4.1 State

```ts
type SettingsState = {
  location_mode: "current" | "custom"
  city_label: string
  coords: { lat: number; lng: number } | null  // 3 dp; never sent until SUBMIT
  range_mi: 5 | 10 | 20 | 45
  geo_status: "idle" | "acquiring" | "ok" | "manual"
  audio_unmuted: boolean
}
```

Default: `location_mode: "current"`, `range_mi: 20`, `audio_unmuted: false`, `geo_status: "idle"`.

Persist to `localStorage` key `fh.settings.v1`:

```json
{ "location_mode", "city_label", "coords", "range_mi", "audio_unmuted" }
```

Copy on the settings sheet: `Saved on this device only. Never sent anywhere.` plus a working `Clear` that wipes the key and resets defaults.

**Never persist:** memory text, anchors, ranked candidates, place names, evidence.

### 4.2 Events

| Event | Rule |
|---|---|
| `GEO_REQUEST` | First interaction (focus input or tap example). Not on page load. |
| `GEO_OK` | Round to 3 dp, reverse-geocode label if needed, `geo_status: ok` |
| `GEO_FAIL` | `location_mode: custom`, `geo_status: manual`, reveal city field. Do not re-prompt. |
| `SET_CITY` | `{ city_label }` custom mode; coords null until submit (server geocodes) |
| `SET_RANGE` | `{ range_mi }` animates rings on S0; during S3 is read-only in telemetry |
| `SET_MODE` | current \| custom |
| `TOGGLE_AUDIO` | first unmute also resumes `AudioContext` |
| `CLEAR` | wipe localStorage |

Seeded example chips **do not** write this machine. They pass a one-shot `HuntRequest` into `SUBMIT` with the example's city + range. After that hunt `RESET`s, restore settings from this machine (PRD FR-4c).

### 4.3 `HuntRequest` assembly

```ts
function toHuntRequest(memory_text: string, settings: SettingsState, locale: string): HuntRequest {
  return {
    memory_text,
    locale,
    range_mi: settings.range_mi,
    city_label: settings.city_label,
    coords: settings.location_mode === "current" ? settings.coords ?? undefined : undefined,
  }
}
```

Widen accept: same memory, `range_mi = widen_offer.to_mi`. Substitute accept: same memory and range, `substitute` set to the offered rung (`relation` stays on the request so the header can say what changed). Do not mutate stored `range_mi` unless the user changes the knob in settings.

---

## 5. Stream client

```ts
async function hunt(request: HuntRequest, signal: AbortSignal, onEvent: (e: HuntEvent) => void): Promise<void>
```

- `POST /api/hunt` with `JSON.stringify(request)`.
- Read body as `ReadableStream`. Decode UTF-8. Split on `\n`. `JSON.parse` each non-empty line as `HuntEvent`.
- Unknown `type`: ignore (forward-compat). Payload with `lat`/`lng`: strip before `onEvent`.
- On `AbortError`: silent. On network throw: `onEvent({ type: "degraded", reason: "network" })` — the Route Handler may also send its own fixture; if the request never opened, the client loads the **local** fixture file and replays it, still setting `degraded: true`.
- Unmount / `RESET` / new `SUBMIT`: `abort.abort()`.

No `EventSource`. No WebSocket. No retry loop except the single degraded fixture replay.

### 5.1 Fixture replay (Blocks A–C, and NFR-3 client fallback)

File: `fixtures/a1.ndjson` (one event per line, same schema as production). Replay:

```ts
async function replay(ndjson: string, onEvent: (e: HuntEvent) => void, pacing = true): Promise<void>
```

If `pacing`, delay between lines using each line's optional `_delay_ms` (fixture-only, stripped before dispatch). Default 400 ms. `pacing: false` for unit tests.

The visual system is done when S0→S4 replays from `fixtures/a1.ndjson` with the network disabled.

Required fixture files (frontend):

| File | Covers |
|---|---|
| `fixtures/a1.ndjson` | happy path + lock |
| `fixtures/a10.ndjson` | `parsed` + `need_clue` then end |
| `fixtures/a6.ndjson` | hunt then `widen` |
| `fixtures/degraded.ndjson` | `degraded` + fixture lock |
| `fixtures/a1-refine.json` | post-lock snapshot for Block G (`anchors` + `ranked`) |

---

## 6. Refine — pure function, zero I/O

```ts
type Correction =
  | { kind: "edit"; field: keyof AnchorSet | "category_name"; value: unknown }
  | { kind: "nl"; text: string }

type RefineInput = {
  anchors: ParsedEnvelope["anchors"]
  category_name: string
  ranked: RankedCandidate[]
  correction: Correction
}

type RefineOutput = {
  anchors: AnchorSet
  category_name: string
  ranked: RankedCandidate[]   // resorted, scores recomputed
  locked_id: string | null
  deltas: { field: string; from: unknown; to: unknown }[]
}
```

### 6.1 Algorithm

1. Apply correction to a copy of `anchors` (and maybe `category_name`).
2. For each candidate, **keep existing `evidence` rows**. Drop a row if its `anchor` is no longer in the supplied set. Do not invent rows.
3. Recompute `score` with the FR-9a rubric over the **new** denominator. `earned == 0` ⇒ `score = null`.
4. Stable-sort: `score === null` last; else descending score; tie → original order.
5. `locked_id` = first with `score !== null`, else `null` (caller then treats as S8-like empty, but still no network).
6. `deltas` = shallow field diffs for the assumption card animation.

Score **may fall**. If the previous `locked_id` is no longer first, the UI offers `TRY_NEXT` / shows the new lock. Never clamp the score upward.

A score change without at least one evidence-row change **or** denominator change is a defect — the function must not jitter numbers for theater.

### 6.2 NL mapper (still local)

No Claude on refine. `kind: "nl"` uses a constrained mapper:

| Text matches (case-insensitive) | Effect |
|---|---|
| `too sour` / `too acidic` / `不酸` / `太酸` | `sensory` += "low acidity"; `negation` += `{ field: "sensory", value: "sour" }` |
| `too sweet` / `太甜` | `sensory` += "less sweet"; negation sweet |
| `too salty` / `太咸` | analogous |
| `not X` / `不要 X` | `negation` += `{ field: "dish"\|inferred, value: X }` |
| anything unmapped | append `{value: text, confidence: 0.4}` to `sensory` (shown `?`) |

If the mapper cannot do better than a `?` sensory, that is correct — visible assumption, user can `[change]`. It is illegal to `fetch` to "understand" the correction.

Direct `[change]` on an `AnchorRow` is `kind: "edit"` and skips the mapper.

### 6.3 Timing

Must finish in < 100 ms on a mid-tier phone for N ≤ 18. No Promises. Call from the reducer; `REFINE` → compute → `REFINE_DONE` in the same tick (or `startTransition` for the DOM, not for the data).

---

## 7. Seeded examples (judge-safe entry)

Three chips on S0. Each is a triple. Tapping one `SUBMIT`s that triple and **does not** write `SettingsMachine`.

| Chip | Memory | City | Range |
|---|---|---|---|
| 1 (demo) | "the sweet tomato and egg my grandmother used to make" | Boston, MA | 20 mi |
| 2 (naming) | A2 sensory paragraph (East Coast Chinese-American) | Seattle, WA | 20 mi |
| 3 (inauthentic OK) | "the Americanized Chinese takeout I grew up on, not authentic Sichuan" | a city with a known hit | 20 mi |

All three paths must succeed end-to-end in production. Exact strings live with the frontend; this table locks the shape.

---

## 8. Canvas / DOM split (implementation rules)

Copied as constraints, not a rewrite of `06` §1.1:

- DOM: telemetry, sheet, scores, tappable rows. Re-render on Hunt/Sheet/Settings state change only.
- Canvas: sweep, blips, trails, scout, lock brackets. One RAF loop. Reads `scopeRef`. **0 React re-renders during sweep.**
- Rings SVG are static; bound to `range_mi` on settings change (S0) or on a new hunt after widen accept.
- `prefers-reduced-motion`: static scope, pose cuts, no sweep, no scanline (`07` §5).

Scout pose table remains `07` §3. `wait: true` maps to `alert` hold, not `run`.

---

## 9. Build order (unchanged, now testable)

| Block | Done when |
|---|---|
| A | Sheet snaps on a real phone |
| B | Sweep 60 fps, 0 React re-renders |
| B2 | Scout follows fixture sniff_ids |
| C | `replay(fixtures/a1.ndjson)` reaches S4 |
| D | A2 / A8 / A10 fixtures render assumption / clue |
| E | Score on screen matches `memoryMatch()` of the payload |
| F | Thumbnail frame: point + brackets |
| G | `refine()` unit tests: score may fall; 0 `fetch` |
| H | Replay with network off + reduced motion |

Blocks A–C do not import the Route Handler.
