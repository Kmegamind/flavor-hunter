"use client"

import { useEffect, useRef, type MutableRefObject, type RefObject } from "react"
import type { HuntBlip } from "@/lib/machines/hunt"
import { blit } from "@/lib/hound-pixels"

export type ScopeSnapshot = {
  blips: HuntBlip[]
  sniff_id: string | null
  wait: boolean
  locked_id: string | null
  pose: string
  flip: boolean
  collar: string
  range_mi: number
  reduced_motion: boolean
  phase: string
  use_map: boolean
}

const SIG = "#FF3D00"
const LOCK = "#FFC400"
const PROOF = "#7CFF6B"
const CYN = "#5CE1FF"
const REJ = "#3D5566"
const LAND = "#0C1C33"
const WATER = "#071426"
const GRID = "#1A3A5C"

function polarToXY(
  bearing: number,
  distance: number,
  cx: number,
  cy: number,
  r: number,
  range: number,
) {
  const rad = ((bearing - 90) * Math.PI) / 180
  const d = Math.min(distance / Math.max(range, 1), 1) * r
  return { x: cx + Math.cos(rad) * d, y: cy + Math.sin(rad) * d }
}

export function RadarCanvas({
  scopeRef,
  miniRef,
}: {
  scopeRef: MutableRefObject<ScopeSnapshot>
  miniRef?: RefObject<HTMLCanvasElement | null>
}) {
  const fieldRef = useRef<HTMLCanvasElement>(null)
  const sweepRef = useRef(0)
  const pulseRef = useRef(0)
  const brkRef = useRef(0)
  /** Scout position in canvas space, eased toward its target between events. */
  const scoutRef = useRef<{ x: number; y: number; init: boolean }>({ x: 0, y: 0, init: false })
  const runFrameRef = useRef(0)
  const runClockRef = useRef(0)

  useEffect(() => {
    const field = fieldRef.current
    if (!field) return
    const fx = field.getContext("2d")
    if (!fx) return
    let raf = 0
    let last = performance.now()

    const fit = () => {
      const parent = field.parentElement
      if (!parent) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const W = Math.round(parent.clientWidth)
      const H = Math.round(parent.clientHeight)
      field.width = W * dpr
      field.height = H * dpr
      field.style.width = `${W}px`
      field.style.height = `${H}px`
      fx.setTransform(dpr, 0, 0, dpr, 0, 0)
      fx.imageSmoothingEnabled = false
    }
    fit()
    const ro = new ResizeObserver(fit)
    if (field.parentElement) ro.observe(field.parentElement)

    const tick = (now: number) => {
      const dt = Math.min(32, now - last)
      last = now
      const parent = field.parentElement
      if (!parent) {
        raf = requestAnimationFrame(tick)
        return
      }
      const W = parent.clientWidth
      const H = parent.clientHeight
      const CX = W * 0.52
      const CY = H * 0.52
      const R = Math.min(W, H) * 0.38
      const snap = scopeRef.current
      const reduced = snap.reduced_motion

      if (!reduced && (snap.phase.includes("HUNT") || snap.phase.includes("LOCK") || snap.phase.includes("DECOD") || snap.phase.includes("S3") || snap.phase.includes("S1") || snap.phase.includes("S4") || snap.phase.includes("S7"))) {
        sweepRef.current += 0.002 * dt
      }

      if (snap.locked_id) {
        pulseRef.current = Math.min(1, pulseRef.current + 0.02)
        brkRef.current = Math.min(1, brkRef.current + 0.05)
      } else {
        pulseRef.current = 0
        brkRef.current = 0
      }

      fx.clearRect(0, 0, W, H)
      if (!snap.use_map) {
      fx.fillStyle = WATER
      fx.fillRect(0, 0, W, H)
      fx.fillStyle = LAND
      ;[
        [0.2, 0.3, 0.55, 0.7],
        [0.55, 0.15, 0.7, 0.5],
        [0.1, 0.65, 0.4, 0.5],
        [0.6, 0.55, 0.5, 0.55],
      ].forEach((e) => {
        fx.beginPath()
        fx.ellipse(W * e[0], H * e[1], (W * e[2]) / 2, (H * e[3]) / 2, 0, 0, 6.28)
        fx.fill()
      })
      fx.strokeStyle = GRID
      fx.lineWidth = 1
      fx.globalAlpha = 0.35
      for (let x = 0; x < W; x += 28) {
        fx.beginPath()
        fx.moveTo(x, 0)
        fx.lineTo(x, H)
        fx.stroke()
      }
      for (let y = 0; y < H; y += 28) {
        fx.beginPath()
        fx.moveTo(0, y)
        fx.lineTo(W, y)
        fx.stroke()
      }
      fx.globalAlpha = 1

      fx.strokeStyle = "#1A3A5C"
      for (let i = 1; i <= 3; i++) {
        fx.beginPath()
        fx.arc(CX, CY, (R * i) / 3, 0, 6.28)
        fx.stroke()
      }
      }

      const hunting =
        snap.phase === "S3_HUNTING" ||
        snap.phase === "S7_DEGRADED" ||
        snap.phase === "S4_LOCKED" ||
        snap.phase === "S1_DECODING" ||
        snap.phase === "S5_EVIDENCE"
      if (hunting && !reduced) {
        const sweep = sweepRef.current
        fx.save()
        fx.beginPath()
        fx.moveTo(CX, CY)
        fx.arc(CX, CY, R * 1.15, sweep - 0.5, sweep)
        fx.closePath()
        fx.fillStyle = "rgba(255,61,0,.10)"
        fx.fill()
        fx.beginPath()
        fx.moveTo(CX, CY)
        fx.lineTo(CX + Math.cos(sweep) * R * 1.15, CY + Math.sin(sweep) * R * 1.15)
        fx.strokeStyle = SIG
        fx.lineWidth = 2
        fx.stroke()
        fx.restore()
      }

      snap.blips.forEach((b) => {
        const p = polarToXY(b.bearing, b.distance, CX, CY, R, snap.range_mi)
        const col =
          b.status === "eliminated" ? REJ : b.status === "locked" ? SIG : b.status === "candidate" ? PROOF : CYN
        const sz = b.status === "locked" ? 7 : 4
        fx.save()
        fx.translate(p.x, p.y)
        fx.rotate(Math.PI / 4)
        fx.fillStyle = col
        fx.globalAlpha = b.status === "eliminated" ? 0.4 : 1
        fx.fillRect(-sz, -sz, sz * 2, sz * 2)
        fx.fillStyle = WATER
        fx.fillRect(-sz + 2, -sz + 2, sz * 2 - 4, sz * 2 - 4)
        fx.restore()
        fx.globalAlpha = 1
        if (b.status === "eliminated") {
          fx.strokeStyle = REJ
          fx.beginPath()
          fx.moveTo(p.x - 6, p.y - 6)
          fx.lineTo(p.x + 6, p.y + 6)
          fx.stroke()
        }
        if (b.status === "locked" && !reduced) {
          for (let k = 0; k < 2; k++) {
            fx.beginPath()
            fx.arc(p.x, p.y, 16 + pulseRef.current * 36 + k * 12, 0, 6.28)
            fx.strokeStyle = SIG
            fx.globalAlpha = Math.max(0, 0.5 - pulseRef.current * 0.4 - k * 0.1)
            fx.lineWidth = 2
            fx.stroke()
          }
          fx.globalAlpha = 1
          const d = 26 + 32 * (1 - brkRef.current)
          ;[
            [-1, -1],
            [1, -1],
            [-1, 1],
            [1, 1],
          ].forEach((q) => {
            fx.strokeStyle = LOCK
            fx.lineWidth = 2
            fx.beginPath()
            fx.moveTo(p.x + q[0] * d, p.y + q[1] * d - q[1] * 10)
            fx.lineTo(p.x + q[0] * d, p.y + q[1] * d)
            fx.lineTo(p.x + q[0] * d - q[0] * 10, p.y + q[1] * d)
            fx.stroke()
          })
        }
      })

      // ── The scout ───────────────────────────────────────────────────────────
      // Was designed into ScopeSnapshot (pose / flip / collar / sniff_id) but never
      // drawn: the hound had been demoted to a static badge in the title bar. It now
      // travels the field, and its target is derived from real stream state — the blip
      // being sniffed, else the locked one. When the backend is waiting (`snap.wait`)
      // the scout holds its pose instead of running, per PRD FR-7a: the visual layer
      // may not animate through work the system is not doing.
      {
        const target =
          snap.blips.find((b) => b.id === snap.sniff_id) ??
          snap.blips.find((b) => b.id === snap.locked_id) ??
          null
        const home = { x: CX, y: CY }
        const dest = target
          ? (() => {
              const p = polarToXY(target.bearing, target.distance, CX, CY, R, snap.range_mi)
              return { x: p.x - 13, y: p.y + 11 }
            })()
          : home
        const s = scoutRef.current
        if (!s.init) {
          s.x = home.x
          s.y = home.y
          s.init = true
        }
        const dx = dest.x - s.x
        const dy = dest.y - s.y
        const dist = Math.hypot(dx, dy)
        const moving = dist > 1.5 && !snap.wait
        if (moving && !reduced) {
          const step = Math.min(dist, Math.max(1.2, dist * 0.14))
          s.x += (dx / dist) * step
          s.y += (dy / dist) * step
        } else if (reduced) {
          s.x = dest.x
          s.y = dest.y
        }

        runClockRef.current += dt
        if (runClockRef.current > 80) {
          runClockRef.current = 0
          runFrameRef.current = (runFrameRef.current + 1) % 8
        }

        const pose = moving ? "run" : snap.pose
        const flip = moving ? dx < 0 : snap.flip
        const scale = Math.max(2, Math.round(R / 120))
        blit(fx, pose, Math.round(s.x), Math.round(s.y), scale, flip, snap.collar, runFrameRef.current)
      }

      const mini = miniRef?.current
      if (mini) {
        const mx = mini.getContext("2d")
        if (mx) {
          const s = mini.parentElement?.clientWidth ?? 118
          const dpr = Math.min(window.devicePixelRatio || 1, 2)
          if (mini.width !== Math.round(s * dpr)) {
            mini.width = Math.round(s * dpr)
            mini.height = Math.round(s * dpr)
            mini.style.width = `${s}px`
            mini.style.height = `${s}px`
          }
          mx.setTransform(dpr, 0, 0, dpr, 0, 0)
          mx.imageSmoothingEnabled = false
          const c = s / 2
          const rr = s * 0.42
          mx.clearRect(0, 0, s, s)
          mx.fillStyle = "#071426"
          mx.beginPath()
          mx.arc(c, c, rr + 4, 0, 6.28)
          mx.fill()
          mx.strokeStyle = "#1A3A5C"
          for (let i = 1; i <= 3; i++) {
            mx.beginPath()
            mx.arc(c, c, (rr * i) / 3, 0, 6.28)
            mx.stroke()
          }
          mx.beginPath()
          mx.moveTo(c - rr, c)
          mx.lineTo(c + rr, c)
          mx.moveTo(c, c - rr)
          mx.lineTo(c, c + rr)
          mx.stroke()
          if (!reduced) {
            const sweep = sweepRef.current
            mx.strokeStyle = SIG
            mx.globalAlpha = 0.5
            mx.beginPath()
            mx.moveTo(c, c)
            mx.arc(c, c, rr, sweep - 0.4, sweep)
            mx.closePath()
            mx.fillStyle = "rgba(255,61,0,.12)"
            mx.fill()
            mx.beginPath()
            mx.moveTo(c, c)
            mx.lineTo(c + Math.cos(sweep) * rr, c + Math.sin(sweep) * rr)
            mx.stroke()
            mx.globalAlpha = 1
          }
          snap.blips.forEach((b) => {
            const rad = ((b.bearing - 90) * Math.PI) / 180
            const d = Math.min(b.distance / Math.max(snap.range_mi, 1), 1)
            const px = c + Math.cos(rad) * rr * d
            const py = c + Math.sin(rad) * rr * d
            mx.fillStyle =
              b.status === "eliminated" ? REJ : b.status === "locked" ? SIG : b.status === "candidate" ? PROOF : CYN
            mx.fillRect(px - 2, py - 2, 4, 4)
          })
        }
      }

      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [miniRef, scopeRef])

  return <canvas id="field" ref={fieldRef} aria-label="Hunt field" />
}
