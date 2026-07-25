import { describe, it, expect, beforeEach } from 'vitest'
import worker from '../src/index'
import {
  allowUploadRequest,
  resetUploadRateLimitForTests
} from '../src/upload-rate-limit'
import { resetTokenRateLimitForTests } from '../src/token-rate-limit'
import type { Env } from '../src/env'

const ctx = {} as ExecutionContext
const SECRET = 'upload-rate-limit-signing-secret'

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    BUCKET: {
      async get() {
        return null
      },
      async head() {
        return null
      },
      async put() {}
    } as unknown as R2Bucket,
    DB: {
      prepare() {
        return {
          bind() {
            return {
              async all() {
                return { results: [] }
              },
              async run() {
                return { success: true }
              }
            }
          }
        }
      }
    } as unknown as D1Database,
    TOKEN_SIGNING_SECRET: SECRET,
    ...overrides
  }
}

/** 최소 유효 업로드: PNG 매직 8바이트 + 더미. context 없음 → D1 미접촉, 200 반환 */
function postUpload(env: Env, ip?: string): Promise<Response> {
  const PNG = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4
  ])
  const form = new FormData()
  form.set('image', new Blob([PNG], { type: 'image/png' }), 'shot.png')
  const headers: Record<string, string> = {}
  if (ip !== undefined) headers['CF-Connecting-IP'] = ip
  return worker.fetch(
    new Request('https://w.test/upload', { method: 'POST', headers, body: form }),
    env,
    ctx
  )
}

describe('POST /upload rate-limit', () => {
  beforeEach(() => {
    resetUploadRateLimitForTests()
    resetTokenRateLimitForTests()
  })

  it('동일 IP 분당 20회 초과 시 429', async () => {
    const env = makeEnv()
    const ip = '198.51.100.7'
    for (let i = 0; i < 20; i++) {
      const res = await postUpload(env, ip)
      expect(res.status).toBe(200)
    }
    const denied = await postUpload(env, ip)
    expect(denied.status).toBe(429)
  })

  it('다른 IP 는 독립 카운터 (한 IP 소진이 남을 막지 않음)', async () => {
    const env = makeEnv()
    for (let i = 0; i < 20; i++) await postUpload(env, '198.51.100.7')
    const other = await postUpload(env, '198.51.100.8')
    expect(other.status).toBe(200)
  })

  it('/upload 한도가 /token 카운터를 잠식하지 않음 (별 Map)', async () => {
    const env = makeEnv()
    const ip = '203.0.113.50'
    for (let i = 0; i < 20; i++) await postUpload(env, ip)
    expect((await postUpload(env, ip)).status).toBe(429)
    // 같은 IP 로 /token 은 여전히 발급 — 카운터가 분리돼 있음을 증명
    const tok = await worker.fetch(
      new Request('https://w.test/token', {
        method: 'POST',
        headers: {
          Origin: 'chrome-extension://abcdefghijklmnop',
          'CF-Connecting-IP': ip
        }
      }),
      env,
      ctx
    )
    expect(tok.status).toBe(200)
  })
})

describe('allowUploadRequest (순수함수 fixed-window 경계)', () => {
  it('nowMs 고정 시 정확히 20회 허용, 21회째 거부 (off-by-one)', () => {
    const ip = '192.0.2.1'
    const t = 1_000_000
    for (let i = 0; i < 20; i++) expect(allowUploadRequest(ip, t)).toBe(true)
    expect(allowUploadRequest(ip, t)).toBe(false)
  })

  it('윈도 경계: 59999ms 는 같은 창(거부 유지), 60000ms 는 새 창(재허용)', () => {
    const ip = '192.0.2.2'
    const t0 = 5_000_000
    for (let i = 0; i < 20; i++) allowUploadRequest(ip, t0)
    expect(allowUploadRequest(ip, t0 + 59_999)).toBe(false)
    expect(allowUploadRequest(ip, t0 + 60_000)).toBe(true)
  })
})
