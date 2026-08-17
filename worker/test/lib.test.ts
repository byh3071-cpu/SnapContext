import { describe, it, expect, vi } from 'vitest'
import {
  isPngMagic,
  readExpiry,
  isExpiredAt,
  parseSharedContext,
  parseExpiresInDays,
  safeDecodeId,
  DAY_MS,
  DEFAULT_EXPIRY_DAYS,
  EXPIRY_DAYS_ALLOWLIST,
  MAX_AGE_MS,
  PNG_MAGIC
} from '../src/lib'

const T = Date.parse('2026-07-18T00:00:00.000Z')

describe('isPngMagic', () => {
  it('true for PNG signature', () => {
    expect(isPngMagic(new Uint8Array([...PNG_MAGIC, 0x00]))).toBe(true)
  })
  it('false for non-PNG', () => {
    expect(isPngMagic(new Uint8Array([0xff, 0xd8, 0xff]))).toBe(false)
  })
})

describe('readExpiry', () => {
  it('메타 없음(레거시): uploaded + 7일 · source=legacy', () => {
    const info = readExpiry({ uploaded: new Date(T) })
    expect(info.expiresAtMs).toBe(T + MAX_AGE_MS)
    expect(info.retentionDays).toBe(DEFAULT_EXPIRY_DAYS)
    expect(info.source).toBe('legacy')
  })

  it('메타 1일: 짧은 쪽이 이긴다 — T+2d 에 만료(레거시였다면 미만료)', () => {
    const info = readExpiry({
      uploaded: new Date(T),
      customMetadata: { expiresAt: new Date(T + DAY_MS).toISOString() }
    })
    expect(info.source).toBe('metadata')
    expect(info.retentionDays).toBe(1)
    expect(isExpiredAt(info.expiresAtMs, T + 2 * DAY_MS)).toBe(true)
    // 대조군: 같은 uploaded 라도 메타가 없으면 아직 살아 있다 → 메타를 실제로 읽었다는 증거
    const legacy = readExpiry({ uploaded: new Date(T) })
    expect(isExpiredAt(legacy.expiresAtMs, T + 2 * DAY_MS)).toBe(false)
  })

  it('메타 30일: 긴 쪽이 이긴다 — T+8d 에 미만료(레거시였다면 만료)', () => {
    const info = readExpiry({
      uploaded: new Date(T),
      customMetadata: { expiresAt: new Date(T + 30 * DAY_MS).toISOString() }
    })
    expect(info.source).toBe('metadata')
    expect(info.retentionDays).toBe(30)
    expect(isExpiredAt(info.expiresAtMs, T + 8 * DAY_MS)).toBe(false)
    const legacy = readExpiry({ uploaded: new Date(T) })
    expect(isExpiredAt(legacy.expiresAtMs, T + 8 * DAY_MS)).toBe(true)
  })

  it('파싱 실패: source=invalid + 즉시 만료 (조용히 7일로 되돌리지 않는다)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const info = readExpiry({
      uploaded: new Date(T),
      customMetadata: { expiresAt: 'not-a-date' }
    })
    expect(info.source).toBe('invalid')
    expect(info.retentionDays).toBe(0)
    expect(info.expiresAtMs).toBe(T)
    expect(isExpiredAt(info.expiresAtMs, T + 1000)).toBe(true)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('parseExpiresInDays', () => {
  it('필드 부재(null·undefined) → 기본 7일', () => {
    expect(parseExpiresInDays(null)).toBe(DEFAULT_EXPIRY_DAYS)
    expect(parseExpiresInDays(undefined)).toBe(DEFAULT_EXPIRY_DAYS)
  })

  it.each([
    ['1', 1],
    ['7', 7],
    ['30', 30],
    ['07', 7]
  ])('allowlist 통과: %s → %i', (raw, expected) => {
    expect(parseExpiresInDays(raw)).toBe(expected)
  })

  it('allowlist 는 1·7·30 뿐', () => {
    expect([...EXPIRY_DAYS_ALLOWLIST]).toEqual([1, 7, 30])
  })

  it.each([
    '3',
    '0',
    '365',
    '-1',
    'abc',
    '7.0',
    ' 7 ',
    '0x7',
    '7e0',
    '+7',
    '\n7'
  ])('형식·allowlist 위반 → null: %j', (raw) => {
    expect(parseExpiresInDays(raw)).toBeNull()
  })

  it("빈 문자열은 400 이다 — 부재(=7)로 흡수하지 않는다", () => {
    expect(parseExpiresInDays('')).toBeNull()
  })

  it('문자열이 아닌 값(숫자·Blob·객체) → null (부재와 구별)', () => {
    expect(parseExpiresInDays(7)).toBeNull()
    expect(parseExpiresInDays(new Blob(['7']))).toBeNull()
    expect(parseExpiresInDays({ toString: () => '7' })).toBeNull()
  })

  it("Number() 만으로는 통과하는 값들을 정규식이 막는다 (회귀 앵커)", () => {
    for (const raw of ['0x7', '7e0', ' 7 ', '7.0', '+7']) {
      expect(Number(raw)).toBe(7) // Number() 단독이면 전부 7 로 통과한다
      expect(parseExpiresInDays(raw)).toBeNull()
    }
  })
})

describe('isExpiredAt (경계)', () => {
  it('(T, T) = false — 만료시각 정각은 아직 유효', () => {
    expect(isExpiredAt(T, T)).toBe(false)
  })
  it('(T, T+1) = true', () => {
    expect(isExpiredAt(T, T + 1)).toBe(true)
  })
})

describe('parseSharedContext', () => {
  it('parses valid json', () => {
    const ctx = parseSharedContext('{"v":1,"sourceUrl":"http://a"}')
    expect(ctx?.sourceUrl).toBe('http://a')
  })
  it('returns null on invalid json', () => {
    expect(parseSharedContext('{bad')).toBeNull()
  })
})

describe('hardening (regression)', () => {
  it('parseSharedContext rejects JSON arrays', () => {
    expect(parseSharedContext('[1,2,3]')).toBeNull()
  })
  it('safeDecodeId decodes valid and returns raw on malformed', () => {
    expect(safeDecodeId('%41bc')).toBe('Abc')
    expect(safeDecodeId('%')).toBe('%')
    expect(safeDecodeId('abc-123')).toBe('abc-123')
  })
})
