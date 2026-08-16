import type { Annotation } from '../../types'
import { computeBaseLineWidth, drawAnnotationsPreview } from '../../utils/annotated-image'
import type { AnnotationTool } from './AnnotationToolbar'

export type AnnotationOverlayApi = {
  /** 최신 주석 목록·활성 도구·표시 크기를 다시 읽어 캔버스를 재그린다. */
  render: () => void
}

export type AnnotationOverlayOpts = {
  getAnnotations: () => Annotation[]
  getActiveTool: () => AnnotationTool
  /** 가리기 드래그 확정 — % 좌표계(0~100). id 부여는 호출측(App) 책임. */
  onCommitRedact: (box: { x: number; y: number; w: number; h: number }) => void
  /** 화살표 드래그 확정 — % 좌표계. */
  onCommitArrow: (arrow: { x1: number; y1: number; x2: number; y2: number }) => void
  /** 형광펜/자유선 드래그 확정 — % 좌표계 점 목록. */
  onCommitStroke: (
    kind: 'highlight' | 'freehand',
    points: Array<{ x: number; y: number }>
  ) => void
  /**
   * 임계 미달로 주석이 조용히 폐기될 때 통보한다(예: 가리기 드래그가 너무 작아 버려짐).
   * 호출측(App)이 기존 토스트 관례로 사용자에게 알린다.
   */
  onRejectAnnotation: (reason: string) => void
}

/** 드래그 중(미확정) 도형 — % 좌표계. 확정 전에는 App 상태에 반영하지 않는다(undo 가능). */
type Draft =
  | { kind: 'redact'; x1: number; y1: number; x2: number; y2: number }
  | { kind: 'arrow'; x1: number; y1: number; x2: number; y2: number }
  | { kind: 'highlight' | 'freehand'; points: Array<{ x: number; y: number }> }

/** 드래그가 이 이하(% 단위)면 실수 클릭으로 보고 버린다 — 표현 도구(화살표·스트로크) 전용. */
const MIN_DRAG_PCT = 1
/**
 * 가리기(redact) 최소 크기 — 표시 px 절대값(가로·세로 각각 이 이상).
 *
 * 가리기는 % 임계값을 쓰면 안 된다 — 원본 캡처가 길수록(예: 1000×6000) 같은 % 가 나타내는
 * 실제 표시 px 문턱이 커져서, 넓고 얇은 박스(텍스트 한 줄 가리기 등)가 % 문턱에 걸려
 * 무통보로 사라진다(실측: 1000×6000 캡처에서 원본 60px 문턱). 화면에 실제로 보이는
 * 크기(표시 px) 기준으로 판정해야 캡처 크기와 무관하게 일관된다. 파괴적 도구라 표현
 * 도구(화살표·스트로크)와는 분리해서 판정한다.
 */
const MIN_REDACT_DISPLAY_PX = 4
/** 자유선/형광펜 포인트 샘플링 최소 간격(표시 px) — 과도한 점 적재 방지. */
const STROKE_SAMPLE_PX = 2

function draftToAnnotation(draft: Draft): Annotation {
  if (draft.kind === 'redact') {
    return {
      id: -1,
      kind: 'redact',
      x: Math.min(draft.x1, draft.x2),
      y: Math.min(draft.y1, draft.y2),
      w: Math.abs(draft.x2 - draft.x1),
      h: Math.abs(draft.y2 - draft.y1)
    }
  }
  if (draft.kind === 'arrow') {
    return { id: -1, kind: 'arrow', x1: draft.x1, y1: draft.y1, x2: draft.x2, y2: draft.y2 }
  }
  return { id: -1, kind: draft.kind, points: draft.points }
}

/**
 * pin-container 위에 편집용 캔버스 오버레이를 올린다. 도구가 '없음'이면
 * pointer-events 를 놓아 기존 핀 클릭 UX(PinAnnotation.ts)를 그대로 통과시키고,
 * 도구가 선택되면 이 캔버스가 드래그를 가로채 % 좌표 도형을 만든다.
 *
 * 실제 픽셀 파괴(가리기)는 여기서 하지 않는다 — 여긴 편집 중 미리보기 캔버스일 뿐이고,
 * 파괴적 bake 는 내보내기 시점에 annotated-image.ts 가 한다(ADR-021 D2).
 */
export function mountAnnotationOverlay(
  pinContainer: HTMLElement,
  imageEl: HTMLImageElement,
  opts: AnnotationOverlayOpts
): AnnotationOverlayApi {
  const canvas = document.createElement('canvas')
  canvas.className = 'annotation-overlay'
  pinContainer.appendChild(canvas)

  const maybeCtx = canvas.getContext('2d')
  if (!maybeCtx) {
    throw new Error('Canvas 2D 컨텍스트를 사용할 수 없습니다.')
  }
  // 별도 바인딩으로 재대입 — nullable 원본과 달리 이 상수는 뒤에서 정의되는
  // 포인터 이벤트 클로저들 안에서도 계속 non-null 타입으로 남는다.
  const ctx: CanvasRenderingContext2D = maybeCtx

  let draft: Draft | null = null
  let activePointerId: number | null = null

  const clamp = (v: number): number => Math.min(100, Math.max(0, v))

  function pointToPercent(ev: PointerEvent): { x: number; y: number } | null {
    const rect = imageEl.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) return null
    return {
      x: clamp(((ev.clientX - rect.left) / rect.width) * 100),
      y: clamp(((ev.clientY - rect.top) / rect.height) * 100)
    }
  }

  function render(): void {
    const tool = opts.getActiveTool()
    canvas.classList.toggle('annotation-overlay--active', tool !== 'none')

    const displayWidth = canvas.clientWidth
    const displayHeight = canvas.clientHeight
    if (displayWidth < 1 || displayHeight < 1) return

    // devicePixelRatio 로 버퍼만 키우고(선명도), 그리기는 항상 표시 px(CSS 좌표계)로
    // 한다 — transform:scale 로 확대하지 않는다(CLAUDE.md 제약).
    const dpr = window.devicePixelRatio || 1
    const bufW = Math.max(1, Math.round(displayWidth * dpr))
    const bufH = Math.max(1, Math.round(displayHeight * dpr))
    if (canvas.width !== bufW || canvas.height !== bufH) {
      canvas.width = bufW
      canvas.height = bufH
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, displayWidth, displayHeight)

    const baseLineWidth = computeBaseLineWidth(displayWidth)
    drawAnnotationsPreview(ctx, opts.getAnnotations(), displayWidth, displayHeight, baseLineWidth)
    if (draft) {
      drawAnnotationsPreview(
        ctx,
        [draftToAnnotation(draft)],
        displayWidth,
        displayHeight,
        baseLineWidth
      )
    }
  }

  function onPointerDown(ev: PointerEvent): void {
    const tool = opts.getActiveTool()
    if (tool === 'none') return
    if (ev.button !== 0) return
    const pct = pointToPercent(ev)
    if (!pct) return

    canvas.setPointerCapture(ev.pointerId)
    activePointerId = ev.pointerId

    if (tool === 'redact') {
      draft = { kind: 'redact', x1: pct.x, y1: pct.y, x2: pct.x, y2: pct.y }
    } else if (tool === 'arrow') {
      draft = { kind: 'arrow', x1: pct.x, y1: pct.y, x2: pct.x, y2: pct.y }
    } else {
      draft = { kind: tool, points: [pct] }
    }
    ev.preventDefault()
    render()
  }

  function onPointerMove(ev: PointerEvent): void {
    if (!draft || ev.pointerId !== activePointerId) return
    const pct = pointToPercent(ev)
    if (!pct) return

    if (draft.kind === 'redact' || draft.kind === 'arrow') {
      draft.x2 = pct.x
      draft.y2 = pct.y
    } else {
      const rect = imageEl.getBoundingClientRect()
      const last = draft.points[draft.points.length - 1]
      const dxPx = ((pct.x - last.x) / 100) * rect.width
      const dyPx = ((pct.y - last.y) / 100) * rect.height
      if (Math.hypot(dxPx, dyPx) >= STROKE_SAMPLE_PX) {
        draft.points.push(pct)
      }
    }
    render()
  }

  function finishDraft(ev: PointerEvent): void {
    if (!draft || ev.pointerId !== activePointerId) return
    canvas.releasePointerCapture(ev.pointerId)
    activePointerId = null
    const committed = draft
    draft = null

    if (committed.kind === 'redact') {
      const x = Math.min(committed.x1, committed.x2)
      const y = Math.min(committed.y1, committed.y2)
      const w = Math.abs(committed.x2 - committed.x1)
      const h = Math.abs(committed.y2 - committed.y1)
      // % 가 아니라 실제 표시 px 로 환산해 판정한다(MIN_REDACT_DISPLAY_PX 주석 참고).
      const rect = imageEl.getBoundingClientRect()
      const pxW = (w / 100) * rect.width
      const pxH = (h / 100) * rect.height
      if (pxW >= MIN_REDACT_DISPLAY_PX && pxH >= MIN_REDACT_DISPLAY_PX) {
        opts.onCommitRedact({ x, y, w, h })
      } else {
        opts.onRejectAnnotation('너무 작아 가리기가 적용되지 않았습니다.')
      }
    } else if (committed.kind === 'arrow') {
      const dist = Math.hypot(committed.x2 - committed.x1, committed.y2 - committed.y1)
      if (dist >= MIN_DRAG_PCT) {
        opts.onCommitArrow({
          x1: committed.x1,
          y1: committed.y1,
          x2: committed.x2,
          y2: committed.y2
        })
      }
    } else if (committed.points.length >= 2) {
      opts.onCommitStroke(committed.kind, committed.points)
    }
    render()
  }

  function onPointerCancel(ev: PointerEvent): void {
    if (ev.pointerId !== activePointerId) return
    draft = null
    activePointerId = null
    render()
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', finishDraft)
  canvas.addEventListener('pointercancel', onPointerCancel)

  // 표시 크기 변동(창 resize·이미지 교체) 시 캔버스를 재조정·재그림.
  const resizeObserver = new ResizeObserver(() => render())
  resizeObserver.observe(imageEl)
  imageEl.addEventListener('load', () => render())

  render()

  return { render }
}
