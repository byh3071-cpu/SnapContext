import { describe, it, expect } from 'vitest'
import worker from '../src/index'
import { generateUserToken } from '../src/token'
import { createSignedImageUrl } from '../src/image-url'
import type { Env } from '../src/env'

/**
 * 0.4.4(ADR-015 2차): 레거시 POST /upload·GET /s·GET /i 는 사라졌다(index.test.ts·
 * upload-bearer.test.ts 삭제, T2/T4). 이 파일에 남기는 건 "SharedContext 화이트리스트
 * 밖 필드가 새 나가지 않는다"는 누출 회귀 2건뿐 — 검증 경로만 현재 라우트
 * (POST /captures·GET /pi/{id})로 옮겼다. 나머지(D1 INSERT 매핑·expiresInDays
 * allowlist·snap_history 연동)는 private-capture-routes.test.ts·lib.test.ts 에
 * 이미 있다.
 */

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])
const SIGNING_SECRET = 'upload-ingest-leak-secret'

interface StoredObj {
  bytes: Uint8Array
  uploaded: Date
  customMetadata?: Record<string, string>
  contentType?: string
}

function makeEnv(): { env: Env; objects: Map<string, StoredObj> } {
  const objects = new Map<string, StoredObj>()
  const env: Env = {
    TOKEN_SIGNING_SECRET: SIGNING_SECRET,
    BUCKET: {
      async get(key: string) {
        const o = objects.get(key)
        if (!o) return null
        return {
          body: o.bytes,
          uploaded: o.uploaded,
          httpMetadata: { contentType: o.contentType },
          customMetadata: o.customMetadata,
          text: async () => new TextDecoder().decode(o.bytes),
          arrayBuffer: async () => o.bytes.buffer
        }
      },
      async put(
        key: string,
        value: ArrayBuffer | string,
        putOpts?: {
          httpMetadata?: { contentType?: string }
          customMetadata?: Record<string, string>
        }
      ) {
        const bytes =
          typeof value === 'string'
            ? new TextEncoder().encode(value)
            : new Uint8Array(value)
        objects.set(key, {
          bytes,
          uploaded: new Date(),
          contentType: putOpts?.httpMetadata?.contentType,
          customMetadata: putOpts?.customMetadata
        })
      }
    } as unknown as R2Bucket,
    DB: {
      prepare() {
        return {
          bind() {
            return { async run() { return { success: true } } }
          }
        }
      }
    } as unknown as D1Database
  }
  return { env, objects }
}

function leakyContextJson(): string {
  return JSON.stringify({
    v: 2,
    sourceUrl: 'https://example.com/page',
    sourceTitle: 'Example',
    captureType: 'visible',
    capturedAt: '2026-07-10T00:00:00.000Z',
    viewport: { width: 1280, height: 720 },
    pins: [{ id: 1, memo: 'ok', x: 99, y: 88 }],
    intent: '설명',
    mode: 'context',
    // 화이트리스트 밖 필드 — parseSharedContextV2 가 재구성 시 걸러내야 한다
    userNote: 'SECRET_NOTE',
    tags: ['SECRET_TAG'],
    userAgent: 'SECRET_UA'
  })
}

async function uploadCapture(env: Env, token: string): Promise<{ id: string }> {
  const form = new FormData()
  form.append('image', new Blob([PNG], { type: 'image/png' }), 'capture.png')
  form.append('context', leakyContextJson())
  form.append('expiresInDays', '7')
  const res = await worker.fetch(
    new Request('https://w.test/captures', {
      method: 'POST',
      body: form,
      headers: { Authorization: `Bearer ${token}` }
    }),
    env,
    {} as ExecutionContext
  )
  expect(res.status).toBe(201)
  return (await res.json()) as { id: string }
}

describe('누출 회귀 — SharedContext 화이트리스트 미확장 (POST /captures·GET /pi)', () => {
  it('R2 에 저장되는 {id}.json 은 화이트리스트 밖 필드(userNote·tags·pin x/y·userAgent)를 담지 않는다', async () => {
    const { env, objects } = makeEnv()
    const token = await generateUserToken(SIGNING_SECRET)
    const { id } = await uploadCapture(env, token)

    const jsonEntry = [...objects.entries()].find(([key]) => key.endsWith('.json'))
    expect(jsonEntry).toBeDefined()
    const stored = JSON.parse(
      new TextDecoder().decode(jsonEntry![1].bytes)
    ) as Record<string, unknown>

    expect(stored.pins).toEqual([{ id: 1, memo: 'ok' }])
    expect(stored).not.toHaveProperty('userNote')
    expect(stored).not.toHaveProperty('tags')
    expect(stored).not.toHaveProperty('userAgent')
    expect(JSON.stringify(stored)).not.toContain('SECRET_NOTE')
    expect(JSON.stringify(stored)).not.toContain('SECRET_TAG')
    expect(JSON.stringify(stored)).not.toContain('SECRET_UA')
    expect(id).toBeTruthy()
  })

  it('GET /pi/{id} 는 이미지 바이트만 반환한다 — JSON·메타 필드 미포함', async () => {
    const { env } = makeEnv()
    const token = await generateUserToken(SIGNING_SECRET)
    const { id } = await uploadCapture(env, token)

    const signedUrl = await createSignedImageUrl({
      origin: 'https://w.test',
      id,
      secret: SIGNING_SECRET,
      nowMs: Date.now()
    })
    const res = await worker.fetch(
      new Request(signedUrl),
      env,
      {} as ExecutionContext
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    const buf = new Uint8Array(await res.arrayBuffer())
    expect(Array.from(buf)).toEqual(Array.from(PNG))
    const asText = new TextDecoder().decode(buf)
    expect(asText).not.toContain('SECRET_NOTE')
    expect(asText).not.toContain('sourceUrl')
  })
})
