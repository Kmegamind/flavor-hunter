/**
 * Flavor Hunter — frozen contracts.
 * Copied into the Next.js app as the single schema module (Zod).
 * Spec: docs/08-system-design.md §4, docs/10-pipeline-stages.md
 *
 * Peer dependency when wired into the app: `zod`
 */
import { z } from "zod"

export const RANGE_MI = [5, 10, 20, 45] as const
export type RangeMi = (typeof RANGE_MI)[number]

export const DirectionEnum = z.enum([
  "family_home",
  "street_stall",
  "restaurant_formal",
  "diaspora_adapted",
  "americanized_chain",
])
export type Direction = z.infer<typeof DirectionEnum>

export const IntentEnum = z.enum([
  "find_restaurant",
  "find_recipe",
  "find_grocery",
  "other",
])
export type Intent = z.infer<typeof IntentEnum>

export const ConfidenceValue = z.object({
  value: z.string().min(1),
  confidence: z.number().min(0).max(1),
})

export const Negation = z.object({
  field: z.string().min(1),
  value: z.string().min(1),
})

export const FallbackRung = z
  .object({
    dish: z.string().min(1).optional(),
    cuisine: z.string().min(1).optional(),
    relation: z.string().min(1),
  })
  .refine((r) => Boolean(r.dish || r.cuisine), { message: "fallback rung needs dish or cuisine" })
export type FallbackRung = z.infer<typeof FallbackRung>

export const SubstituteOffer = z.object({
  dish: z.string().min(1).optional(),
  cuisine: z.string().min(1).optional(),
  relation: z.string().min(1),
})
export type SubstituteOffer = z.infer<typeof SubstituteOffer>

export const AnchorSet = z.object({
  dish: ConfidenceValue.nullable(),
  cuisine: ConfidenceValue.nullable(),
  substyle: ConfidenceValue.nullable(),
  sensory: z.array(ConfidenceValue),
  direction: DirectionEnum.nullable(),
  person: ConfidenceValue.nullable(),
  setting: ConfidenceValue.nullable(),
  price_band: ConfidenceValue.nullable(),
  ritual: ConfidenceValue.nullable(),
  benchmark: ConfidenceValue.nullable(),
  negation: z.array(Negation),
  query_variants: z.array(z.string().min(1)).default([]),
  fallback_ladder: z.array(FallbackRung).default([]),
})
export type AnchorSet = z.infer<typeof AnchorSet>

export const MissingRequired = z.enum(["location", "dish_or_cuisine", "intent"])

/** Call A of the parse stage: judgement only — what is this, and what is it called. */
export const Interpretation = z.object({
  intent: IntentEnum,
  reasoning: z.string(),
  category_name: z.string(),
  category_name_native: z.string().nullish(),
  category_confidence: z.number().min(0).max(1),
})
export type Interpretation = z.infer<typeof Interpretation>

export const ParsedEnvelope = z.object({
  intent: IntentEnum,
  category_name: z.string(),
  /** Optional original-language label, shown as a subtitle under category_name. */
  category_name_native: z.string().nullish(),
  category_confidence: z.number().min(0).max(1),
  anchors: AnchorSet,
  searchable: z.boolean(),
  missing_required: z.array(MissingRequired),
})
export type ParsedEnvelope = z.infer<typeof ParsedEnvelope>

export const Coords = z.object({
  lat: z.number(),
  lng: z.number(),
}).refine(
  (c) => decimalPlaces(c.lat) <= 3 && decimalPlaces(c.lng) <= 3,
  { message: "coords must be rounded to ≤3 decimal places before transmit" },
)

function decimalPlaces(n: number): number {
  const s = String(n)
  const i = s.indexOf(".")
  return i === -1 ? 0 : s.length - i - 1
}

export const HuntRequest = z.object({
  memory_text: z.string().trim().min(1),
  locale: z.string().min(2),
  range_mi: z.custom<RangeMi>((v) => RANGE_MI.includes(v as RangeMi)),
  city_label: z.string().min(1),
  coords: Coords.optional(),
  /** FR-2a: parse + name the dish first. Places run only when true. */
  confirmed: z.boolean().optional(),
  /** One accepted ladder rung. Original memory_text stays unchanged (PRD FR-4b-2). */
  substitute: SubstituteOffer.optional(),
})
export type HuntRequest = z.infer<typeof HuntRequest>

export const Blip = z.object({
  id: z.string(),
  bearing: z.number().min(0).lt(360),
  distance: z.number().nonnegative(),
  lat: z.number(),
  lng: z.number(),
})

export const EvidenceSource = z.enum(["website", "google_review", "places_meta", "reddit"])
export const EvidenceMechanism = z.enum(["llm_extracted", "deterministic_match"])

export const EvidenceLine = z.object({
  anchor: z.string().min(1),
  /** Verbatim span of the fetched corpus, in its original language. NEVER altered. */
  quote: z.string().min(1),
  /** English rendering of `quote`. A translation, never presented as the quote itself.
   *  Absent when `quote` is already English. If absent, the UI shows `quote`. */
  quote_en: z.string().optional(),
  source: EvidenceSource,
  mechanism: EvidenceMechanism,
  source_name: z.string().min(1),
  fetched_at: z.string().min(1),
  source_date: z.string().optional(),
  denominator: z.string().optional(),
  /** Permalink for sources that have one (Reddit). Attribution, and it is checkable. */
  source_url: z.string().optional(),
  verified: z.literal(true),
})
export type EvidenceLine = z.infer<typeof EvidenceLine>

export const RankedCandidate = z.object({
  id: z.string(),
  name: z.string(),
  distance: z.number().nonnegative(),
  bearing: z.number().min(0).lt(360),
  score: z.number().int().min(1).max(97).nullable(),
  limited_evidence: z.boolean().optional(),
  address: z.string().min(1).optional(),
  evidence: z.array(EvidenceLine),
  excluded_by: z.string().optional(),
  /** Agent ③ — the "why this one" paragraph. Every claim traces to `evidence`. */
  reason: z.string().optional(),
  /** `written` = LLM prose that passed guardReason; `template` = deterministic floor. */
  reason_source: z.enum(["written", "template", "none"]).optional(),
})
export type RankedCandidate = z.infer<typeof RankedCandidate>

export const HuntEvent = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("parsed"),
    category_name: z.string(),
  /** Optional original-language label, shown as a subtitle under category_name. */
  category_name_native: z.string().nullish(),
    confidence: z.number().min(0).max(1),
    anchors: AnchorSet,
    searchable: z.boolean(),
    missing_required: z.array(MissingRequired),
  }),
  z.object({
    type: z.literal("need_clue"),
    missing_required: z.array(MissingRequired),
  }),
  z.object({
    type: z.literal("broadened"),
    dropped: z.enum(["price_band", "dish"]),
    now: z.string(),
  }),
  z.object({
    type: z.literal("candidates"),
    count: z.number().int().nonnegative(),
    blips: z.array(Blip),
  }),
  z.object({
    type: z.literal("evaluated"),
    id: z.string(),
    score_partial: z.number().optional(),
  }),
  z.object({
    type: z.literal("eliminated"),
    id: z.string(),
    reason: z.string().min(1),
  }),
  z.object({
    type: z.literal("widen"),
    from_mi: z.number(),
    to_mi: z.number().nullable(),
    why: z.string(),
    applied: z.literal(false),
  }),
  z.object({
    type: z.literal("substitute"),
    from: z.string(),
    to: SubstituteOffer,
    applied: z.literal(false),
  }),
  z.object({
    type: z.literal("locked"),
    ranked: z.array(RankedCandidate),
    /**
     * True when the best candidate scored under the confidence bar. The widen and substitute
     * offers are sent first; this ranking is still sent so the user can see the near-misses
     * rather than being told nothing exists.
     */
    below_bar: z.boolean().optional(),
    best_score: z.number().optional(),
  }),
  z.object({
    /**
     * Sent the moment the naming call returns, before the mapping call has finished.
     *
     * Naming takes roughly half the parse stage, and the name is the one thing the user is
     * waiting for — everything after it is bookkeeping. Emitting it early puts the headline on
     * screen at about twelve seconds instead of twenty-seven, without making anything faster.
     */
    type: z.literal("interpreted"),
    category_name: z.string(),
    category_name_native: z.string().nullish(),
    confidence: z.number(),
    reasoning: z.string(),
  }),
  z.object({
    /**
     * Sent after `locked`, because the reason is the slowest call in the pipeline and the
     * target does not need to wait for it. The user sees the lock land, then the paragraph
     * arrives — 5-8 seconds of perceived latency removed for nothing in return.
     */
    type: z.literal("reason"),
    id: z.string(),
    reason: z.string(),
    reason_source: z.enum(["written", "template", "none"]),
  }),
  z.object({
    type: z.literal("degraded"),
    reason: z.string(),
  }),
])
export type HuntEvent = z.infer<typeof HuntEvent>

/** LLM evidence output — quotes only. Handler byte-verifies then wraps EvidenceLine. */
export const EvidenceLlmItem = z.object({
  id: z.string(),
  evidence: z.array(
    z.object({
      anchor: z.string(),
      quote: z.string(),
      quote_en: z.string().optional(),
      source: z.literal("website"),
    }),
  ),
  excluded_by: z.string().optional(),
})
export const EvidenceLlmBatch = z.array(EvidenceLlmItem)
export type EvidenceLlmBatch = z.infer<typeof EvidenceLlmBatch>
