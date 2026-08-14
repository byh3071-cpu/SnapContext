import { afterEach, describe, expect, it, vi } from 'vitest'
import worker from '../src/index'
import { createSignedImageUrl } from '../src/image-url'
import { generateUserToken, ownerFromToken } from '../src/token'
import type { Env } from '../src/env'

const SIGNING_SECRET = 'test-signing-secret'
const NOW_MS = 1_800_000_000_000
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

interface StoredObject {
  bytes: Uint8Array
  uploaded: Date
  customMetadata?: Record<string, string>
  contentType?: string
}

interface CaptureRow {
  id: string
  created_at: string
  url: string
  title: string
  capture_type: string
  pin_count: number
  expires_at: string
  owner: string | null
}

interface TestState {
  objects: Map<string, StoredObject>
  rows: Map<string, CaptureRow>
  r2Reads: string[]
  r2Writes: string[]
  r2Deletes: string[]
  events: string[]
  failR2Delete: boolean
  failD1Delete: boolean
}

function bytesFrom(value: ArrayBuffer | ArrayBufferView | string | Blob): Promise<Uint8Array> {
  if (typeof value === 'string') {
    return Promise.resolve(new TextEncoder().encode(value))
  }
  if (value instanceof Blob) {
    return value.arrayBuffer().then((buffer) => new Uint8Array(buffer))
  }
  if (ArrayBuffer.isView(value)) {
    return Promise.resolve(
      new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength))
    )
  }
  return Promise.resolve(new Uint8Array(value))
}

function makeEnv(overrides: Partial<Pick<Env, 'TOKEN_SIGNING_SECRET'>> = {}): {
  env: Env
  state: TestState
} {
  const state: TestState = {
    objects: new Map(),
    rows: new Map(),
    r2Reads: [],
    r2Writes: [],
    r2Deletes: [],
    events: [],
    failR2Delete: false,
    failD1Delete: false
  }

  const bucket = {
    async put(
      key: string,
      value: ArrayBuffer | ArrayBufferView | string | Blob,
      options?: {
        customMetadata?: Record<string, string>
        httpMetadata?: { contentType?: string }
      }
    ): Promise<void> {
      state.r2Writes.push(key)
      state.events.push(`r2:put:${key.endsWith('.json') ? 'json' : 'image'}`)
      state.objects.set(key, {
        bytes: await bytesFrom(value),
        uploaded: new Date(Date.now()),
        customMetadata: options?.customMetadata,
        contentType: options?.httpMetadata?.contentType
      })
    },
    async get(key: string): Promise<R2ObjectBody | null> {
      state.r2Reads.push(key)
      const stored = state.objects.get(key)
      if (!stored) return null
      const bytes = stored.bytes.slice()
      return {
        key,
        version: 'test',
        size: bytes.byteLength,
        etag: 'etag',
        httpEtag: '"etag"',
        checksums: {},
        uploaded: stored.uploaded,
        httpMetadata: { contentType: stored.contentType },
        customMetadata: stored.customMetadata,
        range: undefined,
        storageClass: 'Standard',
        ssecKeyMd5: undefined,
        body: new Blob([bytes]).stream(),
        bodyUsed: false,
        arrayBuffer: async () => bytes.buffer,
        text: async () => new TextDecoder().decode(bytes),
        json: async <T>() => JSON.parse(new TextDecoder().decode(bytes)) as T,
        blob: async () => new Blob([bytes])
      }
    },
    async head(key: string): Promise<R2Object | null> {
      const stored = state.objects.get(key)
      if (!stored) return null
      return {
        key,
        version: 'test',
        size: stored.bytes.byteLength,
        etag: 'etag',
        httpEtag: '"etag"',
        checksums: {},
        uploaded: stored.uploaded,
        httpMetadata: { contentType: stored.contentType },
        customMetadata: stored.customMetadata,
        range: undefined,
        storageClass: 'Standard',
        ssecKeyMd5: undefined
      }
    },
    async delete(keys: string | string[]): Promise<void> {
      if (state.failR2Delete) throw new Error('R2 delete failed')
      const values = Array.isArray(keys) ? keys : [keys]
      state.events.push('r2:delete')
      for (const key of values) {
        state.r2Deletes.push(key)
        state.objects.delete(key)
      }
    }
  } as unknown as R2Bucket

  const db = {
    prepare(sql: string) {
      let args: unknown[] = []
      const statement = {
        bind(...values: unknown[]) {
          args = values
          return statement
        },
        async run() {
          if (/INSERT\s+INTO\s+captures/i.test(sql)) {
            const [id, createdAt, url, title, captureType, pinCount, expiresAt, owner] = args
            if (
              typeof id !== 'string' ||
              typeof createdAt !== 'string' ||
              typeof url !== 'string' ||
              typeof title !== 'string' ||
              typeof captureType !== 'string' ||
              typeof pinCount !== 'number' ||
              typeof expiresAt !== 'string' ||
              (typeof owner !== 'string' && owner !== null)
            ) {
              throw new Error('invalid insert args')
            }
            state.events.push('d1:insert')
            state.rows.set(id, {
              id,
              created_at: createdAt,
              url,
              title,
              capture_type: captureType,
              pin_count: pinCount,
              expires_at: expiresAt,
              owner
            })
          } else if (/DELETE\s+FROM\s+captures/i.test(sql)) {
            state.events.push('d1:delete')
            if (state.failD1Delete) throw new Error('D1 delete failed')
            const [id, owner] = args
            if (typeof id === 'string' && state.rows.get(id)?.owner === owner) {
              state.rows.delete(id)
            }
          }
          return { success: true, results: [], meta: {} }
        },
        async first<T>(): Promise<T | null> {
          const id = args[0]
          const row = typeof id === 'string' ? state.rows.get(id) : undefined
          return (row ? { owner: row.owner } : null) as T | null
        },
        async all<T>() {
          const owner = args.find((value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value))
          const rows = [...state.rows.values()]
            .filter((row) => owner === undefined || row.owner === owner)
            .map((row) => ({
              id: row.id,
              created_at: row.created_at,
              url: row.url,
              title: row.title,
              capture_type: row.capture_type,
              pin_count: row.pin_count,
              expires_at: row.expires_at
            }))
          return { success: true, results: rows as T[], meta: {} }
        }
      }
      return statement
    }
  } as unknown as D1Database

  return {
    env: {
      BUCKET: bucket,
      DB: db,
      SNAPCONTEXT_BEARER_TOKEN: 'admin-secret',
      TOKEN_SIGNING_SECRET: SIGNING_SECRET,
      ...overrides
    },
    state
  }
}

function contextJson(): string {
  return JSON.stringify({
    v: 2,
    sourceUrl: 'https://example.com/page?private=yes#memo',
    sourceTitle: '페이지',
    captureType: 'visible',
    capturedAt: '2026-08-05T00:00:00.000Z',
    viewport: { width: 1200, height: 800 },
    pins: [{ id: 1, memo: '확인' }],
    intent: '이 화면을 구현해 주세요.',
    mode: 'context'
  })
}

function uploadRequest(token?: string, context = contextJson()): Request {
  const form = new FormData()
  form.append('image', new Blob([PNG], { type: 'image/png' }), 'capture.png')
  form.append('context', context)
  form.append('expiresInDays', '7')
  return new Request('https://worker.example/captures', {
    method: 'POST',
    body: form,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined
  })
}

async function userToken(byte = 7): Promise<string> {
  return generateUserToken(SIGNING_SECRET, new Uint8Array(16).fill(byte))
}

async function uploadOne(env: Env, token: string): Promise<{ id: string; expiresAt: string }> {
  const response = await worker.fetch(uploadRequest(token), env, {} as ExecutionContext)
  expect(response.status).toBe(201)
  return (await response.json()) as { id: string; expiresAt: string }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('POST /captures', () => {
  it('bearer가 없으면 401이며 R2·D1 write가 0회다', async () => {
    const { env, state } = makeEnv()
    const response = await worker.fetch(uploadRequest(), env, {} as ExecutionContext)

    expect(response.status).toBe(401)
    expect(state.r2Writes).toEqual([])
    expect(state.rows.size).toBe(0)
  })

  it('TOKEN_SIGNING_SECRET가 없으면 500 fail-closed다', async () => {
    const { env, state } = makeEnv({ TOKEN_SIGNING_SECRET: undefined })
    const response = await worker.fetch(
      uploadRequest(await userToken()),
      env,
      {} as ExecutionContext
    )

    expect(response.status).toBe(500)
    expect(state.r2Writes).toEqual([])
  })

  it('잘못된 SharedContextV2는 400이며 R2·D1 write가 0회다', async () => {
    const { env, state } = makeEnv()
    const response = await worker.fetch(
      uploadRequest(await userToken(), JSON.stringify({ v: 2, sourceUrl: 'ftp://x' })),
      env,
      {} as ExecutionContext
    )

    expect(response.status).toBe(400)
    expect(state.r2Writes).toEqual([])
    expect(state.rows.size).toBe(0)
  })

  it('유효 요청은 파생 key 두 개에 owner/access/expiry를 쓰고 {id,expiresAt}만 반환한다', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW_MS)
    const { env, state } = makeEnv()
    const token = await userToken()
    const owner = await ownerFromToken(token)
    const response = await worker.fetch(uploadRequest(token), env, {} as ExecutionContext)
    const body = (await response.json()) as Record<string, unknown>

    expect(response.status).toBe(201)
    expect(Object.keys(body).sort()).toEqual(['expiresAt', 'id'])
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(body.expiresAt).toBe(new Date(NOW_MS + 7 * 86_400_000).toISOString())
    expect(state.r2Writes).toHaveLength(2)
    expect(state.r2Writes.every((key) => key.startsWith('private-v2/'))).toBe(true)
    expect(state.r2Writes.some((key) => key.includes(String(body.id)))).toBe(false)
    for (const key of state.r2Writes) {
      expect(state.objects.get(key)?.customMetadata).toEqual({
        expiresAt: body.expiresAt,
        owner,
        access: 'private-v2'
      })
    }
    expect(state.rows.get(String(body.id))?.url).toBe('https://example.com/page')
  })

  it('private 업로드 외부 id는 레거시 /i/{id}에서 찾을 수 없다', async () => {
    const { env } = makeEnv()
    const stored = await uploadOne(env, await userToken())

    const response = await worker.fetch(
      new Request(`https://worker.example/i/${stored.id}`),
      env,
      {} as ExecutionContext
    )
    expect(response.status).toBe(410)
  })
})

describe('GET /pi/{id}', () => {
  it('signature가 없거나 변조되면 403이고 R2 read는 0회다', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW_MS)
    const { env, state } = makeEnv()

    const missing = await worker.fetch(
      new Request('https://worker.example/pi/11111111-1111-4111-8111-111111111111'),
      env,
      {} as ExecutionContext
    )
    const tampered = await worker.fetch(
      new Request(
        'https://worker.example/pi/11111111-1111-4111-8111-111111111111?exp=1800000300&sig=bad'
      ),
      env,
      {} as ExecutionContext
    )

    expect(missing.status).toBe(403)
    expect(tampered.status).toBe(403)
    expect(state.r2Reads).toEqual([])
  })

  it('유효 URL은 private,no-store PNG를 반환한다', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW_MS)
    const { env } = makeEnv()
    const stored = await uploadOne(env, await userToken())
    const signed = await createSignedImageUrl({
      origin: 'https://worker.example',
      id: stored.id,
      secret: SIGNING_SECRET,
      nowMs: NOW_MS
    })

    const response = await worker.fetch(
      new Request(signed),
      env,
      {} as ExecutionContext
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(response.headers.get('Content-Type')).toBe('image/png')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG)
  })
})

describe('GET/DELETE /captures', () => {
  it('목록은 현재 owner 행만 반환하고 limit 범위 밖은 400이다', async () => {
    const { env } = makeEnv()
    const first = await userToken(7)
    const second = await userToken(8)
    const own = await uploadOne(env, first)
    await uploadOne(env, second)

    const list = await worker.fetch(
      new Request('https://worker.example/captures?limit=20', {
        headers: { Authorization: `Bearer ${first}` }
      }),
      env,
      {} as ExecutionContext
    )
    const invalid = await worker.fetch(
      new Request('https://worker.example/captures?limit=0', {
        headers: { Authorization: `Bearer ${first}` }
      }),
      env,
      {} as ExecutionContext
    )

    expect(list.status).toBe(200)
    expect(await list.json()).toEqual([
      expect.objectContaining({ id: own.id, url: 'https://example.com/page' })
    ])
    expect(invalid.status).toBe(400)
  })

  it('다른 owner 삭제는 동일 404이고 R2 delete가 0회다', async () => {
    const { env, state } = makeEnv()
    const stored = await uploadOne(env, await userToken(7))
    const response = await worker.fetch(
      new Request(`https://worker.example/captures/${stored.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${await userToken(8)}` }
      }),
      env,
      {} as ExecutionContext
    )

    expect(response.status).toBe(404)
    expect(state.r2Deletes).toEqual([])
  })

  it('본인 삭제는 R2 다음 D1 순서로 끝난 뒤 204를 반환한다', async () => {
    const { env, state } = makeEnv()
    const token = await userToken()
    const stored = await uploadOne(env, token)
    state.events.length = 0

    const response = await worker.fetch(
      new Request(`https://worker.example/captures/${stored.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      }),
      env,
      {} as ExecutionContext
    )

    expect(response.status).toBe(204)
    expect(state.events).toEqual(['r2:delete', 'd1:delete'])
    expect(state.rows.has(stored.id)).toBe(false)
  })

  it('R2 삭제 실패는 502이며 D1 row를 유지한다', async () => {
    const { env, state } = makeEnv()
    const token = await userToken()
    const stored = await uploadOne(env, token)
    state.failR2Delete = true

    const response = await worker.fetch(
      new Request(`https://worker.example/captures/${stored.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      }),
      env,
      {} as ExecutionContext
    )

    expect(response.status).toBe(502)
    expect(state.rows.has(stored.id)).toBe(true)
    expect(state.events).not.toContain('d1:delete')
  })

  it('R2 성공 뒤 D1 삭제 실패는 500이며 재시도로 수렴한다', async () => {
    const { env, state } = makeEnv()
    const token = await userToken()
    const stored = await uploadOne(env, token)
    state.failD1Delete = true

    const first = await worker.fetch(
      new Request(`https://worker.example/captures/${stored.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      }),
      env,
      {} as ExecutionContext
    )
    expect(first.status).toBe(500)
    expect(state.rows.has(stored.id)).toBe(true)

    state.failD1Delete = false
    const retry = await worker.fetch(
      new Request(`https://worker.example/captures/${stored.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      }),
      env,
      {} as ExecutionContext
    )
    expect(retry.status).toBe(204)
    expect(state.rows.has(stored.id)).toBe(false)
  })
})
