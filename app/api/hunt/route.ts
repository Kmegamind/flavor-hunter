import { NextRequest } from "next/server"
import { dummyParsedEvent, streamHunt } from "@/lib/pipeline/run-hunt"
import { ndjson } from "@/lib/pipeline/stream"
import { HuntRequest } from "@/schemas"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const dummy = req.nextUrl.searchParams.get("dummy") === "1"
  const enc = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(enc.encode(ndjson(obj as never)))
      try {
        if (dummy) {
          send(dummyParsedEvent())
          controller.close()
          return
        }
        const body = await req.json()
        const parsed = HuntRequest.safeParse(body)
        if (!parsed.success) {
          send({ type: "degraded", reason: "bad_request" })
          send(dummyParsedEvent())
          controller.close()
          return
        }
        await streamHunt(parsed.data, send)
        controller.close()
      } catch {
        send({ type: "degraded", reason: "handler_throw" })
        send(dummyParsedEvent())
        controller.close()
      }
    },
  })
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  })
}
