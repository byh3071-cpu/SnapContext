import { describe, expect, it } from 'vitest'

import type { CaptureHistoryItem } from '../src/storage/history'
import {
  applySaveResult,
  saveBadgeLabel
} from '../src/storage/save-status'
import {
  assertOneLine,
  buildPrivateSaveSuccessMessage
} from '../src/utils/share-expiry'

const baseItem = (): CaptureHistoryItem => ({
  id: 'hist_1',
  timestamp: '2026-08-30T00:00:00.000Z',
  url: 'https://example.com/page',
  title: 'Example',
  captureType: 'visible',
  thumbnail: '',
  pinsCount: 0,
  hasAnnotations: false
})

describe('applySaveResult', () => {
  it('marks the item saved and drops saveError', () => {
    const item: CaptureHistoryItem = {
      ...baseItem(),
      saveStatus: 'failed',
      saveError: '네트워크 오류'
    }
    const next = applySaveResult(item, {
      status: 'saved',
      id: 'cap_abc',
      expiresAt: '2026-09-06T00:00:00.000Z'
    })
    expect(next.saveStatus).toBe('saved')
    expect(next.savedCaptureId).toBe('cap_abc')
    expect(next.saveError).toBeUndefined()
  })

  it('marks the item failed and stores the message', () => {
    const next = applySaveResult(baseItem(), {
      status: 'failed',
      message: '토큰이 거부되었습니다.'
    })
    expect(next.saveStatus).toBe('failed')
    expect(next.saveError).toBe('토큰이 거부되었습니다.')
  })

  it('clears saveError when a failed item is saved on retry', () => {
    const failed = applySaveResult(baseItem(), {
      status: 'failed',
      message: '일시적 오류'
    })
    const saved = applySaveResult(failed, {
      status: 'saved',
      id: 'cap_retry',
      expiresAt: '2026-09-06T00:00:00.000Z'
    })
    expect(saved.saveStatus).toBe('saved')
    expect(saved.savedCaptureId).toBe('cap_retry')
    expect(saved.saveError).toBeUndefined()
  })
})

describe('saveBadgeLabel', () => {
  it('returns null when saveStatus is undefined', () => {
    expect(saveBadgeLabel(baseItem())).toBeNull()
  })

  it("returns '저장됨' when saved", () => {
    expect(saveBadgeLabel({ ...baseItem(), saveStatus: 'saved' })).toBe('저장됨')
  })

  it("returns '실패' when failed", () => {
    expect(saveBadgeLabel({ ...baseItem(), saveStatus: 'failed' })).toBe('실패')
  })
})

describe('buildPrivateSaveSuccessMessage', () => {
  it('is one line, mentions the analysis phrase, and omits 업로드', () => {
    const message = buildPrivateSaveSuccessMessage(7)
    expect(() => assertOneLine(message)).not.toThrow()
    expect(message).toContain('캡처 분석해줘')
    expect(message).not.toContain('업로드')
  })
})
