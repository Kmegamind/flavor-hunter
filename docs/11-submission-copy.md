# Flavor Hunter — submission copy (hackathon cut)

Stop at the PRD line (`docs/02-prd.md` §10). Do **not** claim FR-11–17. The system is a **three-stage pipeline** (parse → hunt → evidence), not an agent runtime.

## One-liner

A handheld tracker for tastes you remember but cannot name — it names the category, hunts restaurants live, and only locks a match with byte-verified quotes.

## Short description (judges)

Flavor Hunter turns an undescribable taste memory into a searchable hypothesis, then hunts restaurants in the city you are in. Matches are ranked by a hand-auditable Memory Match score. Every displayed quote is a literal substring of fetched menu or review text. If live search is unavailable, a labelled cached example still completes the demo.

## What to say on camera

1. **Not a map. Not Yelp.** The subject is the memory; the dog is tracking it.
2. **Three-stage pipeline:** parse the memory → hunt with Places (polar blips only) → batched evidence with byte-verify.
3. **A2 is the signature:** “East Coast Chinese-American” — the name the user did not have.
4. **A6 honesty:** if earned evidence is 0, there is no percentage. Widen is offered, never faked.
5. **Refine is local.** “Not quite / too sour” re-ranks on-device. Score may fall.

## Thumbnail

`public/og-image.png` — Boston Terrier `point` pose + **94 MEMORY MATCH**.

## Demo video shot list (~90 s)

| t | Shot | On-screen |
|---|---|---|
| 0–4 s | Boot self-test | SCOPE OK · HOUND AWAKE |
| 4–10 s | Seeded chip | 外婆的甜口番茄炒蛋 / Boston / 20 mi |
| 10–18 s | Decode | category name + assumption chips (`?` / ✓) |
| 18–40 s | Hunt | polar blips, dog runs, sniffs, rejects; waits during evidence batch |
| 40–55 s | Lock | `point` pose, 94 MEMORY MATCH, quotes you can read |
| 55–70 s | Refine | NOT QUITE → too sour → score may drop → Try the next one |
| 70–85 s | Insurance | labelled banner if live search is down |
| 85–90 s | End card | Three-stage pipeline. Nothing stored. |

Record from `/?fixture=a1` (offline replay) then one live hunt if keys are present. Mute is default; unmute for proximity tone.

A poster hold lives at `public/demo.mp4` (og-image, 6s). Replace it with a screen recording of the shot list before upload.

## Out of scope (do not demo)

FR-11 multi-target list, FR-12 permalinks, FR-13 Reddit, FR-14 Surprise me, FR-15 photo input, FR-16 saved memories, FR-17 operator claiming.
