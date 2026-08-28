# Flavor Hunter — Product Overview (User's View)

| Field | Value |
|---|---|
| Status | v1.0 |
| Date | 2026-08-27 |
| Purpose | The single source of truth for what this product is, told from the user's side |
| Upstream | `01-user-research.md` · `02-prd.md` · `03-tech-design.md` · `04-taste-memory-archetypes.md` · `07-tracker-simulation-and-assets.md` |

---

## 1. One line

> **Flavor Hunter turns a taste you remember but can't describe into a searchable
> hypothesis, sends a scent hound out to hunt it down across real restaurants, and only
> claims a match when it can prove it with evidence.**

You describe a memory. You get a tracker. On the tracker is your dog, and you watch it
work.

Three shorter registers for different surfaces:

| Surface | Line |
|---|---|
| Devpost tagline | *A search engine for tastes you remember but can't describe.* |
| Video, first spoken line | *Can a search engine find a meal you've never been able to put into words?* |
| The dog, in one line | *You can't describe the smell. That's what a nose is for.* |
| One sentence to a non-technical judge | *You describe a food memory; it names what you're actually looking for, then proves which restaurant comes closest.* |

**What it is not:** not a restaurant recommender, not a better Yelp, not a food map.
Those all assume you can already name what you want. This product exists for the case
where you can't.

## 2. The one idea behind everything

Ordinary search assumes: **I know what I want → find it.**

This product assumes: **I have a taste in my head → I can't name it → something has to
figure out what it is → then hunt it → then prove the match → then learn from my
correction.**

Every feature below is one step of that chain.

## 3. Features

### F0 — There is a dog, and the dog is the product

**What you see.** The whole app is a handheld tracker. Your phone *is* the device — no
drawn bezel, full screen. On the scope is one moving figure: a pixel-art scent hound.
You are tracking your dog while your dog tracks the taste.

```
              ·          ✕
        ·                        ◉
                 🐕 →
     ✕                    ·
              ·
        BRG 041°   RNG 2.3 mi
```

**How it works.** Everything the system does is expressed as something the dog does. It
sniffs a restaurant while that restaurant's data is being fetched. It shakes its head and
moves on when one is eliminated. It **points** — paw up, nose out — when it locks a target.
It **tilts its head** when it doesn't understand you. Its collar changes colour with the
system's state: red while searching, amber on lock, green when evidence is verified.

**Why.** A dog finds things by smell *precisely when you can't describe them.* That is this
product's entire premise, embodied instead of explained. It also gives the product the right
emotional temperature — the research found the real trigger is family and longing, and that
people search for years. An instrument alone reads clinical. So the instrument stays cold
and factual, and the dog carries the warmth.

**The rule that makes it honest.** The dog is never decoration. Its animation is driven by
the same real events as everything else, so **it never runs while nothing is happening.** If
the system is waiting, the dog waits too — ears up, still. A dog that performs busywork
would be the same lie as an invented evidence quote, only more charming, and therefore worse.

### F1 — You describe a memory, not keywords

**What you do.** One text box. Write it however it comes out, in any language:
*"我想吃我外婆做的那种甜口番茄炒蛋"* · *"bright yellow fried rice like a small-town
American Chinese place"* · *"the ramen I ate at 2am in Tokyo."*

**How it works.** Nothing is keyword-matched. Your sentence is broken into eleven kinds
of *memory anchor*: the dish, the cuisine, the **regional sub-style**, sensory details,
which **version** you mean (a relative's kitchen / a street stall / a formal restaurant
/ a diaspora adaptation / an Americanized chain), a person, the kind of venue, a price
range, a ritual, a chain you're comparing against, and — separately — **what you don't
want.**

**Why.** Research finding: people don't describe cravings the way databases do. They
describe memories.

### F2 — It names the thing you couldn't name  ← *the signature feature*

**What you see.** The first line of the answer is a name:

```
You're looking for:  East Coast Chinese-American
                     (not the Cantonese/Sichuan places common in Seattle)
```

**How it works.** It takes the sensory details you gave — bright yellow fried rice,
bright red char siu, huge egg rolls, crab rangoon with more than cream cheese — and
finds the one regional tradition that explains *all* of them at once. If it isn't
confident, the name appears with a `?` rather than being hidden.

**Why.** In the source thread, the user didn't have trouble finding restaurants. He had
trouble knowing what his craving was *called*. Commenters named it; he edited his post
to record the name; then he could search on his own. **Naming is the valuable act.** A
system that returns correct attributes but no name has failed.

### F3 — It shows you its guesses instead of interrogating you

**What you see.** An assumption card, live, while it works. Inferred fields are marked
`?` with the reasoning shown, and every line is editable:

```
  dish        番茄炒蛋 · tomato & egg              ✓
  cuisine     Chinese · home-style                ✓
  substyle    ? unspecified — inferring Jiangnan/Shanghai from "sweet"   [change]
  version     family kitchen, not restaurant      [change]
  location    Boston, MA · from your browser      [change]
```

**How it works.** Missing information never blocks you. It assumes, shows the
assumption, marks its confidence, and keeps hunting — you correct it mid-flight.

**Why.** A "please provide more details" form would stop everything. And a visible
guess is better than a question: you can see exactly what it thinks you meant.

### F4 — When it truly can't start, it asks for exactly one clue

**What you see.** For an input like *"Missing home food."* — the dog tilts its head, and:

```
  I need one more clue —
  [ What was it? ]   [ Where was it from? ]   [ What did it taste like? ]
```

The head tilt does the explaining. Nobody needs to be told what it means.

**How it works.** There is only one thing it genuinely cannot proceed without: some
dish or cuisine to search for. Everything else it will assume. So there is exactly one
blocking state, and it costs you one tap.

**Why.** The alternative is a system that guesses "Chinese / noodles" and pretends to
know. Knowing that it doesn't know is a designed capability.

### F5 — You watch the hunt, and every rejection has a reason

**What you see.** The scope sweeps, the dog picks up the trail, and:

```
        43 candidates detected
        🐕 sniffing …
        ❌ reviews indicate sharply acidic
        ❌ no evidence of home-style preparation
        ❌ regional profile doesn't match
        ...
        12 possible · 3 strong
        TARGET LOCKED                          live · 7.4s
```

The dog runs to each candidate, sniffs it, and either rejects it and moves on or holds.
Rejected ones stay on the scope, struck through — watching the field narrow is the point.
A tone pings faster and faster as the dog closes in.

**How it works.** Each `❌` is a real result coming back, not an animation step — which is
why the elapsed timer is on screen. There is **no map underneath**: only bearing and
distance, like an instrument rather than an atlas. A tracker doesn't render streets.

**Why.** It's the only way to see the machine actually working. It also proves the
search is happening now, against live data, rather than reading from a stored list.

### F6 — A match score you can check by hand

**What you see.** `94% Memory Match`, and underneath it the arithmetic.

**How it works.** The score is *only* evidence coverage. Each anchor you gave carries a
weight — dish 30, sensory + sub-style 30, cuisine + version 20, person/venue/price/ritual
20 — and **an anchor earns its weight only if there's a verbatim quotation backing it.**
Anchors you never mentioned are removed from the denominator. You can add up the evidence
lines yourself and get the same number.

It never shows 100%. **Nobody claims a restaurant is 100% their grandmother's cooking** —
in the research corpus, real people always said *"the closest I've found."* The gap is
honest, and it's what makes "why not 100%?" a real question with a real answer.

### F7 — Every reason is a quotation you can open

**What you see.**

```
94% Memory Match          Why not 100%? → slightly more acidic than described

✓ sweet-style tomato & egg
    menu: "家常番茄炒蛋（甜口）"            restaurant website · fetched 2s ago
✓ home-style preparation
    review: "tastes like the one my mom made"   Google · 2026-03 · 2 of 5 available
✓ operator from Hunan
    website "about" page · fetched 2s ago
✗ family-style serving
    no evidence found
```

**How it works.** It may only **quote**, never paraphrase. "The menu says 甜口" is
allowed. "Eight reviewers say it tastes like home" is not allowed unless eight reviews
actually say so. Every quotation is checked character-by-character against the text that
was fetched, and any line that fails the check is thrown away rather than shown. When
there's no evidence for something you asked about, it says **no evidence found** instead
of filling the gap.

Counts always come with a denominator — *"2 of 5 available reviews"* — because five is
genuinely all there is per restaurant, and hiding that would invite invention.

### F8 — Say "not quite," and it re-thinks instantly

**What you see.**

```
[ Not quite ]  →  "too sour, my grandmother's was sweet"

    acidity    0.48 → 0.22
    sweetness  0.71 → 0.91

TARGET RE-ACQUIRED        97% Memory Match
```

**How it works.** The dog shakes itself off and picks the trail back up. Under that: it
doesn't search again — it re-ranks the candidates it already has, in your browser. That's
why it's instant, needs no network, and cannot fail.

**The score is allowed to go down.** If your correction reveals the locked restaurant
fits *worse* than believed, it shows the lower number and offers you the next candidate.
It will not quietly bias itself toward a rising number.

### F9 — It will tell you there's no good answer

**What you see.** The dog sits down, ears and tail low. Then either a candidate marked
`insufficient evidence` — with no percentage at all — or a visible widening step:

```
        nothing within 5 mi clears the bar
        widening to 40 mi ...
```

**How it works.** If nothing has any supporting evidence, it declines to produce a score
rather than ranking the least-bad option. Widening the search radius happens as a visible
event with its reason stated.

**Why.** Sometimes the true answer is *"nothing in this city, but there's a place an hour
out."* That was a real, highly-upvoted answer in the research. A system that must always
crown a winner will invent one.

### F10 — It stores nothing, and it never asks where you're from

**What you see.** Stated on the page: no account, no history, nothing saved. And the
question is always about the *food*, never about you:

> ✅ "Where was the version you remember from?"
> ❌ "Where are you from?"

So you can answer *"my grandmother's kitchen in Hunan"* or *"a Chinese-American place in
Queens"* or skip it entirely.

**How it works.** No database exists. Everything is fetched live per query and discarded
when the answer is rendered. Nationality is never a required field and is never logged.

**Why.** In a DC thread asking immigrants which restaurant best matched their country's
food, the top comment — with more upvotes than the post — was **"Nice try ICE….."** The
question was innocent; the reflex was not. Asking about the food instead of the person
is both safer and a better description of what we actually need to know.

## 4. What it deliberately does not do

| Not doing | Why |
|---|---|
| Reservations, ordering, delivery | Different product; adds integrations, adds no value here |
| A browsable restaurant list, directory, or ranking | You get one hypothesis with proof, not a catalogue to scroll |
| An "authenticity" rating | A large share of users want the *non*-authentic version — an authenticity score would rank their answer last |
| Accounts, saved history, notifications | Conflicts with storing nothing |
| Claim coverage it doesn't have | The current city and candidate count are always shown |

## 5. The whole thing in one journey

0. The tracker boots — `SCOPE / SCENT ARRAY / GEO LOCK / HOUND` — and the dog wakes up.
1. You type: *"I want the sweet tomato and egg my grandmother used to make."*
2. It answers what you're looking for: **sweet-style home-cooked 番茄炒蛋**, and shows
   which parts it inferred rather than read.
3. The dog takes the scent and runs. It sniffs candidates across your city; they fall away
   one at a time, each with a reason. The ping quickens.
4. The dog **points**. Brackets converge. **TARGET LOCKED** — one restaurant,
   `94% Memory Match`.
5. **Why:** four quotations, each from a named source, each timestamped, one of them
   honestly marked *no evidence found*.
6. You say: *"too sour."* Two numbers move on the card. It re-locks in under a tenth of
   a second — `97%`.
7. Nothing about any of it is saved.

## 6. The sentence that holds it together

> **It is not a restaurant recommender. It is a system that turns an imperfect food
> memory into a searchable hypothesis, sends a hound to hunt it through real restaurants,
> and only claims a match when it can prove it.**

And the reason the dog is right rather than cute: **you brought a smell you couldn't put
into words. That is the one problem a nose was built for.**
