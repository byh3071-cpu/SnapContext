/**
 * 벤더 아이콘 — "사용할 AI 도구" 드롭다운(§04 AI 연결) 전용.
 * swiss-icons.ts(자체 stroke 어휘)와 출처가 달라 별도 파일로 분리.
 *
 * 결정 근거: docs/research/vendor-logo-policy.md (요한 A안 승인 2026-08-17)
 *   - Codex(OpenAI)·Cursor = 공식 로고 원형 유지(각 벤더 브랜드 가이드 조건부 허용/정책 공백)
 *   - Claude Code = 자체 제작 모노그램 — Anthropic 실제 로고(방사형 선버스트)는
 *     Trademark Guidelines 상 지명적 사용 예외 조항이 없어 사전 서면 승인 없이는 미사용
 */

const SVG_NS = 'http://www.w3.org/2000/svg'

/**
 * OpenAI 로고마크(육각 매듭) — simple-icons(CC0-1.0) openai.svg path 원본 그대로, 변형 없음.
 * 출처: https://cdn.jsdelivr.net/npm/simple-icons/icons/openai.svg (확보 2026-08-17)
 * 근거: vendor-logo-policy.md "OpenAI = 조건부 허용 — 원형 유지·자사 마크보다 작게·보증 암시 금지"
 */
const CODEX_PATH =
  'M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z'

/**
 * Cursor 로고마크(각진 프리즘) — simple-icons(CC0-1.0) cursor.svg path 원본 그대로, 변형 없음.
 * 출처: https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/cursor.svg (확보 2026-08-17)
 * 근거: vendor-logo-policy.md "Cursor = 정책 공백(자산 공개 배포 → 사실상 OK)"
 */
const CURSOR_PATH =
  'M11.503.131 1.891 5.678a.84.84 0 0 0-.42.726v11.188c0 .3.162.575.42.724l9.609 5.55a1 1 0 0 0 .998 0l9.61-5.55a.84.84 0 0 0 .42-.724V6.404a.84.84 0 0 0-.42-.726L12.497.131a1.01 1.01 0 0 0-.996 0M2.657 6.338h18.55c.263 0 .43.287.297.515L12.23 22.918c-.062.107-.229.064-.229-.06V12.335a.59.59 0 0 0-.295-.51l-9.11-5.257c-.109-.063-.064-.23.061-.23'

export type VendorIconName = 'claude-code' | 'cursor' | 'codex'

function mkFilledIcon(path: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('class', 'vendor-ic')
  svg.setAttribute('aria-hidden', 'true')
  svg.innerHTML = `<path d="${path}"/>`
  return svg
}

/**
 * Claude Code 자체 제작 모노그램 — 굵은 사각 프레임 + 터미널 프롬프트(«>_») 모티프.
 * swiss-icons.ts와 동일한 stroke 어휘(24 광학박스·stroke 1.8·square cap/miter, .ic 클래스 재사용)로
 * Anthropic 실제 로고(방사형 선버스트)와 형태적으로 겹치지 않게 자체 설계했다.
 * 근거: vendor-logo-policy.md "Anthropic만 문면상 사전 서면 승인 필수 → 자체 제작(A안)"
 */
function claudeCodeGlyph(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('class', 'ic vendor-ic--claude')
  svg.setAttribute('aria-hidden', 'true')
  svg.innerHTML =
    '<rect x="3" y="4" width="18" height="16" rx="0"/><path d="m8 10.5 3 2.5-3 2.5M13 15.5h4"/>'
  return svg
}

/** "사용할 AI 도구" 드롭다운 트리거·옵션에 쓰는 20px 내외 벤더 아이콘. */
export function vendorIcon(name: VendorIconName): SVGSVGElement {
  if (name === 'codex') return mkFilledIcon(CODEX_PATH)
  if (name === 'cursor') return mkFilledIcon(CURSOR_PATH)
  return claudeCodeGlyph()
}
