import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SharedContextV2 } from '../src/types'
import { saveCaptureWithToken } from '../src/utils/share-upload'
import { TOKEN_STORAGE_KEY } from '../src/utils/token'
import { stubChromeStorage } from './helpers/chrome-storage'

const TOKEN = 'sc_AAAAAAAAAAAAAAAAAAAAAA.BBBBBBBBBBBBBBBBBBBBBB'
const context: SharedContextV2 = {
  v: 2,
  sourceUrl: 'https://example.com',
  sourceTitle: '예시',
  captureType: 'visible',
  capturedAt: '2026-08-05T00:00:00.000Z',
  viewport: { width: 1, height: 2 },
  pins: [],
  intent: '설명해 줘',
  mode: 'context'
}
const image = () => new Blob([new Uint8Array([1])], { type: 'image/png' })
const ok = () =>
  new Response(JSON.stringify({ id: 'id', expiresAt: '2026-08-12T00:00:00.000Z' }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' }
  })

describe('saveCaptureWithToken', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_UPLOAD_ENDPOINT', 'https://worker.example')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('저장된 토큰으로 한 번만 저장한다', async () => {
    stubChromeStorage({ [TOKEN_STORAGE_KEY]: TOKEN })
    const fetchMock = vi.fn().mockResolvedValue(ok())
    vi.stubGlobal('fetch', fetchMock)
    await expect(saveCaptureWithToken(image(), context, 7)).resolves.toMatchObject({
      id: 'id'
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('401 이외 오류는 재시도하지 않고 토큰을 유지한다', async () => {
    const storage = stubChromeStorage({ [TOKEN_STORAGE_KEY]: TOKEN })
    const fetchMock = vi.fn().mockResolvedValue(new Response('too big', { status: 413 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(saveCaptureWithToken(image(), context, 7)).rejects.toThrow(
      '캡처 저장 실패 (413)'
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(storage.store.get(TOKEN_STORAGE_KEY)).toBe(TOKEN)
  })

  it('토큰 발급 실패를 익명 저장으로 바꾸지 않는다', async () => {
    stubChromeStorage()
    let captureRequests = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('/token')) return new Response('Unavailable', { status: 500 })
        captureRequests += 1
        return ok()
      })
    )
    await expect(saveCaptureWithToken(image(), context, 7)).rejects.toThrow(
      '새 토큰을 발급하지 못했습니다'
    )
    expect(captureRequests).toBe(0)
  })
})
