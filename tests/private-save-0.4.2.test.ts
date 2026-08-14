import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SharedContextV2 } from '../src/types'
import {
  CaptureUploadError,
  deletePrivateCapture,
  listPrivateCaptures,
  uploadPrivateCapture
} from '../src/utils/upload'
import { saveCaptureWithToken } from '../src/utils/share-upload'
import { TOKEN_STORAGE_KEY } from '../src/utils/token'
import { stubChromeStorage } from './helpers/chrome-storage'

const OLD_TOKEN = 'sc_AAAAAAAAAAAAAAAAAAAAAA.BBBBBBBBBBBBBBBBBBBBBB'
const NEW_TOKEN = 'sc_CCCCCCCCCCCCCCCCCCCCCC.DDDDDDDDDDDDDDDDDDDDDD'

const context: SharedContextV2 = {
  v: 2,
  sourceUrl: 'https://example.com/page',
  sourceTitle: '예시',
  captureType: 'visible',
  capturedAt: '2026-08-05T00:00:00.000Z',
  viewport: { width: 1200, height: 800 },
  pins: [{ id: 1, memo: '이 부분 확인' }],
  intent: '이 화면을 이해해 주세요.',
  mode: 'context'
}

const png = () => new Blob([new Uint8Array([1])], { type: 'image/png' })
const ok = () =>
  new Response(
    JSON.stringify({ id: '11111111-1111-4111-8111-111111111111', expiresAt: '2026-08-12T00:00:00.000Z' }),
    { status: 201, headers: { 'Content-Type': 'application/json' } }
  )

describe('0.4.2 비공개 캡처 저장', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_UPLOAD_ENDPOINT', 'https://worker.example')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('/captures에 토큰·v2 컨텍스트를 보내고 공개 URL 없는 결과를 반환한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok())
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      uploadPrivateCapture(png(), context, { token: OLD_TOKEN, expiresInDays: 7 })
    ).resolves.toEqual({
      id: '11111111-1111-4111-8111-111111111111',
      expiresAt: '2026-08-12T00:00:00.000Z'
    })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://worker.example/captures')
    expect(init.headers).toEqual({ Authorization: `Bearer ${OLD_TOKEN}` })
    const body = init.body as FormData
    expect(JSON.parse(body.get('context') as string)).toEqual(context)
    expect(body.get('expiresInDays')).toBe('7')
  })

  it('토큰이 없으면 네트워크 요청 전에 중단한다', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      uploadPrivateCapture(png(), context, { token: null, expiresInDays: 7 })
    ).rejects.toThrow('AI 연결 토큰')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('401이면 기존 토큰을 지우고 새 토큰으로 한 번만 재시도한다', async () => {
    stubChromeStorage({ [TOKEN_STORAGE_KEY]: OLD_TOKEN })
    const uploadHeaders: unknown[] = []
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/token')) {
        return new Response(JSON.stringify({ token: NEW_TOKEN }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }
      uploadHeaders.push(init.headers)
      return uploadHeaders.length === 1
        ? new Response('Unauthorized', { status: 401 })
        : ok()
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(saveCaptureWithToken(png(), context, 7)).resolves.toMatchObject({
      id: '11111111-1111-4111-8111-111111111111'
    })
    expect(uploadHeaders).toEqual([
      { Authorization: `Bearer ${OLD_TOKEN}` },
      { Authorization: `Bearer ${NEW_TOKEN}` }
    ])
  })

  it('재발급 실패 시 익명 업로드 없이 중단한다', async () => {
    stubChromeStorage({ [TOKEN_STORAGE_KEY]: OLD_TOKEN })
    let uploads = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('/token')) return new Response('Unavailable', { status: 500 })
        uploads += 1
        return new Response('Unauthorized', { status: 401 })
      })
    )

    await expect(saveCaptureWithToken(png(), context, 7)).rejects.toThrow(
      '새 토큰을 발급하지 못했습니다'
    )
    expect(uploads).toBe(1)
  })

  it('거부된 토큰을 storage에서 지우지 못하면 같은 토큰으로 재시도하지 않는다', async () => {
    const storage = stubChromeStorage({ [TOKEN_STORAGE_KEY]: OLD_TOKEN })
    storage.remove.mockRejectedValueOnce(new Error('storage unavailable'))
    let uploads = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        uploads += 1
        return new Response('Unauthorized', { status: 401 })
      })
    )

    await expect(saveCaptureWithToken(png(), context, 7)).rejects.toThrow(
      'storage unavailable'
    )
    expect(uploads).toBe(1)
  })

  it('HTTP 상태를 보존해 401만 복구 대상으로 구분한다', () => {
    expect(new CaptureUploadError(401).status).toBe(401)
    expect(new CaptureUploadError(413).status).toBe(413)
  })

  it('내 저장 목록 조회와 즉시 삭제에도 같은 bearer를 사용한다', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: 'cap-1',
              createdAt: '2026-08-05T00:00:00.000Z',
              url: 'https://example.com',
              title: '예시',
              captureType: 'visible',
              pinCount: 1
            }
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(listPrivateCaptures(OLD_TOKEN, 20)).resolves.toHaveLength(1)
    await expect(deletePrivateCapture(OLD_TOKEN, 'cap-1')).resolves.toBeUndefined()
    expect(fetchMock.mock.calls[0][0]).toBe('https://worker.example/captures?limit=20')
    expect(fetchMock.mock.calls[1][0]).toBe('https://worker.example/captures/cap-1')
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: 'DELETE',
      headers: { Authorization: `Bearer ${OLD_TOKEN}` }
    })
  })
})
