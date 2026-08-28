import { describe, expect, it } from "vitest"
import { dummyParsedEvent } from "@/lib/pipeline/run-hunt"
import { HuntEvent } from "@/schemas"

describe("dummy NDJSON event", () => {
  it("is a valid parsed HuntEvent", () => {
    const ev = dummyParsedEvent()
    expect(HuntEvent.parse(ev).type).toBe("parsed")
  })
})
