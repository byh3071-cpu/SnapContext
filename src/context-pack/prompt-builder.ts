import type { ContextPack, PinItem } from '../types'
import { hasBugPin, pinKind } from './pin-kind'
import { renderTemplate } from './template-engine'
import bugReportTemplate from '../../prompts/templates/bug-report.md?raw'
import refactorTemplate from '../../prompts/templates/refactor.md?raw'
import referenceTemplate from '../../prompts/templates/reference.md?raw'

export type PromptTemplateId = 'bug' | 'refactor' | 'reference'

export const PROMPT_TEMPLATES: Record<PromptTemplateId, string> = {
  bug: bugReportTemplate,
  refactor: refactorTemplate,
  reference: referenceTemplate
}

export const DEFAULT_PROMPT_TEMPLATE: PromptTemplateId = 'bug'

export type BuildTemplatePromptExtras = {
  userAgent?: string
  userNote?: string
  viewport?: { width: number; height: number }
}

function parseViewport(value: string): { width: number; height: number } {
  const [w, h] = value.split('x').map((part) => Number.parseInt(part, 10))
  return {
    width: Number.isFinite(w) ? w : 0,
    height: Number.isFinite(h) ? h : 0
  }
}

function annotationToPin(a: ContextPack['annotations'][number]): PinItem {
  return {
    id: a.id,
    x: a.position.x,
    y: a.position.y,
    memo: a.memo ?? '',
    kind: a.kind
  }
}

const EMPTY_VIEWPORT = { width: 0, height: 0 }

export function buildTemplatePrompt(
  pack: ContextPack,
  template: PromptTemplateId,
  extras?: BuildTemplatePromptExtras
): string {
  const source = pack.source
  const capture = pack.capture
  const pinItems = (pack.annotations ?? []).map(annotationToPin)
  const debug = template === 'bug' && hasBugPin(pinItems)
  const lite = !debug
  const viewport = extras?.viewport ?? parseViewport(capture.viewport)
  const ctx = {
    debug,
    lite,
    source: {
      url: source.url,
      title: source.title,
      userAgent: debug ? (extras?.userAgent ?? '') : '',
      captureType: debug ? capture.type : '',
      viewport: debug ? viewport : EMPTY_VIEWPORT
    },
    pins: pinItems.map((p) => ({
      id: p.id,
      x: p.x.toFixed(1),
      y: p.y.toFixed(1),
      memo: p.memo.trim() ? p.memo : '(메모 없음)',
      tag: pinKind(p) === 'bug' ? ' [버그]' : ''
    })),
    context: {
      userNote: extras?.userNote?.trim() ?? ''
    }
  }
  return renderTemplate(PROMPT_TEMPLATES[template], ctx)
}
