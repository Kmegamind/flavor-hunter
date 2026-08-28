# Deployment — Cloud Run

## One command

```bash
./deploy/cloudrun.sh
```

Idempotent. Re-running ships a new revision and adds a new secret version rather than
duplicating anything.

## What it does

| Step | Detail |
|---|---|
| Enables APIs | `run`, `cloudbuild`, `artifactregistry`, `secretmanager` |
| Writes secrets | `GEMINI_API_KEY` → `fh-gemini-api-key`, `GOOGLE_PLACES_API_KEY` → `fh-places-api-key` |
| Grants access | Cloud Run's runtime service account gets `secretAccessor` on both |
| Builds | Cloud Build, from `Dockerfile`. **No local Docker required** |
| Deploys | 1 CPU · 1 GiB · 0–4 instances · concurrency 20 · 120 s timeout |

## Decisions worth knowing

**`output: "standalone"` in `next.config.ts`.** The image carries a pruned dependency tree —
66 MB against 376 MB for a full install. That is the difference between a cold start a judge
waits through and one they never notice.

**`concurrency 20`, not the default 80.** A hunt holds one request open for tens of seconds
while it streams events. A container juggling 80 of those will time all of them out.

**`prompts/` and `data/` are copied into the runtime image.** Three prompts and the Reddit
corpus are read from disk per request (`process.cwd()`), so they are runtime assets, not build
inputs. Omitting them does not crash anything — the fallback paths fire and log, and the
product quietly gets worse. That is the failure mode this line prevents.

**Secrets vs. environment variables.** The two private keys go through Secret Manager. The two
`NEXT_PUBLIC_*` values cannot: Next inlines them into the browser bundle **at build time**, so
they are passed as Docker build args via `deploy/cloudbuild.yaml`. This is why the script uses a
build config instead of `gcloud run deploy --source`, which offers no way to set build args —
that path produces an image whose map silently has no API key.

## Two manual steps, and the first is not optional

### 1. Restrict the Maps browser key

`NEXT_PUBLIC_*` is inlined into the JavaScript. **Anyone who opens the site can read that key.**
The only thing between it and someone else's bill is a referrer restriction:

> Cloud Console → APIs & Services → Credentials → the browser Maps key →
> Application restrictions → **Websites** → add `https://<service-url>/*` and
> `http://localhost:3111/*`

The server-side Places key is a different credential and must **not** be reused here.

### 2. Import the dark map style

> Console → Google Maps Platform → Map Styles → the style bound to your Map ID →
> **Import JSON** → `data/map-style-blue-violet.json` → Save

With a `mapId` set, an inline `styles` array is ignored, and Advanced Markers require the
`mapId` — so the map hue can only be changed here. Skip this and the basemap renders in
Google's default light theme.

## Cost shape

Two billed SKUs beyond Cloud Run itself, and they scale with hunts rather than with visits:

| SKU | Per hunt |
|---|---|
| Places Text Search | 1 call per spelling variant (capped) |
| Places Details | up to 18 |
| Maps dynamic map load | 1 per page view |
| Gemini | 3 calls (parse · evidence · reason) |

`min-instances 0` means no idle cost and a cold start of a few seconds. For a judged demo,
set `--min-instances 1` an hour before and back to 0 afterwards — the first impression is worth
more than the idle hours.

Verify both free tiers before publishing the URL. If either is exhausted the static fallback
serves a labelled cached example (`NFR-3`) rather than an empty screen — but a judge should not
be seeing that.

## Rollback

```bash
gcloud run revisions list --service flavor-hunter --region us-east4
gcloud run services update-traffic flavor-hunter --region us-east4 --to-revisions <REVISION>=100
```
