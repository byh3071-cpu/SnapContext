import { describe, it, expect } from 'vitest'
import worker from '../src/index'
import type { Env } from '../src/env'

/**
 * ADR-015 2차(0.4.4) 계약 — 레거시 공개 경로 3종의 영구 폐쇄.
 *
 * BUCKET·DB 를 건드리면 즉시 던지는 스텁을 쓴다: 폐쇄가 라우팅 최상단에서
 * 걸려야 한다는 계약을 "500 대신 조용히 통과" 하는 회귀로부터 지킨다
 * (구현이 실수로 예전 R2/D1 조회 코드를 남겨두면 이 테스트가 먼저 죽는다).
 */
function makeEnv(): Env {
  return {
    BUCKET: {
      async get() {
        throw new Error('레거시 폐쇄 경로가 BUCKET.get 을 건드렸다 (회귀)')
      },
      async head() {
        throw new Error('레거시 폐쇄 경로가 BUCKET.head 를 건드렸다 (회귀)')
      },
      async put() {
        throw new Error('레거시 폐쇄 경로가 BUCKET.put 을 건드렸다 (회귀)')
      },
      async delete() {
        throw new Error('레거시 폐쇄 경로가 BUCKET.delete 를 건드렸다 (회귀)')
      }
    } as unknown as R2Bucket,
    DB: {
      prepare() {
        throw new Error('레거시 폐쇄 경로가 DB.prepare 를 건드렸다 (회귀)')
      }
    } as unknown as D1Database
  }
}

const ctx = {} as ExecutionContext

async function call(path: string, method: string): Promise<Response> {
  return worker.fetch(
    new Request(`https://w.test${path}`, { method }),
    makeEnv(),
    ctx
  )
}

const LEGACY_ROUTES = [
  { label: 'GET /s/{id}', path: '/s/some-id', method: 'GET' },
  { label: 'GET /i/{id}', path: '/i/some-id', method: 'GET' },
  { label: 'POST /upload', path: '/upload', method: 'POST' }
] as const

describe('레거시 공개 경로 3종 — 영구 폐쇄 (ADR-015 2차, 0.4.4)', () => {
  for (const { label, path, method } of LEGACY_ROUTES) {
    it(`${label}: 410 Gone + Cache-Control: no-store + 짧은 안내 본문`, async () => {
      const res = await call(path, method)
      expect(res.status).toBe(410)
      expect(res.headers.get('cache-control')).toBe('no-store')
      const body = await res.text()
      expect(body.length).toBeGreaterThan(0)
      expect(body.length).toBeLessThan(200)
    })

    it(`${label} 의 OPTIONS(preflight)도 410 — 전역 OPTIONS 분기가 200 을 주지 않는다`, async () => {
      const res = await call(path, 'OPTIONS')
      expect(res.status).toBe(410)
      expect(res.headers.get('cache-control')).toBe('no-store')
    })
  }

  it('/upload 는 다른 메서드(DELETE)로 찔러도 여전히 410 — 라우트 자체가 없다', async () => {
    const res = await call('/upload', 'DELETE')
    expect(res.status).toBe(410)
    expect(res.headers.get('cache-control')).toBe('no-store')
  })
})

// /captures·/pi·MCP(history/pack/analyze) 정상 경로 회귀는 private-capture-routes.test.ts·
// mcp-integration.test.ts·mcp-owner-v2.test.ts 에 이미 있다 — 중복 작성하지 않는다.
