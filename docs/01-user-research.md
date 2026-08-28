# Flavor Hunter — User Research Report

| Field | Value |
|---|---|
| Status | Final v1.0 |
| Date | 2026-08-27 |
| Author | Y. Li (li.y63@northeastern.edu) |
| Method | Qualitative analysis of public Reddit discourse |
| Tooling | `agent-reach` v1.5.0 → OpenCLI Reddit backend |
| Reviewers | — |

---

## 1. Executive Summary

We analyzed public Reddit threads in which people search for food that matches a
remembered taste. The dominant finding is that **users do not describe cravings the
way search engines expect. They describe memories, and they are frequently unable to
name the thing they want.**

Five findings have direct product consequences:

1. **Users often cannot name their own target category.** In one thread, the author
   discovered from commenters that the food he had been hunting for is called
   "East Coast Chinese-American," and edited his post to say so. Naming the category
   is itself the valuable act.
2. **"Closest," not "best," is the user's native metric.** Across four cities and six
   cuisines, users spontaneously phrase results as approximations to a remembered
   original. Our scoring metric should adopt the users' own vocabulary.
3. **"Authentic" is the wrong axis.** A material share of demand is for the
   *non-authentic* version (regional American-Chinese, hometown-specific chains).
   Ranking by authenticity would invert these users' intent.
4. **Memory anchors are frequently non-culinary** — price band, venue type, staff
   language, packaging, giveaways, background music.
5. **Users are already building this product by hand.** A 1,152-upvote LA thread was
   manually compiled by a commenter into a shared Google Map.

One significant sensitivity was identified: asking immigrants to self-identify by
country of origin triggers surveillance anxiety (§6).

## 2. Research Questions

| ID | Question |
|---|---|
| RQ1 | In what situations does taste memory become an active search need? |
| RQ2 | What information do users volunteer unprompted, and what is systematically missing? |
| RQ3 | What vocabulary do users use to describe a match? |
| RQ4 | What evidence do users themselves cite when validating a recommendation? |
| RQ5 | What are the failure modes of existing tools (Google, Yelp) from the user's perspective? |

## 3. Methodology

- **Instrument:** `agent-reach` v1.5.0, OpenCLI Reddit backend (authenticated
  browser session, read-only).
- **Sampling:** Purposive keyword sampling across 11 query formulations, followed by
  snowball sampling from cross-references inside high-engagement threads.
- **Corpus:** 9 threads read in full, comment trees included. Aggregate engagement:
  ~3,100 upvotes, ~1,100 comments. Subreddits: r/AskNYC, r/FoodNYC, r/washingtondc,
  r/AskLosAngeles, r/SeattleWA, r/chennaicity, r/Cooking, r/hackathon.
- **Verification:** Every citation below was independently re-fetched and its score
  confirmed at time of writing. Scores are point-in-time and will drift.
- **Analysis:** Open coding of verbatim phrases → axial coding into the anchor
  taxonomy (§5).

### 3.1 Limitations

- **Platform bias.** Reddit skews young, English-speaking, and Western-urban.
  Findings should not be read as representative of all immigrant populations.
- **Self-selection.** People who post are people who have already failed to find the
  food. Prevalence of the problem is not measurable from this corpus.
- **No quantitative validation.** N=9 threads supports pattern discovery, not
  effect sizes. No survey or interview data was collected.
- **One weak citation.** r/washingtondc `1qwvk75` (score 2) is retained as an
  illustrative quote only and is explicitly **not** treated as a demand signal.
- **Recency skew.** Scores were captured on 2026-08-27.

## 4. Findings

### F1 — Users cannot name their own target category
**Confidence: High.** Direct behavioral evidence, not self-report.

A Seattle user requested "violently American chinese-american food… bright yellow
fried rice and bright red char siu… CRAB rangoons (not just cream cheese)." He then
edited the post:

> "Edit: hi, all! thanks to some lovely redditors in this thread, i have found out
> that what i'm looking for is 'East Coast Chinese-American' food, which makes sense
> since i'm from the east coast!"

*Source: r/SeattleWA `14sv2gn`, 144 upvotes, 186 comments.*

The thread also demonstrates that users discriminate far more finely than category
labels allow. On one recommendation: *"this is more like mall-food court chinese
food. yes there is a difference."*

**Product consequence:** The system's first output must be a **name for the category**,
not an attribute list. This is the single highest-value moment in the experience.

### F2 — "Closest," not "best," is the native metric
**Confidence: High.** Convergent across cities, cuisines, and user origins.

| Verbatim | Source |
|---|---|
| "the closest 'torta ahogada' I've found" (Guadalajara → NYC) | r/AskNYC `10hu54r`, 846 |
| "Randy's in the village is **close but not quite** there… closer to frosted bread" (LA → NYC, Cambodian donuts) | r/FoodNYC `1vyrpgo`, 139 |
| "not 100% authentic, but it's **the closest I can come** to Azorean/Portuguese (the country not Brazil)" | r/AskLosAngeles `1du8cjy`, 1152 |
| "Republic Cantina is **the closest** to the TexMex I had there. The tortillas are legit." | r/washingtondc `1qwvk75`, 2 |

**Product consequence:** Adopt "Memory Match %" as the primary metric. It is a
translation of existing user language, not a new invention. Never display 100% —
users themselves never claim a perfect match.

### F3 — Authenticity is the wrong ranking axis
**Confidence: Medium-High.**

Demand runs in both directions from "authentic":

- *Toward* hyper-regional authenticity: "somewhere between Sichuan and Thai cuisine…
  fresh mint as an herb. It's a distinctive Yunnanese touch." (r/FoodNYC `1vyrpgo`)
- *Away* from it: the Seattle request for deliberately Americanized Chinese food
  (F1); "esquites reminded me of the street vendors in Mexico City"
  (r/washingtondc `t1buwg`, 287).

Sub-national precision is routine and often finer than any cuisine taxonomy:
*Azorean* (not Portuguese), *Yunnanese* (not Chinese), *Tapatío/Guadalajara*
(not Mexican), *East Coast Chinese-American* (not Chinese-American).

**Product consequence:** Replace an `authenticity` score with a `direction`
enum — the specific *version* being sought:
`family_home` · `street_stall` · `restaurant_formal` · `diaspora_adapted` ·
`americanized_chain`.

### F4 — Memory anchors are frequently non-culinary
**Confidence: High.** Present in every thread read.

| Verbatim | Anchor type |
|---|---|
| "Missing my Chula Vista joint that gave you free pickled veggies and an Azulita beer if you bought three or more" | ritual / giveaway |
| "They even have a band of rum he'd only see back home, and live music from a regular performer whom he grew up listening to back in Nepal" | atmosphere / music |
| "What I'd give for a maple bar in a pink donut box out of a hole in the wall with a neon donut sign" | packaging / signage |
| "it's out in a gas station in Gaithersburg and it's legit, owned and ran by a couple of chilangos" | venue type / operator origin |
| "you end up paying $20 for three of them and some terrible refritos" · "$4 tacos" | price band |
| "Chipotle is tastier than this place" | chain benchmark |

*Sources: r/washingtondc `t1buwg` (287); r/AskNYC `10hu54r` (846); r/FoodNYC `1vyrpgo` (139).*

**Product consequence:** The anchor schema must include non-taste fields (§5).
Operator origin and venue type are also the most *verifiable* fields available from
public sources, which makes them doubly valuable for evidence generation.

### F5 — Users describe the target negatively first
**Confidence: Medium.**

> "Had very high expectations, left very disappointed. Tacos were bland and soggy,
> and tortillas were weird." — r/washingtondc `t1buwg`
>
> "Donut scene is pretty bleak out here, closer to frosted bread." — r/FoodNYC `1vyrpgo`
>
> "I don't want Americanized Chinese food." (paraphrase of a recurring pattern)

**Product consequence:** The parser must map negations to *exclusion* constraints.
Treating "not too sour" as a positive signal for sourness is the most likely
silent failure mode.

### F6 — Users are manually building this product
**Confidence: High.** Strongest available demand evidence.

r/AskLosAngeles `1du8cjy` (1,152 upvotes) carries a pinned edit from the author:

> "EDIT: Huge shout out to u/lapersia for taking all of the recommendations (and
> their time) to add them to a google map"

The same question recurs independently across city subreddits — NYC (846), LA
(1,152), DC (521), NYC again 3 years later (139) — indicating a durable, recurring
need rather than an isolated one.

### F7 — The emotional trigger is family, not novelty
**Confidence: Medium-High.**

> "I'm a first gen American and (stupidly) never learned to cook any Lao food so
> when I miss my family I go there!" — r/washingtondc `1kl5qj4`, 521
>
> "For the almost 2 years that I've been in DC I've been on the hunt for taco joints
> that remind me of home." — r/washingtondc `t1buwg`, 287

Note the two-year search duration. This is not a low-stakes discovery task.

### F8 — Existing tools fail at the sub-regional layer
**Confidence: Medium.** Inferred from behavior, not stated by users.

Users do not complain that Google cannot find restaurants. They complain that they
cannot express *which version* they want. Every observed workaround — posting to a
city subreddit, hand-building a Google Map, trying five taquerias in sequence — is a
substitute for a missing query language, not for missing inventory.

## 5. Taste Memory Anchor Taxonomy

Derived from axial coding of F1–F5. This taxonomy is the parser output schema.

| Anchor | Definition | Verbatim example | Verifiable from public sources? |
|---|---|---|---|
| `dish` | Named dish | "torta ahogada" | Yes — menu |
| `cuisine` | National/ethnic category | "Chinese" | Yes — Places type |
| `substyle` | Sub-national or diaspora-regional variant | "Azorean", "Yunnanese", "East Coast Chinese-American" | Partially — menu, reviews |
| `sensory` | Taste, texture, color | "sweet", "bright yellow", "bland and soggy" | Partially — reviews |
| `direction` | Which version is sought | family_home / street_stall / restaurant_formal / diaspora_adapted / americanized_chain | Partially — reviews, photos |
| `person` | Human associated with the memory | "my grandmother", "owned by a couple of chilangos" | Operator side: yes |
| `setting` | Venue form | "gas station", "mall food court", "street vendor", "hole in the wall" | Yes — Places, photos |
| `price_band` | Expected price | "$4 tacos" | Yes — Places price level |
| `ritual` | Non-food practice | "free pickled veggies if you bought three or more" | Rarely |
| `benchmark` | Comparison to a known chain | "Chipotle is tastier than this" | Indirect |
| `negation` | Explicit exclusion | "not just cream cheese", "not too sour" | Applied as filter |

**Design note:** `dish` and `cuisine` are the only anchors that Google Places can
filter on. Every other anchor must be resolved at the evidence stage. This
constraint, not preference, is what forces the two-stage pipeline in the PRD.

## 6. Sensitivity and Ethics Findings

**S1 — Country-of-origin questions trigger surveillance anxiety.**
In r/washingtondc `1kl5qj4` ("Immigrants of DC: which restaurant has the best
version of your country's food?", 521 upvotes), the **top comment outscored the post
itself**:

> "Nice try ICE….." — 1,533 upvotes

Followed by further jokes in the same register. The thread's stated purpose was
benign; the community's reflex was still defensive.

**Requirements derived:**
- Country/region of origin MUST be optional, never a required field.
- Origin MUST NOT be persisted, logged, or used for any purpose beyond the single
  in-flight query.
- Copy MUST NOT ask "where are you from." Ask about the *food*
  ("where was the version you remember from?").
- The privacy posture MUST be stated in-product, not only in a policy page.

**S2 — Nostalgia is a real emotional register, not a gimmick.**
Two-year searches (F7) and "I wanna cry just thinking about it" (r/AskLosAngeles
`1du8cjy`) indicate genuine attachment. Copy should avoid comedic or gamified
treatment of loss.

## 7. Product Implications Summary

| Finding | Implication | PRD requirement |
|---|---|---|
| F1 | Name the category before listing attributes | FR-2 |
| F2 | Metric is "Memory Match %", capped below 100 | FR-9 |
| F3 | `direction` enum replaces authenticity score | FR-1, FR-8 |
| F4 | Anchor schema includes non-taste fields | FR-1 |
| F5 | Negations become exclusion constraints | FR-1, FR-8 |
| F6 | Demand validated; positioning is "query language," not "inventory" | Positioning |
| F7 | Emotional register: earnest, not playful | Copy guidelines |
| F8 | Two-stage narrowing is forced by API capability | FR-5, FR-6 |
| S1 | Origin optional, never persisted | NFR-4 |

## 8. Appendix — Verified Source Index

All scores verified 2026-08-27 via OpenCLI Reddit backend.

| ID | Subreddit | Title | Score | Comments |
|---|---|---|---|---|
| `1du8cjy` | r/AskLosAngeles | Non-Americans of LA, what LA restaurant is most authentic to your home country's cuisine? | 1152 | 150+ |
| `10hu54r` | r/AskNYC | People born abroad, what restaurant is the best example of your home cuisine? | 846 | — |
| `1kl5qj4` | r/washingtondc | Immigrants of DC: which restaurant has the best version of your country's food? | 521 | — |
| `t1buwg` | r/washingtondc | Reviews of taquerias (and a burrito joint) in the DMV by a homesick Californian | 287 | 284 |
| `14sv2gn` | r/SeattleWA | where can i find violently american chinese-american food? | 144 | 186 |
| `1vyrpgo` | r/FoodNYC | Expats and transplants of NYC: favorite restaurant for your own hometown food? | 139 | — |
| `1qwvk75` | r/washingtondc | Tacos that won't make a Texan cry? | 2 | — |
| `1slqnxx` | r/chennaicity | Missing Home food. | 9 | 8 |
| `i3diwb` | r/Cooking | Please stop bashing American Chinese food as "fake" or "inauthentic" | 17889 | 1628 |
