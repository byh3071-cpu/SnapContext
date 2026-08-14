import { describe, expect, it } from 'vitest'
import {
  MAX_SHARED_CONTEXT_V2_BYTES,
  parseSharedContextV2
} from '../src/shared-context-v2'

function validContext(): Record<string, unknown> {
  return {
    v: 2,
    sourceUrl: 'https://user:pass@example.com/path?secret=yes#private',
    sourceTitle: '테스트 페이지',
    captureType: 'visible',
    capturedAt: '2026-08-05T00:00:00.000Z',
    viewport: { width: 1440, height: 900 },
    pins: [{ id: 1, memo: '버튼 위치' }],
    intent: '이 화면을 구현해 주세요.',
    mode: 'context',
    debugLogs: [{ message: '전송하면 안 됨' }],
    project: { name: '전송하면 안 됨' },
    selectedElement: '<main>전송하면 안 됨</main>'
  }
}

describe('SharedContextV2 검증', () => {
  it('허용 필드만 반환하고 URL의 자격증명·query·fragment를 제거한다', () => {
    const parsed = parseSharedContextV2(JSON.stringify(validContext()))

    expect(parsed).toEqual({
      v: 2,
      sourceUrl: 'https://example.com/path',
      sourceTitle: '테스트 페이지',
      captureType: 'visible',
      capturedAt: '2026-08-05T00:00:00.000Z',
      viewport: { width: 1440, height: 900 },
      pins: [{ id: 1, memo: '버튼 위치' }],
      intent: '이 화면을 구현해 주세요.',
      mode: 'context'
    })
    expect(JSON.stringify(parsed)).not.toContain('debugLogs')
    expect(JSON.stringify(parsed)).not.toContain('selectedElement')
  })

  it.each(['context', 'bug-report', 'refactor', 'reference'])('mode %s를 허용한다', (mode) => {
    const value = validContext()
    value.mode = mode
    expect(parseSharedContextV2(JSON.stringify(value))?.mode).toBe(mode)
  })

  it.each([
    ['v1', { v: 1 }],
    ['ftp URL', { sourceUrl: 'ftp://example.com/a' }],
    ['잘못된 시각', { capturedAt: 'not-a-date' }],
    ['잘못된 mode', { mode: 'auto' }],
    ['0 viewport', { viewport: { width: 0, height: 900 } }],
    ['중복 pin id', { pins: [{ id: 1, memo: 'a' }, { id: 1, memo: 'b' }] }],
    ['2000자를 넘는 intent', { intent: '가'.repeat(2001) }]
  ])('%s는 null로 거부한다', (_name, override) => {
    expect(
      parseSharedContextV2(JSON.stringify({ ...validContext(), ...override }))
    ).toBeNull()
  })

  it('64KiB를 넘는 raw JSON은 파싱 전에 거부한다', () => {
    const raw = JSON.stringify({ ...validContext(), padding: 'x'.repeat(70_000) })
    expect(new TextEncoder().encode(raw).byteLength).toBeGreaterThan(
      MAX_SHARED_CONTEXT_V2_BYTES
    )
    expect(parseSharedContextV2(raw)).toBeNull()
  })

  it('JSON이 아니거나 배열이면 null이다', () => {
    expect(parseSharedContextV2('{')).toBeNull()
    expect(parseSharedContextV2('[]')).toBeNull()
  })
})
