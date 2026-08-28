import type { HuntEvent } from "@/schemas"

export function ndjson(ev: HuntEvent): string {
  return JSON.stringify(ev) + "\n"
}

export function ndjsonStream(events: AsyncIterable<HuntEvent> | HuntEvent[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  const list = Array.isArray(events) ? events : null
  return new ReadableStream({
    async start(controller) {
      try {
        if (list) {
          for (const ev of list) controller.enqueue(enc.encode(ndjson(ev)))
        } else {
          for await (const ev of events) controller.enqueue(enc.encode(ndjson(ev)))
        }
        controller.close()
      } catch (e) {
        controller.error(e)
      }
    },
  })
}
