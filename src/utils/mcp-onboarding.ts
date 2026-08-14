export const MCP_CLIENTS = ['claude-code', 'cursor', 'codex'] as const
export type McpClient = (typeof MCP_CLIENTS)[number]

function normalizeBase(base: string): string {
  return base.replace(/\/+$/, '')
}

function clientSetup(client: McpClient, mcpUrl: string): string {
  if (client === 'claude-code') {
    return [
      'Claude Code의 사용자 MCP 설정에 아래 서버를 추가하세요.',
      JSON.stringify(
        {
          mcpServers: {
            snapcontext: {
              type: 'http',
              url: mcpUrl,
              headers: {
                Authorization: 'Bearer ${SNAPCONTEXT_MCP_TOKEN}'
              }
            }
          }
        },
        null,
        2
      )
    ].join('\n')
  }
  if (client === 'cursor') {
    return [
      'Cursor의 MCP 설정에 아래 서버를 추가하세요.',
      JSON.stringify(
        {
          mcpServers: {
            snapcontext: {
              url: mcpUrl,
              headers: {
                Authorization: 'Bearer ${env:SNAPCONTEXT_MCP_TOKEN}'
              }
            }
          }
        },
        null,
        2
      )
    ].join('\n')
  }
  return `codex mcp add snapcontext --url ${mcpUrl} --bearer-token-env-var SNAPCONTEXT_MCP_TOKEN`
}

/** 토큰 원문을 명령이나 설정에 넣지 않는 클라이언트별 연결 안내다. */
export function buildMcpSetup(client: McpClient, base: string): string {
  const mcpUrl = `${normalizeBase(base)}/mcp`
  return [
    '1. 복사한 토큰을 운영체제 환경 변수 SNAPCONTEXT_MCP_TOKEN에 저장하세요.',
    '2. 새 환경 변수를 읽도록 터미널과 AI 도구를 완전히 재시작하세요.',
    '3. 아래 설정을 적용하세요. 토큰 원문은 명령이나 설정 파일에 붙여넣지 않습니다.',
    clientSetup(client, mcpUrl),
    '4. 연결 후 snap_history를 호출해 최근 캡처 목록이 보이는지 확인하세요.'
  ].join('\n\n')
}
