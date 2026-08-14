import { describe, expect, it } from 'vitest'

interface MarkerLib {
  MARKER_LENGTH: number
  GRID_SIZE: number
  CELL_PX: number
  randomMarker: (randomFn?: () => number) => string
  encodeMarkerToGrid: (marker: string) => boolean[][]
  decodeMarkerFromGrid: (grid: boolean[][]) => string
  encodeMarkerToPng: (marker: string) => Promise<Uint8Array>
  decodeMarkerFromPng: (png: Uint8Array) => Promise<string>
  buildFixtureHtml: (opts: { pngDataUrl: string; title?: string }) => string
  assertFixtureHasNoMarkerText: (html: string, marker: string) => void
}

async function loadLib(): Promise<MarkerLib> {
  const specifier = '../tests/e2e/dogfood/fixtures/marker.mjs'
  return (await import(specifier)) as MarkerLib
}

describe('dogfood marker encode/decode', () => {
  it('랜덤 marker는 고정 길이 숫자다', async () => {
    const { randomMarker, MARKER_LENGTH } = await loadLib()
    let n = 0
    const marker = randomMarker(() => {
      n += 0.13
      return n % 1
    })
    expect(marker).toMatch(new RegExp(`^\\d{${MARKER_LENGTH}}$`))
  })

  it('그리드 왕복으로 marker를 복원한다', async () => {
    const { encodeMarkerToGrid, decodeMarkerFromGrid, GRID_SIZE } = await loadLib()
    const marker = '481203'
    const grid = encodeMarkerToGrid(marker)
    expect(grid).toHaveLength(GRID_SIZE)
    expect(grid[0]).toHaveLength(GRID_SIZE)
    expect(decodeMarkerFromGrid(grid)).toBe(marker)
  })

  it('잘못된 길이·문자는 즉시 throw 한다', async () => {
    const { encodeMarkerToGrid } = await loadLib()
    expect(() => encodeMarkerToGrid('12')).toThrow(/marker/i)
    expect(() => encodeMarkerToGrid('abcdef')).toThrow(/marker/i)
  })

  it('PNG 픽셀 왕복으로만 판독 가능하다', async () => {
    const { encodeMarkerToPng, decodeMarkerFromPng } = await loadLib()
    const marker = '908177'
    const png = await encodeMarkerToPng(marker)
    expect(png[0]).toBe(0x89)
    expect(png[1]).toBe(0x50)
    expect(await decodeMarkerFromPng(png)).toBe(marker)
  })

  it('fixture HTML은 marker 문자열을 텍스트로 넣지 않는다', async () => {
    const {
      encodeMarkerToPng,
      buildFixtureHtml,
      assertFixtureHasNoMarkerText
    } = await loadLib()
    const marker = '334455'
    const png = await encodeMarkerToPng(marker)
    let binary = ''
    for (const byte of png) binary += String.fromCharCode(byte)
    const html = buildFixtureHtml({
      pngDataUrl: `data:image/png;base64,${btoa(binary)}`,
      title: 'dogfood fixture'
    })
    expect(() => assertFixtureHasNoMarkerText(html, marker)).not.toThrow()
    expect(html).toMatch(/<img\b/i)
    expect(html.includes(`>${marker}<`)).toBe(false)
  })

  it('workers.dev 가 섞인 data URL 가드는 fixture 쪽에서 거부한다', async () => {
    const { buildFixtureHtml } = await loadLib()
    expect(() =>
      buildFixtureHtml({
        pngDataUrl: 'https://evil.workers.dev/x.png',
        title: 'x'
      })
    ).toThrow(/workers\.dev|production|로컬/i)
  })
})
