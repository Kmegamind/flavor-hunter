/**
 * Rasterize Boston Terrier pixel maps into hound.png, hound-emote.png, og-image.png.
 */
import { deflateSync } from "node:zlib"
import { writeFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { E_BOOT, PALETTE, POINT_HOLD, RUN_CYCLE, gridPixels } from "../lib/hound-pixels"

function crcTable() {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
}
const CRC = crcTable()
function crc32(buf: Buffer) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const t = Buffer.from(type)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])))
  return Buffer.concat([len, t, data, crc])
}

function encodePng(width: number, height: number, rgba: Uint8Array) {
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    const o = y * (width * 4 + 1)
    raw[o] = 0
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), o + 1)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ])
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "")
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

function blitGrid(
  rgba: Uint8Array,
  w: number,
  grid: string[],
  ox: number,
  oy: number,
  scale: number,
  collar = "#FF3D00",
) {
  const rows = grid.length
  const cols = grid[0]?.length ?? 16
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ch = grid[r][c]
      if (ch === ".") continue
      const hex = ch === "c" ? collar : PALETTE[ch as keyof typeof PALETTE] ?? PALETTE.b
      const [R, G, B] = hexToRgb(hex)
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const x = ox + c * scale + dx
          const y = oy + r * scale + dy
          if (x < 0 || y < 0 || x >= w) continue
          const i = (y * w + x) * 4
          rgba[i] = R
          rgba[i + 1] = G
          rgba[i + 2] = B
          rgba[i + 3] = 255
        }
      }
    }
  }
}

function fill(rgba: Uint8Array, color: [number, number, number, number]) {
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = color[0]
    rgba[i + 1] = color[1]
    rgba[i + 2] = color[2]
    rgba[i + 3] = color[3]
  }
}

function rect(
  rgba: Uint8Array,
  w: number,
  x: number,
  y: number,
  rw: number,
  rh: number,
  color: [number, number, number, number],
) {
  for (let yy = y; yy < y + rh; yy++) {
    for (let xx = x; xx < x + rw; xx++) {
      const i = (yy * w + xx) * 4
      rgba[i] = color[0]
      rgba[i + 1] = color[1]
      rgba[i + 2] = color[2]
      rgba[i + 3] = color[3]
    }
  }
}

function main() {
  const pub = join(process.cwd(), "public")
  mkdirSync(pub, { recursive: true })
  mkdirSync(join(pub, "ui"), { recursive: true })

  const cell = 32
  const cols = 8
  const rows = 6
  const W = cols * cell
  const H = rows * cell
  const sheet = new Uint8Array(W * H * 4)
  const states: { grid: string[]; index: number; collar?: string }[] = []
  const sit = gridPixels("sit")
  for (let i = 0; i < 4; i++) states.push({ grid: sit, index: i })
  for (let i = 0; i < 4; i++) states.push({ grid: gridPixels("idle_wag"), index: 4 + i })
  states.push({ grid: gridPixels("alert"), index: 8 })
  states.push({ grid: gridPixels("alert"), index: 9 })
  states.push({ grid: gridPixels("alert"), index: 10 })
  states.push({ grid: gridPixels("tilt"), index: 11 })
  states.push({ grid: gridPixels("tilt"), index: 12 })
  states.push({ grid: gridPixels("tilt"), index: 13 })
  RUN_CYCLE.forEach((g, i) => states.push({ grid: g, index: 16 + i }))
  for (let i = 0; i < 4; i++) states.push({ grid: gridPixels("sniff"), index: 24 + i })
  for (let i = 0; i < 4; i++) states.push({ grid: gridPixels("reject"), index: 28 + i })
  POINT_HOLD.forEach((g, i) => states.push({ grid: g, index: 32 + i, collar: "#7CFF6B" }))
  for (let i = 0; i < 3; i++) states.push({ grid: gridPixels("sad"), index: 35 + i })
  for (let i = 0; i < 6; i++) states.push({ grid: gridPixels("shake"), index: 40 + i })
  for (let i = 0; i < 4; i++) states.push({ grid: gridPixels("sleep"), index: 46 + i })

  for (const s of states) {
    const cx = (s.index % cols) * cell
    const cy = Math.floor(s.index / cols) * cell
    blitGrid(sheet, W, s.grid, cx, cy + 4, 2, s.collar)
  }
  writeFileSync(join(pub, "hound.png"), encodePng(W, H, sheet))

  const ew = 48
  const emoteW = 7 * ew
  const emoteH = 7 * ew
  const emote = new Uint8Array(emoteW * emoteH * 4)
  const loops = [
    E_BOOT,
    [gridPixels("tilt"), gridPixels("tilt"), gridPixels("alert"), gridPixels("tilt"), gridPixels("sit"), gridPixels("tilt"), gridPixels("alert")],
    [gridPixels("tilt"), gridPixels("tilt"), gridPixels("tilt"), gridPixels("sad"), gridPixels("tilt"), gridPixels("tilt"), gridPixels("tilt")],
    RUN_CYCLE.slice(0, 7),
    [gridPixels("reject"), gridPixels("reject"), gridPixels("shake"), gridPixels("reject"), gridPixels("sit"), gridPixels("reject"), gridPixels("shake")],
    [...POINT_HOLD, ...POINT_HOLD, POINT_HOLD[0]],
    [gridPixels("sad"), gridPixels("sad"), gridPixels("sleep"), gridPixels("sad"), gridPixels("sit"), gridPixels("sad"), gridPixels("sleep")],
  ]
  loops.forEach((frames, row) => {
    frames.forEach((g, col) => {
      blitGrid(emote, emoteW, g, col * ew + 8, row * ew + 8, 2, row === 5 ? "#7CFF6B" : "#FF3D00")
    })
  })
  writeFileSync(join(pub, "hound-emote.png"), encodePng(emoteW, emoteH, emote))

  const ogW = 1200
  const ogH = 630
  const og = new Uint8Array(ogW * ogH * 4)
  fill(og, [5, 8, 13, 255])
  rect(og, ogW, 40, 40, ogW - 80, ogH - 80, [59, 163, 247, 255])
  rect(og, ogW, 70, 70, ogW - 140, ogH - 140, [7, 20, 38, 255])
  blitGrid(og, ogW, POINT_HOLD[0], 120, 140, 18, "#7CFF6B")
  const glyph: Record<string, string[]> = {
    "9": ["11110", "10001", "11111", "00001", "00001", "10001", "11110"],
    "4": ["10010", "10010", "10010", "11111", "00010", "00010", "00010"],
    M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
    E: ["11111", "10000", "11110", "10000", "10000", "10000", "11111"],
    O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
    R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
    Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
    A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
    T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
    C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
    H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
    " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  }
  const paintText = (text: string, x0: number, y0: number, scale: number, color: [number, number, number, number]) => {
    let x = x0
    for (const ch of text) {
      const g = glyph[ch] ?? glyph[" "]
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 5; c++) {
          if (g[r][c] === "1") rect(og, ogW, x + c * scale, y0 + r * scale, scale, scale, color)
        }
      }
      x += 6 * scale
    }
  }
  paintText("94", 620, 180, 14, [255, 61, 0, 255])
  paintText("MEMORY MATCH", 620, 320, 4, [124, 255, 107, 255])
  writeFileSync(join(pub, "og-image.png"), encodePng(ogW, ogH, og))

  writeFileSync(
    join(pub, "hound.json"),
    JSON.stringify(
      {
        image: "hound.png",
        cell: [32, 32],
        grid: [8, 6],
        states: {
          idle_sit: { frames: [0, 1, 2, 3], fps: 4, loop: true },
          idle_wag: { frames: [4, 5, 6, 7], fps: 6, loop: true },
          alert: { frames: [8, 9, 10], fps: 8, loop: false, hold: 10 },
          tilt: { frames: [11, 12, 13], fps: 6, loop: false, hold: 13 },
          run: { frames: [16, 17, 18, 19, 20, 21, 22, 23], fps: 12, loop: true },
          sniff: { frames: [24, 25, 26, 27], fps: 6, loop: true },
          reject: { frames: [28, 29, 30, 31], fps: 10, loop: false },
          point: { frames: [32, 33, 34], fps: 8, loop: false, hold: 34 },
          sad: { frames: [35, 36, 37], fps: 4, loop: false, hold: 37 },
          shake: { frames: [40, 41, 42, 43, 44, 45], fps: 12, loop: false },
          sleep: { frames: [46, 47, 48, 49], fps: 2, loop: true },
        },
      },
      null,
      2,
    ),
  )
  console.log("wrote hound.png, hound-emote.png, og-image.png")
}

main()
