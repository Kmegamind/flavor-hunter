import type { AnchorSet, RankedCandidate } from "@/schemas"
import { memoryMatch } from "@/schemas/score"

export type Correction =
  | { kind: "edit"; field: string; value: unknown }
  | { kind: "nl"; text: string }

export type RefineOutput = {
  anchors: AnchorSet
  category_name: string
  ranked: RankedCandidate[]
  locked_id: string | null
  deltas: { field: string; from: unknown; to: unknown }[]
}

function applyNl(anchors: AnchorSet, text: string): AnchorSet {
  const t = text.toLowerCase()
  const next: AnchorSet = {
    ...anchors,
    sensory: [...anchors.sensory],
    negation: [...anchors.negation],
  }
  if (/too sour|too acidic/.test(t)) {
    next.sensory.push({ value: "low acidity", confidence: 0.7 })
    next.negation.push({ field: "sensory", value: "sour" })
  } else if (/too sweet/.test(t)) {
    next.sensory.push({ value: "less sweet", confidence: 0.7 })
    next.negation.push({ field: "sensory", value: "sweet" })
  } else if (/too salty/.test(t)) {
    next.sensory.push({ value: "less salty", confidence: 0.7 })
    next.negation.push({ field: "sensory", value: "salty" })
  } else {
    next.sensory.push({ value: text, confidence: 0.4 })
  }
  return next
}

export function refine(input: {
  anchors: AnchorSet
  category_name: string
  ranked: RankedCandidate[]
  correction: Correction
}): RefineOutput {
  const before = input.anchors
  let anchors = structuredClone(before)
  const deltas: RefineOutput["deltas"] = []

  if (input.correction.kind === "nl") {
    anchors = applyNl(anchors, input.correction.text)
    deltas.push({ field: "sensory", from: before.sensory, to: anchors.sensory })
  } else if (input.correction.field !== "category_name") {
    const key = input.correction.field as keyof AnchorSet
    if (key in anchors) {
      deltas.push({ field: String(key), from: anchors[key], to: input.correction.value })
      ;(anchors as Record<string, unknown>)[key] = input.correction.value
    }
  }

  const supplied = new Set<string>([
    ...(anchors.dish ? ["dish"] : []),
    ...(anchors.cuisine ? ["cuisine"] : []),
    ...(anchors.substyle ? ["substyle"] : []),
    ...(anchors.direction ? ["direction"] : []),
    ...(anchors.person ? ["person"] : []),
    ...(anchors.setting ? ["setting"] : []),
    ...(anchors.ritual ? ["ritual"] : []),
    ...(anchors.price_band ? ["price_band"] : []),
    ...(anchors.benchmark ? ["benchmark"] : []),
    ...anchors.sensory.map(() => "sensory"),
  ])

  const ranked = input.ranked.map((c) => {
    const evidence = c.evidence.filter((e) => supplied.has(e.anchor) || e.anchor === "sensory")
    const score = memoryMatch(anchors, evidence)
    return { ...c, evidence, score }
  })
  ranked.sort((a, b) => {
    if (a.score === null && b.score === null) return 0
    if (a.score === null) return 1
    if (b.score === null) return -1
    return b.score - a.score
  })
  const locked = ranked.find((r) => r.score !== null)
  return {
    anchors,
    category_name: input.category_name,
    ranked,
    locked_id: locked?.id ?? null,
    deltas,
  }
}
