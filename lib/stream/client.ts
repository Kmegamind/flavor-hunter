import type { HuntEvent, HuntRequest } from "@/schemas"
import { EMBEDDED } from "@/lib/fixtures/embedded"
import { reanchorEvent } from "@/lib/stream/reanchor-blips"

function keepBlips(event: HuntEvent): HuntEvent {
  return event
}

export async function huntStream(
  request: HuntRequest,
  signal: AbortSignal,
  onEvent: (e: HuntEvent) => void,
): Promise<"live" | "fixture"> {
  try {
    const res = await fetch("/api/hunt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
      signal,
    })
    if (!res.ok || !res.body) throw new Error("hunt http")
    const reader = res.body.getReader()
    const dec = new TextDecoder()
    let buf = ""
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      const parts = buf.split("\n")
      buf = parts.pop() ?? ""
      for (const line of parts) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          const raw = JSON.parse(trimmed) as HuntEvent
          onEvent(keepBlips(raw))
        } catch {
          /* ignore unknown / partial */
        }
      }
    }
    if (buf.trim()) {
      try {
        onEvent(keepBlips(JSON.parse(buf.trim()) as HuntEvent))
      } catch {
        /* ignore */
      }
    }
    return "live"
  } catch (err) {
    const aborted =
      signal.aborted ||
      (typeof DOMException !== "undefined" && err instanceof DOMException && err.name === "AbortError") ||
      (err instanceof Error && err.name === "AbortError")
    if (aborted) return "live"
    onEvent({ type: "degraded", reason: "network" })
    throw err
  }
}

export async function replayNdjson(
  text: string,
  onEvent: (e: HuntEvent) => void,
  opts?: {
    pacing?: boolean
    signal?: AbortSignal
    reanchorTo?: { lat: number; lng: number }
  },
): Promise<void> {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
  for (const line of lines) {
    if (opts?.signal?.aborted) return
    const raw = JSON.parse(line) as Record<string, unknown>
    const delay = typeof raw._delay_ms === "number" ? raw._delay_ms : 400
    delete raw._delay_ms
    let event = keepBlips(raw as unknown as HuntEvent)
    if (opts?.reanchorTo) event = reanchorEvent(event, opts.reanchorTo)
    onEvent(event)
    if (opts?.pacing !== false) await sleep(delay, opts?.signal)
  }
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener("abort", () => {
      clearTimeout(t)
      resolve()
    })
  })
}

export async function loadFixture(name: string): Promise<string> {
  if (EMBEDDED[name]) return EMBEDDED[name]
  const res = await fetch(`/fixtures/${name}.ndjson`, { cache: "force-cache" })
  if (!res.ok) throw new Error(`missing fixture ${name}`)
  return res.text()
}
