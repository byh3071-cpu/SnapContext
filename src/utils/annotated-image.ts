import type {
  Annotation,
  ArrowAnnotation,
  PinItem,
  RedactBoxAnnotation,
  StrokeAnnotation
} from '../types'
import { applyRedactBoxes } from './redaction'

// 가리기 채움색 — 핀 글리프와 같은 잉크색(#15110F). ADR-021: 모자이크·블러 대신 상수 색.
// export: 사이드패널 주석 오버레이(편집 중 미리보기)도 동일 색을 써야 WYSIWYG 계약이 성립한다.
export const REDACT_COLOR: [number, number, number] = [21, 17, 15]
export const ARROW_COLOR = '#E5302E'
export const FREEHAND_COLOR = '#E5302E'
export const HIGHLIGHT_COLOR = 'rgba(255, 235, 59, 0.4)'

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('이미지를 불러오지 못했습니다.'))
    img.src = url
  })
}

/** % 좌표(0~100) → 캔버스 px 좌표. bake·오버레이 편집 미리보기 공용. */
export function toPx(value: number, size: number): number {
  return (value / 100) * size
}

/** 캔버스 너비 기준 기본 선 두께 — bake·오버레이가 동일 공식을 써야 시각이 일치한다. */
export function computeBaseLineWidth(canvasWidth: number): number {
  return Math.max(2, canvasWidth * 0.004)
}

/** 화살표 1건을 그린다 — bake(내보내기)와 사이드패널 오버레이(편집 중 미리보기) 공용 함수. */
export function drawArrow(
  ctx: CanvasRenderingContext2D,
  arrow: ArrowAnnotation,
  width: number,
  height: number,
  lineWidth: number
): void {
  const x1 = toPx(arrow.x1, width)
  const y1 = toPx(arrow.y1, height)
  const x2 = toPx(arrow.x2, width)
  const y2 = toPx(arrow.y2, height)

  ctx.save()
  ctx.strokeStyle = ARROW_COLOR
  ctx.fillStyle = ARROW_COLOR
  ctx.lineWidth = lineWidth
  ctx.lineCap = 'round'

  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()

  // 화살표 머리 — 끝점에서 뒤로 꺾인 삼각형.
  const headLength = Math.max(8, lineWidth * 4)
  const angle = Math.atan2(y2 - y1, x2 - x1)
  ctx.beginPath()
  ctx.moveTo(x2, y2)
  ctx.lineTo(
    x2 - headLength * Math.cos(angle - Math.PI / 6),
    y2 - headLength * Math.sin(angle - Math.PI / 6)
  )
  ctx.lineTo(
    x2 - headLength * Math.cos(angle + Math.PI / 6),
    y2 - headLength * Math.sin(angle + Math.PI / 6)
  )
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

/** 형광펜·자유선 1건을 그린다 — bake·오버레이 공용 함수. */
export function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: StrokeAnnotation,
  width: number,
  height: number,
  color: string,
  lineWidth: number
): void {
  if (stroke.points.length === 0) return
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  const [first, ...rest] = stroke.points
  ctx.moveTo(toPx(first.x, width), toPx(first.y, height))
  for (const point of rest) {
    ctx.lineTo(toPx(point.x, width), toPx(point.y, height))
  }
  ctx.stroke()
  ctx.restore()
}

/**
 * 가리기 박스 1건을 불투명 솔리드로 그린다 — 사이드패널 오버레이의 "편집 중 미리보기"
 * 전용(WYSIWYG, ADR-021). 실제 내보내기 bake 는 픽셀 버퍼를 직접 치환하는
 * applyRedactBoxes 를 쓴다(캔버스 합성 경로를 거치지 않아야 알파 등으로 픽셀이 새는 걸
 * 원천 배제할 수 있다) — 여기 함수는 편집 화면에 "가려질 자리"를 사용자에게 그대로
 * 보여주는 용도일 뿐, 파괴적 bake 경로가 아니다.
 */
export function drawRedactBox(
  ctx: CanvasRenderingContext2D,
  box: Pick<RedactBoxAnnotation, 'x' | 'y' | 'w' | 'h'>,
  width: number,
  height: number
): void {
  const [r, g, b] = REDACT_COLOR
  ctx.save()
  ctx.fillStyle = `rgb(${r}, ${g}, ${b})`
  ctx.fillRect(toPx(box.x, width), toPx(box.y, height), toPx(box.w, width), toPx(box.h, height))
  ctx.restore()
}

/** 표현용 주석(화살표·형광펜·자유선) 1건을 그린다 — bake·오버레이 공용 dispatcher. */
export function drawExpressiveAnnotation(
  ctx: CanvasRenderingContext2D,
  annotation: ArrowAnnotation | StrokeAnnotation,
  width: number,
  height: number,
  baseLineWidth: number
): void {
  if (annotation.kind === 'arrow') {
    drawArrow(ctx, annotation, width, height, baseLineWidth)
  } else if (annotation.kind === 'highlight') {
    drawStroke(ctx, annotation, width, height, HIGHLIGHT_COLOR, baseLineWidth * 3)
  } else {
    drawStroke(ctx, annotation, width, height, FREEHAND_COLOR, baseLineWidth)
  }
}

/**
 * 주석 목록을 캔버스에 그린다(비파괴 미리보기 전용 — 사이드패널 오버레이가 쓴다).
 * 가리기를 먼저 그려야 그 위에 얹힌 화살표·형광펜 등이 가려지지 않는다
 * (bake 쪽 순서와 동일 규칙, ADR-021).
 */
export function drawAnnotationsPreview(
  ctx: CanvasRenderingContext2D,
  annotations: Annotation[],
  width: number,
  height: number,
  baseLineWidth: number
): void {
  for (const annotation of annotations) {
    if (annotation.kind === 'redact') {
      drawRedactBox(ctx, annotation, width, height)
    }
  }
  for (const annotation of annotations) {
    if (annotation.kind !== 'redact') {
      drawExpressiveAnnotation(ctx, annotation, width, height, baseLineWidth)
    }
  }
}

export async function renderAnnotatedPngBlob(
  imageDataUrl: string,
  pins: PinItem[],
  annotations: Annotation[] = []
): Promise<Blob> {
  const img = await loadImage(imageDataUrl)
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Canvas 2D 컨텍스트를 사용할 수 없습니다.')
  }

  ctx.drawImage(img, 0, 0)

  // 1) 가리기(파괴적) 먼저 bake — 표현 주석·핀보다 앞서야 가려진 자리 위에 다른
  // 주석이 그려지는 것을 막을 수 있고, ADR-021 계약(픽셀 자체 파괴)을 만족한다.
  const redactBoxes = annotations.filter(
    (a): a is Extract<Annotation, { kind: 'redact' }> => a.kind === 'redact'
  )
  if (redactBoxes.length > 0) {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const pxBoxes = redactBoxes.map((box) => ({
      x: toPx(box.x, canvas.width),
      y: toPx(box.y, canvas.height),
      w: toPx(box.w, canvas.width),
      h: toPx(box.h, canvas.height)
    }))
    applyRedactBoxes(imageData.data, canvas.width, canvas.height, pxBoxes, REDACT_COLOR)
    ctx.putImageData(imageData, 0, 0)
  }

  // 2) 표현용 주석(화살표·형광펜·자유선) — 선 두께는 이미지 크기에 비례.
  const baseLineWidth = computeBaseLineWidth(canvas.width)
  for (const annotation of annotations) {
    if (annotation.kind !== 'redact') {
      drawExpressiveAnnotation(ctx, annotation, canvas.width, canvas.height, baseLineWidth)
    }
  }

  // 3) 핀 — 기존 로직 그대로.
  for (const pin of pins) {
    const px = (pin.x / 100) * canvas.width
    const py = (pin.y / 100) * canvas.height
    const r = 12
    ctx.save()
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)'
    ctx.shadowBlur = 6
    ctx.fillStyle = '#e94560'
    ctx.beginPath()
    ctx.arc(px, py, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 12px system-ui, -apple-system, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(pin.id), px, py)
    ctx.restore()
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error('PNG 데이터를 만들지 못했습니다.'))
      else resolve(blob)
    }, 'image/png')
  })
}

export async function downloadAnnotatedPng(
  imageDataUrl: string,
  pins: PinItem[],
  filename: string,
  annotations: Annotation[] = []
): Promise<void> {
  const blob = await renderAnnotatedPngBlob(imageDataUrl, pins, annotations)
  const url = URL.createObjectURL(blob)
  try {
    await chrome.downloads.download({ url, filename, saveAs: false })
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    return
  } catch {
    /* fallback below */
  }

  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export async function copyAnnotatedPngToClipboard(
  imageDataUrl: string,
  pins: PinItem[],
  annotations: Annotation[] = []
): Promise<void> {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
    throw new Error('이 브라우저에서는 이미지 복사를 지원하지 않습니다.')
  }
  const blob = await renderAnnotatedPngBlob(imageDataUrl, pins, annotations)
  await navigator.clipboard.write([
    new ClipboardItem({ 'image/png': blob })
  ])
}
