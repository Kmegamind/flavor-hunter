# Flavor Hunter

**A search engine for tastes you remember but can't describe.**

You remember a thin, dark, savoury crepe folded into a square with an egg cracked in the middle,
eaten every day during a year in France. You don't know it's called a *galette de sarrasin*, that
it comes from Brittany, or that the sweet crepes sold near you are a different dish made from
different flour.

You aren't missing inventory. You're missing a query language.

Flavor Hunter turns an imperfect food memory into a searchable hypothesis, hunts real restaurants
for it, and **only claims a match when it can prove one — in the restaurant's own words.**

---

## A real run

Asked, in Washington DC:

> *"5 years ago, I ate these thin savoury crepes in France, it was darker than a normal one,
> folded into a square with an egg cracked in the middle."*

```
Named it       Breton Buckwheat Galette
               cuisine: French · region: Brittany
               excluded: the sweet dessert kind

Locked         MAISON BREIZH — 63% Memory Match
               1205 Pendleton St, Alexandria — 6.6 mi

Proved         "Transporting the authentic flavors of Brittany right to Alexandria"
               "Do not miss this yummy and authentic Breton experience"
               "The star of the show was undeniably the galettes — masterfully
                executed with that signature crisp, lacy edge"
               "I just returned from a week in Brittany, and these galettes and
                crepes are the real deal"

Admitted       no evidence on the specific menu listing
```

63%, not 94%. Four quotations, one gap named out loud. The right restaurant — a Breton crêperie —
found from a description that never used the word.

---

## How it works

Four stages. Three call a language model; **every one is followed by code that checks the
model's work.**

| | Stage | Does |
|---|---|---|
| ① | **Interpreter** | Names the dish you couldn't name. Extracts 13 signals, the spellings the map might use instead of yours, and what you *don't* want |
| — | *Ready gate* | Not enough to search on? Ask for exactly one clue and spend nothing |
| ② | **Hunter** | Google Places finds candidates; each restaurant's own website supplies the menu text. Places **cannot** confirm a dish — it has no menu field — which is why there are two sources |
| ③ | **Verifier** | Quotes, never paraphrases. Every quotation is checked character-by-character against the text actually fetched; anything unverifiable is deleted, not softened |
| ④ | **Explainer** | Two sentences on why this one, and it is required to name what it could *not* prove |

**Full plain-language walkthrough: [`docs/13-ai-pipeline-explained.md`](docs/13-ai-pipeline-explained.md)**

### Three refusals that define the product

- **It never shows 100%.** The cap is 97. Real people say *"the closest I've found,"* never
  *"perfect."*
- **No evidence means no score** — not a low percentage. The candidate is labelled *insufficient
  evidence*. A system that must crown a winner will invent one.
- **It says what it could not prove.** Omitting the gap to make the paragraph read better counts
  as a failure, and is tested as one.

---

## Design and engineering record

This repo carries its full decision history, including the mistakes and the reversals.

| Document | Contents |
|---|---|
| [`docs/01-user-research.md`](docs/01-user-research.md) | 8 findings from real city-subreddit threads, every citation verified with vote counts |
| [`docs/02-prd.md`](docs/02-prd.md) | 20 numbered requirements with acceptance criteria and design rationale |
| [`docs/03-tech-design.md`](docs/03-tech-design.md) | Architecture, latency budget, prompt contracts, and **§11: verbatim platform-terms analysis** |
| [`docs/04-taste-memory-archetypes.md`](docs/04-taste-memory-archetypes.md) | The 12-archetype regression suite, each drawn from a real conversation |
| [`docs/12-changelog.md`](docs/12-changelog.md) | Remediation log: 7 defects found by running the thing, what each fix was, and 2 left open with reasoning |
| [`docs/13-ai-pipeline-explained.md`](docs/13-ai-pipeline-explained.md) | The pipeline in plain language |

**81 automated tests.** Four are release gates: naming, refusing to fabricate, negation handling,
and honest substitution. A fifth guards the one location bug that presents as working software —
if the memory says the food came from Hunan and you are in DC, the search must run in **DC**.

---

## Notes on platform terms

Read in full and recorded verbatim in [`docs/03-tech-design.md`](docs/03-tech-design.md) §11.
The consequences that shaped the build:

- **No caching of Places content.** Only `place_id` and coordinates may be retained, so nothing
  else is — every field is fetched per request and discarded.
- **Places content requires a Google basemap.** MapLibre + Places is prohibited by explicit
  example, so the map is the Google Maps JS API with Cloud-based Maps Styling.
- **Google review text is never sent to a third-party model.** It is matched inside our own
  request handler by plain text matching — which is also *verbatim by construction*, and so the
  more trustworthy of the two evidence paths.

## Privacy

No account, no database, no server-side history. City and radius are remembered on your own
device. Coordinates are rounded to ~100 m before transmission, never placed in a URL, and
discarded when the answer is drawn.

The question is always about the food, never about you — *"where was the version you remember
from?"*, never *"where are you from?"* That wording came from the research: in a thread asking
immigrants which restaurant best matched their country's food, the top comment, with more upvotes
than the post, was **"Nice try ICE…"**

---

## Running it

```bash
npm install
cp .env.example .env.local     # then fill in the keys
npm run dev
```

| Variable | For |
|---|---|
| `GEMINI_API_KEY` · `GEMINI_MODEL` | The three model calls |
| `GOOGLE_PLACES_API_KEY` | Places API (New) + Geocoding — server-side only |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Maps JavaScript API — restrict by HTTP referrer |
| `NEXT_PUBLIC_GOOGLE_MAP_ID` | Cloud-based Maps Styling. Import [`data/map-style-blue-violet.json`](data/map-style-blue-violet.json) |

```bash
npm test        # 81 tests
npm run harness # the 12 archetypes against the parser and gates
npm run art     # regenerate the sprite atlas from lib/hound-pixels.ts
```

The app runs without `GEMINI_API_KEY` — it degrades to a deterministic parser and a template
explanation, and says so in the server log. Every fallback announces itself, because a fallback
that cannot be observed is indistinguishable from the real thing working.

## Stack

Next.js 15 · React 19 · TypeScript · Zod · Vitest · Google Places API (New) · Google Maps JS API ·
Gemini. Streaming over `POST` + NDJSON (not `EventSource` — the memory is a request body). The
scope and the pixel scout are a single canvas driven by real stream events.
