import type { ContextPack, PinItem } from '../types'
import { pinKind } from './pin-kind'
import type { PromptTemplateId } from './prompt-builder'

export type PackSummaryTemplateLabel = '버그 리포트' | '리팩토링' | '레퍼런스'

export interface PackSummary {
  templateLabel: PackSummaryTemplateLabel
  pinCount: number
  bugPinCount: number
  hasImage: boolean
  hasUserNote: boolean
}

const TEMPLATE_LABELS: Record<PromptTemplateId, PackSummaryTemplateLabel> = {
  bug: '버그 리포트',
  refactor: '리팩토링',
  reference: '레퍼런스'
}

function annotationToPin(
  annotation: ContextPack['annotations'][number]
): PinItem {
  return {
    id: annotation.id,
    x: annotation.position.x,
    y: annotation.position.y,
    memo: annotation.memo ?? '',
    kind: annotation.kind
  }
}

export function packTemplateLabel(
  template: PromptTemplateId
): PackSummaryTemplateLabel {
  return TEMPLATE_LABELS[template]
}

export function buildPackSummary(
  pack: ContextPack,
  template: PromptTemplateId,
  extras: { hasImage: boolean; userNote?: string }
): PackSummary {
  const pins = (pack.annotations ?? []).map(annotationToPin)
  return {
    templateLabel: TEMPLATE_LABELS[template],
    pinCount: pins.length,
    bugPinCount: pins.filter((pin) => pinKind(pin) === 'bug').length,
    hasImage: extras.hasImage,
    hasUserNote: Boolean(extras.userNote?.trim())
  }
}
