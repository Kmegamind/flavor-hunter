# Flavor Hunter — Remediation Changelog

Baseline before any change: **41 tests passing across 9 files**, `tsc --noEmit` clean.

Plan (from the code review):

| # | Action | Fixes |
|---|---|---|
| 1 | Language layer: verbatim quote + separate translation | F1 (blocker), F2, F4, F5, F6 |
| 2 | Real review denominator | F3 |
| 3 | New Agent ③ — Reason Writer | the missing "soul" |
| 4 | Restaurant dossier — second typographic register | terse-UI complaint |
| 5 | Promote the procedural sprite from title badge to travelling scout | dog that actually hunts |
| 6 | Agent ② — Clue Digger (lexicon + LLM) | "N people said it tastes like home" |
| 7 | Reddit corpus as an evidence source | lets that N reach 7 |

---
## Step 1 — Language layer  ✅

**Principle established: a translation is not a quote.**

| File | Change |
|---|---|
| `schemas/index.ts` | `EvidenceLine.quote_en?` (translation, optional) · `EvidenceLlmItem.quote_en?` · `category_name_native?` on both parse envelopes |
| `schemas/score.ts` | `filterWebsiteQuotes` carries `quote_en` through byte-verification. Only `quote` is verified; a translation is never claimed to be present in the corpus |
| `prompts/parse.md` | `category_name` **must** be English regardless of input language; `category_name_native` added so the user's own words appear as a subtitle rather than being replaced |
| `prompts/evidence.md` | Rule 7 inverted: **quote in the menu's own language**, never translate inside `quote`. New rule 8: supply `quote_en` as a labelled translation; if you cannot translate faithfully, omit it and keep the original — **never invent a substitute sentence** |
| `lib/pipeline/english-labels.ts` | **115 → 48 lines.** Deleted `displayQuote`, `toEnglishLabel`, `preferLatinQuotes`, `englishizeParsed` and the 16-entry `PHRASES` table. Added `readableQuote()` (translation if present, else the verbatim original) and `showsOriginal()`. Kept `directionLabel`, `hasCjk` |
| `lib/pipeline/parse.ts` | Deleted `preferEnglishDisplay()` — the 420-line heuristic no longer overrides Gemini whenever Gemini returns CJK. English now comes from the prompt, which is the right place for it |
| `lib/pipeline/evidence.ts` | `preferLatinQuotes` → new `dedupeEvidence()`: drops exact `(anchor, quote)` duplicates, **keeps every other line**. Website lines sort ahead of review lines. `quote_en` passed through from the LLM |
| `components/Tracker.tsx` | Evidence rows render `readableQuote(ev)` as the reading line, then `translated from “<verbatim>”` plus provenance as a receipt beneath. Same for the expanded quote. Anchor-gap values no longer pass through a translation table |
| `app/globals.css` | `.qsrc` — the receipt line (12px, dim) |
| `tests/english-labels.test.ts` | **Rewritten from locking the drift in to preventing it.** The old suite asserted `hasCjk(displayQuote(...)) === false` — "quotes must not contain Chinese". It now asserts: the fallback is the verbatim original and never the invented sentence; the quote is never altered; only `quote` is byte-verified; a non-verbatim quote is dropped however good its translation |

Fixes **F1** (blocker — fabricated quotations were reaching the UI), **F2**, **F4**, **F5**, **F6**.

## Step 2 — Real review denominator  ✅

`lib/pipeline/review-match.ts` rewritten as two passes.

Before: ``denominator: `${Math.min(lines.length + 1, n)} of ${n} available reviews` `` — where
`lines.length` was a running total of evidence lines across *all* anchors. The third line
printed claimed "3 of 5 reviews" even when only one review mentioned it. A false quantitative
claim: the exact class of error FR-9 exists to prevent.

After: pass 1 counts the reviews that actually contain the phrase; pass 2 emits every hit
stamped with that count. Identical spans collapse (two rows reading the same quote is noise);
**distinct spans for the same anchor are all kept** — which is what makes "3 reviews say it
tastes like home" producible at all.

Fixes **F3**.

**Tests: 41 → 47 passing across 9 files. `tsc --noEmit` clean.**

---
## Step 3 — Agent ③, the Reason Writer  ✅

The pipeline could already find a restaurant and compute a score, but **nothing wrote the
reason** — and the reason is the product. "94%" is a number, not an answer. This was the
single largest gap between the vision and the code.

New files:

| File | Role |
|---|---|
| `prompts/reason.md` | 2–4 sentences, English, plain text. Every factual claim must trace to an evidence line; numbers may only come from a `denominator` or the `score`; **gaps must be named** rather than omitted to make the paragraph read better; no "authentic" as a judgement; no "perfect"/"guaranteed" |
| `lib/pipeline/reason.ts` | `templateReason()` — deterministic floor, assembled from verified lines, works with no API key. `writeReason()` — LLM lift over the same material. `guardReason()` — rejects prose asserting unsupported quantities. `withoutQuotedSpans()` |

**`guardReason` is the point of this module.** Prose is the easiest place in the system to
smuggle in a claim nobody verified, and it is exactly where "seven people said it tastes like
home" would appear when one did. The guard allows only numbers found in the evidence
denominators or the score, checking digits *and* spelled-out words.

One real false positive surfaced while testing and was fixed: the guard flagged its own
template output, because a quoted review — *"tastes like the one my mom made"* — contains the
word "one". Verbatim quotations are already byte-verified, so `withoutQuotedSpans()` now strips
them before the numeric check. **The guard polices the writer's assertions, not the evidence it
cites.**

Wiring: `schemas/index.ts` gains `RankedCandidate.reason?` and `reason_source?`
(`written` | `template` | `none`). `lib/pipeline/run-hunt.ts` gains `attachReasons()`, called
just before `send({ type: "locked" })` — **top candidate only**, so this is one extra call per
hunt, not one per candidate.

`tests/reason.test.ts` — 12 new tests, including that an inflated count is rejected, that the
template passes its own guard, that no evidence yields `Not enough evidence to say why.` rather
than an invented paragraph, and that the quotation boundary works in both directions.

## Step 4 — Dossier register  ✅

The scope is an instrument: monospace, terse, 11–12px. That is correct for the hunt and wrong
for the answer — compressing the evidence to fit the pixel aesthetic was costing the user the
information they came for.

| File | Change |
|---|---|
| `components/Tracker.tsx` | New `Why this one` section rendering `locked.reason`, above the evidence list |
| `app/globals.css` | `.reason` — 16px, line-height 1.65, `62ch` measure. `#evs .ev` gains real padding and a rule between rows; `#evs .qline` up to 15px. Token names corrected to this project's actual set (`--hi`, `--mute`, `--grid`, `--reject`) |

**Tests: 47 → 59 passing across 10 files. `tsc --noEmit` clean. `next build` clean, 120 kB
First Load JS (budget is 200 kB).**

---
### Step 4 addendum — the pixel fonts have no CJK glyphs

Applying the dossier styles surfaced a second problem the first pass would have shipped:
`app/globals.css` sets `font-family: var(--font-vt)` on `body`, and both loaded faces are
pixel fonts (VT323, Press Start 2P). Neither carries **any** CJK glyph — so the verbatim
non-Latin quotes that Step 1 just wired in would have rendered as tofu boxes. 16px prose in a
pixel monospace is also not readable prose.

Added `--font-read`: a system stack including `PingFang SC` / `Hiragino Sans GB` /
`Microsoft YaHei`. Zero bytes over the wire, native CJK coverage. Applied to `.reason`,
`#evs .qline`, and `.qsrc` — the three dossier surfaces. The instrument keeps its pixel fonts.

`next build` clean, First Load JS unchanged at 103 kB shared.

---
## Step 5 — The scout travels the field  ✅

`ScopeSnapshot` already carried `pose`, `flip`, `collar`, `sniff_id`, `wait` and `locked_id` —
the scout had been **designed into the contract and then removed from the renderer**. It
survived only as a fixed 48×36 badge in the title bar, whose own comment read *"it does not
travel on the map."* That is the literal drift the review was pointing at: the dog that hunts
had become a logo.

| File | Change |
|---|---|
| `components/RadarCanvas.tsx` | Imports `blit` from `lib/hound-pixels`. New refs `scoutRef` (eased canvas position), `runFrameRef` / `runClockRef` (8-frame run cycle at ~12 fps). A scout block after the blip loop derives its destination from **real stream state** — the blip being sniffed, else the locked one, else the centre — eases toward it, and blits the pose |

Three details that follow the spec rather than looking nice:

- **`snap.wait` holds the pose instead of running.** PRD FR-7a: the visual layer may not
  animate through work the system is not doing. A dog trotting happily while the backend
  stalls is the same class of dishonesty as a fabricated quote, only more charming.
- **`prefers-reduced-motion` snaps to the destination** and never plays the run cycle; the
  pose alone carries the state.
- Position is rounded to whole device pixels before `blit`, and scale is an integer
  (`max(2, round(R/120))`) — sub-pixel placement shimmers under nearest-neighbour scaling.

`next build` clean. Tests 59/59.

---
## Step 6 — Agent 2, the Clue Digger  ✅

`review-match.ts` could only find phrases the user had already typed — it took each anchor's
`value` and looked for that substring. A user who wrote "sweet" got matches on "sweet". The
thing the product exists for, finding the review that says *"tastes like the one my mom made"*
when the user never wrote those words, was **structurally impossible**.

| File | Change |
|---|---|
| `lib/pipeline/clue-lexicon.ts` (new) | A vocabulary of ~50 phrases taken from the research corpus — nostalgia (`reminds me of home`, `my mom made`, `my grandmother's`, `my nonna`, `my halmoni`, `my lola`), venue (`hole in the wall`, `mom and pop`, `strip mall`), approximation (`closest thing to`, `almost authentic`), operator origin (`the owner is from`, `grew up in`). Gated two ways: only fires for anchors the user actually supplied, and direction-specific entries only fire for that direction |
| `lib/pipeline/review-match.ts` | `clueNeedles()` appended to the phrase set. New `expandToClause()` |

Two corrections surfaced while building it:

**Needles had to match how people actually write.** `"like my mom"` never matches *"tastes like
the one my mom made"* — the substring is not present. Replaced with the observed forms:
`my mom made`, `my mom's`, `my grandmother used to`.

**Quotes were fragments.** A needle-length span turned a match on `home-style` into the quote
"home-style", when what the reader wants is the sentence. `expandToClause()` grows the match to
its surrounding clause, stopping at `. ! ? ; \n` and capped at 110 characters. The result is
**still a literal slice of the review**, so byte-verification is untouched — only the window
changed.

This also changed a Step-2 test expectation, correctly: two reviews containing the same dish
name now yield two distinct readable clauses rather than collapsing to one, and both carry the
true `2 of 5` count. Better outcome; the earlier assertion was an artifact of narrow spans.

Why deterministic rather than an LLM call: Google review bodies must not be transmitted to a
third-party model (§11.3), matching runs inside our own handler, and substring matching is
**verbatim by construction** — it cannot fabricate. The LLM half of Agent 2 continues to work
on the restaurant's own website text, where no such restriction applies.

`tests/clue-digger.test.ts` — 6 new tests, including that the clause stays inside its sentence
boundaries, that unsupplied anchors stay silent, and that street-stall vocabulary does not leak
into a home-cooking query.

**Tests: 59 → 65 passing across 11 files. `tsc --noEmit` clean. `next build` clean.**

---
## Step 7 — The Reddit corpus as an evidence source  ✅

The product's flagship claim was always shaped like *"N people said it tastes like home"*.
Google Place Details caps at five reviews, so that sentence was **never reachable from Google
alone** — a five-review ceiling cannot produce a seven-person chorus, and pretending otherwise
is exactly the pressure toward fabrication the whole design refuses.

But that sentence is precisely what the city subreddits contain. The recurring
*"Immigrants of <city>: which restaurant has the best version of your country's food?"* threads
are, structurally, a restaurant → "tastes like home" mapping written by the people who would
know.

| File | Change |
|---|---|
| `schemas/index.ts` | `EvidenceSource` gains `"reddit"`. `EvidenceLine.source_url?` — a permalink, so any line is checkable |
| `data/reddit-corpus.json` (new) | 11 entries across 6 cities, every quote verbatim, every one carrying subreddit, thread title, permalink and upvote count. All verified against the live threads during this session |
| `lib/pipeline/reddit-corpus.ts` (new) | `loadCorpus`, `namesMatch`, `mentionsFor`, `redditEvidence`. Anchored to `substyle` — what a thread corroborates is not that a dish exists, but that people from that food culture consider this the version worth naming |
| `lib/pipeline/evidence.ts` | Reddit lines join website + review lines; `dedupeEvidence` ranks website → places_meta → reddit → google_review. `scoreCandidates` takes `cityLabel` |
| `lib/pipeline/run-hunt.ts` | Passes `req.city_label` through |
| `components/Tracker.tsx` | `sourceKind()` labels the row `reddit`; the receipt line becomes a permalink (`r/boston ↗`) when `source_url` is present |
| `scripts/harvest-reddit.ts` (new) | Offline harvester, `npm run harvest`. Reads the eight verified threads via the agent-reach CLI and **proposes** rows marked `_needs_review: true` |

Three properties worth naming:

- **Not Google Maps Content**, so none of the §11.3 constraints apply.
- **Quoted with attribution and a permalink** — the credibility argument gets stronger, not
  weaker, because a judge can click through and check.
- **Reddit is not a runtime dependency.** The API's approval gate and rate limits never touch a
  request; the corpus is a static file.

Matching is deliberately strict, because a false *"3 Redditors named this place"* would be worse
than no line at all: names must clear a 5-character floor and match on word boundaries. Tests
cover the failure directions specifically — `Natasha's Kitchen` must not match `Natas`,
`Republic Cantinas Grill` must not match `Republican`, `Pho` is too short to match at all, and a
Boston mention is not evidence for a Chicago restaurant.

The harvester proposes rather than writes, and the reason is in its header comment: restaurant
names inside free-form comment prose are exactly what a heuristic gets subtly wrong, and these
quotes ship with permalinks, so a wrong attribution is a correctness bug rather than a cosmetic
one. It stays dumb on purpose; a person accepts each row.

**Tests: 65 → 75 passing across 12 files. `tsc --noEmit` clean. `next build` clean, 103 kB
shared First Load JS.**

---

## Result

| | Before | After |
|---|---|---|
| Tests | 41 / 9 files | **75 / 12 files** |
| Fabricated evidence reachable in the UI | **yes** (`displayQuote` → *"listed on the restaurant website"*) | no — regression-tested |
| Quantitative claims | denominator was a line counter | true per-anchor review counts |
| Aggregate claim (*"N people said…"*) | structurally impossible | produced by Reddit corpus + kept-not-collapsed review lines |
| Non-Latin evidence | stripped, or replaced with invented text | verbatim, with a labelled translation beneath |
| The reason ("the soul") | did not exist | Agent 3 with a numeric guard and a deterministic floor |
| The three agents | 1 of 3 implemented | 3 of 3 |
| The scout | static badge in the title bar | travels the field, event-driven, holds pose while the backend waits |

Still open, by choice: the LLM half of Agent 2 (website/Reddit clue digging beyond the lexicon),
voice input, and expanding the corpus with `npm run harvest`.

## Step 8 — First live run (Washington DC, galette)  ✅ with findings

Ran the real pipeline against real Places + real Gemini for the seeded galette memory, city
`Washington, DC`, range 20 mi. **It works** — and the run surfaced six defects, five now fixed.

### The result

```
MAISON BREIZH        63%  MEMORY MATCH        6.6 mi
1205 Pendleton St, Alexandria

WHY THIS ONE  (written by Agent 3)
  Reviews describe the restaurant bringing Brittany flavors to Alexandria, with one
  reviewer comparing the galettes to those eaten on a recent trip to Brittany. One of
  four available reviews highlights galettes made with a signature crisp, lacy edge.
  No evidence either way on the specific dish menu item itself.

EVIDENCE (4)
  [cuisine]  “Transporting the authentic flavors of Brittany right to Alexandria…”
  [substyle] “Do not miss this yummy and authentic Breton experience”
  [sensory]  “The star of the show was undeniably the galettes—masterfully executed
              with that signature crisp, lacy edge”
  [substyle] “I just returned from a week in Brittany, and these galettes and crepes
              are the real deal”
```

The naming step produced **`Breton Buckwheat Galette`** from a memory that never contains the
word, with `cuisine: French` / `substyle: Breton` correctly separated and
`negation: sweet dessert kind` extracted. A2 and A9 both hold on real input.

### Defects found and fixed

| # | Defect | Fix |
|---|---|---|
| 1 | **The configured model was retired.** `gemini-2.5-flash` returns 404 for new users; every call failed and the pipeline ran on the hardcoded phrase table **for an entire session with no visible symptom** | `gemini-3.6-flash` in `.env.local`, `.env.example`, and `DEFAULT_MODEL` |
| 2 | **Silent fallbacks hid #1.** `geminiGenerate` returned `null` on any non-ok response; `parseOnce` fell back to the heuristic on empty text, missing JSON, schema rejection, or a throw — none logged | Both now log the reason. `[gemini] <model> HTTP <status>` and `[parse] falling back to heuristic: <why>`, including the zod issue list |
| 3 | **Schema rejected valid model output.** Gemini returned `dish: "galette de sarrasin"` (bare string, not `{value, confidence}`), `category_name_native: null`, and omitted `sensory` / `price_band` — so a correct parse was discarded wholesale | `coerceEnvelope()` normalises shape before validation: bare string → `{value, confidence: 0.6}`, missing scalars → `null`, missing arrays → `[]`, explicit `null` on optional strings tolerated (`.nullish()`). `prompts/parse.md` now shows the exact anchor object, and states that `cuisine` is country-level while `substyle` is the region — never `"Breton / French"` in one field — and that a place the memory happened in belongs in `substyle`, not `setting` |
| 4 | **A cuisine word matched the restaurant's own name.** "French" hit *"Emmy French Corner has so many delicious pastries"*, and that noise ranked a pastry shop **above the actual Breton crêperie** | `matchReviewPhrases` takes the candidate name and skips any needle contained in it. MAISON BREIZH went from 44% (rank 2) to 63% (rank 1) |
| 5 | **Agent 3's paragraph was truncated mid-sentence** (`"Two of the five."`) — gemini-3.x spends part of `maxOutputTokens` on thinking | Reason budget 600 → 1500 |
| 6 | **Agent 3's prose arrived wrapped in JSON** (`{"reason": "One of the four…"}`) because `geminiGenerate` always set `responseMimeType: application/json` | `json` flag on `geminiGenerate`, `false` for prose; plus `unwrapProse()` as a defensive unwrap |
| 7 | **The clause window slid.** Two sensory needles inside one review clause produced two near-identical quotes that exact-match dedupe could not collapse, both starting mid-word — the 110-char cap was measured from the needle, so the window moved with it | `expandToClause` walks to real sentence boundaries first with no cap, then truncates at a word break. Same window wherever in the clause the match landed; the duplicate pair collapsed to one |

Two new tests in `tests/clue-digger.test.ts` cover #4 in both directions: the word is ignored for
a place named after it, and still matched for one that is not.

### Open, not fixed — both need a decision

**Latency is ~45 s warm, against a 16 s P95 budget** (`03-tech-design.md` §4). Three timed runs:
47.6 s, 44.3 s, 45 s. The budget assumed one batched evidence call; the run makes a parse call,
18 Place Details calls, website fetches, an evidence call and a reason call. This is a dev
server, but not by 30 seconds. The hunt animation covers some of it honestly — but not 45 s.

**The score is not stable across identical runs.** The same query returned 63%, then 44%, then
44%, with 4 then 3 evidence lines. Part is Places returning slightly different reviews; the
larger part is structural: `rubricWeights` divides each group's budget across *the anchors the
model extracted*, so a run that understands the memory better — finding three sensory details
instead of one — gets a **larger denominator and therefore a lower score**. That is perverse,
and it undermines the auditability claim: a user who reloads sees a different number for the
same memory. Candidate fixes, in order of preference:

1. Cap anchors per rubric group (e.g. at most 2 sensory) so `available` is stable.
2. `temperature: 0` on the parse call — reduces variance, does not remove it.
3. Weight by anchor *kind* rather than by count, so extracting more detail cannot dilute.

### Note on the run

All four evidence lines came from Google reviews; none from the restaurant's website. The
deterministic review path (FR-6b, Step 6) is carrying the whole result here, which is exactly
what it was added for — and it is the path that cannot fabricate.

## Verifying the two-pass parse — and the two bugs it exposed

The second parse pass was suspected dead code: prompt rule 13 now tells the model that a
`The dish or cuisine is: …` line *is* the answer, which should make the first pass succeed and
make a second full parse — two more model calls — unnecessary.

Instrumenting it and running the two-step follow-up flow in production showed something worse
than dead code. It fired on the **initial vague input**, re-parsing `"Missing home food"` against
itself, and did **not** fire on the answered follow-up, which succeeded in a single pass. The
patch was doing the opposite of its purpose: paying for a wasted pass in the case it could not
help, and staying out of the case it was written for.

It now requires the tagged follow-up line to be present and non-vague. No tag, no second pass.

The same instrumentation surfaced two silent failures that had been sending correct parses to
the heuristic phrase table:

- `category_name` was `z.string()`, but a model looking at `"Missing home food."` honestly
  returns `null`. The whole envelope was rejected over it. Now nullish, coerced to `""`.
- `direction` is an enum, so it sat outside the `SCALARS` list that `coerceEnvelope()`
  normalises — it was the one anchor nothing unwrapped. Models wrap it as
  `{value, confidence}` like the others often enough to reject the envelope. Now unwrapped.

Measured against the same two-step flow, before and after:

| | before | after |
|---|---|---|
| step 1, vague input | 19s, envelope rejected, wasted second pass | **7s**, no fallback, no second pass |
| step 2, after follow-up | envelope rejected on `direction` | **12s**, `dish: laab`, `direction: family_home` |

Neither of these had a symptom. The pipeline answered, the answer was plausible, and the only
evidence that it had stopped using the model was a log line that did not exist yet. That is the
second time in this project a silent fallback has run for an extended period — the first was a
retired model id — and both were found only by adding logging to the fallback path rather than
by reading output.
