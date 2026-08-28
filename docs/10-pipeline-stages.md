# Flavor Hunter — Pipeline Stages

| Field | Value |
|---|---|
| Status | Approved for build |
| Version | v1.0 |
| Date | 2026-08-27 |
| Purpose | Parse / Gate / Hunt / Evidence as a **fixed pipeline** — not an agent runtime |
| Upstream | `02-prd.md` · `03-tech-design.md` §6 · `04-taste-memory-archetypes.md` · `08-system-design.md` |
| Code | [`../schemas/index.ts`](../schemas/index.ts) · [`../schemas/score.ts`](../schemas/score.ts) · [`../schemas/harness-cases.json`](../schemas/harness-cases.json) · [`../prompts/parse.md`](../prompts/parse.md) · [`../prompts/evidence.md`](../prompts/evidence.md) |

Submission copy: **"three-stage pipeline"** (parse → hunt → evidence). Gate is a deterministic check between parse and hunt, not a fourth LLM. No LangGraph, CrewAI, ADK, or Agents SDK.

Block 1 (this harness) is the hard gate. Do not start radar polish until A2, A6, A9, A11, and A12 pass.

---

## 1. Stage map

```
HuntRequest
    │
    ▼
┌─────────┐   Gemini #1     ┌─────────┐
│  PARSE  │ ──────────────► │  GATE   │  searchable?
└─────────┘  ParsedEnvelope └────┬────┘
                                 │ no → need_clue, END  (0 Places, 0 evidence)
                                 │ yes
                                 ▼
                            ┌─────────┐
                            │  HUNT   │  Places Text Search → Details ×18 + websites ×8
                            └────┬────┘
                                 │ polar blips + menu_text + display reviews
                                 ▼
                            ┌─────────┐   Gemini #2
                            │EVIDENCE │  website LLM + review match → byte-verify → MemoryMatch
                            └────┬────┘
                                 │
                          locked | widen and/or substitute
```

Two LLM calls. Everything else is deterministic TypeScript.

---

## 2. Parse

**In:** `{ memory_text, locale, city_label }` (coords stay out of the prompt).
**Out:** `ParsedEnvelope` validated with Zod. One retry: append the Zod error to the prompt. Second failure → NFR-3 fixture path.

Prompt file: [`../prompts/parse.md`](../prompts/parse.md).

### 2.1 Post-conditions the handler enforces (do not trust the model)

| Check | On failure |
|---|---|
| Zod `ParsedEnvelope` | retry once, then degrade |
| `searchable === true` ⇒ `dish` or `cuisine` non-null | force `searchable: false`, add `dish_or_cuisine` |
| `intent !== find_restaurant` ⇒ `searchable: false` | force |
| Every `negation[].value` is not copied into `sensory[].value` equal-ignore-case | strip from `sensory` (A9 mechanical guard) |
| `city_label` does not appear as `anchors.substyle.value` solely because it was the search city | if substyle equals `city_label` and the memory text does not contain that city, null the substyle |
| A11: memory contains 湖南 / Hunan and request city is not Hunan → `substyle` must be Hunan-ish and Places query must not use Hunan | **release blocker** — fail the harness, do not ship |

### 2.2 A11 — origin ≠ location

Request: `memory_text = "我外婆在湖南的厨房做的番茄炒蛋"`, `city_label = "Boston, MA"`.

| Field | Required |
|---|---|
| Search | Boston (Places `locationBias` / geocode of Boston) |
| `anchors.substyle` | 湖南 or Hunan |
| `anchors.dish` | 番茄炒蛋 / tomato and egg |
| Places keyword / includedType | must **not** contain 湖南, Hunan, Changsha, 长沙 |

The parser never receives a `location` slot to fill. If a future prompt change adds one, delete it.

---

## 3. Gate

Pure function. No LLM. No I/O.

```ts
function gate(req: HuntRequest, parsed: ParsedEnvelope): "hunt" | "need_clue" {
  const missing: MissingRequired[] = []
  if (!req.city_label && !req.coords) missing.push("location")
  if (parsed.intent !== "find_restaurant") missing.push("intent")
  const hasDish = parsed.anchors.dish !== null
  const hasCuisine = parsed.anchors.cuisine !== null
  if (!hasDish && !hasCuisine) missing.push("dish_or_cuisine")
  parsed.missing_required = missing
  parsed.searchable = missing.length === 0
  return parsed.searchable ? "hunt" : "need_clue"
}
```

`need_clue` → emit `parsed` (so the assumption card can still show nulls) then `need_clue`, then **end the stream**. Log nothing. Call Places zero times.

Optional anchors (`person`, `ritual`, …) never block. Assumptions stay on the card with `?` when `confidence < 0.5`.

---

## 4. Hunt

### 4.1 Stage 1 — Text Search

Inputs the Places API can actually filter:

- keyword: search across `query_variants[]` plus `dish.value ?? cuisine.value` (cap 5). Include `substyle.value` **only if it is not a geographic origin that differs from `city_label`** — for A11, do not pass 湖南
- `includedType` from a small cuisine→type map (fallback `restaurant`)
- `price_band` if present
- location bias: `coords` or geocode(`city_label`)
- radius: `range_mi` in meters
- cap **18**, server-side

Emit `candidates` with polar blips (`08` §3.3). Assign request-scoped ids `c0`…`c17`. Keep `place_id` in handler memory only.

**0 results:** emit `broadened`, drop `price_band` then retry; then drop `dish` and search `cuisine` only. Still inside `range_mi`. If still 0: emit `widen` (`applied: false`) and, if a `fallback_ladder` rung remains, `substitute` (`applied: false`, `relation` required). Do not silently grow radius. One rung at a time.

### 4.2 Stage 2 — Details + websites

- Place Details × N (N≤18), concurrency 6. Pull: display name, types, price, location (for polar), website URI, reviews (≤5) **for display and deterministic match only**.
- Website fetch × top 8 by Text Search rank, concurrency 4, **2.5 s timeout**. Readability extraction → `menu_text`. Failures: empty string, `limited_evidence: true`.

Each Details (or website) landing → `evaluated { id }`. Dog sniffs that id.

**Cheap `eliminated` (deterministic, before Evidence):**

| Rule | Reason string |
|---|---|
| `benchmark` name matches candidate name (case-insensitive, token) | `already tried (benchmark)` |
| types clearly disjoint from cuisine map (e.g. `meal_delivery` only, no food type) | `not a restaurant` |
| `negation` value equals the candidate name | `excluded by name` |

Do not cheap-eliminate for “weak vibe”. That is Evidence’s job.

Reviews: store on the candidate for (a) Google-attributed display, (b) deterministic substring match of `anchor.value` against review text. **Do not put review text in the Evidence LLM payload.**

---

## 5. Evidence

### 5.1 Batched LLM

Prompt: [`../prompts/evidence.md`](../prompts/evidence.md).

Payload per candidate: `{ id, name, places_meta, menu_text }`. No `reviews`.

One call. Dog **waits** (`alert`, still) for the whole call (`08` §1.2).

Zod `EvidenceLlmBatch`. One retry with the validation error. Then degrade.

### 5.2 Byte-verification (correctness gate)

```ts
function byteVerify(quote: string, corpus: string): boolean {
  return Boolean(quote) && quote.trim().length > 0 && corpus.includes(quote)
}
```

| Line source | Corpus |
|---|---|
| LLM `source: website` | that candidate’s `menu_text` |
| Deterministic review | that review’s text body |
| `places_meta` | `JSON.stringify` of the metadata object actually fetched |

**Drop** any line that fails. Never display it. Count drops (in-memory for the request only — NFR-4: do not log the quote or the memory). A single invented quote that reached the UI is a release blocker.

Empty `menu_text` ⇒ LLM evidence array must be empty after verify. Candidate may still score from `places_meta` / review substring matches.

### 5.3 Deterministic review lines (P0, FR-6b)

For each supplied scalar/array value **and each `query_variants` entry**, if `review.text` contains that string (literal, case-insensitive for Latin), emit one `EvidenceLine` with `source: "google_review"`, `mechanism: "deterministic_match"`, required attribution, `denominator: "k of n available reviews"`. Not produced by Gemini. Reviews never enter any model payload.

Website LLM lines use `mechanism: "llm_extracted"`. A candidate with no website can still score from review lines and is labelled `limited evidence`.

### 5.4 Memory Match

Implementation: [`../schemas/score.ts`](../schemas/score.ts).

Rubric groups share a budget; split equally among anchors **the user supplied**. Unsupplied groups are removed from the denominator.

| Group | Budget |
|---|---|
| `dish` | 30 |
| `sensory` + `substyle` | 30 |
| `cuisine` + `direction` | 20 |
| `person` + `setting` + `ritual` + `price_band` + `benchmark` | 20 |

An anchor earns its share iff ≥1 **verified** line cites that `anchor` key. Negations never enter earned or available.

```
earned == 0  →  score = null     // insufficient evidence; no %
else         →  round(100 * min(0.97, earned / available))
```

Never 100. Never emit `0`. Sort: non-null scores descending; `null` last.

If every survivor has `score === null`: emit `widen` (distance door) and/or `substitute` (specificity door) instead of `locked` with fake percentages. A6 / A12.

If at least one non-null score: emit remaining `eliminated` (excluded_by / score null) then `locked`.

---

## 6. Polar conversion

Handler-only. `08` §3.3.

```
φ1, λ1 = center (radians)
φ2, λ2 = place (radians)
a = haversine …
distance_mi = 2 * R_km * atan2(√a, √(1−a)) * 0.621371
θ = atan2(sin(Δλ)cos(φ2), cos(φ1)sin(φ2) − sin(φ1)cos(φ2)cos(Δλ))
bearing = (θ° + 360) % 360
```

Client never sees φ2, λ2.

---

## 7. Harness (Block 1)

**Every parse prompt change re-runs A1–A12.** Cases: [`../schemas/harness-cases.json`](../schemas/harness-cases.json).

Runner (to be built as a CLI, not in this phase): for each case, call Parse + Zod + gate; assert `expect.*`; for A10 assert the test double for Places was **not** invoked; for A11 assert the constructed Text Search keyword/bias does not contain Hunan/湖南/Changsha.

| ID | Gate | Must prove |
|---|---|---|
| A1 | PASS | `person` + family `direction`; demo query |
| **A2** | PASS | **`category_name` ~ East Coast Chinese-American** |
| A3 | PASS | `substyle` Azorean survives; Brazilian in `negation` |
| A4 | PASS | `benchmark` Randy’s |
| A5 | PASS | searchable on dish/cuisine alone |
| **A6** | PASS parse; **Evidence: no % if earned 0** | separate evidence fixture |
| A7 | PASS | `americanized_chain`; no authenticity field anywhere in JSON |
| A8 | PARTIAL | does not block; ritual/setting allowed |
| **A9** | PASS | **bland/soggy in `negation[]`, not in positive `sensory`** |
| A10 | BLOCK | all nulls; `searchable: false`; **zero Places calls** |
| **A11** | PASS | **Boston search, `substyle` Hunan** |
| **A12** | PASS | **`query_variants` searched; two doors with `relation`** |

Hard gate to proceed to Hunt/UI polish: **A2, A6, A9, A11, A12**.

A6 parse can be “Mexican / searchable”. A6’s honesty test is the **score function**: a candidate list with zero verified lines ⇒ `memoryMatch` returns `null` for all ⇒ handler emits `widen`, never `locked` with numbers. Unit-test `memoryMatch` with empty evidence; do not wait for live Toronto data.

### 7.1 Evidence unit tests (no live APIs)

| Test | Input | Expected |
|---|---|---|
| verbatim | quote `"甜口"` in menu `"家常番茄炒蛋（甜口）"` | kept |
| paraphrase | quote `"sweet-style tomato egg"` not in menu | dropped |
| empty menu | LLM returns a quote anyway | dropped |
| earned 0 | anchors with dish+cuisine, no lines | `null` not `0` |
| cap 97 | full coverage | `97` |
| A9 sensory guard | parse sneaks `bland` into sensory | stripped if also in negation |

---

## 8. Latency and fan-out (caps)

| Cap | Value |
|---|---|
| Text Search results | 18 |
| Details concurrency | 6 |
| Website fetches | 8 |
| Website concurrency | 4 |
| Website timeout | 2.5 s |
| LLM calls per hunt | 2 (parse + evidence) |
| Parse retries | 1 |
| Evidence retries | 1 |
| Global hunt rate limit | protect demo quota (exact number at deploy) |

No cache of Places fields. Cost control is these caps.

---

## 9. What “agent” means here

| Phrase | Allowed |
|---|---|
| Product narrative: the hound hunts | Yes |
| Internal names: `parseStage`, `huntStage`, `evidenceStage` | Yes |
| Submission: “three-stage pipeline” | **Required** |
| Agent runtime, tool loop, planner, multi-agent debate | **No** |

The three stages are a division of labour with a frozen NDJSON contract. That is the design.
