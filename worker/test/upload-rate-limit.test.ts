import { describe, it, expect } from 'vitest'
import { allowUploadRequest } from '../src/upload-rate-limit'

// 0.4.4(ADR-015 2차): POST /upload 라우트 자체가 사라져 라우트 레벨 429 테스트는
// 의미가 없다(index.test.ts 삭제와 동일한 이유) — 신규 쓰기 경로(POST /captures)의
// rate-limit 은 private-capture-routes.test.ts 관할. allowUploadRequest 는 그 경로가
// 그대로 재사용하는 순수함수라 여기 남긴다.
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
