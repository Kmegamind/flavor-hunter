#!/usr/bin/env bash
#
# Deploy Flavor Hunter to Cloud Run.
#
#   ./deploy/cloudrun.sh
#
# Reads keys from .env.local, puts the private ones in Secret Manager, and passes the
# two NEXT_PUBLIC_* values as build args — those are inlined into the browser bundle, so
# they must exist at build time, not just at runtime. They are public by definition; the
# Maps key is protected by an HTTP-referrer restriction in Cloud Console, not by secrecy.
#
# Idempotent: safe to re-run. Secrets are versioned rather than duplicated.

set -euo pipefail

SERVICE="${SERVICE:-flavor-hunter}"
REGION="${REGION:-us-east4}"
ENV_FILE="${ENV_FILE:-.env.local}"

die() { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
say() { printf '\033[36m▸\033[0m %s\n' "$*"; }
ok()  { printf '\033[32m✓\033[0m %s\n' "$*"; }

command -v gcloud >/dev/null || die "gcloud not found. brew install --cask google-cloud-sdk"
[ -f "$ENV_FILE" ] || die "$ENV_FILE not found. cp .env.example .env.local and fill it in."

PROJECT="${PROJECT:-$(gcloud config get-value project 2>/dev/null)}"
[ -n "$PROJECT" ] && [ "$PROJECT" != "(unset)" ] || die "No project set. Run: gcloud init"

# ── Read .env.local without sourcing it ───────────────────────────────────────
# Never `source` a secrets file: if a line is `KEY = value`, the shell tries to run the
# value as a command and echoes it in the error. That is how these keys leaked once.
read_env() {
  python3 - "$1" "$2" <<'PY'
import sys
key, path = sys.argv[1], sys.argv[2]
for line in open(path, encoding="utf-8"):
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    k, v = line.split("=", 1)
    if k.strip() == key:
        print(v.strip().strip('"').strip("'"))
        break
PY
}

GEMINI_API_KEY="$(read_env GEMINI_API_KEY "$ENV_FILE")"
GEMINI_MODEL="$(read_env GEMINI_MODEL "$ENV_FILE")"
GOOGLE_PLACES_API_KEY="$(read_env GOOGLE_PLACES_API_KEY "$ENV_FILE")"
MAPS_KEY="$(read_env NEXT_PUBLIC_GOOGLE_MAPS_API_KEY "$ENV_FILE")"
MAP_ID="$(read_env NEXT_PUBLIC_GOOGLE_MAP_ID "$ENV_FILE")"

for pair in "GEMINI_API_KEY:$GEMINI_API_KEY" "GOOGLE_PLACES_API_KEY:$GOOGLE_PLACES_API_KEY" \
            "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY:$MAPS_KEY" "NEXT_PUBLIC_GOOGLE_MAP_ID:$MAP_ID"; do
  [ -n "${pair#*:}" ] || die "${pair%%:*} is empty in $ENV_FILE"
done
: "${GEMINI_MODEL:=gemini-3.6-flash}"

say "project $PROJECT · region $REGION · service $SERVICE"

# Every gcloud call below pins --project explicitly. A build once ran under a *different*
# project's service account because the ambient `core/project` had been changed elsewhere,
# and the resulting "permission denied on the repository (or it may not exist)" sent the
# investigation after IAM for half an hour. The identity a build runs as is not something
# to leave to global config.

# ── APIs ──────────────────────────────────────────────────────────────────────
say "enabling APIs (no-op if already on)"
gcloud services enable --project="$PROJECT" \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  --quiet
ok "APIs enabled"

# ── Secrets ───────────────────────────────────────────────────────────────────
put_secret() {
  local name="$1" value="$2"
  if gcloud secrets describe "$name" --quiet >/dev/null 2>&1; then
    printf '%s' "$value" | gcloud secrets versions add "$name" --data-file=- --quiet >/dev/null
    ok "secret $name — new version"
  else
    printf '%s' "$value" | gcloud secrets create "$name" --data-file=- \
      --replication-policy=automatic --quiet >/dev/null
    ok "secret $name — created"
  fi
}

say "writing secrets"
put_secret fh-gemini-api-key "$GEMINI_API_KEY"
put_secret fh-places-api-key "$GOOGLE_PLACES_API_KEY"

# Cloud Run's runtime identity has to be allowed to read them.
PROJECT_NUM="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
RUNTIME_SA="${PROJECT_NUM}-compute@developer.gserviceaccount.com"
for s in fh-gemini-api-key fh-places-api-key; do
  gcloud secrets add-iam-policy-binding "$s" \
    --member="serviceAccount:${RUNTIME_SA}" \
    --role=roles/secretmanager.secretAccessor --quiet >/dev/null
done
ok "runtime service account granted secret access"

# ── Build ─────────────────────────────────────────────────────────────────────
IMAGE="${REGION}-docker.pkg.dev/${PROJECT}/${SERVICE}/app:$(date +%Y%m%d-%H%M%S)"

if ! gcloud artifacts repositories describe "$SERVICE" --location="$REGION" --quiet >/dev/null 2>&1; then
  say "creating Artifact Registry repo"
  gcloud artifacts repositories create "$SERVICE" \
    --repository-format=docker --location="$REGION" --quiet
fi

say "building in Cloud Build (no local Docker needed)"
gcloud builds submit --project="$PROJECT" \
  --config=deploy/cloudbuild.yaml \
  --substitutions="_MAPS_KEY=${MAPS_KEY},_MAP_ID=${MAP_ID},_IMAGE=${IMAGE}" \
  --quiet
ok "image $IMAGE"

# ── Deploy ────────────────────────────────────────────────────────────────────
# concurrency 20, not the default 80: a hunt holds a request open for tens of seconds
# while it streams, and a container juggling 80 of those will have them all time out.
say "deploying"
gcloud run deploy "$SERVICE" --project="$PROJECT" \
  --image "$IMAGE" \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --cpu 1 \
  --memory 1Gi \
  --min-instances 0 \
  --max-instances 4 \
  --concurrency 20 \
  --timeout 120s \
  --set-env-vars "GEMINI_MODEL=${GEMINI_MODEL},NEXT_TELEMETRY_DISABLED=1" \
  --set-secrets "GEMINI_API_KEY=fh-gemini-api-key:latest,GOOGLE_PLACES_API_KEY=fh-places-api-key:latest" \
  --quiet

URL="$(gcloud run services describe "$SERVICE" --project="$PROJECT" --region "$REGION" --format='value(status.url)')"
ok "live at $URL"

cat <<EOF

┌─ Two things left, and the first is not optional ────────────────────────────
│
│ 1. Restrict the Maps browser key.
│    NEXT_PUBLIC_* is inlined into the JavaScript, so anyone who opens the site
│    can read that key. The only thing standing between it and someone else's
│    bill is an HTTP-referrer restriction:
│
│      Cloud Console → APIs & Services → Credentials
│        → the browser Maps key → Application restrictions → Websites
│        → add:  ${URL}/*
│                http://localhost:3111/*
│
│ 2. Import the dark map style.
│    Console → Google Maps Platform → Map Styles → the style bound to your
│    Map ID → Import JSON → data/map-style-blue-violet.json → Save.
│    Without this the basemap renders in Google's default light theme.
│
└─────────────────────────────────────────────────────────────────────────────
EOF
