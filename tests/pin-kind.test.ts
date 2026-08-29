import { describe, expect, it } from 'vitest'

import {
  generateContextPack,
  type GenerateContextPackInput
} from '../src/context-pack/generator'
import { hasBugPin, pinKind, toggleKind } from '../src/context-pack/pin-kind'
import type { ContextPack, PinItem } from '../src/types'

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

describe('pinKind', () => {
  it('treats a pin without kind as ref', () => {
    expect(pinKind({ id: 1, x: 0, y: 0, memo: '' })).toBe('ref')
  })

  it('returns bug when kind is bug', () => {
    expect(pinKind({ id: 1, x: 0, y: 0, memo: '', kind: 'bug' })).toBe('bug')
  })
})

describe('hasBugPin', () => {
  it('is false for an empty list', () => {
    expect(hasBugPin([])).toBe(false)
  })

  it('is false when every pin is a reference', () => {
    const pins: PinItem[] = [
      { id: 1, x: 0, y: 0, memo: '' },
      { id: 2, x: 1, y: 1, memo: 'note', kind: 'ref' }
    ]
    expect(hasBugPin(pins)).toBe(false)
  })

  it('is true when one pin is a bug', () => {
    const pins: PinItem[] = [
      { id: 1, x: 0, y: 0, memo: '', kind: 'ref' },
      { id: 2, x: 1, y: 1, memo: '', kind: 'bug' }
    ]
    expect(hasBugPin(pins)).toBe(true)
  })
})

describe('toggleKind', () => {
  it('flips ref to bug and bug to ref', () => {
    expect(toggleKind('ref')).toBe('bug')
    expect(toggleKind('bug')).toBe('ref')
  })
})

describe('generateContextPack pin kind', () => {
  it('fills annotations[].kind as ref when the pin has no kind', () => {
    const pack = generateContextPack({
      ...baseInput(),
      pins: [{ id: 1, x: 0, y: 0, memo: '' }]
    })
    expect(pack.annotations[0].kind).toBe('ref')
  })

  it('fills annotations[].kind as bug when the pin is a bug', () => {
    const pack = generateContextPack({
      ...baseInput(),
      pins: [{ id: 1, x: 10, y: 20, memo: 'broken', kind: 'bug' }]
    })
    expect(pack.annotations[0].kind).toBe('bug')
  })
})

describe('old context pack without annotation kind', () => {
  it('accepts a legacy pack as ContextPack and treats missing kind as ref', () => {
    const oldPack: ContextPack = {
      version: '0.2',
      id: 'snap_legacy',
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
      annotations: [{ id: 1, position: { x: 0, y: 0 }, memo: 'old memo' }],
      debugLogs: [],
      mode: 'context'
    }

    expect(oldPack.annotations[0].kind).toBeUndefined()

    const restored: PinItem[] = oldPack.annotations.map((a) => ({
      id: a.id,
      x: a.position.x,
      y: a.position.y,
      memo: a.memo ?? '',
      kind: a.kind
    }))
    expect(pinKind(restored[0])).toBe('ref')
    expect(hasBugPin(restored)).toBe(false)
  })
})
