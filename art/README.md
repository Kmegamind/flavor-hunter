# Source art

Kept in the repo as the origin of the pixel sprite, but **not served**: these were sitting in
`public/` unreferenced, so every visitor downloaded 1.7 MB of files the app never asks for.

| File | What it is |
|---|---|
| `hound-ref.jpeg` | Reference frame the character was drawn from |
| `hound-point.png` | AI-generated pixel art, 1024px, single pose (point) |
| `hound-still.png` | AI-generated pixel art, 1024px, single pose (stand) |

The sprite the app actually renders is generated procedurally from `lib/hound-pixels.ts`
(`npm run art` writes `public/hound.png`, `public/hound-emote.png`, `public/og-image.png`).
The AI art has one pose and no pixel grid; the procedural sprite has eleven poses, a
recolourable collar, and can be driven frame-by-frame from real stream events (PRD FR-7a).
