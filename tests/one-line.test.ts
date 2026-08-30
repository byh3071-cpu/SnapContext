import { describe, expect, it } from 'vitest'

import { assertOneLine } from '../src/utils/one-line'

// 저장 성공 토스트는 만들어지는 시점에 assertOneLine 을 통과해야 한다 — 통과 못 하면
// ImageActions 의 catch 로 빠져 "성공한 저장"이 실패 배지로 뒤바뀐다(critic MINOR, 2026-08-30).
// 문구를 늘릴 때 이 그물이 먼저 빨간불을 켜야 한다.
describe('assertOneLine', () => {
  it('80자 초과는 throw', () => {
    expect(() => assertOneLine('a'.repeat(81))).toThrow()
  })
  it('줄바꿈 포함은 throw', () => {
    expect(() => assertOneLine('한 줄\n두 줄')).toThrow()
  })
  it('80자 이하 한 줄은 통과', () => {
    expect(() => assertOneLine('a'.repeat(80))).not.toThrow()
  })
})
