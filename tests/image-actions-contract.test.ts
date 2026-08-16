import { describe, it, expect } from 'vitest'
// @types/node 가 이 레포에 없어(devDependencies 참고) node:fs 를 못 쓴다 — 대신 Vite 의
// ?raw 쿼리(vite/client.d.ts 에 이미 타입 선언됨, tsconfig types 에 포함)로 소스를 문자열
// 그대로 읽는다. vitest 도 내부적으로 Vite 변환 파이프라인을 쓰므로 node 환경에서도 동작한다.
import SOURCE from '../src/sidepanel/components/ImageActions.ts?raw'

/**
 * ImageActions.ts 의 내보내기 3경로(PNG 복사·PNG 저장·서버 저장) 정적 소스 계약 — 0.4.3
 * critic 지적: renderAnnotatedPngBlob(image, pins, deps.getAnnotations()) 처럼 annotations
 * 인자가 통째로 빠지는 뮤테이션을 잡을 실행 테스트가 없었다(tests/annotated-image.test.ts
 * 는 renderAnnotatedPngBlob 자체의 픽셀 계약만 검증 — 호출부가 실제로 annotations 를
 * 넘기는지는 별개 문제).
 *
 * ⚠️ 깨지기 쉬움(fragile) — 소스 텍스트를 정규식으로 훑는 방식이라, ImageActions.ts 를
 * 리팩터링(변수명 변경·헬퍼 함수로 추출 등)하면 이 테스트가 실제 버그 없이도 깨질 수
 * 있다. tests/e2e/coverage.mjs 처럼 실제 브라우저에서 bake 산출물 픽셀을 검증하는 것이
 * 이상적이지만(3b 본 항목의 1순위 옵션), 이 세션에서는 실행 인프라(빌드+Chromium 구동)
 * 비용 대비 커버리지 이득이 작다고 판단해 이 차선책을 택했다 — 사람 보고에 기록.
 */

/**
 * `fnName(...)` 호출의 인자 텍스트를 괄호 깊이를 세어 추출한다. 단순 정규식
 * `/fnName\(([^)]*)\)/` 은 인자 안에 `Date.now()` 같은 중첩 괄호가 있으면 첫 `)` 에서
 * 멈춰버려 못 쓴다(실제로 downloadAnnotatedPng 호출의 파일명 인자가 그렇다).
 */
function extractCallArgs(source: string, fnName: string): string {
  const marker = `${fnName}(`
  const start = source.indexOf(marker)
  if (start === -1) {
    throw new Error(`${marker} 호출을 소스에서 찾지 못했습니다`)
  }
  let depth = 1
  let i = start + marker.length
  const argStart = i
  for (; i < source.length && depth > 0; i++) {
    if (source[i] === '(') depth++
    else if (source[i] === ')') depth--
  }
  if (depth !== 0) {
    throw new Error(`${marker} 호출의 닫는 괄호를 찾지 못했습니다`)
  }
  return source.slice(argStart, i - 1)
}

describe('ImageActions 내보내기 3경로 — bake 계약 정적 검사', () => {
  it('PNG 복사(copyPng)가 copyAnnotatedPngToClipboard 에 deps.getAnnotations() 를 함께 넘긴다', () => {
    const args = extractCallArgs(SOURCE, 'copyAnnotatedPngToClipboard')
    expect(args).toContain('deps.getAnnotations()')
  })

  it('PNG 저장(downloadButton)이 downloadAnnotatedPng 에 deps.getAnnotations() 를 함께 넘긴다', () => {
    const args = extractCallArgs(SOURCE, 'downloadAnnotatedPng')
    expect(args).toContain('deps.getAnnotations()')
  })

  it('서버 저장(saveButton)이 renderAnnotatedPngBlob 에 deps.getAnnotations() 를 함께 넘긴다', () => {
    const args = extractCallArgs(SOURCE, 'renderAnnotatedPngBlob')
    expect(args).toContain('deps.getAnnotations()')
  })
})
