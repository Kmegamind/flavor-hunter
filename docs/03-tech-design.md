# Flavor Hunter — Technical Design & Stack Selection

| Field | Value |
|---|---|
| Status | Approved for build |
| Version | v1.0 |
| Date | 2026-08-27 |
| Author | Y. Li |
| Requirements | `02-prd.md` |
| Constraint | Online async-judged hackathon; no database; live APIs only |
| Compliance | Google Maps Platform terms read in full 2026-08-27 — see §11 |
| Frontend | UI layers superseded by `06` / `07` / `09` |
| Diagrams & contracts | `08-system-design.md` is the engineering source of truth. `EventSource` in §2 is superseded: `POST` + `fetch` + NDJSON (`06` §1, `08` §4.3). Prompts in §6 are superseded by `10` + `prompts/` |

---

## 1. Design Constraints

| ID | Constraint | Source |
|---|---|---|
| C1 | No durable data store of any kind | Product decision (NFR-4) + provider terms (NFR-5) |
| C2 | All restaurant data fetched live per query | C1 |
| C3 | API credentials never reach the browser | NFR-5 |
| C4 | Must survive total external failure with a usable screen | NFR-3 |
| C5 | Single developer, pitch/design-strong, moderate coding depth | Team composition |
| C6 | Judging is asynchronous — no live Q&A defense | Competition format |
| C7 | Places content: no caching, no non-Google basemap, no LLM substrate | Verified terms (§11) |

**C5 and C6 together are the dominant constraints.** They mean: minimize the number
of moving parts and vendors; spend the complexity budget where it is *visible*;
prefer boring, well-documented choices over impressive ones.

## 2. Architecture

```
BROWSER (no keys, no persistence)
  │
  │  POST /api/hunt            (memory text, coords)
  │  ← text/event-stream       (SSE: parsed → candidates → eliminations → locked)
  │
  ▼
EDGE / SERVERLESS FUNCTION  ── the only trusted context
  │
  ├─ 1. PARSE ─────────────────────────────────────────────
  │     Claude · structured output → AnchorSet + category name
  │     emits: SSE `parsed`
  │
  ├─ 2. GATE ──────────────────────────────────────────────
  │     required: location, dish_or_cuisine, intent
  │     fail → SSE `need_clue`, terminate (zero downstream cost)
  │
  ├─ 3. STAGE 1 ───────────────────────────────────────────
  │     Places Text Search  (keyword + includedType + price + bias)
  │     cap 18 → emits SSE `candidates`
  │
  ├─ 4. STAGE 2 ───────────────────────────────────────────
  │     ├─ Place Details ×18   (concurrency 6)   → up to 5 reviews each
  │     └─ Website fetch ×8    (concurrency 4, 2.5 s timeout) → menu text
  │     each resolution → SSE `evaluated` / `eliminated`
  │
  ├─ 5. EVIDENCE ──────────────────────────────────────────
  │     Claude · one batched call over all candidates
  │     hard rule: quotations must be verbatim substrings of input
  │     post-check: byte-verify every quote, drop failures
  │     → SSE `locked` (ranked list + evidence + MemoryMatch)
  │
  └─ FALLBACK ─────────────────────────────────────────────
        any stage throws / quota 429 → serve static fixture,
        SSE `degraded`

NO CACHE OF PLACES CONTENT — discarded at end of request (C7 / §11.1)
Retained across requests: place_id only. lat/lng optional, ≤30 days. Nothing else.
```

**Refinement (FR-10) is entirely client-side.** The candidate set with its evidence
is already in browser memory after `locked`; a correction mutates the anchor weights
and re-sorts locally. Zero network. This is deliberate: the most narratively
important interaction has no external dependency.

## 3. Stack Selection

| Layer | Choice | Rationale | Rejected alternative |
|---|---|---|---|
| Framework | **Next.js 15 (App Router)** | One repo holds UI and the trusted proxy (C3). Route Handlers stream SSE natively. Largest documentation surface — matters under C5. | Vite + separate API service — two deploy targets, no benefit here |
| Language | **TypeScript, strict** | The AnchorSet schema is the contract between four stages; static typing catches drift for free | JS — schema drift is the likeliest silent bug |
| Hosting | **Vercel** | Zero-config for the above; preview URLs are the judge-facing artifact | Cloudflare Workers — comparable; chosen against only for Next.js integration friction under time pressure |
| Styling | **Tailwind CSS** | Design iteration speed; C5 says visual quality is where the marginal hour pays | CSS modules — slower iteration |
| Animation | **Framer Motion for DOM only** — the scope is a hand-rolled `requestAnimationFrame` canvas loop | Sheet snapping, assumption rows, evidence expansion and number transitions are DOM work. The sweep, blips and scout sprite are fill-rate work and must not touch React. See `06` §1.1 | Motion driving the scope — per-node overhead, guaranteed jank on mobile |
| Sprites | **Two PNG atlases + JSON** (`hound`, `props`), 32×32 cells, nearest-neighbour | The whole character and blip system in ~2 small files, no animation runtime. `ctx.imageSmoothingEnabled = false` and integer scale multiples are mandatory (`07` §5) | Lottie / an animation runtime — vector tooling for pixel art is backwards |
| Map | **Google Maps JS API + Cloud-based Maps Styling + Advanced Markers**, camera locked during the hunt | Without a basemap the blips carry nothing actionable (PRD FR-6a). Cloud-based Maps Styling delivers the custom dark look inside Google's own renderer — the configuration Sony shipped. Locking the camera during S3 removes overlay/camera sync entirely. | ~~MapLibre / Mapbox GL~~ — **prohibited with Places content** (§3.2.3(e)(i), §14.2); reaching for them inverts the constraint. ~~No basemap~~ — legal under §14.1 but informationally empty |
| LLM | **Claude (`claude-sonnet-5`)** | Two calls only: parse and evidence. Both need reliable structured output and strict instruction-following on the verbatim-quotation rule, which is the product's credibility gate | Smaller/cheaper model — the quotation constraint is exactly where weaker instruction-following costs the most |
| Candidate discovery | **Google Places API (New)** — discovery and structured attributes only | Only viable source with global coverage, dish-keyword text search, `includedType` filtering, and price level in one API. Used for *finding* candidates and for display, not as LLM input (§11.3) | Yelp Fusion — 3 truncated review excerpts, few-hundred/day free cap; P1 supplement only. Reddit API — approval effectively unavailable since 2025-11 |
| Evidence substrate | **Restaurant's own public website** | Not Google Maps Content, therefore free of the §3.2.3(a)(i)/(c)(vii) conflict that applies to Google reviews (§11.3). Also the highest-signal source (§5) | Google review text as LLM input — real terms risk, see §11.3 |
| Menu extraction | **Direct fetch + readability extraction** | Menu language is the highest-signal evidence (§5); a single public page fetch is cheap and needs no vendor | A scraping vendor — cost and a fourth dependency |
| State | **React state + URL params** | Nothing to persist (C1) | Redux/Zustand — unnecessary at this size |
| Store | **None** | C1 + C7 | Postgres/Redis — would violate C1, C7, and the no-persistence claim that is a submission asset |

### 3.1 Deliberate rejections worth defending

**No embeddings at all.** Open Question Q2 is closed: the semantic-similarity term is
**cut**. Memory Match is evidence coverage only (PRD FR-9a). At N ≤ 18 the semantic term
rarely changed rankings, could not be explained to a user, and made the score
unauditable — which undermines the product's central claim. Removing it eliminates an
embedding vendor, a latency stage, and a failure class. No vector database was ever
warranted at this N; with the term cut, no embedding call is needed either.

**No agent framework (LangGraph / CrewAI / ADK).** The pipeline is a fixed
five-stage sequence with no dynamic planning, no tool selection, and no loops. An
agent framework would add a dependency, obscure the control flow, and make the SSE
event contract harder to guarantee. The three "agents" in the product narrative map
to stages 1, 3–4, and 5 — they are real functional divisions, described honestly as
pipeline stages in the code.

> This is the highest-risk-of-criticism decision in the document, so it is stated
> plainly: the multi-agent framing is a description of the pipeline's division of
> labour, not a claim to use an agent runtime. The submission text will say
> "three-stage pipeline" where accuracy matters and will not claim autonomous agents.

**No live Reddit / social scraping.** Rate limits, authentication, and terms make it
the least reliable source, and its contribution is invisible in the demo. Reddit was
used as *research input* (`01-user-research.md`, `04-taste-memory-archetypes.md`) rather
than as a runtime dependency. This distinction is stated in the submission.

**No cache layer.** Not a performance choice — Places terms permit caching only
`place_id` and lat/lng (§11.1). Every other field is fetched per request and discarded.
Cost control is therefore achieved by capping fan-out (NFR-2), not by caching.

## 4. Latency Budget

| Stage | P50 | P95 | Notes |
|---|---|---|---|
| Parse (streaming) | 0.9 s | 2.0 s | First token < 400 ms → radar starts immediately |
| Stage 1 Text Search | 0.4 s | 0.8 s | Single call |
| Stage 2 Details ×18 | 1.6 s | 3.2 s | Concurrency 6 |
| Stage 2 Website ×8 | 1.2 s | 2.5 s | Concurrency 4, hard 2.5 s timeout, failures tolerated |
| Evidence (batched) | 3.5 s | 7.0 s | One call over all candidates; no embedding stage (Q2 cut) |
| **Total** | **~8 s** | **~16 s** | Meets NFR-1 |

**Perceived latency.** The radar begins within 500 ms and receives a genuine event
roughly every 300–800 ms throughout. Elapsed time is displayed (`live · 2.3s`) —
under a live-API architecture this is a differentiator, not an apology, because a
pre-scraped competitor cannot show it.

## 5. Evidence Source Ranking

| Source | Volume per restaurant | Signal quality | Notes |
|---|---|---|---|
| Restaurant website menu | 1 page | **Highest** | Menu language is specific ("家常番茄炒蛋（甜口）"); resolves `dish`, `substyle`, `direction`. Not Google Maps Content — **the only substrate cleared for LLM input** (§11.3) |
| Place Details reviews | **≤ 5** | Medium | Hard ceiling. Matched **server-side by deterministic phrase matching, never sent to the LLM** (§11.3, PRD FR-6b). Displayed with attribution |
| Places metadata | structured | Medium | Reliable for `price_band`, `setting`, `cuisine` |
| Photos | several | Low (unused v1) | Would resolve `setting`/`direction`; P2 |

### 5.1 What Places can and cannot do (verified 2026-08-27)

| Capability | Available? | Source |
|---|---|---|
| Find candidate restaurants from a **dish** keyword | **Yes.** Text Search (New) documents dish-level queries — `"pizza in New York"`, `"Spicy Vegetarian Food in Sydney, Australia"` | [Text Search (New)](https://developers.google.com/maps/documentation/places/web-service/text-search) |
| **Confirm** a restaurant serves a given dish | **No.** There is no menu or dish field of any kind. Only coarse booleans (`servesVegetarianFood`, `servesBreakfast`, …), and those sit in the highest-priced Enterprise + Atmosphere SKU tier | [Place Data Fields](https://developers.google.com/maps/documentation/places/web-service/data-fields) |
| Search menu or review **content** | **No.** Text Search explicitly does not serve "non-geospatial elements," and lists specific menu queries as unsupported | [Text Search (New)](https://developers.google.com/maps/documentation/places/web-service/text-search) |

**This is the load-bearing fact behind the whole architecture: Places gets you to the door;
it cannot tell you what is on the menu.** Confirmation can only come from the restaurant's
own material, which is why the website fetch is P0 rather than an enhancement, and why the
product's claim is "here is the evidence" rather than "this restaurant has your dish."

It also exposes the sharpest risk in the design: small immigrant-run restaurants — precisely
our subject — often have no website, or only a social page, or a PDF, or a photograph of a
menu. Website-only evidence therefore fails hardest exactly where the product matters most.
PRD FR-6b answers this with a second, deterministic matching path over review text.

**The 5-review ceiling is the defining constraint of the evidence design.** It is why
FR-9 states denominators ("2 of 5 available reviews") instead of aggregate counts, and
why the website menu fetch is P0 rather than an enhancement. A design that claimed
"8 reviewers mention home cooking" would require a review corpus this architecture
cannot obtain, and would pressure the model toward fabrication — the one failure that
destroys the product's entire premise.

## 6. Prompt Contracts

Two calls. Both use structured output; both are validated after return.

### 6.1 Parse

```
in:  { memory_text, locale, coords? }
out: {
  intent: "find_restaurant" | "find_recipe" | "find_grocery" | "other",
  category_name: string,            // FR-2 — the named thing
  category_confidence: number,
  anchors: {
    dish: {value, confidence} | null,
    cuisine: {value, confidence} | null,
    substyle: {value, confidence} | null,
    sensory: [{value, confidence}],
    direction: "family_home"|"street_stall"|"restaurant_formal"
             | "diaspora_adapted"|"americanized_chain" | null,
    person, setting, price_band, ritual, benchmark,   // {value, confidence} | null
    negation: [{field, value}]                        // exclusions only
  },
  searchable: boolean,
  missing_required: string[]
}
```
Hard rules in the prompt: absent anchors are `null`, never inferred into a value;
negations go only into `negation[]`; `category_name` must be the most specific label
that is defensible, and its confidence must reflect genuine uncertainty.

### 6.2 Evidence

```
in:  { anchors, candidates: [{ id, name, places_meta, reviews[], menu_text }] }
out: [{ id,
        evidence: [{ anchor, quote, source, source_date?, denominator? }],
        excluded_by?: string,
        semantic_note }]
```
Hard rules: every `quote` must be a **verbatim substring** of the supplied
`reviews[]` or `menu_text`; if no supporting text exists, emit no line for that
anchor. Post-return, the server byte-verifies every quote against the payload and
**drops any line that fails** — the model's compliance is checked, not trusted.

## 7. Failure Modes

| Mode | Detection | Response |
|---|---|---|
| Places quota exhausted | HTTP 429 | Serve static fixture, SSE `degraded`, banner |
| Places returns 0 candidates | empty result | Progressive broadening (PRD §8), each step a visible radar event |
| Website fetch timeout | 2.5 s timer | Skip; candidate scored from Places only; labeled `limited evidence` |
| LLM returns invalid schema | Zod validation | One retry with the validation error appended; then fixture |
| **Fabricated quotation** | byte-verification | **Drop the line.** Never displayed. Counted and logged |
| Places content retained past request | code review + no cache layer exists | Structurally prevented: nothing writes Places fields anywhere (§11.1) |
| Location denied | permission API | Text city input; do not block |
| Total backend failure | catch-all | Radar still completes; fixture served |

**Fabricated quotation is the only failure mode treated as a correctness bug rather
than a degradation.** Everything else has a graceful path; this one is caught
mechanically and silently discarded, because a single invented quote invalidates the
product's central claim.

## 8. Build Plan

| Block | Hours | Deliverable | Gate to proceed |
|---|---|---|---|
| 0 | 0–1 | Repo, deploy, Places key in server env, blank SSE route streaming | A dummy event reaches the browser |
| 1 | 1–3 | Parse prompt + Zod schema + gate logic; CLI harness over all 10 scenarios | 10/10 schema-valid; scenarios 2 and 6 correct |
| 2 | 3–5 | Stage 1 + Stage 2 fetchers, concurrency caps, SSE events | Real candidates and eliminations stream for scenario 1 |
| 3 | 5–8 | Evidence prompt + byte-verification + Memory Match | Every quote verifiable across all 10 scenarios |
| 4 | 8–16 | Radar, assumption card, evidence panel — the visual build | Scenario 1 is demo-quality end to end |
| 5 | 16–18 | FR-10 client-side refinement | Refinement < 100 ms, zero requests, evidence changes |
| 6 | 18–19 | **NFR-3 static fixture + degraded banner** | Works with network disabled |
| 7 | 19–24 | Video, thumbnail, submission copy, sponsor tracks | — |

**Block 1 is the real gate.** Scenarios 2 and 6 exercise category naming and negation
handling; if the parser cannot do those, no amount of visual work saves the project.
Do not begin Block 4 until Block 1 passes.

## 9. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Quota exhausted during judging window | **High** | **Fatal** | NFR-3 fixture; server rate limit; verify current free-tier quotas before publishing the link |
| Evidence too thin (5-review ceiling) | High | Medium | Website menu is P0, not optional; state denominators; accept `no evidence found` |
| Model fabricates quotes | Medium | **Fatal** | Byte-verification with hard drop; part of the 10-scenario regression run |
| Latency reads as broken | Medium | High | Event-driven radar; elapsed-time display; first event < 500 ms |
| Google review text transmitted to a third-party LLM | Medium | **High** | Website menu is the LLM substrate; Places review text is displayed with attribution but not sent to the model (§11.3) |
| Product read as a "listings or directory service" (§3.2.3(d)(iii)) | Low-Medium | High | Memory parsing, gate, and evidence layer are the "substantial, independent value" required by §3.2.3(d); the product does not enumerate or browse listings (§11.4) |
| Two billing SKUs to watch (Places + Maps dynamic loads) | Medium | Medium | Cap fan-out (NFR-2); verify both free tiers before publishing; the static fallback (NFR-3) covers exhaustion of either |
| Builder uses the legacy inline `styles` array instead of a Map ID | Medium | Low | Cloud-based Maps Styling requires a Map ID created in Google Cloud Console — state this explicitly in the build brief |
| Provider terms change | Low | Medium | No retention keeps exposure minimal; re-verify before any public launch |
| Visual polish crowds out Block 6 | **High** | **Fatal** | Block 6 is 20 minutes and is scheduled *before* video production, not after |
| Multi-agent framing read as overclaiming | Medium | Medium | Submission text says "three-stage pipeline"; §3.1 records the decision |

## 10. What Is Deliberately Not Built

| Not built | Reason |
|---|---|
| Database / any persistence | C1; also a positioning asset (§3) |
| Vector database **and embeddings entirely** | N ≤ 18; Q2 closed as cut (§3.1) |
| Any cache of Places content | Prohibited by terms (§11.1) |
| Non-Google basemap with Places content | Prohibited by terms (§11.2) |
| Agent runtime | Fixed pipeline, no dynamic planning (§3.1) |
| Live social scraping | Unreliable, invisible, terms-constrained (§3.1) |
| Auth / accounts | NG2; conflicts with NFR-4 |
| Multi-city pre-indexing | The live architecture makes every city work; pre-indexing would *reduce* generality |

---

## 11. Terms Compliance Analysis (Q1 — CLOSED)

**Status: resolved 2026-08-27 by reading the terms in full.** The answer to Q1 is
**no** — the previously specified cache is not permitted — and two further design
decisions were forced. Sources: Google Maps Platform Terms of Service §3.2.3 and Maps
Service Specific Terms §14 (Places API), §A.3 (Google ID Caching). Terms change; re-verify
before any public launch.

### 11.1 Caching — the cache is removed

> **ToS §3.2.3(b) No Caching.** "Customer will not cache Google Maps Content except as
> expressly permitted under the Maps Service Specific Terms."

> **Service Specific Terms §14.3 (Places API, Legacy and New).** "Customer may
> temporarily cache **latitude and longitude values** from the Places API for up to 30
> consecutive calendar days, after which Customer must delete the cached latitude and
> longitude values."

> **General Service Terms §A.3 Google ID Caching.** "Customer may cache the Google ID
> values from the Services that return such field and allow caching… For example,
> Customer may cache (a) `place_id` from Places API…"

§14.3 is the *entire* express permission for Places. It covers lat/lng and nothing else.
Therefore:

| Field | May retain? |
|---|---|
| `place_id` | Yes, indefinitely (§A.3) |
| latitude / longitude | Yes, ≤ 30 days (§14.3) |
| name, address, reviews, price level, types, photos, opening hours | **No. Not for 10 minutes, not at all.** |

Reinforced by the scraping clause, which names reviews explicitly:

> **ToS §3.2.3(a) No Scraping.** "Customer will not export, extract, or otherwise scrape
> Google Maps Content for use outside the Services. For example, Customer will not:
> (i) pre-fetch, index, store, reshare, or rehost Google Maps Content outside the
> services; … **(iii) copy and save business names, addresses, or user reviews**…"

**Consequences.** (a) The 10-minute in-memory LRU is deleted. (b) The originally
considered "pre-scrape 52 Boston restaurants into a JSON file" approach — rejected
earlier on product grounds — is now confirmed to have been a terms violation, which
retroactively validates the live-API architecture. (c) Cost control must come from
fan-out caps (NFR-2), not caching.

### 11.2 Basemap — MapLibre prohibited; Google's own map selected

> **ToS §3.2.3(e) No Use With Non-Google Maps.** "To avoid quality issues and/or brand
> confusion, Customer will not use the Google Maps Core Services with or near a
> non-Google Map in a Customer Application. For example, Customer will not
> **(i) display or use Places content on a non-Google Map**…"

> **Service Specific Terms §14.2.** "Customer must not use Google Maps Content from the
> Places API in conjunction with a non-Google map."

MapLibre + Places is prohibited by explicit example. **§3 of this document is corrected.**

The escape is in the adjacent clause:

> **§14.1 Use without a Google Map.** "Customer may use Google Maps Content from the
> Places API in Customer Applications **without a corresponding Google Map**."

§14.1 permits a third option — Places content with **no map at all** — and an earlier
revision selected it. **That selection is now reversed** (PRD FR-6a): legal, but the blips
convey nothing actionable without geography, which makes the scope a themed loading screen.

**Selected design: Google Maps JS API with Cloud-based Maps Styling.**

| Piece | Choice |
|---|---|
| Basemap | Google Maps JavaScript API, **Cloud-based Maps Styling** via a Map ID created in Google Cloud Console |
| Candidates | **Advanced Markers** |
| Sweep / scout / pins / lock rings | canvas overlay above the map |
| Camera | **locked during the hunt** — no pan, zoom, rotate, tilt |
| Attribution | rendered, unaltered, unobscured (§15.4) |

Locking the camera during S3 removes the only hard part: over a static map the overlay is a
fixed canvas needing no camera synchronisation. Pan/zoom is enabled at S4 as the sweep fades.

This is the stack Sony shipped for the Spidey Tracker (Maps JavaScript API + Cloud-based Maps
Styling + Advanced Markers) — direct evidence that a fully customised dark stylised map is
achievable *inside* Google's own renderer, since the styling feature exists for exactly that.
Reaching for MapLibre to "escape Google's branding restrictions" inverts the constraint: that
combination is what §3.2.3(e)(i) prohibits.

**Cost note.** Maps JS dynamic map loads bill on a separate SKU from Places. Negligible at
demo volume, but it is a second quota to watch (§9).

### 11.3 LLM input — substrate changed to restaurant websites

Two clauses bear on sending Google review text to a third-party model:

> **§3.2.3(a)(i)** "…pre-fetch, index, store, **reshare, or rehost** Google Maps Content
> outside the services…"

> **§3.2.3(c) No Creating Content From Google Maps Content.** "…Customer will not…
> (vii) **use Google Maps Content to improve machine learning and artificial
> intelligence models, including to train, test, validate or fine-tune the models.**"

Assessment, stated plainly rather than resolved in our own favor: inference is not among
the enumerated verbs in (c)(vii) — "train, test, validate, fine-tune" — so passing review
text to a model at request time to serve the end user is not clearly prohibited by that
clause. But (a)(i)'s "reshare… outside the services" is broad enough to cover
transmitting review text to another vendor's API, and our own 10-archetype regression
suite is literally *testing* a pipeline using Places content. **This is a genuine grey
area and we are not going to pretend otherwise.**

**Mitigation adopted:** the LLM evidence substrate is the **restaurant's own public
website**, which is not Google Maps Content and carries no such restriction. Google review
text is never placed in an LLM request payload.

**But it is still processed — on our own server.** The distinction matters and is stated here
explicitly so nobody later reads FR-6b as an attempt to route around the terms:

| | Status |
|---|---|
| Transmitting Google review text to a third-party model API | **Refused.** This is what §3.2.3(a)(i)'s "reshare… outside the services" plausibly reaches |
| Matching anchor phrases against review text **inside our own request handler**, with no LLM and no egress | **Done.** The content does not leave the service; it is used to serve the end user who requested it, then discarded |
| Retaining any of it | **Never** (§11.1) |
| Displaying it with attribution | **Required** |

The mechanism is deterministic substring/phrase matching, not inference — so it also cannot
fabricate, which makes it the more trustworthy of our two evidence paths (PRD FR-6b). The
two-source design in PRD FR-6 was already the plan; the terms make the website source
mandatory for LLM work and keep review matching on-premises.

### 11.4 Residual risk — "listings or directory service"

> **§3.2.3(d) No Re-Creating Google Products or Features.** "Customer will not use the
> Services to create a product or service with features that are substantially similar to
> or that re-create the features of another Google product or service. **Customer's
> product or service must contain substantial, independent value and features beyond the
> Google products or services.** For example, Customer will not… **(iii) use the Google
> Maps Core Services in a listings or directory service** or to create or augment an
> advertising product…"

A restaurant finder sits near this line. The defense is the clause's own test —
"substantial, independent value… beyond the Google products or services" — which is
exactly what the memory parser, the searchability gate, and the verbatim-evidence layer
provide. The product does not browse, enumerate, or list; it accepts a memory and returns
one hypothesis with proof. Two design rules follow, and they are product rules, not just
legal ones:

- Do not ship a browsable list or directory view of restaurants. **PRD FR-11
  (multi-target view) must be a ranked answer set with evidence, never a browsable
  directory.**
- Never present results without the memory-interpretation and evidence layers attached.

### 11.5 Compliance checklist (verify before publishing the link)

- [ ] No Places field other than `place_id` / lat-lng is written anywhere, including logs
- [ ] No non-Google basemap on any screen displaying Places content
- [ ] Google review text is not included in any LLM request payload
- [ ] Google attribution rendered per Documentation, unaltered and unobscured
- [ ] API key server-side only; not present in any client bundle
- [ ] No browsable directory view
- [ ] Terms re-read at time of publication (they change)
