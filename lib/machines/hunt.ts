import type { AnchorSet, HuntEvent, HuntRequest, RankedCandidate } from "@/schemas"

export type HuntPhase =
  | "S0_IDLE"
  | "S1_DECODING"
  | "S1B_CONFIRM"
  | "S2_NEED_CLUE"
  | "S3_HUNTING"
  | "S4_LOCKED"
  | "S5_EVIDENCE"
  | "S6_REFINING"
  | "S7_DEGRADED"
  | "S8_NO_ANSWER"

export type HuntBlip = {
  id: string
  bearing: number
  distance: number
  lat: number
  lng: number
  status: "unresolved" | "candidate" | "eliminated" | "locked"
  reason?: string
}

export type HuntState = {
  phase: HuntPhase
  /** Name is in, anchors are still coming. */
  interpreting?: boolean
  /** Best candidate scored under the confidence bar — offers shown above the ranking. */
  below_bar?: boolean
  best_score?: number | null
  request: HuntRequest | null
  anchors: AnchorSet | null
  category_name: string | null
  category_confidence: number | null
  blips: HuntBlip[]
  ranked: RankedCandidate[]
  locked_id: string | null
  widen_offer: { from_mi: number; to_mi: number | null; why: string } | null
  substitute_offer: { from: string; to: { dish?: string; cuisine?: string; relation: string } } | null
  degraded: boolean
  degraded_reason: string | null
  last_error: string | null
  evidence_index: number | null
  missing_required: string[]
  broadened: string | null
}

export const initialHuntState: HuntState = {
  phase: "S0_IDLE",
  request: null,
  anchors: null,
  category_name: null,
  category_confidence: null,
  blips: [],
  ranked: [],
  locked_id: null,
  widen_offer: null,
  substitute_offer: null,
  degraded: false,
  degraded_reason: null,
  last_error: null,
  evidence_index: null,
  missing_required: [],
  broadened: null,
}

export type HuntAction =
  | { type: "SUBMIT"; request: HuntRequest }
  | { type: "STREAM"; event: HuntEvent }
  | { type: "STREAM_END" }
  | { type: "STREAM_ABORT" }
  | { type: "OPEN_EVIDENCE"; index: number }
  | { type: "CLOSE_EVIDENCE" }
  | { type: "REFINE" }
  | {
      type: "REFINE_DONE"
      ranked: RankedCandidate[]
      locked_id: string | null
      anchors: AnchorSet
    }
  | { type: "RESET" }
  | { type: "TRY_NEXT" }
  | { type: "SELECT_CANDIDATE"; id: string }
  | { type: "PATCH_ANCHORS"; anchors: AnchorSet }

function illegal(from: HuntPhase, action: HuntAction): boolean {
  if (action.type === "STREAM") {
    const t = action.event.type
    if (from === "S0_IDLE") return true
    if (from === "S2_NEED_CLUE" && (t === "candidates" || t === "evaluated" || t === "locked")) return true
    // `reason` arrives *after* `locked` by design, so the post-lock phases must accept it.
    // Without this exemption the guard silently swallowed it and the paragraph never appeared
    // — the failure mode of streaming an event into a state machine that was written when
    // everything still arrived before the lock.
    if (
      (from === "S4_LOCKED" || from === "S5_EVIDENCE" || from === "S6_REFINING") &&
      t !== "degraded" &&
      t !== "reason"
    ) {
      return true
    }
    if (from === "S6_REFINING" && t !== "reason") return true
    if (t === "locked") {
      const ranked = action.event.type === "locked" ? action.event.ranked : []
      if (ranked.some((r) => r.score === 0)) return true
    }
  }
  if (from === "S1B_CONFIRM" && action.type === "STREAM") {
    const t = action.event.type
    if (t === "candidates" || t === "evaluated" || t === "locked") return true
  }
  if (from === "S6_REFINING" && action.type === "SUBMIT") return true
  if (from === "S3_HUNTING" && (action.type === "OPEN_EVIDENCE" || action.type === "REFINE")) return true
  if (from === "S8_NO_ANSWER" && action.type === "REFINE") return true
  return false
}

export function huntReducer(state: HuntState, action: HuntAction): HuntState {
  if (illegal(state.phase, action)) {
    if (process.env.NODE_ENV !== "production") {
      console.assert(false, `illegal hunt transition ${state.phase} ← ${action.type}`)
    }
    return state
  }

  switch (action.type) {
    case "SUBMIT":
      return {
        ...initialHuntState,
        phase: "S1_DECODING",
        request: action.request,
        degraded: false,
      }
    case "RESET":
      return { ...initialHuntState }
    case "STREAM_ABORT":
      return { ...initialHuntState, last_error: "aborted" }
    case "STREAM_END": {
      const named = Boolean(
        state.category_name || state.anchors?.dish || state.anchors?.cuisine,
      )
      if (
        state.phase === "S1_DECODING" &&
        state.request &&
        !state.request.confirmed &&
        named &&
        !state.missing_required.includes("dish_or_cuisine") &&
        !state.missing_required.includes("intent")
      ) {
        return { ...state, phase: "S1B_CONFIRM" }
      }
      return state
    }
    case "OPEN_EVIDENCE":
      if (state.phase !== "S4_LOCKED") return state
      return { ...state, phase: "S5_EVIDENCE", evidence_index: action.index }
    case "CLOSE_EVIDENCE":
      if (state.phase !== "S5_EVIDENCE") return state
      return { ...state, phase: "S4_LOCKED", evidence_index: null }
    case "REFINE":
      if (state.phase !== "S4_LOCKED" && state.phase !== "S5_EVIDENCE") return state
      return { ...state, phase: "S6_REFINING" }
    case "REFINE_DONE":
      return {
        ...state,
        phase: "S4_LOCKED",
        ranked: action.ranked,
        locked_id: action.locked_id,
        anchors: action.anchors,
      }
    case "TRY_NEXT": {
      if (state.phase !== "S4_LOCKED") return state
      const rest = state.ranked.filter((r) => r.id !== state.locked_id && r.score !== null)
      const next = rest[0]
      if (!next) return state
      return {
        ...state,
        locked_id: next.id,
        blips: state.blips.map((b) => ({
          ...b,
          status: b.id === next.id ? "locked" : b.id === state.locked_id ? "eliminated" : b.status,
        })),
      }
    }
    case "SELECT_CANDIDATE": {
      if (state.phase !== "S4_LOCKED" && state.phase !== "S5_EVIDENCE") return state
      if (!state.ranked.some((r) => r.id === action.id && r.score !== null)) return state
      return {
        ...state,
        phase: "S4_LOCKED",
        locked_id: action.id,
        evidence_index: null,
        blips: state.blips.map((b) => ({
          ...b,
          status: b.id === action.id ? "locked" : b.status === "eliminated" ? "eliminated" : "candidate",
        })),
      }
    }
    case "PATCH_ANCHORS":
      if (state.phase !== "S1B_CONFIRM") return state
      return { ...state, anchors: action.anchors }
    case "STREAM":
      return applyEvent(state, action.event)
    default:
      return state
  }
}

function applyEvent(state: HuntState, event: HuntEvent): HuntState {
  switch (event.type) {
    case "parsed":
      return {
        ...state,
        interpreting: false,
        anchors: event.anchors,
        category_name: event.category_name,
        category_confidence: event.confidence,
        missing_required: event.missing_required,
      }
    case "need_clue":
      return {
        ...state,
        phase: "S2_NEED_CLUE",
        missing_required: event.missing_required,
      }
    case "degraded":
      return {
        ...state,
        phase: state.phase === "S4_LOCKED" ? state.phase : "S7_DEGRADED",
        degraded: true,
        degraded_reason: event.reason,
      }
    case "broadened":
      return { ...state, broadened: `${event.dropped}:${event.now}` }
    case "candidates": {
      const blips: HuntBlip[] = event.blips.map((b) => ({
        ...b,
        lat: b.lat,
        lng: b.lng,
        status: "unresolved",
      }))
      const hunting = state.phase === "S7_DEGRADED" ? "S7_DEGRADED" : "S3_HUNTING"
      return { ...state, phase: hunting, blips }
    }
    case "evaluated":
      return {
        ...state,
        blips: state.blips.map((b) => (b.id === event.id ? { ...b, status: "candidate" } : b)),
      }
    case "eliminated":
      return {
        ...state,
        blips: state.blips.map((b) =>
          b.id === event.id ? { ...b, status: "eliminated", reason: event.reason } : b,
        ),
      }
    case "widen":
      return {
        ...state,
        phase: "S8_NO_ANSWER",
        widen_offer: { from_mi: event.from_mi, to_mi: event.to_mi, why: event.why },
      }
    case "substitute":
      return {
        ...state,
        phase: "S8_NO_ANSWER",
        substitute_offer: { from: event.from, to: event.to },
      }
    case "interpreted":
      // The headline lands here; the anchors arrive with `parsed` a few seconds later.
      return {
        ...state,
        category_name: event.category_name,
        category_confidence: event.confidence,
        interpreting: true,
      }
    case "reason":
      // Arrives after `locked`, so patch the candidate already on screen rather than
      // waiting for it. Anything else would put the whole result behind the slowest call.
      return {
        ...state,
        ranked: state.ranked.map((r) =>
          r.id === event.id
            ? { ...r, reason: event.reason, reason_source: event.reason_source }
            : r,
        ),
      }
    case "locked": {
      const locked = event.ranked.find((r) => r.score !== null) ?? null
      // Below the bar the offers were already sent, so the phase stays S8 and this ranking
      // renders underneath them. The near-misses are shown rather than withheld: the user
      // asked a question and there is a closest answer, it just is not a good one.
      const belowBar = event.below_bar === true
      return {
        ...state,
        below_bar: belowBar,
        best_score: event.best_score ?? null,
        phase: belowBar ? state.phase : "S4_LOCKED",
        ranked: event.ranked,
        locked_id: locked?.id ?? null,
        blips: state.blips.map((b) => ({
          ...b,
          status: b.id === locked?.id ? "locked" : b.status === "eliminated" ? "eliminated" : "candidate",
        })),
      }
    }
    default:
      return state
  }
}
