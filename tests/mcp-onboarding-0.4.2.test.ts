import { describe, expect, it } from 'vitest'
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
    expect(message).toBe('내 AI에 저장됨 · 30일 후 삭제 · 연결한 AI 도구에서 조회')
    expect(message).not.toMatch(/링크|익명/)
  })
})
