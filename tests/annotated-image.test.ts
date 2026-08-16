import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderAnnotatedPngBlob, REDACT_COLOR } from '../src/utils/annotated-image'
import type { RedactBoxAnnotation } from '../src/types'

/**
 * bake 파이프라인(renderAnnotatedPngBlob) 픽셀 계약 테스트 — 0.4.3 critic 지적.
 *
 * 이전까지 tests/ 전체에서 annotated-image.ts·ImageActions.ts 를 임포트하는 테스트가
 * 0건이었다 — ImageActions.ts 의 renderAnnotatedPngBlob(image, pins, deps.getAnnotations())
 * 호출에서 세 번째 인자를 지워도 기존 131개 테스트가 전부 그린이었다(뮤테이션 무방비).
 *
 * vitest environment 는 'node' 라 실제 DOM/Canvas 가 없다 — document.createElement('canvas')
 * 와 new Image() 를 최소 fake 로 대체하되, 픽셀 파이프라인의 핵심 3단계
 * (ctx.getImageData → applyRedactBoxes(진짜 함수) → ctx.putImageData) 는 실제 로직 그대로
 * 실행되게 한다. 그래야 "annotations 인자를 안 넘기면(=deps.getAnnotations() 를 빼먹으면)
 * 가림 픽셀이 안 나온다" 는 뮤테이션을 이 테스트가 실패로 잡아낼 수 있다.
 *
 * 한계(사람 QA 로만 확인 가능 — 시도하지 않음, 3c):
 *   - 산출 PNG 파일에 원본 바이트가 잔존하지 않는지(aCropalypse 류)는 실제 canvas.toBlob 의
 *     PNG 인코더가 있어야 확인 가능하다. 여기 fake canvas.toBlob 은 인코딩을 하지 않는
 *     더미 Blob 을 돌려주므로 이 계약은 검증 범위 밖이다 — 실브라우저 수동 QA 항목.
 */

const FAKE_IMAGE_WIDTH = 10
const FAKE_IMAGE_HEIGHT = 10

/** new Image() 대체 — src 대입 시 곧바로(microtask) onload 를 태운다. */
class FakeImage {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  naturalWidth = 0
  naturalHeight = 0
  private _src = ''

  get src(): string {
    return this._src
  }

  set src(value: string) {
    this._src = value
    this.naturalWidth = FAKE_IMAGE_WIDTH
    this.naturalHeight = FAKE_IMAGE_HEIGHT
    queueMicrotask(() => this.onload?.())
  }
}

type FakeBuffer = { data: Uint8ClampedArray }

/**
 * 실제 CanvasRenderingContext2D 대신 쓰는 permissive fake — drawImage/getImageData/
 * putImageData 만 진짜처럼 동작하고, 나머지(save/fillStyle/arc/fillText 등 표현 주석·핀
 * 렌더링이 호출하는 모든 메서드)는 Proxy 로 조용히 no-op 처리한다. 여기서 하는 건 픽셀
 * 파이프라인 검증이지 캔버스 드로잉 API 전체를 재구현하는 게 아니다.
 */
function makeFakeCtx(buffer: FakeBuffer): CanvasRenderingContext2D {
  const real = {
    drawImage(): void {
      // 실제 이미지 디코딩 없이, 결정론적 sentinel 패턴으로 "원본 픽셀"을 채운다.
      // (tests/redaction.test.ts 의 makeSentinelData 와 동일한 규칙)
      for (let i = 0; i < buffer.data.length; i++) {
        buffer.data[i] = i % 256
      }
    },
    getImageData(_x: number, _y: number, w: number, h: number) {
      // 실제 getImageData 계약과 동일하게 "복사본"을 돌려준다(putImageData 로 되돌리기
      // 전까지 buffer 원본과 독립).
      return { data: buffer.data.slice(), width: w, height: h }
    },
    putImageData(imageData: { data: Uint8ClampedArray }): void {
      buffer.data.set(imageData.data)
    }
  }
  return new Proxy(real, {
    get(target, prop, receiver) {
      if (Reflect.has(target, prop)) return Reflect.get(target, prop, receiver)
      // save/restore/beginPath/moveTo/lineTo/stroke/fill/arc/fillText 등 — 전부 no-op.
      return () => undefined
    },
    set() {
      // fillStyle/strokeStyle/lineWidth/shadowBlur 등 프로퍼티 대입은 무시.
      return true
    }
  }) as unknown as CanvasRenderingContext2D
}

type FakeCanvas = {
  width: number
  height: number
  getContext: (type: string) => CanvasRenderingContext2D | null
  toBlob: (cb: (blob: Blob | null) => void) => void
  getBuffer: () => Uint8ClampedArray
}

function makeFakeCanvas(): FakeCanvas {
  let buffer: FakeBuffer | null = null
  const canvas: FakeCanvas = {
    width: 0,
    height: 0,
    getContext(type: string) {
      if (type !== '2d') return null
      const needed = canvas.width * canvas.height * 4
      if (!buffer || buffer.data.length !== needed) {
        buffer = { data: new Uint8ClampedArray(needed) }
      }
      return makeFakeCtx(buffer)
    },
    toBlob(cb: (blob: Blob | null) => void) {
      // PNG 인코딩은 하지 않는다 — 여긴 픽셀 파이프라인 검증용, 실제 PNG 바이트 계약은
      // 테스트 범위 밖(파일 상단 한계 설명 참고).
      cb(new Blob(['fake-png-bytes']))
    },
    getBuffer: () => {
      if (!buffer) throw new Error('getContext 를 먼저 호출해야 buffer 가 생긴다')
      return buffer.data
    }
  }
  return canvas
}

let lastCanvas: FakeCanvas | null = null

function pixelIndex(x: number, y: number, width: number): number {
  return (y * width + x) * 4
}

/** i%256 sentinel 패턴에서 인덱스 idx 위치의 기대값(RGBA 4바이트) */
function sentinelAt(idx: number): [number, number, number, number] {
  return [idx % 256, (idx + 1) % 256, (idx + 2) % 256, (idx + 3) % 256]
}

describe('renderAnnotatedPngBlob — 가리기(redact) bake 픽셀 계약', () => {
  beforeEach(() => {
    lastCanvas = null
    vi.stubGlobal('Image', FakeImage)
    vi.stubGlobal('document', {
      createElement: (tag: string) => {
        if (tag !== 'canvas') throw new Error(`예상치 못한 createElement(${tag})`)
        lastCanvas = makeFakeCanvas()
        return lastCanvas
      }
    })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('가림 영역 픽셀 전수가 REDACT_COLOR([21,17,15,255])로 바뀌고, 영역 밖은 무변경이다', async () => {
    const box: RedactBoxAnnotation = { id: 1, kind: 'redact', x: 20, y: 30, w: 40, h: 20 }
    // toPx(%, 10) 기준: x0=floor(2)=2, x1=ceil(2+4)=6 → 열 2,3,4,5
    //                    y0=floor(3)=3, y1=ceil(3+2)=5 → 행 3,4

    await renderAnnotatedPngBlob('data:image/png;base64,irrelevant', [], [box])

    if (!lastCanvas) throw new Error('canvas 가 생성되지 않았습니다')
    const buffer = lastCanvas.getBuffer()
    const width = FAKE_IMAGE_WIDTH

    for (let y = 3; y <= 4; y++) {
      for (let x = 2; x <= 5; x++) {
        const idx = pixelIndex(x, y, width)
        expect(
          [buffer[idx], buffer[idx + 1], buffer[idx + 2], buffer[idx + 3]],
          `(${x},${y})`
        ).toEqual([...REDACT_COLOR, 255])
      }
    }

    for (let y = 0; y < FAKE_IMAGE_HEIGHT; y++) {
      for (let x = 0; x < width; x++) {
        if (y >= 3 && y <= 4 && x >= 2 && x <= 5) continue
        const idx = pixelIndex(x, y, width)
        expect(
          [buffer[idx], buffer[idx + 1], buffer[idx + 2], buffer[idx + 3]],
          `(${x},${y}) 밖 픽셀`
        ).toEqual(sentinelAt(idx))
      }
    }
  })

  it('annotations 인자를 생략하면(기본값 []) 가리기가 전혀 적용되지 않는다 — 세 번째 인자 누락 뮤테이션 감지선', async () => {
    // deps.getAnnotations() 를 호출부에서 빼먹은 것과 동일한 상태 재현.
    await renderAnnotatedPngBlob('data:image/png;base64,irrelevant', [])

    if (!lastCanvas) throw new Error('canvas 가 생성되지 않았습니다')
    const buffer = lastCanvas.getBuffer()

    // redact 박스가 없었으므로 sentinel 원본 패턴이 끝까지 유지돼야 한다.
    for (let i = 0; i < buffer.length; i++) {
      expect(buffer[i]).toBe(i % 256)
    }
  })
})
