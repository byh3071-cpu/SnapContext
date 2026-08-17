/**
 * 만료 파라미터화 — 쓰기→읽기 수명주기 (0.4.0 P3, 0.4.4 에 /captures·/pi 로 이관)
 *
 * vi.spyOn(Date,'now') 로 시간을 이동시켜, 업로드 때 심은 customMetadata.expiresAt 이
 * GET /pi/{id} · snap_pack 판정을 지배하는지 검증한다. 단위 테스트가 각각 덮는 조각
 * (파싱·put·readExpiry)이 실제로 이어져 있는지는 이 왕복 테스트만 잡을 수 있다.
 *
 * 0.4.4(ADR-015 2차)에서 레거시 POST /upload·GET /i·GET /s 가 폐쇄되면서, 같은
 * 왕복 시나리오를 현재 라우트(POST /captures·GET /pi/{id})로 옮겼다. /s 뷰어의
 * "30일 자동 삭제" 문구 검증은 뷰어 자체가 삭제돼(T3a) 대응 지점이 없다 — 대신
 * 200/410 전환 자체로 보관기간이 실제로 흐르는지 확인한다.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import worker from '../src/index'
import { DAY_MS } from '../src/lib'
import { getSnapPack } from '../src/pack'
import { derivePrivateObjectKeys } from '../src/private-object-key'
import { createSignedImageUrl } from '../src/image-url'
import { generateUserToken } from '../src/token'
import type { Env } from '../src/env'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])
const SIGNING_SECRET = 'expiry-lifecycle-secret'

const SHARED_CTX = {
  v: 2 as const,
  sourceUrl: 'https://example.com/lifecycle',
  sourceTitle: 'Lifecycle Title',
  captureType: 'visible',
  capturedAt: '2026-07-22T09:00:00.000Z',
  viewport: { width: 1280, height: 720 },
  pins: [{ id: 1, memo: 'a' }],
  intent: '수명주기 테스트',
  mode: 'context' as const
}

type StoredObj = {
  bytes?: Uint8Array
  uploaded: Date
  contentType?: string
  text?: string
  customMetadata?: Record<string, string>
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
          customMetadata: o.customMetadata,
          httpMetadata: { contentType: o.contentType },
          text: async () => o.text ?? ''
        }
      },
      async head(key: string) {
        const o = objects.get(key)
        if (!o) return null
        return { uploaded: o.uploaded, customMetadata: o.customMetadata }
      },
      async put(
        key: string,
        value: ArrayBuffer | string,
        putOpts?: {
          httpMetadata?: { contentType?: string }
          customMetadata?: Record<string, string>
        }
      ) {
        const common = {
          uploaded: new Date(Date.now()),
          contentType: putOpts?.httpMetadata?.contentType,
          customMetadata: putOpts?.customMetadata
        }
        if (typeof value === 'string') {
          objects.set(key, { ...common, text: value })
        } else {
          objects.set(key, { ...common, bytes: new Uint8Array(value) })
        }
      },
      async delete() {}
    } as unknown as R2Bucket,
    DB: {
      prepare() {
        return {
          bind() {
            return {
              async run() {
                return { success: true }
              }
            }
          }
        }
      }
    } as unknown as D1Database
  }
  return { env, objects }
}

async function upload(env: Env, expiresInDays?: string): Promise<string> {
  const token = await generateUserToken(SIGNING_SECRET)
  const form = new FormData()
  form.set('image', new Blob([PNG], { type: 'image/png' }), 'shot.png')
  form.set('context', JSON.stringify(SHARED_CTX))
  if (expiresInDays !== undefined) form.set('expiresInDays', expiresInDays)
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
  const { id } = (await res.json()) as { id: string }
  return id
}

/** 읽는 시점(now)에 새로 서명해야 exp 검증을 통과한다 — 서명 유효기간(5분)과
 *  캡처 보관기간(expiresInDays)은 서로 다른 시계라 섞으면 안 된다. */
async function fetchImage(env: Env, id: string, nowMs: number): Promise<Response> {
  const url = await createSignedImageUrl({
    origin: 'https://w.test',
    id,
    secret: SIGNING_SECRET,
    nowMs
  })
  return worker.fetch(new Request(url), env, {} as ExecutionContext)
}

const T = Date.parse('2026-07-22T09:00:00.000Z')

describe('만료 수명주기 (업로드 → 시간 이동 → 조회, POST /captures·GET /pi)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("expiresInDays='1' 업로드 @T → T+2d: /pi 410 · snap_pack EXPIRED", async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(T)
    const { env } = makeEnv()
    const id = await upload(env, '1')

    nowSpy.mockReturnValue(T + 2 * DAY_MS)
    expect((await fetchImage(env, id, T + 2 * DAY_MS)).status).toBe(410)
    await expect(
      getSnapPack(env.BUCKET, {
        id,
        origin: 'https://w.test',
        includeImage: false,
        now: T + 2 * DAY_MS,
        signingSecret: SIGNING_SECRET
      })
    ).rejects.toMatchObject({ name: 'SnapPackError', code: 'EXPIRED' })
  })

  it("expiresInDays='30' 업로드 @T → T+8d: /pi 200 · snap_pack 정상", async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(T)
    const { env } = makeEnv()
    const id = await upload(env, '30')

    nowSpy.mockReturnValue(T + 8 * DAY_MS)
    const img = await fetchImage(env, id, T + 8 * DAY_MS)
    expect(img.status).toBe(200)
    expect(new Uint8Array(await img.arrayBuffer())).toEqual(PNG)

    const pack = await getSnapPack(env.BUCKET, {
      id,
      origin: 'https://w.test',
      includeImage: false,
      now: T + 8 * DAY_MS,
      signingSecret: SIGNING_SECRET
    })
    expect(pack.sourceTitle).toBe('Lifecycle Title')
  })

  it('미지정 업로드 @T → T+8d: 기본 7일이라 /pi 410', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(T)
    const { env } = makeEnv()
    const id = await upload(env)

    nowSpy.mockReturnValue(T + 8 * DAY_MS)
    expect((await fetchImage(env, id, T + 8 * DAY_MS)).status).toBe(410)
  })

  it("expiresInDays='30' 이어도 {id}.json 메타가 없으면 snap_pack 은 fail-closed (split-brain 방지 계약)", async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(T)
    const { env, objects } = makeEnv()
    const id = await upload(env, '30')

    // 회귀 시뮬레이션: {id}.json put 에서 customMetadata 를 빠뜨린 상태
    const keys = await derivePrivateObjectKeys(id, SIGNING_SECRET)
    const json = objects.get(keys.jsonKey)
    expect(json?.customMetadata?.expiresAt).toBeTruthy()
    if (json) objects.set(keys.jsonKey, { ...json, customMetadata: undefined })

    nowSpy.mockReturnValue(T + 8 * DAY_MS)
    // 이미지는 살아 있는데 pack 만 죽는다 = split-brain. 그래서 양쪽에 심어야 한다.
    expect((await fetchImage(env, id, T + 8 * DAY_MS)).status).toBe(200)
    await expect(
      getSnapPack(env.BUCKET, {
        id,
        origin: 'https://w.test',
        includeImage: false,
        now: T + 8 * DAY_MS,
        signingSecret: SIGNING_SECRET
      })
    ).rejects.toMatchObject({ name: 'SnapPackError', code: 'EXPIRED' })
  })
})
