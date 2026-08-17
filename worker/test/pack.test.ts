import { describe, it, expect } from 'vitest'
import { DAY_MS, MAX_AGE_MS } from '../src/lib'
import { getSnapPack, SnapPackError } from '../src/pack'
import { derivePrivateObjectKeys } from '../src/private-object-key'

type StoredObj = {
  text?: string
  uploaded: Date
  customMetadata?: Record<string, string>
}

function makeBucket(objects: Map<string, StoredObj>) {
  return {
    async get(key: string) {
      const o = objects.get(key)
      if (!o) return null
      return {
        uploaded: o.uploaded,
        customMetadata: o.customMetadata,
        async text() {
          return o.text ?? ''
        }
      }
    },
    async head(key: string) {
      const o = objects.get(key)
      if (!o) return null
      return { uploaded: o.uploaded, customMetadata: o.customMetadata }
    }
  }
}

const ctxJson = JSON.stringify({
  v: 2,
  sourceUrl: 'https://a.com',
  sourceTitle: 'T',
  captureType: 'visible',
  capturedAt: '2026-07-10T00:00:00.000Z',
  viewport: { width: 1, height: 2 },
  pins: [{ id: 1, memo: 'm' }],
  intent: '테스트 의도',
  mode: 'context'
})

const SIGNING_SECRET = 'test-signing-secret'

/**
 * 0.4.4(ADR-015 2차)부터 getSnapPack 은 레거시 raw-ID fallback 없이 private-v2
 * 파생 키로만 찾는다 — 테스트도 실제 파생 키 위치에 저장해야 한다.
 */
async function privateBucket(
  id: string,
  opts: {
    uploaded: Date
    imageMeta?: Record<string, string>
    jsonMeta?: Record<string, string>
    withImage?: boolean
    withJson?: boolean
    jsonText?: string
  }
): Promise<ReturnType<typeof makeBucket>> {
  const keys = await derivePrivateObjectKeys(id, SIGNING_SECRET)
  const map = new Map<string, StoredObj>()
  if (opts.withImage !== false) {
    map.set(keys.imageKey, {
      uploaded: opts.uploaded,
      customMetadata: opts.imageMeta
    })
  }
  if (opts.withJson !== false) {
    map.set(keys.jsonKey, {
      text: opts.jsonText ?? ctxJson,
      uploaded: opts.uploaded,
      customMetadata: opts.jsonMeta
    })
  }
  return makeBucket(map)
}

describe('getSnapPack (snap_pack)', () => {
  it('유효 id: SharedContext JSON 반환', async () => {
    const meta = { expiresAt: new Date(Date.now() + MAX_AGE_MS).toISOString() }
    const bucket = await privateBucket('id1', {
      uploaded: new Date(),
      imageMeta: meta,
      jsonMeta: meta
    })
    const pack = await getSnapPack(bucket as unknown as R2Bucket, {
      id: 'id1',
      origin: 'https://w.test',
      includeImage: false,
      now: Date.now(),
      signingSecret: SIGNING_SECRET
    })
    expect(pack.sourceTitle).toBe('T')
    expect(pack.id).toBe('id1')
    expect(pack.imageUrl).toBeUndefined()
  })

  it('includeImage=true 이면 /pi/{id} URL 참조 (base64 아님)', async () => {
    const meta = { expiresAt: new Date(Date.now() + MAX_AGE_MS).toISOString() }
    const bucket = await privateBucket('id1', {
      uploaded: new Date(),
      imageMeta: meta,
      jsonMeta: meta
    })
    const pack = await getSnapPack(bucket as unknown as R2Bucket, {
      id: 'id1',
      origin: 'https://w.test',
      includeImage: true,
      now: Date.now(),
      signingSecret: SIGNING_SECRET
    })
    expect(pack.imageUrl).toMatch(
      /^https:\/\/w\.test\/pi\/id1\?exp=\d+&sig=[A-Za-z0-9_-]{22}$/
    )
    expect(JSON.stringify(pack)).not.toMatch(/data:image/)
    expect(JSON.stringify(pack)).not.toMatch(/base64/i)
  })

  it('없는 id: SnapPackError (조용한 빈 반환 금지)', async () => {
    const bucket = makeBucket(new Map())
    await expect(
      getSnapPack(bucket as unknown as R2Bucket, {
        id: 'missing',
        origin: 'https://w.test',
        includeImage: false,
        now: Date.now(),
        signingSecret: SIGNING_SECRET
      })
    ).rejects.toBeInstanceOf(SnapPackError)
  })

  it('signingSecret 미설정: 어떤 id 도 못 찾는다 (fail-closed — 레거시 fallback 삭제됨)', async () => {
    const meta = { expiresAt: new Date(Date.now() + MAX_AGE_MS).toISOString() }
    const bucket = await privateBucket('id1', {
      uploaded: new Date(),
      imageMeta: meta,
      jsonMeta: meta
    })
    await expect(
      getSnapPack(bucket as unknown as R2Bucket, {
        id: 'id1',
        origin: 'https://w.test',
        includeImage: false,
        now: Date.now()
      })
    ).rejects.toMatchObject({ name: 'SnapPackError', code: 'NOT_FOUND' })
  })

  it('만료된 id: SnapPackError (readExpiry·isExpiredAt 재사용)', async () => {
    const stale = new Date(Date.now() - MAX_AGE_MS - 1000)
    const meta = { expiresAt: new Date(stale.getTime() + DAY_MS).toISOString() }
    const bucket = await privateBucket('old', {
      uploaded: stale,
      imageMeta: meta,
      jsonMeta: meta
    })
    await expect(
      getSnapPack(bucket as unknown as R2Bucket, {
        id: 'old',
        origin: 'https://w.test',
        includeImage: false,
        now: Date.now(),
        signingSecret: SIGNING_SECRET
      })
    ).rejects.toBeInstanceOf(SnapPackError)
  })

  it('메타 1일: uploaded 가 신선해도 T+2d 조회는 EXPIRED', async () => {
    const uploadedAt = Date.now()
    const meta = { expiresAt: new Date(uploadedAt + DAY_MS).toISOString() }
    const bucket = await privateBucket('short', {
      uploaded: new Date(uploadedAt),
      imageMeta: meta,
      jsonMeta: meta
    })
    await expect(
      getSnapPack(bucket as unknown as R2Bucket, {
        id: 'short',
        origin: 'https://w.test',
        includeImage: false,
        now: uploadedAt + 2 * DAY_MS,
        signingSecret: SIGNING_SECRET
      })
    ).rejects.toMatchObject({ name: 'SnapPackError', code: 'EXPIRED' })
  })

  it('메타 30일: uploaded 가 8일 지나도 정상 반환 (이미지·json 양쪽 메타)', async () => {
    const uploadedAt = Date.now()
    const meta = { expiresAt: new Date(uploadedAt + 30 * DAY_MS).toISOString() }
    const bucket = await privateBucket('long', {
      uploaded: new Date(uploadedAt),
      imageMeta: meta,
      jsonMeta: meta
    })
    const pack = await getSnapPack(bucket as unknown as R2Bucket, {
      id: 'long',
      origin: 'https://w.test',
      includeImage: false,
      now: uploadedAt + 8 * DAY_MS,
      signingSecret: SIGNING_SECRET
    })
    expect(pack.sourceTitle).toBe('T')
  })

  it('split-brain 방지: 이미지=30일 메타 · json=메타 없음 + 8일 경과 → EXPIRED (fail-closed)', async () => {
    const uploadedAt = Date.now()
    // 이미지에만 메타가 심긴 상태(= {id}.json put 에서 메타를 빠뜨린 회귀).
    // json 쪽은 메타가 없으니 readExpiry 가 즉시 만료 처리(invalid)한다.
    const bucket = await privateBucket('split', {
      uploaded: new Date(uploadedAt),
      imageMeta: { expiresAt: new Date(uploadedAt + 30 * DAY_MS).toISOString() },
      jsonMeta: undefined
    })
    await expect(
      getSnapPack(bucket as unknown as R2Bucket, {
        id: 'split',
        origin: 'https://w.test',
        includeImage: false,
        now: uploadedAt + 8 * DAY_MS,
        signingSecret: SIGNING_SECRET
      })
    ).rejects.toMatchObject({ name: 'SnapPackError', code: 'EXPIRED' })
  })

  it('orphan(JSON만 있고 이미지 없음): NOT_FOUND (MAJOR-3)', async () => {
    const bucket = await privateBucket('orphan', {
      uploaded: new Date(),
      withImage: false
    })
    await expect(
      getSnapPack(bucket as unknown as R2Bucket, {
        id: 'orphan',
        origin: 'https://w.test',
        includeImage: true,
        now: Date.now(),
        signingSecret: SIGNING_SECRET
      })
    ).rejects.toMatchObject({
      name: 'SnapPackError',
      code: 'NOT_FOUND'
    })
  })
})
