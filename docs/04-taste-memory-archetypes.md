# Flavor Hunter — 10 Taste Memory Archetypes

| Field | Value |
|---|---|
| Status | Final v1.0 |
| Date | 2026-08-27 |
| Purpose | Parser schema basis · regression test suite · demo test set · requirements evidence |
| Method | Purposive + snowball sampling of public Reddit threads, `agent-reach` → OpenCLI |
| Verification | Every score below re-fetched and confirmed 2026-08-27 |

---

## 0. How to use this document

Each archetype specifies, for one recurring pattern of taste memory:

- **Verbatim** — real user language, quoted exactly
- **Trigger** — what causes the memory to become an active search
- **Anchors present / missing** — against the taxonomy in `01-user-research.md` §5
- **Gate outcome** — PASS / PARTIAL / BLOCK per PRD FR-4
- **Clue to request** — what to ask, and only when the gate blocks
- **Resulting query** — the stage-1 Places call this must produce
- **Tests** — which requirement this archetype is the regression case for

**Every prompt change must be re-run against all ten.** Archetypes 2, 6, and 9 are the
hard ones; if they pass, the rest pass.

### 0.1 Cross-city recurrence (demand evidence)

The same question has been independently asked in at least six city subreddits, each
time with high engagement, and threads explicitly cite each other as the reason for
being posted:

| City | Thread | Score | Note |
|---|---|---|---|
| Los Angeles | r/AskLosAngeles `1du8cjy` | 1152 | A commenter compiled all answers into a shared Google Map |
| NYC | r/AskNYC `10hu54r` | 846 | |
| Toronto | r/askTO `1ubhv9c` | 767 | *"Saw this posted in the London, Ontario subreddit"* |
| Boston | r/boston `1stt3oe` | 631 | *"Saw this question asked on another city's subreddit"* |
| Washington DC | r/washingtondc `1kl5qj4` | 521 | |
| NYC (again) | r/FoodNYC `1vyrpgo` | 139 | Posted years after `10hu54r` |

Two behaviors in this table matter more than the vote counts:

1. **The question propagates city to city** because no tool answers it. Users are
   copying a *format*, not a query.
2. **Users are hand-building the index.** In the Boston thread, a 395-upvote comment
   is nothing but four links to previous Boston threads, captioned
   *"Keeping these in the same spot for future reference."*

---

## A1 — The Family Cook Oracle

> "my jamaican grandma refuses to go to any jamaican place.. except niceys in scarborough"
> — r/askTO `1ubhv9c`, **428 upvotes** (top comment)

Authenticity is delegated to a family member who rejects nearly everything. The user
is not reporting their own taste; they are reporting a trusted verdict.

| | |
|---|---|
| **Trigger** | Wanting to eat what the family authority would accept |
| **Anchors present** | `cuisine`=Jamaican, `person`=grandmother, `direction`=family_home, `benchmark`=implicit (rejects all others) |
| **Anchors missing** | `dish`, `sensory` |
| **Gate** | **PASS** — `cuisine` satisfies `dish_or_cuisine` |
| **Clue to request** | None. Optionally offer: *"any specific dish she'd order?"* — non-blocking |
| **Resulting query** | `includedType=caribbean_restaurant`, keyword `Jamaican`, bias=user coords, `direction` → weight family-style and independent operators |
| **Tests** | FR-1 person anchor; FR-4 pass on cuisine alone |

**Product note.** The oracle pattern implies the strongest evidence signal is not
review sentiment but **operator/staff origin**. Prioritize that evidence line.

---

## A2 — The Unnamed Regional Variant  ⚠️ hard case

> "as much as i respect the abundance of authentic asian food that is in seattle, i
> have been craving the kind of chinese-american food that you find in a small town in
> the middle of nowhere that is so american but so good. i'm talking bright yellow
> fried rice and bright red char siu/bbq pork. i want CRAB rangoons (not just cream
> cheese), and the egg rolls that are stuffed with meat and vegetables and are huge."
>
> "**Edit: … i have found out that what i'm looking for is 'East Coast
> Chinese-American' food, which makes sense since i'm from the east coast!**"
> — r/SeattleWA `14sv2gn`, 144 upvotes, 186 comments

The user could describe the food in precise sensory detail but could not name it.
Commenters supplied the name; he edited the post to record it.

| | |
|---|---|
| **Trigger** | A craving with no searchable term attached |
| **Anchors present** | `sensory`=[bright yellow, bright red, huge], `dish`=[fried rice, char siu, crab rangoon, egg roll], `direction`=americanized_chain, `negation`=["not just cream cheese"], `setting`=small town |
| **Anchors missing** | `substyle` — **this is the whole point** |
| **Gate** | **PASS** |
| **Clue to request** | None |
| **Resulting query** | `includedType=chinese_restaurant`, keyword `crab rangoon`, bias=user coords; `direction=americanized_chain` **inverts** the usual authenticity preference in ranking |
| **Tests** | **FR-2 must output "East Coast Chinese-American"**; FR-8 must not rank by authenticity; FR-1 negation handling |

**This is the archetype the product exists for.** A parser that returns attributes but
no name has failed even if every attribute is correct.

The same thread also shows discrimination finer than any taxonomy:
*"this is more like mall-food court chinese food. yes there is a difference."*

---

## A3 — Sub-National Precision

> "Natas - not 100% authentic, but it's the closest I can come to Azorean/Portuguese
> (**the country not Brazil**) cuisine."
> — r/AskLosAngeles `1du8cjy`, 280 upvotes
>
> "South of the Cloud Yunnan noodle house. Pretty authentic regional Yunnan
> flavors—somewhere between Sichuan and Thai cuisine… beef rice noodles, which come
> with fresh mint as an herb. It's a distinctive **Yunnanese** touch."
> — r/FoodNYC `1vyrpgo`, 113 upvotes

Users routinely operate below the national level, and pre-empt the wrong
generalization themselves.

| | |
|---|---|
| **Trigger** | Prior experience of being served the wrong sub-variant |
| **Anchors present** | `cuisine`=Portuguese, `substyle`=Azorean, `negation`=[Brazilian] |
| **Anchors missing** | `dish`, `sensory` |
| **Gate** | **PASS** |
| **Clue to request** | None |
| **Resulting query** | `includedType=portuguese_restaurant`, keyword `Azorean`; `substyle` cannot be filtered at stage 1 — it must survive into stage-2 evidence matching |
| **Tests** | FR-1 substyle extraction; FR-5/FR-6 handoff — proves substyle is not silently dropped |

**Product note.** `substyle` is the anchor Places cannot filter on and is also the one
users care most about. This asymmetry is the technical justification for the
two-stage pipeline (`03-tech-design.md` §5).

---

## A4 — The Closest-So-Far Iterator

> "Originally from LA, still have yet to find a good donut like the Cambodian shops
> make back home. Donut scene is pretty bleak out here, **closer to frosted bread**.
> **Randy's in the village is close but not quite there.**"
> — r/FoodNYC `1vyrpgo`, 74 upvotes
>
> "For the almost **2 years** that I've been in DC I've been on the hunt for taco
> joints that remind me of home."
> — r/washingtondc `t1buwg`, 287 upvotes

The user arrives with a search history: candidates already tried, ranked, and
rejected, plus an explicit best-so-far.

| | |
|---|---|
| **Trigger** | Accumulated failure; an existing approximate answer |
| **Anchors present** | `dish`=donut, `substyle`=Cambodian-American (LA), `benchmark`=Randy's, `negation`=[frosted bread texture], `direction`=diaspora_adapted |
| **Anchors missing** | `sensory` in positive terms |
| **Gate** | **PASS** |
| **Clue to request** | None |
| **Resulting query** | `includedType=donut_shop`, keyword `Cambodian donut`; the named benchmark must be **excluded or shown as a baseline**, never returned as the top result |
| **Tests** | FR-8 exclusion of an already-rejected named venue; FR-10 — this archetype is the natural entry to refinement |

**Product note.** "Close but not quite" is the refinement loop stated in the user's own
words. This archetype is the strongest evidence that FR-10 is a core feature rather
than a nicety.

---

## A5 — Scarcity Acceptance

> "Club Bosna in Everett. **Sadly it's the only Yugoslavian restaurant in greater
> Boston area** so I feel genuinely lucky to eat **almost authentic** ćevapi there."
> — r/boston `1stt3oe`, 283 upvotes
>
> Reply: "I could kiss you through my phone. I have been looking for good cevap for a
> long time. There was an OK place in Winthrop that closed."
> — 87 upvotes

For small diasporas the answer set may have exactly one member, and the user knows it.
"Almost authentic" is not a complaint; it is a calibrated acceptance.

| | |
|---|---|
| **Trigger** | Knowing the category barely exists locally |
| **Anchors present** | `dish`=ćevapi, `cuisine`=Bosnian/Yugoslav, `direction`=restaurant_formal |
| **Anchors missing** | `sensory`, `substyle` |
| **Gate** | **PASS** |
| **Clue to request** | None |
| **Resulting query** | `includedType=restaurant`, keyword `cevapi` OR `Bosnian`; **widen radius aggressively** — a single result is a valid and valuable outcome |
| **Tests** | FR-5 low-count handling; PRD §8 progressive broadening; a 1-result answer must not read as a failure state |

**Product note.** The UI must not treat "1 result" as an error. For this archetype it
is the complete, correct answer, and the honest Memory Match may be in the 60s.

---

## A6 — Category Absence → Look Further  ⚠️ hard case

> "The mexican silence is deafening. 😢" — 215 upvotes
>
> Reply: "Mexican here. It is indeed disappointing how many Mexican restaurants have
> been popping up in the last few years but **none of them are worth it. Funnily
> enough, there is better Mexican food up in Barrie.**"
> — r/askTO `1ubhv9c`, 152 upvotes

The correct answer is that nothing in the city qualifies — and the real answer is in a
town an hour away.

| | |
|---|---|
| **Trigger** | Repeated local failure across many venues |
| **Anchors present** | `cuisine`=Mexican, `negation`=[all local options], `direction`=street_stall / family_home |
| **Anchors missing** | `dish`, `sensory`, `substyle` |
| **Gate** | **PASS** |
| **Clue to request** | None to unblock; optionally *"which region of Mexico?"* to sharpen |
| **Resulting query** | `includedType=mexican_restaurant`; on weak evidence coverage across all candidates, **broaden radius and say so** |
| **Tests** | **FR-9a `E == 0` → `insufficient evidence`, never a fabricated percentage**; PRD §8 broadening as a visible radar event |

**This is the honesty test.** A system that must return a winner will invent one here.
The correct output is *"nothing within 5 mi clears the bar — widening to 40 mi,"* shown
as a real radar event with the reason stated. Getting A6 right is worth more to
credibility than any visual polish.

---

## A7 — Deliberate Inauthenticity

> "For the love of god, please stop bashing American Chinese food as 'fake' or
> 'inauthentic' [Rant]"
> — r/Cooking `i3diwb`, **17,889 upvotes**, 1,628 comments

The single largest engagement signal in the entire corpus is a defense of the
*non-authentic* version as a legitimate cuisine in its own right.

| | |
|---|---|
| **Trigger** | Wanting a specific diaspora-evolved cuisine, not its ancestor |
| **Anchors present** | `cuisine`, `direction`=americanized_chain \| diaspora_adapted |
| **Anchors missing** | varies |
| **Gate** | **PASS** |
| **Clue to request** | None |
| **Resulting query** | Standard, but `direction` **inverts ranking**: chain-adjacent and long-established local operators rank *up*, "authentic regional" signals rank *down* |
| **Tests** | FR-3 (NG5) — confirms no authenticity score exists anywhere in the model |

**Product note.** 17.9k upvotes is the strongest available evidence that ranking by
authenticity would misserve a large user population. This archetype exists in the
suite specifically to prevent that regression from being reintroduced.

---

## A8 — The Non-Food Anchor

> "Missing my Chula Vista joint that gave you **free pickled veggies and an Azulita
> beer if you bought three or more**." — r/washingtondc `t1buwg`
>
> "Himalayan Yak in Jackson Heights is legit. They even have **a brand of rum he'd
> only see back home**, and **live music from a regular performer whom he grew up
> listening to** back in Nepal." — r/AskNYC `10hu54r`, 284 upvotes
>
> "What I'd give for **a maple bar in a pink donut box** out of a hole in the wall with
> **a neon donut sign**." — r/FoodNYC `1vyrpgo`, 31 upvotes

What is missed is often not the flavor. It is a ritual, a soundtrack, a box, a sign.

| | |
|---|---|
| **Trigger** | Memory of a whole environment, not a dish |
| **Anchors present** | `ritual`, `setting`, `person`, sometimes `dish` |
| **Anchors missing** | `sensory`, often `substyle` |
| **Gate** | **PARTIAL** — proceed with `?`-marked assumptions |
| **Clue to request** | Non-blocking: *"what were you eating there?"* |
| **Resulting query** | Derive `dish_or_cuisine` from context; `setting` and `ritual` become stage-2 ranking signals (independent, hole-in-the-wall, live music) |
| **Tests** | FR-1 must not crash on non-culinary anchors; FR-4 must mark low-confidence assumptions `?` rather than blocking |

**Product note.** `ritual` is the least verifiable anchor from public sources. When no
evidence exists, FR-9 requires `no evidence found` — this archetype is where that rule
gets exercised most often.

---

## A9 — Negative-Only Description  ⚠️ hard case

> "Had very high expectations, left very disappointed. **Tacos were bland and soggy,
> and tortillas were weird.**" — r/washingtondc `t1buwg`
>
> "Donut scene is pretty bleak out here, **closer to frosted bread**."
> — r/FoodNYC `1vyrpgo`
>
> "**I don't want Americanized Chinese food.**" — recurring formulation

The user states only what is wrong. There is no positive target in the text.

| | |
|---|---|
| **Trigger** | A recent bad experience |
| **Anchors present** | `negation`=[bland, soggy, wrong tortilla texture], `dish`=taco |
| **Anchors missing** | all positive `sensory` |
| **Gate** | **PASS** |
| **Clue to request** | Non-blocking: *"what would the right one taste like?"* |
| **Resulting query** | Standard for `dish`; negations become **exclusion filters** at stage 2 |
| **Tests** | **FR-1 — negations must land in `negation[]` and never in a positive field.** FR-8 — the excluded property must appear as a visible elimination reason |

**This is the most likely silent failure in the system.** A parser that reads "not too
sour" as evidence *for* sourness will produce confidently wrong results with clean
evidence citations attached — the worst possible failure shape. A9 must be in every
regression run.

---

## A10 — Insufficient Input

> "Missing Home food." — r/chennaicity `1slqnxx`, 9 upvotes, 8 comments
>
> "I love how diverse the food scene is here, and I want to know where people go when
> they are **genuinely homesick**." — r/FoodNYC `1vyrpgo` (the prompt itself)

No dish, no cuisine, no location, no sensory detail. This is a real and common
formulation, not a synthetic edge case.

| | |
|---|---|
| **Trigger** | Diffuse homesickness with no specific target |
| **Anchors present** | `direction`=family_home (weak inference only) |
| **Anchors missing** | `dish_or_cuisine` — a **required** slot |
| **Gate** | **BLOCK** |
| **Clue to request** | Three buttons: `What was it?` · `Where was it from?` · `What did it taste like?` |
| **Resulting query** | **None. Zero API calls are issued.** |
| **Tests** | FR-4 hard block; FR-3 cost containment; **FR-1 must return `null` for absent anchors, not a plausible guess** |

**Product note.** This archetype is the parser's honesty test. The failure mode to
prevent is:

```json
{ "cuisine": "Chinese", "dish": "noodles", "searchable": true }
```

which is a fabrication. The required output is:

```json
{ "dish": null, "cuisine": null, "sensory": [],
  "searchable": false, "missing_required": ["dish_or_cuisine"] }
```

Knowing that it does not know is a core capability, not an error path.

---

## A12 — The Substitution Ladder  ⚠️ hard case

> "我想吃正宗东北麻辣烫" — a user in a city that has none.

Two problems arrive together. The dish may not exist within any reasonable range, **and** the
dish may be listed on Google under a transliteration the user would never type: `Mala Tang`,
`MaLaTang`, `Spicy Hot Pot`, `Sichuan Soup`.

| | |
|---|---|
| **Trigger** | Wanting a regional dish whose category may be locally absent |
| **Anchors present** | `dish`=麻辣烫, `cuisine`=Chinese, `substyle`=Northeastern, `direction`=street_stall |
| **Anchors missing** | `sensory` (the user assumes "麻辣" is self-evident) |
| **Gate** | **PASS** |
| **Variants required** | `["麻辣烫", "mala tang", "malatang", "spicy hot pot", "Chinese hot soup"]` — searching only the user's spelling silently misses places that are right there (FR-1) |
| **Resulting query** | Stage 1 across all variants; on zero qualifying evidence, **two doors** (FR-4b-2) |
| **Tests** | FR-1 `query_variants`; **FR-4b-2 two-door fallback with `relation` shown**; FR-9a `insufficient evidence` |

The correct output when nothing qualifies:

```
No 麻辣烫 within 20 mi.

[ Search 45 mi ]              [ Try 麻辣香锅 instead ]
  same dish, further            closer — same flavour profile, no broth
```

**Product note.** This archetype exists to prevent two distinct failures. The first is
searching one spelling and reporting absence for something that is present. The second is
quietly serving 麻辣香锅 as if it were 麻辣烫 — a substitution the user might well accept, but
only if told what they are accepting. Every rung of `fallback_ladder` carries a required
`relation` string for that reason.

A12 is **not** a seeded example (FR-4c): seeded paths must succeed deterministically, and this
archetype's value lies precisely in the possibility of failure.

---

## Summary Matrix

| # | Archetype | Gate | Primary requirement tested | Difficulty |
|---|---|---|---|---|
| A1 | Family Cook Oracle | PASS | FR-1 `person`; operator-origin evidence | Easy |
| A2 | Unnamed Regional Variant | PASS | **FR-2 naming** | **Hard** |
| A3 | Sub-National Precision | PASS | FR-1 `substyle` survives to stage 2 | Medium |
| A4 | Closest-So-Far Iterator | PASS | FR-8 benchmark exclusion; FR-10 entry | Medium |
| A5 | Scarcity Acceptance | PASS | FR-5 low-count; 1 result is success | Easy |
| A6 | Category Absence | PASS | **FR-9a `insufficient evidence`** | **Hard** |
| A7 | Deliberate Inauthenticity | PASS | NG5 — no authenticity score | Easy |
| A8 | Non-Food Anchor | PARTIAL | FR-4 `?` assumptions, no blocking form | Medium |
| A9 | Negative-Only | PASS | **FR-1 negation isolation** | **Hard** |
| A10 | Insufficient Input | BLOCK | FR-4 block; FR-1 returns `null` | Medium |
| A11 | Origin ≠ Location | PASS | FR-4a — searching Hunan for a Boston user is a blocker | Medium |
| **A12** | **Substitution Ladder** | PASS | **FR-1 `query_variants`; FR-4b-2 two doors** | **Hard** |

**Four hard cases: A2 (naming), A6 (refusing to invent a winner), A9 (negation), A12
(variants + honest substitution).**
Each is a distinct failure mode: inability to name, willingness to fabricate, and
sign inversion. Passing all three means the parser is sound; the remaining seven
follow.

## Verified Source Index

| ID | Subreddit | Score | Used in |
|---|---|---|---|
| `i3diwb` | r/Cooking | 17889 | A7 |
| `1du8cjy` | r/AskLosAngeles | 1152 | §0.1, A3 |
| `10hu54r` | r/AskNYC | 846 | §0.1, A8 |
| `1ubhv9c` | r/askTO | 767 | §0.1, A1, A6 |
| `1stt3oe` | r/boston | 631 | §0.1, A5 |
| `1kl5qj4` | r/washingtondc | 521 | §0.1 |
| `t1buwg` | r/washingtondc | 287 | A4, A8, A9 |
| `14sv2gn` | r/SeattleWA | 144 | A2 |
| `1vyrpgo` | r/FoodNYC | 139 | §0.1, A3, A4, A8, A10 |
| `1slqnxx` | r/chennaicity | 9 | A10 |

All scores verified 2026-08-27. Scores are point-in-time.
