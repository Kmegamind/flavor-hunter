/** Boston Terrier pixel blit — black/white tuxedo + red kiss-lips. Facing right. */

export const PALETTE = {
  k: "#0A0E14",
  b: "#1A1A1A",
  B: "#2C2C2C",
  w: "#F4F7FA",
  g: "#D0D5DC",
  p: "#E07A8A",
  l: "#E02020",
  n: "#141414",
  e: "#F4F7FA",
} as const

export type Pose =
  | "sit"
  | "idle_sit"
  | "idle_wag"
  | "alert"
  | "tilt"
  | "run"
  | "run1"
  | "run2"
  | "sniff"
  | "reject"
  | "point"
  | "sad"
  | "shake"
  | "sleep"

const SIT = [
  "................",
  ".......kkkk.....",
  "......kwwwk.....",
  ".....kwllwk.....",
  ".....kwe.nk.....",
  "....kkBBBBkk....",
  "...kBBBBBBck....",
  "...kwBBBBBwk....",
  "...kBBBBBBk.....",
  "...kBBk.kBBk....",
  "...kkk...kkk....",
  "................",
]

const RUN1 = [
  "................",
  "k........kkkk...",
  "Bk......kwwwk...",
  ".Bk....kwllwk...",
  ".BBk...kwe.nk...",
  ".BBBBBBBBckk....",
  ".kBBBBBBBwk.....",
  ".kwBBBBBwk......",
  "kBk.k..k.Bk.....",
  "k.........k.....",
  "................",
  "................",
]

const RUN2 = [
  "................",
  "..k......kkkk...",
  ".Bk.....kwwwk...",
  ".Bk....kwllwk...",
  ".BBk...kwe.nk...",
  ".BBBBBBBBckk....",
  ".kBBBBBBBwk.....",
  "..kwBBBBwk......",
  "...kk..kk.......",
  "................",
  "................",
  "................",
]

const SNIFF = [
  "................",
  "k...............",
  "Bk..............",
  ".Bk.....kkkk....",
  ".BBBkkkwwwwk....",
  ".kBBBBBBllwk....",
  ".kwBBBBBe.nk....",
  ".kBBBBBBckk.....",
  ".kBBk.kBBk......",
  ".kkk...kkk......",
  "................",
  "................",
]

const POINT = [
  "................",
  ".kkkk...........",
  ".kwwwk...kkkk...",
  "..kkBBBBBBBBwk..",
  "..kBBBBBllw.nk..",
  "..kBBBBBBBckk...",
  "..kwBBBBBBwk....",
  "..kB..k..kBBk...",
  "..k...k...kkk...",
  "................",
  "................",
  "................",
]

const TILT = [
  "................",
  ".........kk.....",
  "........kwwkk...",
  "....kkkkllwek...",
  "...kwwwkBBBnk...",
  "...kBBBBpkcBk...",
  "...kwBBBBBBk....",
  "...kBBBBBBk.....",
  "...kBBk.kBBk....",
  "...kkk...kkk....",
  "................",
  "................",
]

const ALERT = [
  "................",
  "......k..kkkk...",
  ".....kpk.kwwwk..",
  ".....k..kwllwk..",
  "....kkkkwe.nk...",
  "...kBBBBBBck....",
  "...kwBBBBBwk....",
  "...kBBBBBBk.....",
  "...kBBk.kBBk....",
  "...kkk...kkk....",
  "................",
  "................",
]

const SAD = [
  "................",
  "........kkkk....",
  ".......kwwwk....",
  "......kwllwk....",
  "......kwe.nk....",
  ".....kBBBck.....",
  "....kwBBBBwk....",
  "....kBBBBBk.....",
  "....kk...kk.....",
  "................",
  "................",
  "................",
]

const SLEEP = [
  "................",
  "................",
  "....kkkkkkk.....",
  "...kwwllllwk....",
  "...kBBBBBBnk....",
  "...kwBBBBBwk....",
  "....kkkkkkk.....",
  "................",
  "................",
  "................",
  "................",
  "................",
]

const REJECT = [
  "................",
  ".....kkkk.......",
  "....kwwwk.......",
  "...kwllwk.......",
  "...kwe.nk.......",
  "..kBBBBBck......",
  "..kwBBBBwk......",
  "..kBBBBBk.......",
  ".kBBk.kBBk......",
  ".k.k...k.k......",
  "................",
  "................",
]

const WAG = [
  "................",
  ".......kkkk...k.",
  "......kwwwk..kB.",
  ".....kwllwk.kB..",
  ".....kwe.nk.....",
  "....kkBBBBck....",
  "...kBBBBBBwk....",
  "...kwBBBBBk.....",
  "...kBBk.kBBk....",
  "...kkk...kkk....",
  "................",
  "................",
]

const SHAKE = [
  "................",
  ".....k.kkkk.k...",
  "....k.kwwwk.k...",
  ".....kwllwk.....",
  "....kwe.nk.k....",
  "...kBBBBBBck....",
  "..k.wBBBBBwk....",
  "...kBBBBBBk.....",
  "..k.kB.kB.k.....",
  "...kkk.kkk......",
  "................",
  "................",
]

const POSES: Record<string, string[]> = {
  sit: SIT,
  idle_sit: SIT,
  idle_wag: WAG,
  alert: ALERT,
  tilt: TILT,
  run: RUN1,
  run1: RUN1,
  run2: RUN2,
  sniff: SNIFF,
  reject: REJECT,
  point: POINT,
  sad: SAD,
  shake: SHAKE,
  sleep: SLEEP,
}

export const RUN_CYCLE = [RUN1, RUN2, RUN1, RUN2, RUN1, RUN2, RUN1, RUN2]
export const E_BOOT = [SIT, ALERT, SIT, WAG, TILT, SIT, ALERT]
export const POINT_HOLD = [POINT, POINT, POINT]

export function blit(
  ctx: CanvasRenderingContext2D,
  pose: Pose | string,
  ox: number,
  oy: number,
  scale: number,
  flip: boolean,
  collar: string,
  frame = 0,
) {
  let grid = POSES[pose] ?? SIT
  if (pose === "run" || pose === "run1" || pose === "run2") {
    grid = RUN_CYCLE[frame % RUN_CYCLE.length]
  }
  if (pose === "e_boot") grid = E_BOOT[frame % E_BOOT.length]
  const rows = grid.length
  const cols = grid[0]?.length ?? 16
  ctx.save()
  ctx.translate(ox, oy)
  if (flip) ctx.scale(-1, 1)
  ctx.imageSmoothingEnabled = false
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ch = grid[r][c]
      if (ch === ".") continue
      ctx.fillStyle = ch === "c" ? collar : PALETTE[ch as keyof typeof PALETTE] ?? PALETTE.b
      ctx.fillRect((c - cols / 2) * scale, (r - rows) * scale, scale, scale)
    }
  }
  ctx.restore()
}

export function gridPixels(pose: Pose | string, frame = 0): string[] {
  if (pose === "run") return RUN_CYCLE[frame % RUN_CYCLE.length]
  if (pose === "e_boot") return E_BOOT[frame % E_BOOT.length]
  return POSES[pose] ?? SIT
}
