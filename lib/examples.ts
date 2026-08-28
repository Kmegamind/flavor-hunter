export type SeededExample = {
  id: string
  memory_text: string
  locale: string
}

/**
 * Pre-filled in the textarea on load.
 *
 * A prefilled memory rather than a placeholder, because the point of this screen is to teach
 * the *granularity* — one or two sentences with a dish, a place, and a physical detail. A
 * placeholder is greyed out and reads as instruction; filled text reads as "this is the kind
 * of thing that works", and a judge can hit HUNT without typing anything (FR-4c: the seeded
 * path must succeed deterministically).
 *
 * Naming test: it describes a galette without ever using the word.
 */
export const DEFAULT_MEMORY =
  "5 years ago, I ate these thin savoury crepes in France, it was darker than a normal one, folded into a square with an egg cracked in the middle."

/**
 * Shown in full underneath, not as labels.
 *
 * Chips reading "Tacos from back home" taught nothing — the whole lesson of this screen is how
 * much detail to give, and a three-word label demonstrates the opposite. Each exercises a
 * different shape of result:
 *
 *   sandiego  many candidates, and only evidence can separate them. Region-within-a-country
 *             plus a hard negation ("nothing else piled on top").
 *   lao       few candidates, a person anchor, and the exclusion rule that matters most:
 *             "not a Thai restaurant with a couple of Lao dishes" must be read as a filter,
 *             not as an interest in Thai food. Also the only example that reaches the Reddit
 *             corpus — Thip Khao is a DC entry in data/reddit-corpus.json.
 */
export const SEEDED_EXAMPLES: SeededExample[] = [
  {
    id: "sandiego",
    memory_text:
      "I grew up in San Diego and I try to find a carne asada taco like the ones from the little shops there. Small corn tortillas, just meat with onion and cilantro, and nothing else piled on top.",
    locale: "en",
  },
  {
    id: "lao",
    memory_text:
      "My family is Lao and I'm looking for somewhere that makes laab and sticky rice the way my mom did, not a Thai restaurant with a couple of Lao dishes on the menu.",
    locale: "en",
  },
]
