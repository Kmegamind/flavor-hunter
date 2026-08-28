const CACHE = [
  "/",
  "/fixtures/a1.ndjson",
  "/fixtures/a10.ndjson",
  "/fixtures/a6.ndjson",
  "/fixtures/degraded.ndjson",
  "/fixtures/a1-refine.json",
  "/hound.png",
  "/hound-emote.png",
  "/og-image.png",
  "/icon.svg",
]

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open("fh-v1").then((c) => c.addAll(CACHE)))
})

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== "GET") return
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_next/")) return
  event.respondWith(
    caches.match(event.request).then((hit) => {
      if (hit) return hit
      return fetch(event.request).then((res) => {
        const copy = res.clone()
        void caches.open("fh-v1").then((c) => c.put(event.request, copy))
        return res
      })
    }),
  )
})
