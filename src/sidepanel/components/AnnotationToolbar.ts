import { swissIcon, type SwissIconName } from '../utils/swiss-icons'

/**
 * 주석 도구 5종 — '없음'은 기본값이자 기존 핀 클릭 모드다(오버레이가 pointer-events 를
 * 놓아준다). 나머지 4종은 AnnotationOverlay 가 드래그로 % 좌표 도형을 만든다.
 * PRD-0.4.3 §B · ADR-021.
 */
export type AnnotationTool = 'none' | 'redact' | 'arrow' | 'highlight' | 'freehand'

export interface AnnotationToolbarHandlers {
  getActiveTool: () => AnnotationTool
  onSelectTool: (tool: AnnotationTool) => void
  /** 마지막으로 추가된 주석 1건만 제거한다. */
  onUndo: () => void
  hasImage: () => boolean
  hasAnnotations: () => boolean
}

export interface AnnotationToolbarApi {
  /** 활성 도구·disabled 상태를 다시 반영한다(이미지 변경·주석 추가/삭제 후 호출). */
  sync: () => void
}

interface ToolRow {
  tool: AnnotationTool
  icon: SwissIconName
  label: string
}

/** dataset 값(string)이 실제로 닫힌집합 AnnotationTool 인지 런타임 대조(as 캐스팅 대신). */
function isAnnotationTool(value: string | undefined): value is AnnotationTool {
  return (
    value === 'none' ||
    value === 'redact' ||
    value === 'arrow' ||
    value === 'highlight' ||
    value === 'freehand'
  )
}

const TOOLS: ToolRow[] = [
  { tool: 'none', icon: 'pointer', label: '없음 (핀 모드)' },
  { tool: 'redact', icon: 'redactBox', label: '가리기 — 픽셀 파괴' },
  { tool: 'arrow', icon: 'arrowTool', label: '화살표' },
  { tool: 'highlight', icon: 'highlighter', label: '형광펜' },
  { tool: 'freehand', icon: 'freehand', label: '자유선' }
]

export function mountAnnotationToolbar(
  root: HTMLElement,
  handlers: AnnotationToolbarHandlers
): AnnotationToolbarApi {
  root.replaceChildren()

  const toolbar = document.createElement('div')
  toolbar.className = 'anno-toolbar'
  toolbar.setAttribute('role', 'toolbar')
  toolbar.setAttribute('aria-label', '주석 도구')

  const toolButtons = new Map<AnnotationTool, HTMLButtonElement>()

  for (const row of TOOLS) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'anno-btn'
    btn.dataset.tool = row.tool
    btn.setAttribute('aria-pressed', 'false')
    btn.title = row.label
    btn.setAttribute('aria-label', row.label)
    btn.append(swissIcon(row.icon, 'ic-sm'))
    toolbar.append(btn)
    toolButtons.set(row.tool, btn)
  }

  const divider = document.createElement('span')
  divider.className = 'anno-toolbar__divider'
  divider.setAttribute('aria-hidden', 'true')
  toolbar.append(divider)

  const undoBtn = document.createElement('button')
  undoBtn.type = 'button'
  undoBtn.className = 'anno-btn anno-btn--undo'
  undoBtn.dataset.action = 'undo'
  undoBtn.title = '실행취소 (마지막 주석 제거)'
  undoBtn.setAttribute('aria-label', '실행취소')
  undoBtn.append(swissIcon('undo', 'ic-sm'))
  toolbar.append(undoBtn)

  root.append(toolbar)

  const sync = (): void => {
    const hasImage = handlers.hasImage()
    const active = handlers.getActiveTool()
    for (const [tool, btn] of toolButtons) {
      btn.disabled = !hasImage
      btn.setAttribute('aria-pressed', String(tool === active))
    }
    undoBtn.disabled = !hasImage || !handlers.hasAnnotations()
  }

  const onClick = (ev: MouseEvent): void => {
    const target = ev.target
    if (!(target instanceof Element)) return
    const toolBtn = target.closest<HTMLButtonElement>('button[data-tool]')
    if (toolBtn && !toolBtn.disabled && isAnnotationTool(toolBtn.dataset.tool)) {
      handlers.onSelectTool(toolBtn.dataset.tool)
      sync()
      return
    }
    const undoTarget = target.closest<HTMLButtonElement>('button[data-action="undo"]')
    if (undoTarget && !undoTarget.disabled) {
      handlers.onUndo()
      sync()
    }
  }
  root.addEventListener('click', onClick)

  sync()

  return { sync }
}
