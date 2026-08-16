import { describe, it, expect } from 'vitest'
import { applyRedactBoxes } from '../src/utils/redaction'

/**
 * width×height 크기의 Uint8ClampedArray(RGBA) 를 결정론적 패턴으로 채운다.
 * 값 자체는 의미 없고, "가림 밖 픽셀이 정말 1바이트도 안 변했는지" 를 인덱스 단위로
 * 비교하기 위한 스냅샷 기준선이다.
 */
function makeSentinelData(width: number, height: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < data.length; i++) {
    data[i] = i % 256
  }
  return data
}

function pixelIndex(x: number, y: number, width: number): number {
  return (y * width + x) * 4
}

describe('applyRedactBoxes', () => {
  it('박스 내부 픽셀 전수가 정확히 (r,g,b,255) 로 바뀐다', () => {
    const width = 4
    const height = 3
    const data = makeSentinelData(width, height)
    const original = data.slice()
    const color: [number, number, number] = [200, 150, 50]

    applyRedactBoxes(data, width, height, [{ x: 1, y: 0, w: 2, h: 2 }], color)

    const insidePixels = [
      [1, 0],
      [2, 0],
      [1, 1],
      [2, 1]
    ]
    for (const [x, y] of insidePixels) {
      const idx = pixelIndex(x, y, width)
      expect([data[idx], data[idx + 1], data[idx + 2], data[idx + 3]]).toEqual([
        200,
        150,
        50,
        255
      ])
    }

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (insidePixels.some(([ix, iy]) => ix === x && iy === y)) continue
        const idx = pixelIndex(x, y, width)
        expect([data[idx], data[idx + 1], data[idx + 2], data[idx + 3]]).toEqual([
          original[idx],
          original[idx + 1],
          original[idx + 2],
          original[idx + 3]
        ])
      }
    }
  })

  it('박스 밖 픽셀은 1바이트도 무변경이다', () => {
    const width = 5
    const height = 5
    const data = makeSentinelData(width, height)
    const original = data.slice()

    applyRedactBoxes(data, width, height, [{ x: 0, y: 0, w: 1, h: 1 }], [9, 8, 7])

    // (0,0) 4바이트를 제외한 나머지 전부가 원본과 정확히 같아야 한다.
    for (let i = 4; i < data.length; i++) {
      expect(data[i]).toBe(original[i])
    }
  })

  it('이미지 경계 밖으로 나가는 박스는 클램프한다', () => {
    const width = 5
    const height = 5
    const data = makeSentinelData(width, height)
    const original = data.slice()

    applyRedactBoxes(
      data,
      width,
      height,
      [
        // 왼쪽·위로 넘치는 박스 → (0,0)~(1,1) 만 칠해져야 한다
        { x: -2, y: -2, w: 4, h: 4 },
        // 오른쪽·아래로 넘치는 박스 → (3,3)~(4,4) 만 칠해져야 한다
        { x: 3, y: 3, w: 10, h: 10 }
      ],
      [9, 8, 7]
    )

    const coloredPixels = [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
      [3, 3],
      [4, 3],
      [3, 4],
      [4, 4]
    ]
    for (const [x, y] of coloredPixels) {
      const idx = pixelIndex(x, y, width)
      expect([data[idx], data[idx + 1], data[idx + 2], data[idx + 3]]).toEqual([
        9,
        8,
        7,
        255
      ])
    }
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (coloredPixels.some(([cx, cy]) => cx === x && cy === y)) continue
        const idx = pixelIndex(x, y, width)
        expect([data[idx], data[idx + 1], data[idx + 2], data[idx + 3]]).toEqual([
          original[idx],
          original[idx + 1],
          original[idx + 2],
          original[idx + 3]
        ])
      }
    }
  })

  it('음수/0 크기 박스는 무시하고 데이터를 완전히 그대로 둔다', () => {
    const width = 4
    const height = 4
    const data = makeSentinelData(width, height)
    const original = data.slice()

    applyRedactBoxes(
      data,
      width,
      height,
      [
        { x: 1, y: 1, w: 0, h: 5 },
        { x: 1, y: 1, w: 5, h: 0 },
        { x: 1, y: 1, w: -1, h: 5 },
        { x: 1, y: 1, w: 5, h: -3 }
      ],
      [1, 2, 3]
    )

    expect(Array.from(data)).toEqual(Array.from(original))
  })

  it('겹치는 박스도 정상적으로 처리된다 (합집합 영역이 빠짐없이 칠해진다)', () => {
    const width = 5
    const height = 5
    const data = makeSentinelData(width, height)
    const original = data.slice()
    const color: [number, number, number] = [10, 20, 30]

    applyRedactBoxes(
      data,
      width,
      height,
      [
        { x: 1, y: 1, w: 3, h: 1 }, // x:1..3, y:1
        { x: 2, y: 1, w: 3, h: 1 } // x:2..4, y:1 (겹침 구간 x:2..3)
      ],
      color
    )

    for (let x = 1; x <= 4; x++) {
      const idx = pixelIndex(x, 1, width)
      expect([data[idx], data[idx + 1], data[idx + 2], data[idx + 3]]).toEqual([
        10,
        20,
        30,
        255
      ])
    }
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (y === 1 && x >= 1 && x <= 4) continue
        const idx = pixelIndex(x, y, width)
        expect([data[idx], data[idx + 1], data[idx + 2], data[idx + 3]]).toEqual([
          original[idx],
          original[idx + 1],
          original[idx + 2],
          original[idx + 3]
        ])
      }
    }
  })

  it('빈 배열이면 완전히 무변경이다', () => {
    const width = 3
    const height = 3
    const data = makeSentinelData(width, height)
    const original = data.slice()

    applyRedactBoxes(data, width, height, [], [255, 0, 0])

    expect(Array.from(data)).toEqual(Array.from(original))
  })
})
