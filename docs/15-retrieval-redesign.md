# 15 — Retrieval Redesign

**Status:** Proposed — measured, not yet built
**Supersedes:** the Stage-1 candidate construction described in [10 Pipeline Stages](10-pipeline-stages.md) §3
**Depends on:** [03 Tech Design](03-tech-design.md) §11 (Maps terms), [02 PRD](02-prd.md) FR-1, FR-2a, FR-4b-2

---

## 1. Why this document exists

A hunt is supposed to answer the same memory the same way. It does not.

Ten production runs of one identical memory — *"A savoury crepe with a darker, nuttier batter, folded into a square with an egg cracked in the middle. Ate it at a tiny place in Brittany."* — in Washington DC:

| | winner | score |
|---|---|---|
| run 1 | MAISON BREIZH | 81% |
| run 2 | Fontaine Caffe & Creperie | 65% |
| run 3 | Dulce Crepes | 45% |
| runs 4–8 | *no lock — fell through to the substitute ladder* | — |

Five of ten runs produced no answer at all. Three different restaurants won the other five.

This document records what was measured, what caused it, what the industry does about it, and the redesign that follows. Every number below is from a live run against the deployed service or the live Places API — none are estimates.

---

## 2. What was measured

### 2.1 The parse is not deterministic, and temperature is already 0

Five identical parse requests:

| field | distinct values across 5 runs |
|---|---|
| `category_name` *(shown to user)* | 2 |
| `cuisine`, `substyle` *(shown)* | 1 each — stable |
| `sensory` *(shown)* | 4 |
| `setting` *(shown)* | 2 — present in 3 runs, absent in 2 |
| `dish` *(hidden, becomes a search term)* | 3 |
| **`query_variants`** *(hidden, become search terms)* | **5 — all different, one empty** |

Every extraction call already runs at `temperature = 0`. `lib/pipeline/gemini.ts` carries a comment describing this exact failure and presenting `temperature = 0` as the fix; that fix did not work, and the comment made the problem look settled.

**The asymmetry matters more than the variance.** What the user is shown is markedly more stable than what is searched with. A confirmation step therefore cannot surface this: the user would confirm the same dish name in 4 of 5 runs and still receive different restaurants.

### 2.2 A bare `cuisine` query floods the candidate pool

`textSearchVariants` walks the query list **in order**, first-come-first-served, and returns as soon as the pool reaches `CAP = 18`.

```
path A                                     path B
1. buckwheat galette Breton    3 hits      1. galette de sarrasin Breton   1 hit
2. buckwheat galette           3 new       2. galette de sarrasin          0 new
3. French                     18 new  ←    3. French                      18 new  ←
4. galette de sarrasin      never runs     4. buckwheat crepe           never runs
5. galette complete         never runs     5. savoury crepe             never runs
```

`French` — the fallback query for memories that never named a dish — is positioned as a peer of the specific ones. It returns the maximum result count and fills the pool by itself. Queries 4 and 5 never execute, including `galette de sarrasin`, which is the query MAISON BREIZH matches most strongly.

Running all five queries yields **35 distinct places**. The pipeline never sees more than 18 of them.

### 2.3 Stage 1.5 cannot see this kind of noise

`prefilterCandidates` drops a candidate only when it claims a *different* cuisine and not ours. The pool is full of `french_restaurant` bistros, which is the correct cuisine and the wrong dish.

```
path A: 0 of 18 dropped
path B: 0 of 18 dropped
```

### 2.4 The top-8 cut is made on arrival order, not quality

`detailed.slice(0, 8)` selects which candidates get a Place Details call and a website fetch. Arrival order is "which query found it first", which is a property of the parse wording, not of the candidate.

| | candidates in the top 8 found by a dish-level query |
|---|---|
| path A | 6/8 |
| path B | **2/8** |

In path B, seven of eight website fetches are spent on French bistros that cannot produce galette evidence.

### 2.5 The website fetch reads the wrong 9% of the page

`fetchWebsite` strips tags and takes `.slice(0, 8000)`.

```
maisonbreizhva.com    86,024 chars after stripping;  we read the first 8,000  (9%)
                      "galette" appears at char 85,090 — 98.9% of the way in

fontainecaffe.com     38,268 chars;  we read the first 8,000  (20%)
                      "crêpe" appears at char 23,463
```

Restaurant sites are single-page; the menu is at the bottom. Measured across the top 8 of both paths: **0 of 8 website extracts contained `galette`, `buckwheat`, or `sarrasin`.**

### 2.6 Consequence: the evidence LLM contributes nothing

A live hunt, all evidence lines for the top three candidates:

```
Fontaine Caffe & Creperie  65%   {'google_review': 5}
Dulce Crepes               45%   {'google_review': 2}
MAISON BREIZH              35%   {'google_review': 3}
```

Every line came from `review-match.ts` — deterministic substring matching over Google review text. The website LLM path produced **zero**. It was being fed page headers and cookie banners.

---

## 3. Prior art

The fix is a named, standard technique. Two framings:

**Query fan-out.** Google's own description of AI Mode: *"issuing multiple related searches **concurrently** across subtopics and multiple data sources and then brings those results together."* Our implementation is the inverse — sequential, with early termination.

**RAG-Fusion** ([Raudaschl/rag-fusion](https://github.com/Raudaschl/rag-fusion), 953★) — multi-query generation plus Reciprocal Rank Fusion. Its stated preconditions match this product on all three:

1. *Terminology mismatch between user queries and indexed text* — "darker, nuttier batter" vs `galette de sarrasin`
2. *Recall matters more than precision* — missing MAISON BREIZH costs more than carrying a marginal bistro
3. *Downstream can handle topically-broad context* — we have an evidence stage and a multi-candidate UI

Its own strong-fit example is this product's shape: long-tail retrieval where the user describes rather than names.

**Reciprocal Rank Fusion** is the fusion method, per Elasticsearch:

```
score(d) = Σ over queries  1 / (k + rank(d))          rank starts at 1, k = 60
```

Two independent sources warn against hand-tuned weights. Elastic: equal weighting *"removes the need to figure out what the appropriate weighting is using linear combination."* Assembled, who tried weighting first: score distributions were unknown and per-customer tuning did not scale; they moved to RRF for *"simplicity and minimal tuning."*

An earlier draft of this redesign proposed hand-tuned role weights. It was discarded on this evidence, and on measurement — see §5.1.

**Menu extraction has no prior art.** GitHub yields only 0–1★ single-purpose scrapers. §4.4 is therefore unvalidated by anyone else's experience and must be proven by our own measurement.

---

## 4. The redesign

Four changes. Each addresses one distinct failure above; none of them touches the parse.

### 4.1 Fan out concurrently, run every query

Issue all queries at once and merge. No early termination.

Fixes §2.2 (queries that never execute). Expected to *reduce* latency: three sequential round trips become one concurrent batch.

### 4.2 Fuse with unweighted RRF, k = 60

Rank the merged pool by `Σ 1/(60 + rank)`. A place found by several queries outranks one found by a single query.

Fixes §2.4 (no quality signal at the top-8 cut).

### 4.3 Admission rule: dish-level queries admit, cuisine queries only boost

A candidate may enter the pool only if at least one **dish-level** query returned it — the primary query, the dish, or a `query_variant`. A **cuisine** query contributes to the RRF score of a candidate already in the pool, but cannot by itself put one there.

Fixes §2.2 (cuisine flooding) **without discarding the cuisine signal**, which §5.2 shows is the decisive discriminator in a different case.

### 4.4 Extract menu text by anchor neighbourhood, not by prefix

Keep the full stripped page in memory. Locate occurrences of anchor-relevant terms and extract a window around each. Fall back to the current prefix behaviour when no term appears.

Fixes §2.5. Costs no additional network request, is deterministic, and produces *shorter* input than today's 8,000-character prefix.

Optional follow-up, only when the homepage yields no anchor term: try `/menu`. This one does cost a request and should be conditional.

### 4.5 Apply exclusions during retrieval, not after scoring

Today `markExcludedCandidates` runs *after* `scoreCandidates`. `prefilterCandidates` does not reference `negation` at all. The consequence is that we pay for Place Details, a website fetch, and evidence extraction on candidates the parse already knew the user had ruled out.

Which exclusions can act at which stage is not uniform. See §5.3.

---

## 5. Evidence for the design decisions

### 5.1 Unweighted RRF captures nearly all of the benefit

Candidates in the top 8 found by a dish-level query:

| | path A | path B |
|---|---|---|
| current (sequential, stop at 18) | 6/8 | **2/8** |
| unweighted RRF, k=60 | 7/8 | **8/8** |
| RRF + hand-tuned role weights | 8/8 | 8/8 |

The weighting adds one candidate on one path. Given §3's two independent warnings about weight tuning, that is not worth the tuning surface. The remaining gap is closed structurally by the admission rule (§4.3), which is a rule about query *kind*, not a tuned number.

### 5.2 Why the cuisine signal must be kept

The Lao archetype — *"laab and sticky rice, but not a Thai restaurant with a couple of Lao dishes on the menu"* — is the case where cuisine is the discriminator. In DC, much Lao cooking is sold under Thai signage.

Cross-referencing dish and cuisine queries separates them cleanly:

```
matched laab AND a Lao query    →  Laos in Town · Thip Khao · Padaek Arlington Ridge
                                   (the three genuine Lao restaurants in DC)

matched laab only               →  SURA · Tiki Garden · Thai Chef Street Food · …
                                   (all typed thai_restaurant)
```

A rule of the form "drop the cuisine query when a dish exists" would discard exactly this. Hence §4.3 admits on dish and boosts on cuisine, rather than dropping either.

*Incidental finding:* the bare query `Lao` returns **zero** Places results. The usable cuisine signal came from the variant `Lao food`. Query breadth is a property of the string, not of which anchor field produced it.

### 5.3 Exclusions divide by what a venue can have one of

This is the substantive refinement to §4.5, and the reason a single "apply the negation" step is wrong.

**A restaurant has exactly one cuisine. It serves many flavours.** Therefore:

| `negation.field` | Earliest usable stage | Mechanism | Action | Why |
|---|---|---|---|---|
| `cuisine` | candidate pool | Places `types` | **Drop** | A venue has one cuisine; excluding it excludes the venue |
| `direction` | candidate pool *(partial)* | Places `types` | Demote | No Places type expresses "chain-like"; signal is weak |
| `sensory` (sweet / savoury) | evidence | menu text, review substring | **Demote only** | A crêperie sells sweet *and* savoury; dropping it loses the answer |
| `dish` (a near-miss dish) | confirmation UI + ladder | user confirmation, `fallback_ladder` | **Never filter** | Excluding "crepe" would delete every crêperie, including the ones serving galettes |
| `setting`, `person`, `ritual` | evidence | review substring | Demote | Not expressed in any structured field |

**The rule: drop only on properties a venue can have exactly one of. Demote on everything else.**

This answers the flavour case directly. Sweet-versus-savoury cannot be resolved at retrieval — Places exposes no flavour field — and it must not be resolved by dropping, because the same kitchen serves both. It belongs in evidence, where menu text and review text can support or contradict it, and where its effect is on the score rather than on survival.

It also reclassifies near-miss dish exclusion. That one *feels* like a filter and must not be one; it is already handled correctly by `fallback_ladder`, which offers the near miss as a labelled substitute instead of presenting it as the answer.

### 5.4 Measured effect of exclusion-at-retrieval

Lao case, top 8:

| current — exclusion applied after scoring | exclusion applied at the candidate pool |
|---|---|
| 1. Laos in Town | 1. Laos in Town |
| 2. Sabai Thai-Lao Dining *(excluded)* | 2. doi moi |
| 3. Thai Chef Street Food *(excluded)* | **3. Thip Khao Restaurant** |
| 4. Beau Thai *(excluded)* | **4. Padaek Arlington Ridge** |
| 5. Rice Restaurant *(excluded)* | 5. Rice Market |
| 6. ZomTum *(excluded)* | 6. Indochine Cuisine |
| 7. doi moi | 7. Bandoola Bowl |
| 8. Donsak Thai *(excluded)* | 8. Baltimore Lao Eats |

Candidates in the top 8 that the user had already excluded: **6/8 → 0/8**. All three genuine Lao restaurants now appear; Thip Khao, DC's best-known Lao restaurant, could not previously reach the top 8 at all.

**Regression risk.** An over-broad exclusion match has already caused a production failure once: matching the whole clause *"Thai restaurant with a couple of Lao dishes"* dropped `cuisine: Lao`, and the hunt locked a Korean restaurant at 43%. §4.5 must therefore be narrow:

- act only when `negation.field` is `cuisine` (or `direction`), and
- only when the exclusion's head maps to a known Places type in `CUISINE_TYPES`, and
- keep the existing safety valve: if the filter would empty the pool, return the pool unfiltered.

---

## 6. Confirmation step: expand the dish into an explanation

The confirmation gate exists today (PRD FR-2a, the `confirmed` flag). Today it shows a name. It should show a short explanation of what that dish *is*.

> **Breton Buckwheat Galette** · *galette de sarrasin*
> A savoury pancake made from buckwheat flour — darker and nuttier than a wheat crêpe — folded into a square, classically with ham, egg and cheese.
> *Not the same as a sweet crêpe, which is made from wheat flour.*

Three things this earns:

1. **The user can reject a wrong reading before we spend the search budget.** Today a misinterpretation is only discovered after 28 seconds and a full retrieval.
2. **It gives the user the search term.** Someone who could only say "a savoury crepe" leaves knowing the word *galette* — useful independently of whether our results are good.
3. **It is the right home for near-miss exclusion.** Per §5.3, "not a sweet crêpe" must never become a retrieval filter. Stating the distinction in the confirmation is how the user gets that assurance without the algorithm acting on it destructively.

**What it does not do.** It does not address §2.1. The displayed name is stable in 4 of 5 runs while the underlying search terms differ in 5 of 5, so a user confirming the same name can still receive different restaurants. Presenting confirmation as a determinism fix would be misleading; it is a comprehension and consent feature.

---

## 7. What this redesign does not fix

Parse instability (§2.1) is untouched. Expected effect on run-to-run agreement, measured: overlap of the top 8 between the two parse paths rises from **1/8 to 3/8** — better, not solved, because the fan-out queries themselves still vary with wording.

The failure mode does improve in kind. Today the choice is between *MAISON BREIZH at 81%* and *no answer at all*. After the redesign both paths return 8/8 dish-relevant candidates, so variation is between defensible answers rather than between an answer and a dead end.

Stabilising the parse is separate work, with its own decision to make (caching by memory text vs. prompt rules that make optional-anchor extraction non-optional). It is tracked in [12 Changelog](12-changelog.md) under the scoring-instability finding.

---

## 8. Acceptance criteria

Run the galette memory 5× per parse path, and the Lao memory 5×, against the deployed service.

| Metric | Today | Target |
|---|---|---|
| Top-8 candidates found by a dish-level query | 2/8 (path B) | ≥ 7/8 both paths |
| Top-8 candidates the user excluded (Lao) | 6/8 | 0/8 |
| Website extracts containing an anchor term | 0/8 | ≥ 3/8 |
| Evidence lines from the website path | 0 | > 0 |
| Runs producing no lock | 5/10 | ≤ 1/10 |
| Stage-1 latency | 3 sequential round trips | 1 concurrent batch |

The final row of §2.6 is the honest test of §4.4: if anchor-neighbourhood extraction does not move website-sourced evidence off zero, the evidence LLM call is not earning its latency and should be reconsidered against deterministic matching over the same text — `clue-lexicon.ts` already does exactly that for reviews.

---

## 9. Open questions

1. **Does the evidence LLM survive §4.4?** Testable, not a matter of opinion: run identical inputs with and without it and compare evidence yield. Its unique capability is semantic bridging (`blé noir` → buckwheat; a menu in Chinese), which a phrase table cannot do. If the yield is equal, dropping it removes a call, roughly 5 seconds, and one fabrication surface.
2. **Is `CAP = 18` still the right pool size** once membership is decided by RRF rather than by arrival order? Fan-out surfaces 35 distinct places for the galette memory.
3. **Should the cuisine query run at all when a dish exists?** Under §4.3 it can no longer admit candidates, so its only cost is one API call and its only benefit is the boost signal. Measure whether the boost changes the top 8.
