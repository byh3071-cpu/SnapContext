import { describe, it, expect } from 'vitest'
import { DAY_MS, MAX_AGE_MS } from '../src/lib'
import {
  ANALYZE_MODES,
  DEFAULT_ANALYZE_MODE,
  assertAnalyzeMode,
  buildAnalyzeDigest,
  snapAnalyze,
  SnapAnalyzeError
} from '../src/analyze'
import { SnapPackError } from '../src/pack'
import { derivePrivateObjectKeys } from '../src/private-object-key'
import type { SharedContext } from '../src/lib'

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

const ctx: SharedContext = {
  v: 1,
  sourceUrl: 'https://a.com/page',
  sourceTitle: 'Page Title',
  captureType: 'visible',
  capturedAt: '2026-07-10T00:00:00.000Z',
  viewport: { width: 1280, height: 720 },
  pins: [
    { id: 1, memo: '버튼 깨짐' },
    { id: 2, memo: '' }
  ]
}

const SIGNING_SECRET = 'test-signing-secret'

// getSnapPack(→ snapAnalyze) 은 0.4.4부터 private-v2 전용이라, v2 스키마(intent·mode 필수)로
// 감싼 별도 JSON 이 필요하다. buildAnalyzeDigest 자체는 pack.ts 를 거치지 않으므로 위 v1 ctx 를 그대로 쓴다.
const v2CtxJson = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    ...ctx,
    v: 2,
    intent: '테스트 의도',
    mode: 'context',
    ...overrides
  })

/** 0.4.4부터 getSnapPack 은 private-v2 파생 키로만 찾는다 — 테스트도 실제 위치에 저장한다. */
async function privateBucket(
  id: string,
  opts: {
    uploaded: Date
    imageMeta?: Record<string, string>
    jsonMeta?: Record<string, string>
    withImage?: boolean
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
  map.set(keys.jsonKey, {
    text: opts.jsonText ?? v2CtxJson(),
    uploaded: opts.uploaded,
    customMetadata: opts.jsonMeta
  })
  return makeBucket(map)
}

describe('assertAnalyzeMode (allowlist)', () => {
  it('미지정 → 기본 bug-report', () => {
    expect(assertAnalyzeMode(undefined)).toBe(DEFAULT_ANALYZE_MODE)
    expect(DEFAULT_ANALYZE_MODE).toBe('context')
  })

  it('allowlist 3종 통과', () => {
    for (const mode of ANALYZE_MODES) {
      expect(assertAnalyzeMode(mode)).toBe(mode)
    }
  })

  it('allowlist 위반 → SnapAnalyzeError INVALID_MODE (명시적)', () => {
    expect(() => assertAnalyzeMode('summary')).toThrow(SnapAnalyzeError)
    try {
      assertAnalyzeMode('hack')
    } catch (err) {
      expect(err).toBeInstanceOf(SnapAnalyzeError)
      expect((err as SnapAnalyzeError).code).toBe('INVALID_MODE')
      expect((err as Error).message).toMatch(/allowlist|allowed|mode/i)
    }
  })
})

describe('buildAnalyzeDigest (3 mode 출력 구조)', () => {
  const pack = { ...ctx, id: 'cap-1', imageUrl: 'https://w.test/i/cap-1' }

  it('bug-report: ①메타 ②핀 ③분석지시 ④이미지URL', () => {
    const md = buildAnalyzeDigest(pack, 'bug-report')
    expect(md).toContain('Page Title')
    expect(md).toContain('https://a.com/page')
    expect(md).toContain('visible')
    expect(md).toContain('1280')
    expect(md).toContain('720')
    expect(md).toContain('버튼 깨짐')
    expect(md).toMatch(/원인 추정|버그/)
    expect(md).toContain('https://w.test/i/cap-1')
  })

  it('refactor: 모드별 분석 지시 포함', () => {
    const md = buildAnalyzeDigest(pack, 'refactor')
    expect(md).toContain('Page Title')
    expect(md).toMatch(/리팩토링|개선/)
    expect(md).toContain('https://w.test/i/cap-1')
  })

  it('reference: 모드별 분석 지시 포함', () => {
    const md = buildAnalyzeDigest(pack, 'reference')
    expect(md).toContain('Page Title')
    expect(md).toMatch(/레퍼런스|디자인 패턴/)
    expect(md).toContain('https://w.test/i/cap-1')
  })
})

describe('snapAnalyze (만료/없음 — snap_pack 헬퍼 재사용)', () => {
  it('유효 id + 기본 mode → 마크다운 다이제스트', async () => {
    const meta = { expiresAt: new Date(Date.now() + MAX_AGE_MS).toISOString() }
    const bucket = await privateBucket('ok', {
      uploaded: new Date(),
      imageMeta: meta,
      jsonMeta: meta
    })
    const md = await snapAnalyze(bucket as unknown as R2Bucket, {
      id: 'ok',
      origin: 'https://w.test',
      now: Date.now(),
      signingSecret: SIGNING_SECRET
    })
    expect(md).toContain('Page Title')
    expect(md).toContain('https://w.test/pi/ok')
    expect(md).toContain('컨텍스트 전달')
  })

  it('누출 회귀: {id}.json 화이트리스트 밖 필드(userNote·tags·userAgent·pin x/y)가 다이제스트에 미노출', async () => {
    const meta = { expiresAt: new Date(Date.now() + MAX_AGE_MS).toISOString() }
    const leakyJson = v2CtxJson({
      userNote: 'SECRET_NOTE',
      tags: ['SECRET_TAG'],
      userAgent: 'SECRET_UA',
      pins: [{ id: 1, memo: '핀메모OK', x: 99, y: 88 }]
    })
    const bucket = await privateBucket('leak', {
      uploaded: new Date(),
      imageMeta: meta,
      jsonMeta: meta,
      jsonText: leakyJson
    })
    const md = await snapAnalyze(bucket as unknown as R2Bucket, {
      id: 'leak',
      origin: 'https://w.test',
      now: Date.now(),
      signingSecret: SIGNING_SECRET
    })
    expect(md).toContain('핀메모OK')
    expect(md).toContain('https://w.test/pi/leak')
    expect(md).not.toContain('SECRET_NOTE')
    expect(md).not.toContain('SECRET_TAG')
    expect(md).not.toContain('SECRET_UA')
    expect(md).not.toContain('userNote')
    expect(md).not.toContain('userAgent')
    expect(md).not.toMatch(/\b99\b/)
    expect(md).not.toMatch(/\b88\b/)
  })

  it('없는 id → SnapPackError', async () => {
    const bucket = makeBucket(new Map())
    await expect(
      snapAnalyze(bucket as unknown as R2Bucket, {
        id: 'missing',
        origin: 'https://w.test',
        now: Date.now(),
        signingSecret: SIGNING_SECRET
      })
    ).rejects.toBeInstanceOf(SnapPackError)
  })

  it('만료 id → SnapPackError EXPIRED', async () => {
    const stale = new Date(Date.now() - MAX_AGE_MS - 1000)
    const meta = { expiresAt: new Date(stale.getTime() + DAY_MS).toISOString() }
    const bucket = await privateBucket('old', {
      uploaded: stale,
      imageMeta: meta,
      jsonMeta: meta
    })
    await expect(
      snapAnalyze(bucket as unknown as R2Bucket, {
        id: 'old',
        origin: 'https://w.test',
        now: Date.now(),
        signingSecret: SIGNING_SECRET
      })
    ).rejects.toMatchObject({ name: 'SnapPackError', code: 'EXPIRED' })
  })

  it('메타 30일 id → 8일 경과 조회에도 다이제스트 정상 (레거시였다면 EXPIRED)', async () => {
    const uploadedAt = Date.now()
    const meta = { expiresAt: new Date(uploadedAt + 30 * DAY_MS).toISOString() }
    const bucket = await privateBucket('long', {
      uploaded: new Date(uploadedAt),
      imageMeta: meta,
      jsonMeta: meta
    })
    const md = await snapAnalyze(bucket as unknown as R2Bucket, {
      id: 'long',
      origin: 'https://w.test',
      now: uploadedAt + 8 * DAY_MS,
      signingSecret: SIGNING_SECRET
    })
    expect(md).toContain('Page Title')
  })

  it('orphan(이미지 없음) → SnapPackError NOT_FOUND', async () => {
    const bucket = await privateBucket('orphan', {
      uploaded: new Date(),
      withImage: false
    })
    await expect(
      snapAnalyze(bucket as unknown as R2Bucket, {
        id: 'orphan',
        origin: 'https://w.test',
        now: Date.now(),
        signingSecret: SIGNING_SECRET
      })
    ).rejects.toMatchObject({ name: 'SnapPackError', code: 'NOT_FOUND' })
  })

  it('allowlist 위반 mode → SnapAnalyzeError (팩 조회 전)', async () => {
    const bucket = makeBucket(new Map())
    await expect(
      snapAnalyze(bucket as unknown as R2Bucket, {
        id: 'any',
        origin: 'https://w.test',
        now: Date.now(),
        mode: 'invalid-mode'
      })
    ).rejects.toMatchObject({ name: 'SnapAnalyzeError', code: 'INVALID_MODE' })
  })
})
