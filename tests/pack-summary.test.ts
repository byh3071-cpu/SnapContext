import { describe, expect, it } from 'vitest'

import {
  generateContextPack,
  type GenerateContextPackInput
} from '../src/context-pack/generator'
import { assertOneLine, COPY_NEXT_ACTION } from '../src/context-pack/next-action'
import { buildPackSummary } from '../src/context-pack/pack-summary'
import type { ContextPack } from '../src/types'

const baseInput = (): GenerateContextPackInput => ({
  imageBase64: 'data:image/png;base64,AAAA',
  captureType: 'visible',
  pins: [],
  sourceUrl: 'https://example.com/page',
  sourceTitle: 'Example',
  viewport: { width: 1280, height: 720 },
  userAgent: 'Chrome Test',
  imageWidth: 240,
  imageHeight: 120
})

const emptyPack = (): ContextPack => generateContextPack(baseInput())

describe('buildPackSummary', () => {
  it('counts zero pins, no note, and image present', () => {
    expect(
      buildPackSummary(emptyPack(), 'bug', { hasImage: true })
    ).toEqual({
      templateLabel: '버그 리포트',
      pinCount: 0,
      bugPinCount: 0,
      hasImage: true,
      hasUserNote: false
    })
    expect(buildPackSummary(emptyPack(), 'bug', { hasImage: true, userNote: '   ' }).hasUserNote).toBe(false)
  })

  it('counts three pins with one bug and treats missing kind as ref', () => {
    const pack: ContextPack = {
      version: '0.2',
      id: 'snap_legacy_pins',
      source: {
        url: 'https://example.com/old',
        title: 'Legacy',
        capturedAt: '2026-01-01T00:00:00.000Z'
      },
      capture: {
        type: 'visible',
        viewport: '1280x720',
        imageSize: '240x120'
      },
      annotations: [
        { id: 1, position: { x: 0, y: 0 }, memo: 'broken', kind: 'bug' },
        { id: 2, position: { x: 10, y: 10 }, memo: 'note', kind: 'ref' },
        { id: 3, position: { x: 20, y: 20 }, memo: 'old pin' }
      ],
      debugLogs: [],
      mode: 'context'
    }

    const summary = buildPackSummary(pack, 'refactor', {
      hasImage: false,
      userNote: '추가 요청'
    })
    expect(summary.pinCount).toBe(3)
    expect(summary.bugPinCount).toBe(1)
    expect(summary.hasImage).toBe(false)
    expect(summary.hasUserNote).toBe(true)
  })

  it('maps template ids to Korean labels', () => {
    const pack = emptyPack()
    expect(buildPackSummary(pack, 'bug', { hasImage: false }).templateLabel).toBe(
      '버그 리포트'
    )
    expect(
      buildPackSummary(pack, 'refactor', { hasImage: false }).templateLabel
    ).toBe('리팩토링')
    expect(
      buildPackSummary(pack, 'reference', { hasImage: false }).templateLabel
    ).toBe('레퍼런스')
  })
})

describe('COPY_NEXT_ACTION', () => {
  it('passes assertOneLine (no newline, at most 80 chars)', () => {
    expect(() => assertOneLine(COPY_NEXT_ACTION)).not.toThrow()
    expect(COPY_NEXT_ACTION).toBe('AI 대화창에 붙여넣고 이미지를 함께 첨부하세요.')
    expect(COPY_NEXT_ACTION.includes('\n')).toBe(false)
    expect(COPY_NEXT_ACTION.length).toBeLessThanOrEqual(80)
  })
})
