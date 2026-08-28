"use client"

import { useEffect, useRef } from "react"
import { blit, type Pose } from "@/lib/hound-pixels"

/** Fixed-position title hound. Pose tracks hunt phase; it does not travel on the map. */
export function HoundTitle({ pose, collar }: { pose: Pose | string; collar: string }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const c = ref.current
    if (!c) return
    const ctx = c.getContext("2d")
    if (!ctx) return
    const scale = 3
    const cols = 16
    const rows = 12
    const w = cols * scale
    const h = rows * scale
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    c.width = Math.round(w * dpr)
    c.height = Math.round(h * dpr)
    c.style.width = `${w}px`
    c.style.height = `${h}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.imageSmoothingEnabled = false

    let raf = 0
    let last = performance.now()
    let frame = 0
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches

    const tick = (now: number) => {
      const dt = Math.min(32, now - last)
      last = now
      if (!reduced) frame += dt * 0.012
      ctx.clearRect(0, 0, w, h)
      blit(ctx, pose, w / 2, h, scale, false, collar, Math.floor(frame))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [pose, collar])

  return <canvas id="title-hound" ref={ref} width={48} height={36} aria-hidden />
}
