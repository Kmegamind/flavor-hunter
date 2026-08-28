# Flavor Hunter — Tracker Simulation & Asset Manifest

| Field | Value |
|---|---|
| Status | v1.1 |
| Date | 2026-08-27 |
| Purpose | Full tracker-device simulation spec + the exact asset list to produce |
| Character | Boston Terrier hound — reference still: `../Saved_Frame_from_制作一个搞笑短视频_I用右边的形象为原型_202608261258.jpeg` |
| Upstream | `06-frontend-stack-and-feature-map.md` · `05-product-overview.md` |

---

## 1. The Core Fiction

A handheld tracker locates a subject. In the source genre the subject is a person. Here:

> **The subject is a pixel dog. You are tracking your own scent hound while it hunts down
> the taste you described.**

Two things are being tracked at once, and this is the whole design:

| Tracked by | Tracking what | Surface |
|---|---|---|
| You, via the device | **the dog** | the scope: one moving sprite |
| The dog, via smell | **the taste** | blips: candidates it sniffs and rejects |

Why this works rather than being a mascot bolted on:

- **A dog finds things by smell precisely when you can't describe them.** That is the
  product's premise, embodied. It is not decoration; it is the thesis in one image.
- Everything abstract becomes legible. "Evaluating candidate 7 of 18" is a progress bar.
  "The dog stopped and is sniffing that one" is a scene.
- It supplies the emotional register the research demands. F7 of the research found the
  trigger is family and longing, and that two-year searches are real. A cold instrument
  alone reads clinical; the instrument stays cold and **the dog carries the warmth.**
- Every state in the machine has a true dog behaviour (§3). No state needs inventing.

**The product is a handheld tracker, drawn as one.** Pixel device chrome (cyan frame, title plate, LED ticker, arcade keys) is the visual — in the *genre* of a promotional tracker toy, not a film prop. The phone still *runs* it; the chrome is how it reads as a device rather than a map website.

### 1.1 IP boundary

Use the genre: circular scope, concentric range rings, rotating sweep, bearing/distance
telemetry, accelerating proximity tone, boot self-test. **Do not use** Marvel/Sony assets,
the spider emblem, character names, or a recognisable copy of the film prop's industrial
design. The dog is your own character — that is the point, and it is also the safest
possible substitution.

---

## 2. Tracker Behaviours to Simulate

These are what make it read as a real device rather than a themed loading screen.
Ranked by payoff per hour.

### T1 — Proximity tone that accelerates  ⭐ the iconic one

The single most recognisable tracker behaviour. As the dog closes on a strong candidate,
the ping interval shortens.

```
distance_norm = clamp(dog_to_best_candidate / initial_max_distance, 0, 1)
interval_ms   = 140 + 760 × distance_norm²      // 900ms far → 140ms adjacent
```

Squared so acceleration is felt late — the last stretch is where the drama is. On lock,
the tone resolves into a two-note chord and stops. **Muted by default**, unmute in the
telemetry strip; the first tap arms the WebAudio context.

This gives audio a functional job. It also means the demo video has tension with the
sound on, which is worth a great deal for ~40 lines of code.

### T2 — Boot self-test (0–1.4 s, once per session)

Fires on first load, over the idle scope. Perfect opening 2 seconds for the video.

```
FLAVOR HUNTER  ·  TRACKER v1
  SCOPE ............ OK
  SCENT ARRAY ...... OK
  GEO LOCK ......... ACQUIRING
  HOUND ............ AWAKE
READY
```

Monospace, one line per ~180 ms, `GEO LOCK` resolves when the browser returns coordinates
(or degrades to `MANUAL` and reveals the city input). The dog wakes from `sleep` → `idle`
on the `HOUND` line.

### T3 — Range rings with live distance labels

Three or four rings, labelled in the user's units, relabelled on widen (S8). The ring
expansion during a widen is a real event with a stated reason, not a flourish.

### T4 — ~~Signal strength / interference~~  **CUT**

A 5-bar strength readout was specified here and is now removed: the user cannot act on it,
so it is debug telemetry in a UI costume. Thin evidence is already disclosed where it
matters — by the denominator on each evidence line (`2 of 5 available reviews`) and by
`no evidence found`. Saying it twice, once in a form nobody can use, is redundancy.

### T5 — SIGNAL ACQUIRED / LOST

Two-line state announcements in the strip on the transitions that matter: candidates
detected, all candidates eliminated, target locked, widening.

### T6 — Scent trail

The dog leaves a fading trail of scent particles and occasional paw prints. Cheap, and it
makes the path legible after the fact — the user can see where the dog has already been.
Doubles as the visual record of the search.

### T7 — Distance readout

`2.3 mi` beside the locked target. **Distance only — no bearing in degrees.** The scout's
position on the scope already conveys direction, and nobody navigates by degrees, so the
degree readout was cut as redundant. Distance is actionable, so it stays.

---

## 3. Dog State ↔ App State Mapping

Every app state maps to a real dog behaviour. **This table is the animation contract.**

| App state | Dog animation | What the user reads |
|---|---|---|
| S0 IDLE (fresh) | `sleep` → `idle_sit` on boot T2 | waiting for you |
| S0 IDLE (30 s no input) | `idle_wag` occasionally over `idle_sit` | still here |
| S1 DECODING | `alert` — ears up, nose lifted, sniffing the air | catching the scent of what you said |
| S2 NEED_CLUE | **`tilt` — head tilt** | it doesn't understand yet |
| S3 HUNTING, in transit | `run` (side view, flipped by heading) | on the trail |
| S3 HUNTING, at a candidate | `sniff` — nose down, tail up | checking this one |
| S3 candidate eliminated | `reject` — head shake, then `run` | not it |
| S4 LOCKED | **`point` — paw raised, tail rigid, nose at target** | found it |
| S5 EVIDENCE open | hold `point` | still holding the point |
| S6 REFINING | `shake` — shakes off → `alert` → `run` | resetting, going again |
| S8 NO_ANSWER | `sad` — ears and tail down | nothing here |
| S7 DEGRADED | `idle_sit`, palette desaturated | working from memory, not live scent |

`tilt` for "I need one more clue" and `point` for "found it" are the two that carry the
product. A head tilt is the universally legible *I don't understand*; a pointing gundog is
literally the gesture for *the thing you are hunting is right there.* Neither needs a
caption.

### 3.1 The honesty rule (this one is a requirement, not a style note)

> **The dog's state MUST be driven by the same real events as the blips. It MUST NOT
> idle-animate through work it is not doing.**

If the backend is slow, the dog waits — `alert`, ears up, not running. If a candidate is
being fetched, it sniffs *that* candidate. A dog that runs a happy loop while nothing is
happening is exactly the "demo theater" the whole design has been avoiding, and it is more
insidious than a fake progress bar because it is charming. Same rule as fabricated
evidence: the visual layer may not claim more than the system is doing.

---

## 4. Asset Manifest

Everything below is what needs to be produced. Formats are chosen so a single PNG plus a
single JSON loads the entire visual system.

### 4.1 Dog sprite sheet — `hound.png` + `hound.json`

**Character lock (from the reference still).** Boston Terrier: black/white tuxedo, pink inner ears, **red kiss-lips as the signature gag**. Do not redraw as a generic brown scent hound. Side / three-quarter, **facing right** (flip in code). The lips stay on idle / lock / portrait; they can compress on `sniff` so the nose reads.

| Spec | Value |
|---|---|
| Cell size | **32 × 32 px** field; **48 × 48 px** portraits in `hound-emote.png` |
| Field sheet | 8 columns × 6 rows = **256 × 192 px** |
| View | side / three-quarter, facing right. Horizontal flip for leftward motion |
| Background | fully transparent |
| Anti-aliasing | **none.** Hard pixel edges only |
| Outline | 1 px, `#0A0E14` |
| On-screen size | field 48–64 CSS px; emote 72–96 CSS px; integer scale only |

Frames, in sheet order (unchanged contract — new drawing, same state names):

| Row | State | Frames | fps | Loop | Notes |
|---|---|---|---|---|---|
| 0 | `idle_sit` | 4 | 4 | loop | breathing; blink; lips puff on frame 3 |
| 0 | `idle_wag` | 4 | 6 | loop | tail only |
| 1 | `alert` | 3 | 8 | once → hold | ears up, nose lifted |
| 1 | `tilt` | 3 | 6 | once → hold | **head tilt** + optional `?` emote |
| 2 | `run` | 8 | 12 | loop | full run cycle |
| 3 | `sniff` | 4 | 6 | loop | nose to ground |
| 3 | `reject` | 4 | 10 | once | head shake / sneeze |
| 4 | `point` | 3 | 8 | once → hold | **paw up, nose at target.** Thumbnail frame |
| 4 | `sad` | 3 | 4 | once → hold | ears and tail down |
| 5 | `shake` | 6 | 12 | once | full-body shake-off |
| 5 | `sleep` | 4 | 2 | loop | curled |

### 4.1b Emote / loading pack — `hound-emote.png` + `hound-emote.json`

RPG portrait loops. **Each state is 6–7 frames**, 48×48, looping. Used on the title plate, boot, intel card, and any full-screen wait. Driven by the same hunt events as the field sprite — never decorative busywork.

| ID | App state | What to draw (RPG) | Frames |
|---|---|---|---|
| `e_boot` | S0 boot / loading | Paw-tapping, glance L/R, lip puff, `…` bubble | **6–7**, loop |
| `e_think` | S1 DECODING | Head tilt, ear twitch, `?` | 6–7, loop until `parsed` |
| `e_clue` | S2 NEED_CLUE | Stronger tilt, one ear flop, hold `?` | 6–7, hold last |
| `e_hunt` | S3 (portrait only) | Tongue out, determined squint — field uses `run`/`sniff` | 6, loop |
| `e_nope` | S3 eliminated | Shake + `×` spark | 6, once |
| `e_lock` | S4/S5 | Point + sparkle burst; lips as victory gag | 6–7, hold last |
| `e_empty` | S8 NO_ANSWER | Sit, ears down, one sigh frame | 6, hold last |

Optional 8th (do not ship if time is short): `e_refine` = shake-off → wink, S6.

Emote bubbles as separate 16×16 props (not baked into every frame): `!` `?` `…` `♡` `×` `zzz`.

### 4.2 Palette — max 16 colours, locked to the Boston Terrier

| Role | Colour | Note |
|---|---|---|
| Outline | `#0A0E14` | frame void |
| Fur black | `#1A1A1A` / `#2C2C2C` | body |
| Fur white | `#F4F7FA` / `#D0D5DC` | muzzle, chest, socks |
| Inner ear | `#E07A8A` | pink |
| **Lips** | `#E02020` | **signature. Do not mute.** |
| Nose / pads | `#141414` | |
| Eye | white + black | half-lidded in idle (the still) |
| **Collar** | `#FF3D00` hunt → `#FFC400` lock → `#7CFF6B` proof | flat row, swapped at runtime |

The old warm-brown hound palette is **retired**.

### 4.7 Extra RPG chrome (beyond the dog)

Produce these as pixel slices, not CSS approximations, if the device should read as a game UI:

| Asset | Size | Notes |
|---|---|---|
| `ui/frame-9slice.png` | 48×48, 8px corners | cyan striped window |
| `ui/title-plate.png` | 320×32 cap | `FLAVOR HUNTER` backing |
| `ui/btn-arcade.png` | 3 states (up/over/down) | orange + grey |
| `ui/tab-hot.png` / `tab-cold.png` | 24×48 | left tabs |
| `ui/speaker-on.png` / `off.png` | 16×16 | green pixel key |
| `tiles/field.png` | 16×16 tileset, ~8 tiles | dark water / land / grid — **unlabeled, not a real city** |
| `props.png` | see §4.3 | pins, reticle, scent, paw |
| `vfx/lock-burst.png` | 32×32 × 6 | lock sparkles |
| `vfx/scan-wedge.png` | optional | or keep canvas sweep |

Fonts: **Press Start 2P** (HUD/title) + **VT323** (ticker). Still subset CJK to seeded glyphs only.

**Total 46 field frames** in a 48-cell grid. Two cells spare.

Atlas format — `hound.json`:

```json
{
  "image": "hound.png",
  "cell": [32, 32],
  "grid": [8, 6],
  "states": {
    "idle_sit": { "frames": [0,1,2,3],        "fps": 4,  "loop": true },
    "idle_wag": { "frames": [4,5,6,7],        "fps": 6,  "loop": true },
    "alert":    { "frames": [8,9,10],         "fps": 8,  "loop": false, "hold": 10 },
    "tilt":     { "frames": [11,12,13],       "fps": 6,  "loop": false, "hold": 13 },
    "run":      { "frames": [16,17,18,19,20,21,22,23], "fps": 12, "loop": true },
    "sniff":    { "frames": [24,25,26,27],    "fps": 6,  "loop": true },
    "reject":   { "frames": [28,29,30,31],    "fps": 10, "loop": false },
    "point":    { "frames": [32,33,34],       "fps": 8,  "loop": false, "hold": 34 },
    "sad":      { "frames": [35,36,37],       "fps": 4,  "loop": false, "hold": 37 },
    "shake":    { "frames": [40,41,42,43,44,45], "fps": 12, "loop": false },
    "sleep":    { "frames": [46,47,48,49],    "fps": 2,  "loop": true }
  }
}
```

### 4.3 Supporting sprites — `props.png` + `props.json`

| Sprite | Size | Frames | Use |
|---|---|---|---|
| `scent_particle` | 8 × 8 | 3 | T6 trail, fades over ~800 ms |
| `paw_print` | 8 × 8 | 2 (L/R) | T6, dropped every ~5th run frame |
| `blip_unresolved` | 16 × 16 | 2 | pulsing candidate, `--signal` |
| `blip_candidate` | 16 × 16 | 2 | promoted after `evaluated` |
| `blip_eliminated` | 16 × 16 | 1 | struck through, `--reject`, stays on screen |
| `blip_target` | 16 × 16 | 4 | locked, `--lock` |
| `reticle` | 48 × 48 | 4 | four brackets converging (320 ms) |
| `bowl` | 16 × 16 | 1 | marks the locked restaurant under the reticle |

Rings, graticule, and bearing ticks are **not** sprites — they are vector (`06` §1, layer 1).

### 4.4 Static images

| Asset | Size | Purpose |
|---|---|---|
| `og-image.png` | 1200 × 630 | **The submission thumbnail.** Compose it as: dog in `point`, reticle converged, `94% MEMORY MATCH` visible. This single image carries a large share of the score in an async-judged competition — treat it as a deliverable, not an export |
| `icon-192.png`, `icon-512.png` | as named | PWA install icons — dog head, maskable safe area |
| `favicon.svg` | — | dog head silhouette, single colour |
| `apple-touch-icon.png` | 180 × 180 | iOS home screen |

### 4.5 Audio — `sfx/`

| File | Length | Trigger |
|---|---|---|
| `ping.wav` | ≤ 60 ms | T1 proximity tone; pitch shifted in code by proximity, not resampled as separate files |
| `reject.wav` | ≤ 120 ms | candidate eliminated, low blunt tone |
| `lock.wav` | ≤ 400 ms | two-note resolve on TARGET LOCKED |
| `boot.wav` | ≤ 300 ms | T2 self-test complete (optional) |

Mono, 22 kHz, small. Muted by default; unmute toggle in the telemetry strip.

### 4.6 Fonts

Already specified in `06` §1: JetBrains Mono (telemetry) + Inter Tight (UI). Subset to
Latin plus **only** the CJK glyphs that actually appear in seeded examples. A full CJK
face is hundreds of KB on cellular and will break the performance budget.

---

## 5. Rendering Notes (implementation-side)

- Load `hound.png` and `props.png` **before** the boot self-test completes; T2's 1.4 s is
  the asset loading window. Nothing should pop in late.
- `ctx.imageSmoothingEnabled = false` — without this the pixel art blurs and the whole
  aesthetic dies.
- Snap sprite draw positions to whole device pixels. Sub-pixel positions shimmer at
  nearest-neighbour scaling; round after the DPR multiply, not before.
- The dog and all blips live in **canvas layer 4–5** (`06` §4.3), in the same polar
  coordinate space. No DOM sprite — the dog must move in step with the blips at frame rate.
- Sprite scale must be an **integer multiple** of the source (2× or 3×, never 2.4×).
  Choose the multiple from viewport width at mount and keep it fixed for the session.
- Dog motion between candidates: ease-in-out along a slight arc, ~600–900 ms per hop, so
  it looks like it is choosing rather than being teleported. Timing follows real event
  arrival — if the next event is late, the dog arrives and sniffs, it does not idle-run
  (§3.1).
- `prefers-reduced-motion`: dog holds static poses and cuts between states with no run
  cycle, no sweep rotation, no scanline. Poses alone still carry every state — which is
  why each state needs a readable **hold frame**.

---

## 6. Production Order

Build against placeholders; swap in art as it lands. Nothing here blocks engineering.

| # | Asset | Blocks | Placeholder while waiting |
|---|---|---|---|
| 1 | `point` hold frame | thumbnail, lock animation, video | red square |
| 2 | `run` 8 frames | S3, the bulk of screen time | red square, translated |
| 3 | `sniff`, `reject` | S3 legibility | square that shrinks / shakes |
| 4 | `tilt` hold frame | S2 | square with `?` |
| 5 | `idle_sit`, `alert` | S0, S1 | static square |
| 6 | `sad`, `shake`, `sleep`, `idle_wag` | S8, S6, polish | reuse `idle_sit` |
| 7 | `props.png` | trail, blips, reticle | drawn primitives in canvas |
| 8 | `og-image.png` | submission | — do last, from a real screenshot |

**Frames 1 and 2 are 80% of the value.** A pointing dog and a running dog, and the product
already reads. Everything after that is refinement.
