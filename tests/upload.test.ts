import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SharedContextV2 } from '../src/types'
import {
  CaptureUploadError,
  EXPIRY_DAYS_ALLOWLIST,
  isExpiryDays,
  isUnauthorizedCaptureUploadError,
  sanitizeSourceUrlForUpload,
  uploadPrivateCapture,
  type ExpiryDays
} from '../src/utils/upload'

const TOKEN = 'sc_AAAAAAAAAAAAAAAAAAAAAA.BBBBBBBBBBBBBBBBBBBBBB'
const context: SharedContextV2 = {
  v: 2,
  sourceUrl: 'https://example.com',
  sourceTitle: '예시',
  captureType: 'visible',
  capturedAt: '2026-08-05T00:00:00.000Z',
  viewport: { width: 1, height: 2 },
  pins: [],
  intent: '',
  mode: 'context'
}
const image = () => new Blob([new Uint8Array([1])], { type: 'image/png' })
const success = () =>
  new Response(JSON.stringify({ id: 'id', expiresAt: '2026-08-12T00:00:00.000Z' }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' }
  })

describe('uploadPrivateCapture', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_UPLOAD_ENDPOINT', 'https://worker.example/')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('끝 슬래시를 정리하고 공개 /upload가 아닌 /captures를 호출한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(success())
    vi.stubGlobal('fetch', fetchMock)
    await uploadPrivateCapture(image(), context, { token: TOKEN, expiresInDays: 7 })
    expect(fetchMock.mock.calls[0][0]).toBe('https://worker.example/captures')
  })

  it('페이지 주소의 계정정보·query·fragment를 전송 전에 제거한다', () => {
    expect(
      sanitizeSourceUrlForUpload(
        'https://user:pass@example.com/path?token=secret#account'
      )
    ).toBe('https://example.com/path')
    expect(() => sanitizeSourceUrlForUpload('javascript:alert(1)')).toThrow(
      'http 또는 https'
    )
  })

  it('서버 설정·토큰·보관 기간을 요청 전에 검증한다', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('VITE_UPLOAD_ENDPOINT', '')
    await expect(
      uploadPrivateCapture(image(), context, { token: TOKEN, expiresInDays: 7 })
    ).rejects.toThrow('서버가 설정되지')

    vi.stubEnv('VITE_UPLOAD_ENDPOINT', 'https://worker.example')
    await expect(
      uploadPrivateCapture(image(), context, { token: '', expiresInDays: 7 })
    ).rejects.toThrow('AI 연결 토큰')
    await expect(
      uploadPrivateCapture(image(), context, {
        token: TOKEN,
        expiresInDays: 3 as ExpiryDays
      })
    ).rejects.toThrow('1, 7, 30')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('HTTP 오류 상태와 401 분류를 보존한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('x', { status: 413 })))
    const error = await uploadPrivateCapture(image(), context, {
      token: TOKEN,
      expiresInDays: 7
    }).catch((value: unknown) => value)
    expect(error).toBeInstanceOf(CaptureUploadError)
    expect((error as CaptureUploadError).status).toBe(413)
    expect(isUnauthorizedCaptureUploadError(new CaptureUploadError(401))).toBe(true)
    expect(isUnauthorizedCaptureUploadError(error)).toBe(false)
  })

  it('깨진 JSON이나 필수 필드가 없는 성공 응답을 거부한다', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('<html>', { status: 201 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'id' }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' }
        })
      )
    vi.stubGlobal('fetch', fetchMock)
    const options = { token: TOKEN, expiresInDays: 7 as const }
    await expect(uploadPrivateCapture(image(), context, options)).rejects.toThrow(
      '해석할 수 없습니다'
    )
    await expect(uploadPrivateCapture(image(), context, options)).rejects.toThrow(
      '삭제 예정 시각'
    )
  })
})

describe('isExpiryDays', () => {
  it('Worker와 같은 1·7·30일만 허용한다', () => {
    expect(EXPIRY_DAYS_ALLOWLIST).toEqual([1, 7, 30])
    expect([1, 7, 30].every(isExpiryDays)).toBe(true)
    expect([0, 3, 31, '7', null].some(isExpiryDays)).toBe(false)
  })
})
