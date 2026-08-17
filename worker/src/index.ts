import { resolveMcpAuth } from './auth'
import { rejectInvalidOrigin } from './origin'
import { generateUserToken } from './token'
import { allowTokenRequest } from './token-rate-limit'
import { handlePrivateCaptureRoutes } from './private-capture-routes'
import type { Env } from './env'

export type { Env }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
}

// ADR-015 2차(0.4.4): id 만 알면 열리던 무서명 경로 3종(POST /upload·GET /i/{id}·
// GET /s/{id})을 영구 폐쇄한다. 인증 실패(401/403)가 아니라 라우트 자체가 사라졌다는
// 신호라 410 을 쓴다. 본문은 확장이 실제로 읽지 않으므로(2xx 아니면 토스트만) 길게
// 설명하지 않는다.
const LEGACY_GONE_MSG =
  '이 주소는 더 이상 제공되지 않습니다. 최신 버전의 확장 프로그램을 사용해 주세요.'

/** POST /upload·GET /i/{id}·GET /s/{id} 판정. 메서드 무관(OPTIONS 포함)하게 전부 410. */
function isLegacyGonePath(pathname: string): boolean {
  return (
    pathname === '/upload' ||
    pathname.startsWith('/i/') ||
    pathname.startsWith('/s/')
  )
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS }
  })
}

function textResponse(
  body: string,
  status: number,
  extra: Record<string, string> = {}
): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', ...CORS, ...extra }
  })
}

export default {
  async fetch(
    req: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(req.url)

    // dogfood 부트 정체 — DOGFOOD_LOCAL=1 AND nonce 일치만 200 (그 외 일반 404)
    if (req.method === 'GET' && url.pathname === '/dogfood-health') {
      const expected = env.DOGFOOD_BOOT_NONCE
      const given = url.searchParams.get('nonce')
      const localOk = env.DOGFOOD_LOCAL === '1'
      if (
        localOk &&
        expected !== undefined &&
        expected.length > 0 &&
        given !== null &&
        given === expected
      ) {
        return jsonResponse({ ok: true, dogfood: true })
      }
      return textResponse('Not found', 404)
    }

    // 레거시 폐쇄 경로는 라우팅·전역 OPTIONS 분기보다 먼저 걸러낸다 — 아래 전역
    // OPTIONS 가 이 경로들의 preflight 에 200 을 주는 불일치를 원천 차단한다.
    // env 를 전혀 건드리지 않는다: BUCKET/D1 조회 코드는 여기서 이미 존재하지 않는다.
    if (isLegacyGonePath(url.pathname)) {
      return textResponse(LEGACY_GONE_MSG, 410, { 'Cache-Control': 'no-store' })
    }

    // MCP 분기 우선 — 전역 OPTIONS 보다 먼저 (MAJOR-1). Origin 불일치는 OPTIONS 포함 403
    if (url.pathname === '/mcp') {
      const originDenied = rejectInvalidOrigin(req)
      if (originDenied) return originDenied

      if (req.method === 'OPTIONS') {
        // preflight 는 Authorization 미포함 — Origin 통과 시에만 허용, bearer 는 실제 MCP 메서드에서
        return new Response(null, { headers: CORS })
      }

      const auth = await resolveMcpAuth(req, env)
      if (auth instanceof Response) return auth

      // agents/mcp 는 cloudflare: 워커 모듈 — 게이트 통과 후에만 로드
      const { handleMcpRequest } = await import('./mcp-route')
      return handleMcpRequest(req, env, ctx, auth)
    }

    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: CORS })
    }

    const privateCaptureResponse = await handlePrivateCaptureRoutes(
      req,
      env,
      url
    )
    if (privateCaptureResponse !== null) return privateCaptureResponse

    // 토큰 발급: POST /token — chrome-extension Origin 필수
    if (req.method === 'POST' && url.pathname === '/token') {
      const origin = req.headers.get('Origin') ?? ''
      if (!origin.startsWith('chrome-extension://')) {
        return textResponse('Forbidden origin', 403)
      }
      const secret = env.TOKEN_SIGNING_SECRET
      if (secret === undefined || secret.length === 0) {
        return textResponse(
          'Server misconfigured: TOKEN_SIGNING_SECRET unset',
          500
        )
      }
      const ip = req.headers.get('CF-Connecting-IP') ?? ''
      if (!allowTokenRequest(ip)) {
        return textResponse('Too many token requests', 429)
      }
      const token = await generateUserToken(secret)
      return jsonResponse({ token })
    }

    return textResponse('Not found', 404)
  }
}
