# Flavor Hunter — Product Requirements Document

| Field | Value |
|---|---|
| Status | Approved for build |
| Version | v1.0 |
| Date | 2026-08-27 |
| Author | Y. Li |
| Research input | `01-user-research.md`, `04-taste-memory-archetypes.md` |
| Tech design | `03-tech-design.md` · `06-frontend-stack-and-feature-map.md` · `07-tracker-simulation-and-assets.md` |
| Scope | Hackathon submission (online, async-judged) |

---

## 1. Problem Statement

People who have moved away from a food culture routinely want a *specific remembered
version* of a dish — their grandmother's sweeter tomato and egg, East Coast
Chinese-American fried rice, Azorean rather than Portuguese. Existing restaurant
search accepts only two dimensions that map to this need: a dish keyword and a
location. Everything that distinguishes the remembered version from its neighbors —
sub-regional style, preparation register, operator origin, venue form, price band —
has no place in the query.

Users respond by building workarounds: posting to city subreddits, hand-compiling
Google Maps, or trying restaurants one by one for up to two years (Research F6–F8).

**The missing product is not more inventory. It is a query language for remembered
taste, plus proof that a given restaurant matches.**

## 2. Goals and Non-Goals

### 2.1 Goals

| ID | Goal |
|---|---|
| G1 | Accept an unstructured taste memory in natural language and return restaurant candidates ranked by resemblance to that memory. |
| G2 | Name the category the user could not name (Research F1). |
| G3 | Justify every match with verbatim, source-attributed evidence — never an unsourced score. |
| G4 | Let the user correct the system's understanding and re-rank instantly. |
| G5 | Work in any city the user is in, with no pre-built dataset. |

### 2.2 Non-Goals

| ID | Non-goal | Rationale |
|---|---|---|
| NG1 | Reservations, ordering, delivery | Out of scope; adds vendor integration risk with zero scoring benefit. |
| NG2 | User accounts, saved history, social features | Conflicts with NFR-4 (no persistence). |
| NG3 | Recipe search / grocery search | Distinct intent; explicitly rejected by the intent gate (FR-3). |
| NG4 | Exhaustive coverage of any city | Coverage is not the differentiator; the query language is. |
| NG5 | An "authenticity" rating | Research F3: inverts intent for a material share of users. |

## 3. Success Metrics

### 3.1 Product metrics (post-hackathon)

| Metric | Definition | Target |
|---|---|---|
| Evidence groundedness | % of displayed evidence lines whose quoted text is byte-verifiable in the fetched source | 100% (hard gate) |
| Naming hit rate | % of queries where the displayed category name is judged correct by the user | ≥ 70% |
| Refinement responsiveness | % of refinements that change the ranked order **or** the evidence set | ≥ 90% |
| Time to first result | P50 wall clock, query submit → TARGET LOCKED | ≤ 10 s |

> **Deliberately not a metric: "refinement increases the score."** A correction that
> reveals the best candidate is a worse fit than believed SHOULD lower the score. Making
> the score rise monotonically after refinement would be demo theater, and it is the
> kind of thing a technical evaluator finds immediately. The system optimizes for
> responsiveness to correction, not for a rising number.

### 3.2 Hackathon metrics

| Metric | Target |
|---|---|
| Demo completes on judge's first attempt without error | 100% |
| All archetypes A1–A12 (§5) produce a non-error result | 12/12 |
| Zero fabricated evidence across all archetypes | Hard gate |
| Scout state matches real system state at all times | 100% — FR-7a |
| Zero Places calls issued before the user confirms the name | 100% — FR-2a |

## 4. Personas

**P1 — The Long Searcher (primary).** Moved cities or countries 1–5 years ago. Knows
exactly what the remembered food tastes like; cannot express it in a search box. Has
already tried and rejected several restaurants. Emotionally invested (Research F7).
*Represented by: the Californian who spent two years hunting DC taquerias.*

**P2 — The Unnamed Craver (primary).** Wants something specific but has no vocabulary
for it. Would not know to type the correct term even if it existed.
*Represented by: the Seattle user who learned his target was "East Coast Chinese-American."*

**P3 — The Curious Local (secondary).** Native to the area, wants the version an
insider from that culture would endorse. Not homesick; uses the same machinery in
reverse. Included because it broadens the demo audience at zero build cost.

## 5. User Scenarios

Derived from verified Reddit language (Research §4). **These 10 scenarios are the
regression test suite.** Every prompt change is re-run against all 10.

> **One canonical numbering.** These are the archetype IDs from
> `04-taste-memory-archetypes.md` (`A1`–`A10`). An earlier draft of this section used a
> separate 1–10 list whose numbers did not line up with the archetypes — a suite built from
> "scenarios 2 and 6" would have tested naming and negation while **silently omitting the
> fabrication test**. Always cite archetypes as `A<n>`, never as a bare number.

| ID | Archetype | Representative input | Gate | What it tests |
|---|---|---|---|---|
| A1 | Family cook oracle | "the sweet tomato and egg my grandmother used to make" | PASS | Happy path; `person` anchor; **the demo query** |
| **A2** | **Unnamed regional variant** | "bright yellow fried rice, bright red char siu, huge egg rolls, crab rangoon — not just cream cheese" | PASS | **Must output "East Coast Chinese-American".** Must not rank by authenticity |
| A3 | Sub-national precision | "Azorean, not Portuguese — and not Brazilian" | PASS | `substyle` survives stage 1 → stage 2; negation excludes |
| A4 | Closest-so-far iterator | "Randy's is close but not quite — closer to frosted bread" | PASS | Named benchmark excluded, never returned as top result |
| A5 | Scarcity acceptance | "cevapi — I think there's only one Bosnian place around here" | PASS | 1 result is a success state, not an error; score may honestly sit in the 60s |
| **A6** | **Category absence** | "Mexican food, but everything I've tried here is bad" | PASS | **Zero evidence ⇒ `insufficient evidence`, never a fabricated %.** Widen offered, not taken |
| A7 | Deliberate inauthenticity | "the Americanized Chinese takeout I grew up on, not authentic Sichuan" | PASS | Confirms no authenticity score exists anywhere (NG5) |
| A8 | Non-food anchor | "the place that gave free pickled veggies if you ordered three or more" | PARTIAL | Non-culinary anchors don't crash the parser; assumptions marked `?`, no blocking form |
| **A9** | **Negative-only** | "the tacos I've tried were bland and soggy and the tortillas were weird" | PASS | **Negations land in `negation[]`, never in a positive field** |
| A10 | Insufficient input | "Missing home food." | **BLOCK** | Clue request fires; zero API calls; parser returns `null`, not a plausible guess |
| A11 | **Origin ≠ location** | "我外婆在湖南的厨房做的番茄炒蛋" (user is in Boston) | PASS | **Searches Boston, sets `substyle: Hunan`.** Searching Hunan is a release blocker (FR-4a) |
| **A12** | **Substitution ladder** | "我想吃正宗东北麻辣烫" (city has none) | PASS | **`query_variants` searched, not just the user's spelling. On zero evidence, two doors with `relation` shown** (FR-1, FR-4b-2) |

**Four gating cases: A2 (naming), A6 (refusing to fabricate), A9 (negation), A12 (variants +
honest substitution).** Each is a
distinct failure mode — inability to name, willingness to invent, and sign inversion. If
those three pass, the rest follow. A11 is a fourth mandatory case covering the one
location bug that presents as working software.

### 5.1 Primary Journey (Scenario 1)

0. **Boot.** A 1.4 s tracker self-test runs (`SCOPE / SCENT ARRAY / GEO LOCK / HOUND`).
   The scout wakes on the `HOUND` line. This doubles as the sprite-atlas load window.
1. User lands on a single page. Location is requested from the browser; a text field
   invites a memory, with three example memories shown as clickable chips.
2. User types the memory and submits. The scout goes `alert` — ears up, sniffing the air.
3. **Decode.** Parsed anchors stream in as an *assumption card*. Low-confidence
   anchors are marked `?` with an inline `[change]` affordance. A category name
   appears at the top.
4. **Hunt.** The scope sweeps. The scout picks up the trail and runs to the nearest
   candidate to sniff it. Candidates are eliminated one at a time with a stated reason,
   each elimination driven by a real API response and accompanied by the scout's
   rejection and move to the next. A proximity tone accelerates as it closes in.
5. **Lock.** The scout **points** — paw raised, nose at the target. Four brackets
   converge; `TARGET LOCKED` on the highest-scoring restaurant.
6. **Prove.** An evidence panel shows the Memory Match % and 3–5 evidence lines, each
   with quoted source text, source name, and fetch timestamp. Each line expands to
   the full quoted passage.
7. **Refine.** User clicks `Not quite` and states what was wrong. The assumption card
   updates visibly (numeric anchors animate), candidates re-rank locally, a new
   target locks with a changed score, and at least one new evidence line appears.

## 6. Functional Requirements

Priority: **P0** = submission blocker. **P1** = build if time remains. **P2** = documented, not built.

### 6.1 P0 — Memory Decoding

**FR-1 · Anchor extraction** — P0
The system SHALL parse free-text input into the anchor schema (Research §5):
`dish, cuisine, substyle, sensory[], direction, person, setting, price_band, ritual,
benchmark, negation[]`, plus `query_variants[]` and `fallback_ladder[]`.

**`query_variants[]`** — alternative spellings under which the dish is plausibly listed on
Google Maps: the original script, romanisations, and common English renderings.

```
"正宗东北麻辣烫"
  → ["麻辣烫", "mala tang", "malatang", "spicy hot pot", "Chinese hot soup"]
```

*Acceptance:* Stage 1 searches across variants, not the user's spelling alone. A dish that
exists nearby but is listed under an owner's ad-hoc transliteration MUST still be found.

> **Rationale.** For immigrant food, the name on the map is frequently not the name the user
> uses — owners transliterate however they please. This is the same class of problem as not
> knowing that a savoury crêpe is called a galette (A2), except here the gap is between the
> user's language and the *listing*, not between the user and the category. Searching only
> the user's spelling silently misses restaurants that are right there.
*Acceptance:*
- All 10 archetypes (`04-taste-memory-archetypes.md`) produce schema-valid output.
- Each anchor carries a confidence in `[0,1]`.
- Negations are emitted into `negation[]` and never into a positive field (A9).
- **Absent anchors are `null`.** For input "Missing home food." the parser MUST return
  `{dish: null, cuisine: null, sensory: [], searchable: false,
  missing_required: ["dish_or_cuisine"]}` and MUST NOT return a plausible guess such as
  `{cuisine: "Chinese", dish: "noodles"}`. Knowing that it does not know is a tested
  capability, not an error path (A10).

**FR-2 · Category naming** — P0
The system SHALL emit a single human-readable name for what the user is looking for,
displayed as the first line of output.
*Acceptance:* Scenario 2 yields "East Coast Chinese-American" or a semantically
equivalent label. Scenario 3 yields "Azorean." When confidence < 0.5 the name is
rendered with a `?` prefix rather than omitted.

**FR-3 · Intent gate** — P0
The system SHALL classify intent as `find_restaurant | find_recipe | find_grocery |
other` and SHALL NOT invoke restaurant search for non-`find_restaurant` intents.
*Acceptance:* "how do I cook tomato and egg" issues zero Places calls and returns an
explanatory message.

**FR-4 · Searchability gate** — P0
The system SHALL evaluate three required slots: `location`, `dish_or_cuisine`,
`intent == find_restaurant`.
- If all three are satisfied → proceed to Hunt.
- If `dish_or_cuisine` is missing → BLOCK and render the clue-request UI: three
  buttons (`What was it?` / `Where was it from?` / `What did it taste like?`).
- Missing optional anchors SHALL NOT block. The system assumes a value, displays the
  assumption, and marks it `?`.

*Acceptance:* Scenario 10 blocks with zero API calls. Scenarios 8 and 9 proceed with
`?`-marked assumptions. **No scenario produces a blocking questionnaire form** — the
only blocking interaction is the three-button clue request.

> **Design rationale.** A form that demands complete input before searching would
> break the radar's pacing, which is the product's primary visual asset. Assumptions
> made visible are strictly better than questions asked: they let the user correct
> the system while it is already working, and they double as the entry point for
> FR-10, so the two features share one UI surface.

**FR-4a · Location resolution — P0**

The system distinguishes two distinct locations and MUST NOT conflate them:

| | Meaning | Source | Role |
|---|---|---|---|
| **Search location** | where to look | browser geolocation, or a typed city | required slot (FR-4) |
| **Memory origin** | where the remembered version came from | parsed from the user's text | an **anchor** (`substyle`), never a search location |

*Acceptance:*
- Input "我外婆在湖南的厨房做的番茄炒蛋" while the user is in Boston MUST search **Boston**
  and set `substyle: Hunan`. Searching Hunan is a **release blocker** — it is the most
  likely silent failure in location handling, and it presents as working software.
- Geolocation is requested on the user's **first interaction** (focusing the input or
  tapping an example), not on page load, with `GEO LOCK ... ACQUIRING` visible as the
  stated reason. First-interaction timing also satisfies browsers that require user
  activation for the geolocation API.
- On denial or failure: `GEO LOCK ... MANUAL`, a city field appears, the flow continues.
  The system MUST NOT block and MUST NOT re-prompt.
- The resolved city is displayed at all times and is user-editable.
- If the search city differs from the user's own position, the scope re-centres on the
  search city and the telemetry strip labels it (`CENTER · NEW YORK, NY`).

**FR-4b · User-controlled range — P0**

Range is a user setting, not a system decision. The system SHALL NOT search outside the
range the user has set without asking.

| Presets | 5 mi · 10 mi · **20 mi (default)** · 45 mi |
|---|---|

*Acceptance:*
- The active location and range are visible on the idle screen as one tappable chip
  (`Boston, MA · 20 mi`), and read-only in the telemetry strip during a hunt.
- **The scope's outer ring equals the set range.** Changing range animates the rings and
  fades out-of-range blips; ring labels relabel accordingly.
- Location offers exactly two modes: `Current location` (with a re-acquire control) and
  `Custom` (free-text city, geocoded once).
- The setting persists across sessions in `localStorage` (see NFR-4).

> **Why 20 mi is the default.** Diaspora food lives in suburban enclaves, not downtown —
> which is precisely this product's subject. Flushing is ~10 mi from Midtown; the San
> Gabriel Valley ~12 mi from downtown LA; Quincy and Malden 6-8 mi from central Boston. A
> tighter default would systematically exclude the best answer for the exact user this is
> built for. 45 mi is the "worth an hour's drive" boundary, which is where archetype A6's
> real answer (an hour outside Toronto) sits.

**FR-4b-1 · Widening is offered, never automatic — P0**

When no candidate within the user's range reaches 2 or more verbatim evidence lines, the
system SHALL stop, report that plainly, and offer the next preset up as a single action.

```
Nothing within 20 mi clears the bar.
[ Search 45 mi instead ]
```

*Acceptance:*
- **Triggered by evidence failure, not result count.** 18 results with zero matching
  evidence MUST trigger the offer (archetype A6).
- The system MUST NOT widen without an explicit user action, and MUST NOT rank the
  least-bad candidate as a winner.
- At the top preset no offer is made; the system reports no answer.
- The scout sits (`sad`) while the offer is on screen.

> **Rationale.** This replaces an earlier automatic three-step ladder. Distance is the one
> variable users have strong opinions about; silently searching 45 mi when someone asked for
> 5 substitutes our judgement for theirs. Offering costs one tap and is never reached on the
> seeded demo paths, so it is free in the happy path.

**FR-4b-2 · Two fallback doors — P0**

When nothing in range clears the evidence bar, the system SHALL offer **two** distinct
retreats and SHALL take neither without an explicit user action:

```
No 麻辣烫 within 20 mi.

┌──────────────────┐   ┌────────────────────────┐
│  Search 45 mi    │   │  Try 麻辣香锅 instead   │
│  same dish       │   │  closer, not the same   │
└──────────────────┘   └────────────────────────┘
```

| Axis | Trade |
|---|---|
| **Distance** (FR-4b-1) | Same dish, further away |
| **Specificity** (this requirement) | Nearer, but not exactly the thing |

The substitution comes from `fallback_ladder[]`, emitted by the parser alongside the anchors:

```ts
fallback_ladder: {
  dish?: string
  cuisine?: string
  relation: string    // REQUIRED — how it relates to the original
}[]
// 麻辣烫 →
// [ { dish: "麻辣香锅", relation: "same flavour profile, no broth" },
//   { dish: "冒菜",     relation: "same origin, Sichuan preparation" },
//   { dish: "川式火锅",  relation: "same flavour profile, different format" },
//   { cuisine: "Sichuan" },
//   { cuisine: "Chinese" } ]
```

*Acceptance:*
- **Every rung MUST state its `relation` to the original**, displayed to the user. The system
  MUST NOT quietly serve something adjacent as though it were the thing asked for.
- One rung is offered at a time — the nearest relation first, not the whole ladder.
- Both doors are one tap. Neither is taken automatically.
- Accepting a substitution restarts the hunt with the substituted dish and says so in the
  header; the original memory text is preserved and remains visible.
- At the top range preset with the ladder exhausted, the system reports no answer.

> **Rationale.** An earlier version had a single retreat: search further. But wanting
> 东北麻辣烫 in a city that has none is a two-dimensional problem, and **only the user knows
> which dimension they are willing to give up.** Some will drive an hour for the real thing;
> some want something close enough tonight. Choosing for them is the same error as widening
> the radius silently.

**FR-4c · Seeded examples carry memory + city + range — P0**

Each of the three example memories on the idle screen SHALL specify the memory text, a city
in which a qualifying answer is known to exist, **and** a range.

The three seeded memories SHALL be information-rich — the way people actually describe food
they miss — not two-word placeholders. Each exercises a different capability:

| Seeded memory | Exercises |
|---|---|
| 高雄左营那家地狱拉面，超辣，豚骨底，想再吃到 | place name + heat level + broth base; `query_variants` |
| 我外婆做的番茄炒蛋，有点甜，不是餐厅那种做法 | `person`, `direction`, and a **negation** ("不是餐厅那种") |
| 在法国留学时吃的咸可丽饼，里面好像有芦笋 | **naming** (→ galette de sarrasin) + low-confidence marking ("好像") |

*Acceptance:*
- Tapping an example sets all three, bypassing geolocation and overriding the stored range
  for that one hunt. All three example paths must succeed end-to-end.
- The user's own stored setting is restored afterwards and is never overwritten by an
  example.

> **Rationale.** A judge opens the link from an unknown location. If they are somewhere with
> no relevant restaurants, the product correctly reports "nothing found" — honest, and a
> poor score. Seeded examples make the judge's first tap deterministic and rehearsable. The
> user's real location is used only once they type their own memory, by which point they
> understand the product well enough to read an empty result as honesty rather than failure.

### 6.2 P0 — Hunting

**FR-2a · Confirmation gate — P0**

After decoding, the system SHALL present the category name and anchor set as its own step and
SHALL NOT issue any Places or website request until the user confirms.

*Acceptance:*
- The naming line (FR-2) is the largest element on screen at this step and competes with no
  running animation.
- **Zero Places or website requests before confirmation.** A misread costs nothing.
- Two actions: `Hunt it`, and `not quite — let me rephrase` which returns to the input with
  the text preserved.
- The scout holds `alert` — scented, straining, not yet released.

> **Design rationale.** An earlier draft started the hunt automatically while anchors
> streamed in. That buried the product's one genuine "oh — *that's* what it's called" moment
> under a moving radar, where the eye follows motion and the name slides past. Naming earns
> its own beat. The gate also stops us spending 18 Place Details calls and 8 website fetches
> on a misread, which is the largest avoidable cost in the pipeline.

**FR-5 · Stage-1 candidate retrieval** — P0
The system SHALL query Google Places Text Search using only the anchors Places can
filter on: `dish_or_cuisine` (as keyword + `includedType`), `location`, and
`price_band` where present. Candidates SHALL be capped at 18.
*Acceptance:* Candidate set returns in ≤ 1.0 s P50. Cap is enforced server-side.

**FR-6 · Stage-2 evidence retrieval** — P0
For each candidate the system SHALL fetch Place Details, and for the top 8 by stage-1
rank SHALL fetch and extract text from the restaurant's **own public website** to obtain
menu language.

The restaurant's website is the **primary** evidence substrate: it is not Google Maps
Content, so it may be processed by the LLM without the terms conflict described in
NFR-5. Places fields are used for candidate discovery, display, and structured
attributes (`price_band`, `setting`, `cuisine`), not as LLM input.
*Acceptance:* Per-source failures degrade gracefully — a candidate with no website
still receives a score from Places data alone, and the absence is shown, not hidden.

**FR-6b · Dual-substrate evidence matching — P0**

Evidence is gathered from two sources by **two different mechanisms**, both of which yield
verbatim text:

| Substrate | Mechanism | Why this mechanism |
|---|---|---|
| Restaurant's own public website (menu, about page) | **LLM extraction**, then byte-verification | Needs semantic judgement: "甜口" ≈ sweet-style, "galette de sarrasin" ≈ savoury buckwheat crêpe |
| Google Place Details reviews (≤ 5) | **Server-side deterministic phrase matching. No LLM.** | Verbatim by construction — a substring match cannot fabricate |

*Acceptance:*
- Review text is matched **on our own server** using deterministic string/phrase matching
  against anchor terms and their variants. It is **never included in any LLM request
  payload** (`03-tech-design.md` §11.3).
- Website evidence goes through the LLM and then through byte-verification; any quotation
  not present in the fetched payload is dropped (FR-9).
- Every evidence line records which substrate and which mechanism produced it, so the
  provenance is inspectable.
- A candidate with no website still receives review-derived evidence, and is labelled
  `limited evidence` rather than scored as if the website were absent from the world.

> **Design rationale.** Google Places cannot confirm that a restaurant serves a dish — the
> API has **no menu or dish field at all**, only coarse `serves*` booleans, and Text Search
> explicitly does not search menu or review content. Confirmation can therefore only come
> from the restaurant's own material. But our target users are small immigrant-run
> restaurants, which frequently have no website, or a Facebook page, or a PDF, or a
> photograph of a menu — so website-only evidence fails hardest exactly where the product
> matters most.
>
> Adding deterministic review matching recovers that density without touching the
> compliance position, because the constraint in §3.2.3(a)(i) is on **transmitting** Google
> content to a third party, not on processing it inside our own request handler. It also
> happens to be the more trustworthy of the two mechanisms: a substring match is verbatim by
> construction, whereas an LLM quotation has to be checked afterwards.

**FR-6a · Map substrate — P0**

The scope SHALL render over a **Google Maps JavaScript API** basemap styled with
**Cloud-based Maps Styling** (a Map ID created in Google Cloud Console), with candidates as
**Advanced Markers**. Sweep, scout, and lock brackets are a canvas overlay above it.

*Acceptance:*
- **The camera is locked during S3** — no pan, zoom, rotate, tilt. The overlay is therefore a
  fixed canvas over a static map and needs no camera synchronisation. Pan/zoom is enabled at
  S4 as the sweep fades out.
- Range rings are geographically true: the outer ring is the user's range setting at map scale.
- Google attribution and terms links rendered, never removed, altered, or obscured (`SST §15.4`).
- A non-Google basemap is prohibited (`03-tech-design.md` §11.2).

> **Design rationale — this reverses the earlier "no basemap" decision.** That rested on two
> arguments and only one survived. Compliance is satisfied by using Google's own map. The
> other — "a tracker doesn't render streets" — was an aesthetic preference, and it loses to a
> harder point: **without a basemap the blips carry no information.** A contact at 041°/2.3 mi
> means nothing to someone looking for dinner; a radar operator has training and context that
> a diner does not. An abstract scope is self-consistent but informationally empty, which
> makes it a themed loading screen — the thing this design has been avoiding throughout. Two
> gains come free: the range setting becomes visually true rather than symbolic, and a scout
> running across a real dark-styled city reads better than one running across a void.

**FR-7 · Event-driven hunt visualization** — P0
The radar SHALL be driven by real backend events streamed to the client, not a fixed
client-side timeline. Each elimination SHALL display the reason for elimination.
*Acceptance:*
- Elimination events correspond 1:1 to real candidate evaluations.
- **No elapsed-time readout, no signal-strength meter, no bearing readout.** Pacing is
  carried by animation. The only numbers on screen during a hunt are the converging
  candidate count and, on lock, the distance. See `06` §6.
- **No fixed timestamps anywhere in the animation timeline** — every transition is driven
  by event arrival, never by a clock.
- On total backend failure the animation still completes and hands off to the fallback
  (NFR-3).

### 6.3 P0 — Proving

**FR-7a · Scout embodiment — P0**

The hunt SHALL be embodied by a single tracked subject — a pixel-art scent hound — rendered in
the same coordinate space as the candidate markers. Its animation state SHALL be a pure
function of real system state per `07-tracker-simulation-and-assets.md` §3.

*Acceptance:*
- Every state S0–S8 has a distinct, readable scout pose.
- **The scout MUST NOT animate through work the system is not doing.** If the backend is
  waiting, the scout waits in `alert`; it does not run. If a candidate is being fetched, the
  scout is sniffing *that* candidate.
- Under `prefers-reduced-motion` the scout holds static poses and cuts between states; every
  state stays identifiable from its hold frame alone.
- The scout carries no decoration: its collar colour binds to the system state tokens
  (searching / locked / verified) and to nothing else.

> **Design rationale.** A scent hound finds things by smell precisely when the person cannot
> describe them — this product's premise, embodied rather than explained. It also supplies the
> emotional register Research F7 requires (family, longing, multi-year searches) while the
> instrument itself stays cold and factual.
>
> The second acceptance bullet is not stylistic. A dog running a happy loop while nothing is
> happening is the same class of dishonesty as a fabricated evidence quotation, and it is more
> insidious because it is charming. The visual layer may not claim more than the system does.

**FR-8 · Anchor-to-evidence matching** — P0
For each candidate the system SHALL attempt to match each extracted anchor against
the retrieved text, and SHALL apply `negation[]` as exclusion.
*Acceptance:* Scenario 6 demonstrably ranks a "bland/soggy" restaurant *down*, and
the exclusion appears as a visible elimination reason.

**FR-9 · Evidence panel with verbatim citation** — P0
Every evidence line SHALL carry: the matched anchor, a verbatim quotation from source
text, the source name, and a fetch timestamp. Where a count is stated it SHALL include
the denominator (e.g. "2 of 5 available reviews").
*Acceptance (hard gate):* Every quotation is byte-verifiable in the fetched payload.
When no evidence is found for an anchor the line reads `no evidence found` — the model
MUST NOT generate a substitute. Any fabricated quotation is a release blocker.

**FR-9a · Memory Match score** — P0

Score is **evidence coverage only**. No semantic-similarity term.

```
For each anchor extracted (excluding negations), assign its rubric weight:

    dish                     30
    sensory + substyle       30
    cuisine + direction      20
    person + setting + ritual + price_band + benchmark   20

An anchor contributes its weight ONLY if it is matched by a verbatim,
byte-verified quotation from retrieved source text (FR-9).
Weights of anchors the user never supplied are removed from the denominator.

MemoryMatch = round( 100 × min(0.97, earned / available) )
```

*Acceptance:*
- The rubric is displayed in-product; a user can add up the evidence lines and
  reproduce the number by hand. This is the requirement — the score must be
  hand-auditable.
- Score is never 100 (Research F2: users themselves say "the closest I've found,"
  never "perfect"). The residual gap generates the "why not 100%?" interaction.
- If `earned == 0` **no score is shown**; the candidate is labeled
  `insufficient evidence`. A percentage MUST NOT be produced without evidence
  (archetype A6).
- An anchor with no supporting quotation contributes **zero**, not a partial credit.

> **Design rationale (resolves Open Question Q2 — decision: cut).** An earlier draft
> blended evidence coverage with an embedding-based semantic similarity term. It was
> removed. At N ≤ 18 candidates the semantic term changed rankings rarely, could not be
> explained to a user, and made the score unauditable — which directly undermines the
> product's central claim. A score a user can verify by reading four quotations is worth
> more than a score that is mathematically richer and opaque. Cutting it also removes an
> embedding vendor and a whole class of failure (see `03-tech-design.md` §3.1).

### 6.4 P0 — Refining

**FR-10 · Memory refinement** — P0
The user SHALL be able to state a correction in natural language ("too sour") or edit
any anchor directly on the assumption card. The system SHALL update the anchor set,
re-rank the **already-retrieved** candidate set, and re-render.
*Acceptance:*
- Refinement issues **zero network requests** and completes in < 100 ms.
- A score change is accompanied by at least one changed evidence line. A score that
  moves without any evidence change is a defect.
- **The score MAY decrease.** If a correction reveals that the locked target fits the
  memory less well than believed, the system SHALL show the lower number and offer
  `Try the next one`. The system SHALL NOT bias refinement toward a higher score.

> **Design rationale.** Refinement re-ranks; it does not re-search. This makes the
> single most narratively important interaction independent of every external
> dependency, and it is why FR-10 remains P0 under a live-API architecture.

### 6.5 P1 — Build if time remains

| ID | Requirement |
|---|---|
| FR-11 | Multi-target view — show ranked candidates 2–5, not only the locked target. |
| FR-12 | Shareable result permalink encoding the query + anchors in the URL (no server state). |
| FR-13 | Reddit as a third evidence source for city-specific corroboration. |
| FR-14 | "Surprise me" as a standalone entry point (currently only a gate-failure affordance). |

### 6.6 P2 — Documented, not built

| ID | Requirement |
|---|---|
| FR-15 | Photo input ("find food that looks like this"). |
| FR-16 | Saved memories / notification when a new match opens. |
| FR-17 | Operator-side claiming and correction. |

## 7. Non-Functional Requirements

**NFR-1 · Latency.** P50 ≤ 10 s, P95 ≤ 18 s, query → TARGET LOCKED. Perceived
latency is masked by FR-7; the radar must begin animating within 500 ms of submit.

**NFR-2 · Cost ceiling.** ≤ 18 Places Details calls and ≤ 8 website fetches per
query. Server-enforced global rate limit to protect the demo's quota during judging.

**NFR-3 · Graceful degradation (release blocker).** If any external dependency fails
or quota is exhausted, the system SHALL serve a static cached example for the primary
demo query, labeled in-product:
`⚠️ Live search unavailable — showing a cached example`.
*Rationale:* A judge opening the link after quota exhaustion would otherwise see an
infinite spinner and score zero. This is insurance, not a data store.

**NFR-4 · No server-side persistence.** No database, no account, no server-side log of
user input, parsed anchors, location, or third-party content.

One carve-out, stated explicitly rather than left ambiguous:

| Data | Where | Allowed |
|---|---|---|
| City label + range preset | `localStorage`, the user's own device | **Yes** — the user's own preference on their own device |
| Coordinates | `localStorage`, rounded to 3 dp (~100 m) | Yes, rounded only |
| Anything at all | our server, any log, any URL or query string | **No** |
| Memory text, anchors, third-party content | anywhere durable | **No** |

*Acceptance:*
- The settings sheet displays `Saved on this device only. Never sent anywhere.` with a
  working `Clear` action.
- Coordinates are rounded before transmission and discarded at end of request.
- Share links (FR-12) encode memory text and city name only, never coordinates.
- Country/region of origin remains optional, never required, never logged (Research S1). Country/region of origin is
optional, never required, and never logged (Research S1).
*Acceptance:* The repository contains no database dependency. The privacy posture is
stated on the page itself, not only in a policy document.

**NFR-5 · Third-party terms compliance (verified).** Google Maps Platform terms were
read in full on 2026-08-27; see `03-tech-design.md` §11 for verbatim citations. The
binding consequences:

- **No caching of Places content of any kind, for any duration.** Only `place_id` and
  latitude/longitude may be retained (lat/lng ≤ 30 days). Names, addresses, reviews,
  price levels, and metadata MUST be discarded at the end of each request. The
  previously specified 10-minute in-memory LRU over Places content is **removed**.
- **Places content MUST NOT be displayed on a non-Google basemap.** The basemap is the
  Google Maps JS API with Cloud-based Maps Styling (FR-6a); MapLibre/Mapbox are excluded.
- **Google review text MUST NOT be the substrate sent to a third-party LLM.** The
  evidence substrate is the restaurant's own public website. See §6.2 below and
  `03-tech-design.md` §11.3.
- API keys SHALL remain server-side only.
- Attribution required by the Documentation SHALL be displayed and MUST NOT be removed,
  altered, or obscured.

**NFR-6 · Honest scope disclosure.** The interface SHALL display the actual scope of
the current search (city, candidate count) and SHALL NOT imply coverage it does not
have.

## 8. Edge Cases

| Case | Behavior |
|---|---|
| Location denied | Fall back to a text city input. Do not block. |
| Zero Places candidates | Broaden: drop `price_band`, then `dish` → `cuisine`, then widen radius. Show each broadening step as a visible radar event. |
| Candidate has no website and no reviews | Score from Places metadata only; label `limited evidence`. |
| Non-English memory input | Parse in the input language; emit the category name bilingually. |
| Anchors mutually contradictory ("authentic Sichuan but like Panda Express") | Surface the contradiction on the assumption card and ask which to prioritize. Do not silently pick one. |
| Quota exhausted mid-hunt | Complete with partial candidates; label the reduced denominator. |
| Model returns unquotable evidence | Drop that line. Never display it. Log the incident. |

## 9. Open Questions

| ID | Question | Owner | Needed by |
|---|---|---|---|
| ~~Q1~~ | ~~Do current Places terms permit the in-memory TTL cache?~~ **CLOSED 2026-08-27: NO.** Terms read in full; only `place_id` and lat/lng may be retained. Cache removed; two further architecture changes forced (NFR-5). | Y. Li | Done |
| ~~Q2~~ | ~~Is the `S` term worth its complexity at N≤18?~~ **CLOSED: cut.** Evidence coverage only (FR-9a). | Y. Li | Done |
| Q3 | Does the `direction` enum need a sixth value for institutional food (school, canteen)? | Y. Li | Post-hackathon |

## 10. Hackathon Scope Cut Line

Build in this order. Stop where time runs out; everything above the line ships.

```
1. FR-1, FR-2, FR-3, FR-4      Memory decoding + gate + assumption card
2. FR-5, FR-6                  Two-stage retrieval
3. FR-9, FR-9a                 Evidence panel + score      ← credibility
4. FR-7                        Event-driven radar          ← the first 10 seconds
5. FR-10                       Refinement                  ← the second act
6. NFR-3                       Static fallback             ← 20 min, protects everything
──────────────────────────── SUBMISSION LINE ────────────────────────────
7. FR-11 … FR-14               P1
```

NFR-3 is 20 minutes of work and protects the entire submission. It is listed last
only because it depends on a working primary path; it MUST NOT be skipped.
