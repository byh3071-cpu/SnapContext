import type { Annotation, ArrowAnnotation, PinItem, StrokeAnnotation } from '../types'
import { applyRedactBoxes } from './redaction'

// 가리기 채움색 — 핀 글리프와 같은 잉크색(#15110F). ADR-021: 모자이크·블러 대신 상수 색.
const REDACT_COLOR: [number, number, number] = [21, 17, 15]
const ARROW_COLOR = '#E5302E'
const FREEHAND_COLOR = '#E5302E'
const HIGHLIGHT_COLOR = 'rgba(255, 235, 59, 0.4)'

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('이미지를 불러오지 못했습니다.'))
    img.src = url
  })
}

/** % 좌표(0~100) → 캔버스 px 좌표. */
function toPx(value: number, size: number): number {
  return (value / 100) * size
}

function drawArrow(
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

function drawStroke(
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
  const baseLineWidth = Math.max(2, canvas.width * 0.004)
  for (const annotation of annotations) {
    if (annotation.kind === 'arrow') {
      drawArrow(ctx, annotation, canvas.width, canvas.height, baseLineWidth)
    } else if (annotation.kind === 'highlight') {
      drawStroke(
        ctx,
        annotation,
        canvas.width,
        canvas.height,
        HIGHLIGHT_COLOR,
        baseLineWidth * 3
      )
    } else if (annotation.kind === 'freehand') {
      drawStroke(ctx, annotation, canvas.width, canvas.height, FREEHAND_COLOR, baseLineWidth)
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
