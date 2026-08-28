# ── Flavor Hunter on Cloud Run ─────────────────────────────────────────────────
# Three stages so the shipped image contains no build tooling and no dev deps.
# Cloud Build runs this; nothing needs Docker locally.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# One install, not two. An earlier draft also built a production-only tree to copy into
# the runner — dead work: `output: standalone` emits its own pruned node_modules, so the
# second install was doubling Cloud Build time for something nothing consumed.
RUN npm ci --ignore-scripts

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* are inlined into the browser bundle at build time, so they must be
# present here — not only at runtime. They are public by definition; the Maps key is
# protected by an HTTP-referrer restriction in Cloud Console, not by secrecy.
ARG NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
ARG NEXT_PUBLIC_GOOGLE_MAP_ID
ENV NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=$NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
ENV NEXT_PUBLIC_GOOGLE_MAP_ID=$NEXT_PUBLIC_GOOGLE_MAP_ID
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Cloud Run injects PORT; Next honours it.
ENV PORT=8080
ENV HOSTNAME=0.0.0.0

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# The prompts and the Reddit corpus are read from disk at request time, so they are
# runtime assets, not build inputs. Missing them degrades the pipeline silently — the
# fallback paths would fire and log, but the product would quietly get worse.
COPY --from=build /app/prompts ./prompts
COPY --from=build /app/data ./data

COPY --from=build /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 8080
CMD ["node", "server.js"]
