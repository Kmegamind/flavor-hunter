# Flavor Hunter — Document Index

Last reviewed: **2026-08-27**

Runtime prototype: [`../proto/entry-sim.html`](../proto/entry-sim.html) — open on a phone.

Engineering source of truth for **diagrams and frozen contracts:** [08 System Design](08-system-design.md). Stack rationale and Maps terms stay in [03](03-tech-design.md).

| # | Document | What it settles | Status |
|---|---|---|---|
| 01 | [User Research](01-user-research.md) | 8 findings + 2 sensitivities + the 11-anchor taxonomy, all with verified Reddit citations | **Stable** — findings do not change with design |
| 02 | [PRD](02-prd.md) | 20 numbered requirements (P0/P1/P2), 6 NFRs, 10 scenarios, scope cut line | **Current** |
| 03 | [Tech Design](03-tech-design.md) | Stack rationale, latency budget, **§11 terms compliance**. Prompt sketches superseded by 10 + `prompts/` | **Current** — UI superseded by 06/07/09; diagrams/contracts by 08 |
| 04 | [Taste Memory Archetypes](04-taste-memory-archetypes.md) | The 12-archetype regression suite; A2/A6/A9/A12 are the hard cases | **Stable** |
| 05 | [Product Overview](05-product-overview.md) | One-line definition + all 11 features from the user's side | **Current** |
| 06 | [Frontend Stack & Feature Map](06-frontend-stack-and-feature-map.md) | Mobile stack, **v1.2 pixel handheld chrome**, 9-state overview, component tree | **Current** — Spidey *genre* device, Google dark basemap, no Marvel IP |
| 07 | [Tracker Simulation & Assets](07-tracker-simulation-and-assets.md) | 7 device behaviours, dog↔state mapping, **the asset manifest to produce** | **Current** — on-screen numbers follow 06 §6 |
| 08 | [System Design](08-system-design.md) | Architecture, sequence + swimlanes, polar contract, batched-evidence wait pose, **tradeoff log** | **Current — engineering SoT** |
| 09 | [Frontend Machines](09-frontend-machines.md) | Hunt/Sheet/Settings reducers, illegal transitions, stream client, refine pure function | **Current** |
| 10 | [Pipeline Stages](10-pipeline-stages.md) | Parse / Gate / Hunt / Evidence; byte-verify; A1–A12 harness | **Current** |
| 15 | [Retrieval Redesign](15-retrieval-redesign.md) | Why one memory returns three different restaurants; query fan-out + RRF, the admission rule, and the exclusion taxonomy | **Proposed** — measured, not yet built |

Code contracts (implementation-ready, not the app):

| Path | Contents |
|---|---|
| [`../schemas/index.ts`](../schemas/index.ts) | Zod: `HuntRequest`, `AnchorSet`, `HuntEvent`, `EvidenceLine` |
| [`../schemas/score.ts`](../schemas/score.ts) | `byteVerify`, `memoryMatch`, rubric split |
| [`../schemas/harness-cases.json`](../schemas/harness-cases.json) | Parse expectations A1–A12 |
| [`../prompts/parse.md`](../prompts/parse.md) | Parse system prompt |
| [`../prompts/evidence.md`](../prompts/evidence.md) | Evidence system prompt |

## Decisions closed (do not relitigate)

| Decision | Outcome | Where |
|---|---|---|
| Semantic-similarity term in the score | **Cut.** Evidence coverage only; hand-auditable | 02 §6.3 FR-9a |
| Places content caching | **Prohibited.** Only `place_id` + lat/lng | 03 §11.1 |
| Basemap | **Google Maps JS API + Cloud-based Maps Styling + Advanced Markers**, camera locked during the hunt. MapLibre/Mapbox stay prohibited with Places content | 02 FR-6a, 03 §11.2 |
| ~~No basemap~~ | **Reversed 2026-08-27.** Legal, but blips without a map carry no information — that is a themed loading screen | 02 FR-6a |
| Hunt start | **User confirms the name first.** Zero Places calls before confirmation | 02 FR-2a |
| Dish → restaurant matching | **Places finds candidates; it cannot confirm a dish.** No menu field exists in the API | 03 §5.1 |
| Evidence substrates | **Two mechanisms.** Website → LLM + byte-verify. Google reviews → server-side deterministic match, never in a model payload | 02 FR-6b, 03 §11.3 |
| Dish name variants | **Search romanisations too.** The map's spelling is often not the user's | 02 FR-1 |
| Fallback when nothing qualifies | **Two doors, user picks.** Distance axis or specificity axis. Every substitution states its `relation` | 02 FR-4b-2 |
| Google review text as LLM input | **No.** Substrate is the restaurant's own website | 03 §11.3, 08 §4.4, 10 §5 |
| Agent framework (LangGraph/CrewAI/ADK) | **No.** Fixed pipeline; submission says "three-stage pipeline" | 03 §3.1, 08 §6, 10 §9 |
| Vector DB / embeddings | **No.** N ≤ 18 | 03 §3.1 |
| Authenticity score | **Never.** A large user share wants the non-authentic version | 01 F3, 02 NG5 |
| Refinement must raise the score | **No.** It may fall; forcing a rise is demo theater | 02 §3.1, FR-10, 09 §6 |
| `EventSource` for streaming | **No** — cannot POST. `fetch` + `ReadableStream` | 06 §1, 08 §4.3 |
| Country of origin as a field | **Never required, never logged.** Ask about the food | 01 S1, 02 NFR-4 |
| Regression-suite numbering | **Archetype IDs `A1`–`A12`.** Gates are A2 / A6 / A9 / A11 / A12 | 02 §5, 10 §7 |
| On-screen numbers | **Only if the user can act on them.** Elapsed timer, signal bars, bearing° cut | 06 §6 |
| Animation timing | **Event-driven only.** No fixed timestamps in any timeline | 02 FR-7 |
| The tracked subject | **A pixel-art scent hound.** Never decoration — event-driven only | 02 FR-7a, 07 |
| Search radius | **User setting, not system logic.** Presets 5/10/20/45 mi, default 20; the outer ring *is* the range | 02 FR-4b |
| Automatic widening | **Removed.** Widening is offered as one tap, never taken silently | 02 FR-4b-1, 08 §1.3 |
| Remembering the user's location | **Allowed in `localStorage` only** — their device, their preference. Never our server | 02 NFR-4 |
| Memory origin vs search location | **Two different things.** "湖南" is a `substyle` anchor, never a place to search | 02 FR-4a, 10 §2.2 |
| Evidence LLM vs hunt animation | **One batched evidence call. Dog waits (`alert`, still).** No fake sniff replay | 08 §1.2 |
| Polar coords to the client | **Bearing + distance only.** Never place lat/lng | 08 §3.3 |

## Open items

| Item | Owner | Needed by |
|---|---|---|
| Re-verify Google Maps terms at publication time (they change) | Y. Li | before public link |
| Verify current Places free-tier quotas before publishing the link | Y. Li | before public link |
| Produce `point` and `run` sprite frames — 80% of the visual value | Y. Li | Block F |
| Tune `query_variants` breadth — too many variants multiplies Stage-1 cost | Y. Li | Block 1 |
| Decide how many `fallback_ladder` rungs to offer before reporting no answer | Y. Li | Block 2 |
| Does `direction` need a 6th value for institutional food? | Y. Li | post-hackathon |

## Build order

```
Design    08 contracts frozen  ← this package; do not scaffold the app before this

Backend   Block 1 parser + A1–A12 harness   ← HARD GATE: A2, A6, A9, A11, A12 must pass
          Block 2 two-stage retrieval
          Block 3 evidence + byte-verification + score
Frontend  Block A shell · B scope · B2 scout · C stream client   ← all on fixtures, no backend
          Block D assumption card · E result panel
          Block F lock + point + proximity tone   ← the thumbnail frame
          Block G local re-rank
          Block H reduced-motion · PWA · degraded banner   ← 20 min, protects everything
Submit    video · thumbnail · submission copy · sponsor tracks
```

Backend Block 1 and Frontend Blocks A–C run in parallel once 08 is locked.
