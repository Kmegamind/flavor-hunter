const DEFAULT_MODEL = "gemini-3.6-flash"

export function geminiKey(): string | undefined {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY
}

export function geminiModel(): string {
  return process.env.GEMINI_MODEL ?? DEFAULT_MODEL
}

/** One generateContent call. Returns model text, or null on any failure. */
export async function geminiGenerate(
  system: string,
  user: string,
  maxTokens: number,
  /** Ask for JSON. Set false for prose — otherwise the model wraps the paragraph in an object. */
  json = true,
): Promise<string | null> {
  const key = geminiKey()
  if (!key) return null
  const model = geminiModel()
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": key,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature: 0.2,
        ...(json ? { responseMimeType: "application/json" } : {}),
      },
    }),
  })
  if (!res.ok) {
    // Never swallow this. A silent null here is indistinguishable from "the model had
    // nothing to say", and it hid a complete outage: `gemini-2.5-flash` was retired for
    // new users, every call 404'd, and the pipeline ran on the heuristic phrase table
    // for an entire session without a single visible symptom.
    const detail = await res.text().catch(() => "")
    console.warn(
      `[gemini] ${model} HTTP ${res.status} — falling back to heuristic. ${detail.slice(0, 300)}`,
    )
    return null
  }
  const body = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
  }
  const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? ""
  return text.trim() ? text : null
}
