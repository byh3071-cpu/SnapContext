import { describe, expect, it } from 'vitest'
import registerMcpScript from '../scripts/register-mcp.ps1?raw'
import {
  MCP_CLIENTS,
  buildMcpSetup,
  type McpClient
} from '../src/utils/mcp-onboarding'
import {
  buildPrivateSaveConsentMessage,
  buildPrivateSaveSuccessMessage
} from '../src/utils/share-expiry'

describe('사람이 읽는 0.4.2 연결 안내', () => {
  it('등록 스크립트는 production 기본값과 -Local URL을 구분하고 토큰을 먼저 검증한다', () => {
    expect(registerMcpScript).toContain('[switch]$Local')
    expect(registerMcpScript).toMatch(/\$url\s*=\s*if\s*\(\$Local\)/)
    expect(registerMcpScript).toContain('http://127.0.0.1:8787/mcp')
    expect(registerMcpScript).toContain(
      'https://snapcontext-worker.byh3071-26a.workers.dev/mcp'
    )
    expect(registerMcpScript).toContain('Authorization: Bearer ${')
    expect(registerMcpScript).toContain(
      '--bearer-token-env-var $tokenVariable'
    )

    const userValidation = registerMcpScript.indexOf(
      'SNAPCONTEXT_MCP_TOKEN.StartsWith'
    )
    const adminValidation = registerMcpScript.indexOf(
      'SNAPCONTEXT_MCP_ADMIN_TOKEN.StartsWith'
    )
    const registration = registerMcpScript.indexOf('claude mcp add')
    expect(userValidation).toBeGreaterThanOrEqual(0)
    expect(adminValidation).toBeGreaterThanOrEqual(0)
    expect(registration).toBeGreaterThan(userValidation)
    expect(registration).toBeGreaterThan(adminValidation)
  })

  it('Claude Code·Cursor·Codex 모두 토큰 원문 대신 환경변수를 참조한다', () => {
    expect(MCP_CLIENTS).toEqual(['claude-code', 'cursor', 'codex'])
    for (const client of MCP_CLIENTS) {
      const setup = buildMcpSetup(
        client as McpClient,
        'https://worker.example/'
      )
      expect(setup).toContain('SNAPCONTEXT_MCP_TOKEN')
      expect(setup).toContain('https://worker.example/mcp')
      expect(setup).toContain('snap_history')
      expect(setup).toMatch(/재시작|restart/i)
      expect(setup).not.toMatch(/sc_[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)
    }
  })

  it('저장 동의는 전송·보관·AI 제공자 접근과 공개 링크 부재를 함께 알린다', () => {
    const message = buildPrivateSaveConsentMessage(7)
    expect(message).toContain('서버로 전송')
    expect(message).toContain('Cloudflare')
    expect(message).toContain('선택한 AI')
    expect(message).toContain('공개 링크')
    expect(message).toContain('7일 후 삭제')
  })

  it('성공 문구는 링크 복사나 익명을 말하지 않는다', () => {
    const message = buildPrivateSaveSuccessMessage(30)
    expect(message).toBe(
      "내 AI에 저장됨(30일 후 삭제) — Claude Code·Cursor에서 '방금 캡처 분석해줘'라고 하면 읽습니다."
    )
    expect(message).toContain('30일 후 삭제')
    expect(message.includes('\n')).toBe(false)
    expect(message).not.toMatch(/링크|익명/)
  })
})
