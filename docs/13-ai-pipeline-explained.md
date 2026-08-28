# How Flavor Hunter Works

*A plain-language walkthrough of the AI pipeline. No code required.*

---

## The problem, stated precisely

Restaurant search assumes you can name what you want. Type "pizza," get pizza.

But the hardest food searches are the ones where **you know exactly what you want and cannot
say it.** You remember a thin, dark, savoury crepe folded into a square with an egg cracked in
the middle, eaten every day during a year in France. You do not know that this is called a
*galette de sarrasin*, that it comes from Brittany, or that the sweet crepes sold everywhere
near you are a different dish made from different flour.

You are not missing inventory. You are missing **a query language**.

This is not a niche problem. In city subreddits — NYC, Los Angeles, Toronto, Boston, Washington
DC — the same question recurs with hundreds of upvotes: *"Immigrants of this city: which
restaurant has the best version of your country's food?"* In one Los Angeles thread (1,152
upvotes) a commenter compiled every answer into a shared Google Map by hand. People are building
this product manually because nothing does it.

Flavor Hunter turns an imperfect food memory into a searchable hypothesis, hunts real
restaurants for it, and **only claims a match when it can prove one.**

---

## The pipeline in one picture

```
        your memory, in your own words
                      │
        ┌─────────────▼─────────────┐
   ①    │      THE INTERPRETER      │   what are you actually asking for?
        └─────────────┬─────────────┘
                      │  names the dish · extracts 13 signals
                      │  writes the alternative spellings
                      ▼
              ┌───────────────┐
              │  READY GATE   │   enough to search on? if not, ask for
              └───────┬───────┘   exactly one clue and spend nothing
                      │
        ┌─────────────▼─────────────┐
   ②    │       THE HUNTER          │   which restaurants could hold it?
        └─────────────┬─────────────┘
                      │  Google Places → 18 candidates
                      │  each candidate's own website → menu text
                      ▼
        ┌───────────────────────────┐
   ③    │      THE VERIFIER         │   can we prove it, in their words?
        └─────────────┬─────────────┘
                      │  quotes only · never paraphrase
                      │  every quote checked character-by-character
                      ▼
              ┌───────────────┐
              │  MEMORY MATCH │   a score you can add up by hand
              └───────┬───────┘
                      │
        ┌─────────────▼─────────────┐
   ④    │     THE EXPLAINER         │   why this one, in two sentences
        └───────────────────────────┘
```

Four stages. Three of them call a language model; every one of them is followed by code that
checks the model's work.

---

## ① The Interpreter — naming what you could not name

**Input:** your sentence, in any language, plus the city you are searching.

**What it does.** It reads the memory the way a knowledgeable friend would and produces a
structured reading of it — thirteen distinct signals:

| Signal | Example from a real query |
|---|---|
| **the name of the thing** | `Breton Buckwheat Galette` |
| dish | galette de sarrasin |
| cuisine | French |
| **regional sub-style** | Breton |
| sensory details | savoury · darker buckwheat batter · egg cooked in the centre |
| which *version* | family kitchen / street stall / sit-down / diaspora / Americanised chain |
| the person attached to it | "my grandmother" |
| kind of venue | hole in the wall · gas station · street cart |
| price band, ritual, benchmark | "$4 tacos", "free pickled veggies", "better than Chipotle" |
| **what you do NOT want** | *"not the sweet dessert kind"* |
| alternative spellings | galette · buckwheat crepe · savoury crepe |
| acceptable substitutes | savoury wheat crepe — *"wheat instead of buckwheat"* |

Three of these deserve attention, because they are where the product's value lives.

### The name is the product

The output above came from a sentence that never contains the word *galette*. That naming step
is the whole thing: in the original Reddit thread that inspired this feature, a Seattle user
described a food in precise sensory detail, commenters told him it was called *"East Coast
Chinese-American,"* and he edited his post to record the name — **because once he had the name
he could search on his own.** Naming is the act of value. A system that returns correct
attributes and no name has failed even when every attribute is right.

### Alternative spellings, because the map does not use your word

Immigrant-run restaurants are listed under whatever transliteration the owner chose. A search
for *malatang* must also try *mala tang*, *spicy hot pot*, *Chinese hot soup*. Searching only
the user's spelling silently misses restaurants that are two blocks away — a false negative
that looks exactly like a true one.

### Exclusions are filters, not interests

*"...not a Thai restaurant with a couple of Lao dishes on the menu."*

Read carelessly, that mentions Thai food and ranks Thai restaurants **up** — the precise
opposite of the request. Exclusions are extracted into their own field, never merged into a
positive signal, and the code asserts that separation. In Washington DC, where much Lao cooking
is served under Thai signage, this is not an edge case; it is the main failure path for that
query.

### The Ready Gate

Some memories genuinely cannot be searched: *"Missing home food."* There is no dish, no
cuisine, nothing to look for. The system stops, asks for **exactly one** clue — three buttons,
one tap — and **spends nothing.** No restaurant lookups, no billing, no invented guess.

The failure mode this prevents is a system that answers `{cuisine: "Chinese", dish: "noodles"}`
because that sounds plausible. **Knowing that it does not know is a tested capability**, not an
error path.

---

## ② The Hunter — where could it be?

Ordinary code, no model. Two stages, and the reason for the split is a hard limit worth stating
plainly:

> **Google Places can find candidate restaurants from a dish name. It cannot confirm that a
> restaurant serves that dish.** The API has no menu field of any kind — only coarse flags like
> *serves vegetarian food* — and its text search explicitly does not search menu content.
> ([Places data fields](https://developers.google.com/maps/documentation/places/web-service/data-fields) ·
> [Text Search](https://developers.google.com/maps/documentation/places/web-service/text-search))

So Places gets you to the door. It cannot tell you what is on the menu. Confirmation has to come
from somewhere else, which is exactly why there is a second stage:

**Stage 1** — search Places across every alternative spelling, inside the range the user set.
Capped at 18 candidates, because the cost of the next stage scales with this number.

**Stage 2** — for each candidate, fetch **the restaurant's own website** and extract its menu
text. This is the only source that can actually confirm a dish, and — being the restaurant's
own public page — it carries none of the restrictions that apply to Google's content.

There is a real weakness here, and pretending otherwise would be dishonest: small
immigrant-run restaurants, precisely this product's subject, frequently have no website, or only
a social page, or a photograph of a menu. Website-only evidence fails hardest exactly where the
product matters most. Stage ③ answers that with a second, independent path.

---

## ③ The Verifier — proof, or nothing

This is the stage that makes the product trustworthy, and it is the one most worth understanding.

**The rule: quote, never paraphrase.** Every claim on screen is a verbatim span of text that a
restaurant or a reviewer actually wrote. Not a summary. Not a characterisation. A quotation.

Three independent evidence paths run in parallel, deliberately using different mechanisms:

| Path | Mechanism | Why this mechanism |
|---|---|---|
| **Restaurant's own website** | language model extraction, then verification | Needs judgement: recognising that a menu line means *sweet, home-style* requires reading, not matching |
| **Google reviews** (up to 5) | plain text matching on our own server, **no model** | **Verbatim by construction** — a substring match cannot fabricate. It also keeps review text out of any third-party model, which the platform terms require |
| **City subreddit corpus** | name matching against a vetted set of quotes | Supplies the one thing Google cannot: *aggregate* corroboration from people who would know |

### Character-by-character verification

Whatever the model returns, the server then checks: **is this quotation literally present in the
text we fetched?** Same characters, same order. If not, the line is deleted and never shown.

This is not a stylistic preference. It closes the one failure that would invalidate everything
else: a confident, well-formatted, entirely invented quotation. The model's compliance is
*checked*, not trusted.

### The vocabulary of missing something

Plain matching only finds words the user already typed. Someone who wrote "home cooking" would
never match the review that says *"tastes like the one my mom made"* — which is the review that
matters most.

So the system carries a vocabulary of roughly fifty phrases taken from real discourse:
*reminds me of home · my mom made · my grandmother's · my nonna · my halmoni · my lola · hole in
the wall · closest thing to · the owner is from.* These were collected from the source threads,
not invented as synonyms. And the search is gated: *"reminds me of home"* only counts as
evidence if the memory was about home cooking in the first place.

### Counting honestly

When the interface says **"3 of 5 available reviews describe it as home-style,"** each number is
literal. Three reviews contain the phrase. Five reviews exist — that is Google's hard ceiling,
and stating the denominator is how the product tells you the limit of what it checked.

The alternative — "several reviewers mention" — is where invented quantities live. An earlier
version of this code reported a running line count as if it were a review count, so a third
evidence line claimed *"3 of 5 reviews"* when one review mentioned it. That was found and fixed,
and the honest count is now tested.

---

## The score: 0–97, and you can check the arithmetic

Every signal you gave carries a weight:

```
   the dish itself ............................ 30
   sensory details + regional sub-style ....... 30
   cuisine + which version .................... 20
   person, venue, price, ritual, benchmark .... 20
```

**A signal earns its weight only if a verified quotation supports it.** Signals you never
mentioned are removed from the total, so the score answers one question: *of what you asked for,
how much can be proved?*

The rubric is displayed in the product. You can add up the evidence lines and reproduce the
number yourself — that is the requirement, not a nice-to-have.

Two deliberate refusals:

**It never shows 100%.** The cap is 97. In every real conversation studied, people say *"the
closest I've found"* — never *"perfect."* A restaurant is never entirely your grandmother's
cooking, and the residual gap is what makes *"Why not 100%?"* a real question with a real
answer.

**No evidence means no score.** Not a low percentage — no percentage. The candidate is labelled
*insufficient evidence.* A system that must always produce a winner will invent one, and the
correct answer to *"is there good Mexican food within 20 miles"* is sometimes **no.** When
nothing clears the bar, the product says so and offers two explicit choices: search further, or
accept a named substitute — with the relationship spelled out (*"same flavour profile, no
broth"*). It never quietly serves you something adjacent as though it were what you asked for.

---

## ④ The Explainer — why this one

A number is not an answer. The last stage writes the paragraph:

> *Reviews describe the restaurant bringing Brittany flavors to Alexandria, with one reviewer
> comparing the galettes to those eaten on a recent trip to Brittany. One of four available
> reviews highlights galettes made with a signature crisp, lacy edge. **No evidence either way
> on the specific dish menu item itself.***

Note the last sentence. **Naming the gap is required**, not optional — omitting it to make the
paragraph read better counts as a failure.

Prose is the easiest place in any AI system to smuggle in a claim nobody checked, so this stage
has its own guard: **the paragraph may only contain numbers that appear in the evidence.** Both
digits and spelled-out words. *"Seven reviewers say it tastes like home"* is rejected when one
did, and rejected paragraphs fall back to a plain summary assembled directly from the verified
lines — which means the explanation works even with no model available at all.

---

## What it actually returned

A real query, run against live data in Washington DC:

**Asked:** *"5 years ago, I ate these thin savoury crepes in France, it was darker than a normal
one, folded into a square with an egg cracked in the middle."*

```
It named the thing        Breton Buckwheat Galette
                          cuisine: French · region: Brittany
                          excluded: the sweet dessert kind

It searched               18 candidates within 20 miles

It locked                 MAISON BREIZH — 63% Memory Match
                          1205 Pendleton St, Alexandria, 6.6 mi

It proved                 "Transporting the authentic flavors of Brittany
                           right to Alexandria"
                          "Do not miss this yummy and authentic Breton
                           experience"
                          "The star of the show was undeniably the galettes
                           — masterfully executed with that signature
                           crisp, lacy edge"
                          "I just returned from a week in Brittany, and
                           these galettes and crepes are the real deal"

It admitted               no evidence on the specific menu listing
```

63%, not 94%. Four quotations, one gap named. The correct restaurant — a Breton crêperie —
found from a description that never used the word.

---

## How it is tested

The pipeline is checked against **twelve archetypes** drawn from real online conversations, each
one a distinct way this kind of search fails. Four are treated as release gates:

| Gate | What it proves |
|---|---|
| **Naming** | A food described in sensory detail but never named still gets named |
| **Refusing to fabricate** | With no supporting evidence, the system reports *insufficient evidence* rather than a plausible percentage |
| **Negation** | *"not too sour"* becomes a filter, never a preference for sourness |
| **Substitution** | Alternative spellings are searched, and any substitute offered states its relationship to the original |

A fifth mandatory case guards the one location bug that presents as working software: if the
memory says the food came from Hunan and the user is in Washington DC, the search must run in
**Washington DC** and keep Hunan as a style signal. Searching Hunan would return results, look
entirely correct, and be completely wrong.

**81 automated tests. Type checking clean. Every fallback path logs why it fired** — a lesson
learned the hard way, when a retired model caused every call to fail silently and the whole
pipeline ran on a keyword table for an entire session with no visible symptom. A fallback that
cannot be observed is indistinguishable from the real thing working.

---

## What it stores about you

Nothing on a server. No account, no database, no history.

Your city and search radius are remembered **on your own device** so you do not retype them.
Coordinates are rounded to about 100 metres before they are sent, are never written to a URL,
and are discarded when the answer is drawn. Restaurant data is fetched for your request and
thrown away.

And the question is always about the food, never about you — *"where was the version you
remember from?"*, never *"where are you from?"* That distinction came directly from the research:
in a thread asking immigrants which restaurant best matched their country's food, the top
comment — with more upvotes than the post itself — was **"Nice try ICE…"** The question was
innocent. The reflex was not. Asking about the food is both safer and a more accurate
description of what the system actually needs to know.

---

## The one sentence

> **It is not a restaurant recommender. It turns an imperfect food memory into a searchable
> hypothesis, sends a search across real restaurants, and only claims a match when it can prove
> it — in the restaurant's own words.**
