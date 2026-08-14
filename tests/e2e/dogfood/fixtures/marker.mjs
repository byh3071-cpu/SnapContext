/**
 * dogfood pixel-only marker fixture.
 * marker 문자열은 DOM 텍스트가 아니라 흑백 격자 PNG 픽셀로만 복원한다.
 */
import { randomInt } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'

export const MARKER_LENGTH = 6
/** 테두리 포함 격자 */
export const GRID_SIZE = 8
export const CELL_PX = 16

/**
 * @param {() => number} [randomFn] 0..1
 * @returns {string}
 */
export function randomMarker(randomFn) {
  if (randomFn) {
    let out = ''
    for (let i = 0; i < MARKER_LENGTH; i++) {
      out += String(Math.floor(randomFn() * 10) % 10)
    }
    return out
  }
  let out = ''
  for (let i = 0; i < MARKER_LENGTH; i++) {
    out += String(randomInt(0, 10))
  }
  return out
}

/**
 * @param {string} marker
 */
function assertMarker(marker) {
  if (typeof marker !== 'string' || !new RegExp(`^\\d{${MARKER_LENGTH}}$`).test(marker)) {
    throw new Error(`marker는 ${MARKER_LENGTH}자리 숫자여야 한다: ${marker}`)
  }
}

/**
 * 6자리 → 각 자리 4bit → 24bit.
 * 격자: 바깥 테두리 검정, 내부 6×4 에 비트(행 우선), 나머지 내부는 흰색.
 * @param {string} marker
 * @returns {boolean[][]} true=검정
 */
export function encodeMarkerToGrid(marker) {
  assertMarker(marker)
  /** @type {boolean[][]} */
  const grid = Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => false)
  )
  for (let i = 0; i < GRID_SIZE; i++) {
    grid[0][i] = true
    grid[GRID_SIZE - 1][i] = true
    grid[i][0] = true
    grid[i][GRID_SIZE - 1] = true
  }
  /** @type {number[]} */
  const bits = []
  for (const ch of marker) {
    const d = Number(ch)
    bits.push((d >> 3) & 1, (d >> 2) & 1, (d >> 1) & 1, d & 1)
  }
  let bi = 0
  for (let row = 1; row <= 4; row++) {
    for (let col = 1; col <= 6; col++) {
      grid[row][col] = bits[bi] === 1
      bi += 1
    }
  }
  return grid
}

/**
 * @param {boolean[][]} grid
 * @returns {string}
 */
export function decodeMarkerFromGrid(grid) {
  if (!Array.isArray(grid) || grid.length !== GRID_SIZE) {
    throw new Error(`grid 크기는 ${GRID_SIZE}x${GRID_SIZE} 이어야 한다`)
  }
  /** @type {number[]} */
  const bits = []
  for (let row = 1; row <= 4; row++) {
    if (!Array.isArray(grid[row]) || grid[row].length !== GRID_SIZE) {
      throw new Error('grid 행 길이 불일치')
    }
    for (let col = 1; col <= 6; col++) {
      bits.push(grid[row][col] ? 1 : 0)
    }
  }
  let marker = ''
  for (let i = 0; i < MARKER_LENGTH; i++) {
    const o = i * 4
    const d = (bits[o] << 3) | (bits[o + 1] << 2) | (bits[o + 2] << 1) | bits[o + 3]
    if (d > 9) throw new Error(`디코드 자리수 범위 초과: ${d}`)
    marker += String(d)
  }
  return marker
}

/**
 * @param {string} marker
 * @returns {Promise<Buffer>}
 */
export async function encodeMarkerToPng(marker) {
  const grid = encodeMarkerToGrid(marker)
  const size = GRID_SIZE * CELL_PX
  const raw = Buffer.alloc(size * size * 3)
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const on = grid[row][col]
      const v = on ? 0 : 255
      for (let dy = 0; dy < CELL_PX; dy++) {
        for (let dx = 0; dx < CELL_PX; dx++) {
          const x = col * CELL_PX + dx
          const y = row * CELL_PX + dy
          const i = (y * size + x) * 3
          raw[i] = v
          raw[i + 1] = v
          raw[i + 2] = v
        }
      }
    }
  }
  return sharp(raw, { raw: { width: size, height: size, channels: 3 } })
    .png()
    .toBuffer()
}

/**
 * @param {Buffer} png
 * @returns {Promise<string>}
 */
export async function decodeMarkerFromPng(png) {
  const { data, info } = await sharp(png)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  if (info.width !== GRID_SIZE * CELL_PX || info.height !== GRID_SIZE * CELL_PX) {
    throw new Error(
      `PNG 크기 불일치: ${info.width}x${info.height} (기대 ${GRID_SIZE * CELL_PX})`
    )
  }
  const channels = info.channels
  /** @type {boolean[][]} */
  const grid = Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => false)
  )
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const cx = col * CELL_PX + Math.floor(CELL_PX / 2)
      const cy = row * CELL_PX + Math.floor(CELL_PX / 2)
      const i = (cy * info.width + cx) * channels
      const lum = (data[i] + data[i + 1] + data[i + 2]) / 3
      grid[row][col] = lum < 128
    }
  }
  return decodeMarkerFromGrid(grid)
}

/**
 * @param {string} value
 * @param {string} label
 */
function assertLocalOrDataUrl(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label}: 값이 비어 있다`)
  }
  const lower = value.toLowerCase()
  if (lower.includes('workers.dev') || lower.includes('cloudflareworkers.com')) {
    throw new Error(`production URL 금지 (${label}): ${value}`)
  }
  if (value.startsWith('data:image/png')) return
  if (/^https?:\/\//i.test(value)) {
    const host = new URL(value).hostname.toLowerCase()
    if (host !== '127.0.0.1' && host !== 'localhost' && host !== '::1') {
      throw new Error(`production URL 금지 (${label}): 로컬이 아닌 호스트 ${host}`)
    }
  }
}

/**
 * @param {{ pngDataUrl: string, title?: string }} opts
 * @returns {string}
 */
export function buildFixtureHtml(opts) {
  assertLocalOrDataUrl(opts.pngDataUrl, 'pngDataUrl')
  const title = opts.title ?? 'SnapContext dogfood fixture'
  // marker 숫자 문자열을 텍스트 노드·alt·title 에 넣지 않는다.
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    html, body { margin: 0; background: #111; color: #eee; font-family: sans-serif; }
    main { display: grid; place-items: center; min-height: 100vh; gap: 16px; }
    img { image-rendering: pixelated; width: ${GRID_SIZE * CELL_PX * 2}px; height: ${GRID_SIZE * CELL_PX * 2}px; border: 4px solid #444; }
  </style>
</head>
<body>
  <main>
    <p>pixel-only marker grid</p>
    <img id="marker-grid" src="${opts.pngDataUrl}" width="${GRID_SIZE * CELL_PX}" height="${GRID_SIZE * CELL_PX}" alt="marker-grid" />
  </main>
</body>
</html>
`
}

/**
 * @param {string} html
 * @param {string} marker
 */
export function assertFixtureHasNoMarkerText(html, marker) {
  assertMarker(marker)
  // data URL 본문은 픽셀 바이트의 base64 이라 우연히 숫자열이 섞일 수 있다.
  // 판정 대상은 DOM 텍스트·속성(표시용)만 — data URL 은 제외한다.
  const withoutDataUrls = html.replace(
    /data:image\/png;base64,[A-Za-z0-9+/=]+/gi,
    'data:image/png;base64,REDACTED'
  )
  if (withoutDataUrls.includes(marker)) {
    throw new Error('fixture HTML에 marker 문자열이 텍스트로 포함되면 안 된다')
  }
}

/**
 * @param {string} outDir
 * @returns {Promise<{ marker: string, pngPath: string, htmlPath: string, png: Buffer, html: string }>}
 */
export async function writeMarkerFixture(outDir) {
  const marker = randomMarker()
  const png = await encodeMarkerToPng(marker)
  const pngDataUrl = `data:image/png;base64,${png.toString('base64')}`
  const html = buildFixtureHtml({ pngDataUrl })
  assertFixtureHasNoMarkerText(html, marker)
  mkdirSync(outDir, { recursive: true })
  const pngPath = join(outDir, 'marker.png')
  const htmlPath = join(outDir, 'index.html')
  writeFileSync(pngPath, png)
  writeFileSync(htmlPath, html, 'utf8')
  return { marker, pngPath, htmlPath, png, html }
}
