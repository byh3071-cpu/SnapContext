import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_SHARE_EXPIRY_DAYS,
  SHARE_EXPIRY_CHANGED_EVENT,
  SHARE_EXPIRY_STORAGE_KEY,
  buildPrivateSaveConsentMessage,
  buildPrivateSaveSuccessMessage,
  formatExpiryDays,
  loadShareExpiryDays,
  needsShareConsent,
  readConsentedDays,
  saveShareExpiryDays
} from '../src/utils/share-expiry'
import type { ExpiryDays } from '../src/utils/upload'
import { stubChromeStorage } from './helpers/chrome-storage'

describe('비공개 저장 문구와 동의', () => {
  it('보관 기간을 쉬운 한국어로 표시한다', () => {
    expect(formatExpiryDays(1)).toBe('1일')
    expect(formatExpiryDays(7)).toBe('7일')
    expect(formatExpiryDays(30)).toBe('30일')
  })

  it('공개 링크가 없고 실제 접근 주체를 숨기지 않는다', () => {
    const message = buildPrivateSaveConsentMessage(7)
    expect(message).toContain('공개 링크는 만들지 않습니다')
    expect(message).toContain('AI 제공자')
    expect(message).toContain('Cloudflare')
    expect(message).toContain('7일 후 삭제')
  })

  it('성공 문구는 저장 후 다음 행동만 말한다', () => {
    const message = buildPrivateSaveSuccessMessage(30)
    expect(message).toBe(
      "내 AI에 저장됨(30일 후 삭제) — Claude Code·Cursor에서 '방금 캡처 분석해줘'라고 하면 읽습니다."
    )
    expect(message).toContain('30일 후 삭제')
    expect(message.includes('\n')).toBe(false)
  })

  it('동의한 기간보다 길어질 때만 다시 동의를 받는다', () => {
    expect(readConsentedDays(true)).toBeNull()
    expect(readConsentedDays(7)).toBe(7)
    expect(needsShareConsent(null, 1)).toBe(true)
    expect(needsShareConsent(7, 30)).toBe(true)
    expect(needsShareConsent(30, 7)).toBe(false)
  })
})

describe('보관 기간 저장', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('없거나 깨진 값은 7일, 유효한 값은 그대로 읽는다', async () => {
    stubChromeStorage()
    expect(DEFAULT_SHARE_EXPIRY_DAYS).toBe(7)
    await expect(loadShareExpiryDays()).resolves.toBe(7)

    const valid = stubChromeStorage({ [SHARE_EXPIRY_STORAGE_KEY]: 30 })
    await expect(loadShareExpiryDays()).resolves.toBe(30)
    valid.store.set(SHARE_EXPIRY_STORAGE_KEY, '30')
    await expect(loadShareExpiryDays()).resolves.toBe(7)
  })

  it('허용값을 저장하고 변경 이벤트를 보낸다', async () => {
    const storage = stubChromeStorage()
    const dispatchEvent = vi.fn()
    vi.stubGlobal('window', { dispatchEvent })
    await saveShareExpiryDays(1)
    expect(storage.store.get(SHARE_EXPIRY_STORAGE_KEY)).toBe(1)
    expect(dispatchEvent.mock.calls[0][0].type).toBe(SHARE_EXPIRY_CHANGED_EVENT)
  })

  it('허용되지 않은 값은 저장하지 않는다', async () => {
    const storage = stubChromeStorage()
    await expect(saveShareExpiryDays(3 as ExpiryDays)).rejects.toThrow('1, 7, 30')
    expect(storage.store.has(SHARE_EXPIRY_STORAGE_KEY)).toBe(false)
  })
})
