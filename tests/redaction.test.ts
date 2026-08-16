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

  // ---- 0.4.3 critic 지적 — 아래는 toPx(%, size) 산출 형태(비정수)·경계값을 실제로
  // floor/ceil 확장 분기가 실행되도록 짠 케이스다. 기존 케이스는 전부 정수 좌표라
  // Math.floor/Math.ceil 이 사실상 no-op 이었다.

  it('비정수 좌표(toPx 산출 형태)는 floor(시작)·ceil(끝)으로 바깥쪽으로 확장되어 칠해진다', () => {
    const width = 6
    const height = 6
    const data = makeSentinelData(width, height)
    const original = data.slice()
    const color: [number, number, number] = [50, 60, 70]

    // x: floor(1.2)=1 ~ ceil(1.2+2.5)=ceil(3.7)=4 → 열 1,2,3
    // y: floor(1.4)=1 ~ ceil(1.4+2.3)=ceil(3.7)=4 → 행 1,2,3
    // (정수 좌표였다면 반올림 없이 그대로였을 값들 — floor/ceil 이 실제로 값을 바꾼다)
    applyRedactBoxes(data, width, height, [{ x: 1.2, y: 1.4, w: 2.5, h: 2.3 }], color)

    for (let y = 1; y <= 3; y++) {
      for (let x = 1; x <= 3; x++) {
        const idx = pixelIndex(x, y, width)
        expect([data[idx], data[idx + 1], data[idx + 2], data[idx + 3]]).toEqual([
          50,
          60,
          70,
          255
        ])
      }
    }
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (y >= 1 && y <= 3 && x >= 1 && x <= 3) continue
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

  it('1×1px 박스는 정확히 픽셀 1개만 칠한다', () => {
    const width = 4
    const height = 4
    const data = makeSentinelData(width, height)
    const original = data.slice()

    applyRedactBoxes(data, width, height, [{ x: 2, y: 2, w: 1, h: 1 }], [1, 2, 3])

    const idx = pixelIndex(2, 2, width)
    expect([data[idx], data[idx + 1], data[idx + 2], data[idx + 3]]).toEqual([1, 2, 3, 255])
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (x === 2 && y === 2) continue
        const i = pixelIndex(x, y, width)
        expect([data[i], data[i + 1], data[i + 2], data[i + 3]]).toEqual([
          original[i],
          original[i + 1],
          original[i + 2],
          original[i + 3]
        ])
      }
    }
  })

  it('이미지 전체를 덮는 박스는 모든 픽셀을 칠한다', () => {
    const width = 3
    const height = 3
    const data = makeSentinelData(width, height)

    applyRedactBoxes(data, width, height, [{ x: 0, y: 0, w: width, h: height }], [9, 9, 9])

    for (let i = 0; i < data.length; i += 4) {
      expect([data[i], data[i + 1], data[i + 2], data[i + 3]]).toEqual([9, 9, 9, 255])
    }
  })

  it('이미지 경계를 완전히 벗어난 박스(양쪽 방향 모두)는 아무 것도 칠하지 않는다', () => {
    const width = 4
    const height = 4
    const data = makeSentinelData(width, height)
    const original = data.slice()

    applyRedactBoxes(
      data,
      width,
      height,
      [
        // 오른쪽·아래로 완전히 벗어남
        { x: 10, y: 10, w: 5, h: 5 },
        // 왼쪽·위로 완전히 벗어남(음수 전체)
        { x: -10, y: -10, w: 3, h: 3 }
      ],
      [1, 1, 1]
    )

    expect(Array.from(data)).toEqual(Array.from(original))
  })
})
