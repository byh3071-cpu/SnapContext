import { describe, expect, it } from 'vitest'

interface Lib {
  BOOTSTRAP_STEPS: readonly string[]
  DOGFOOD_VARS_FILENAME: string
  assertLogHasNoUserToken: (payload: unknown) => void
  stripSecretsForLog: (value: unknown) => unknown
  isAllowedDogfoodRequestUrl: (url: string) => boolean
  assertAllowedDogfoodRequestUrl: (url: string, label?: string) => void
  buildDogfoodDevVarsContent: (secrets: {
    TOKEN_SIGNING_SECRET: string
    SNAPCONTEXT_BEARER_TOKEN: string
    DOGFOOD_BOOT_NONCE: string
  }) => string
  validateDogfoodDevVars: (vars: Record<string, string>) => void
  parseDevVars: (text: string) => Record<string, string>
  dogfoodHealthUrl: (nonce: string) => string
  resolveWranglerDevArgs: (envFileName?: string) => string[]
  assertMcpToolNotFound: (jsonRpc: unknown) => void
  assertInvalidTokenRetrySequence: (
    requests: { url: string; method?: string; status?: number }[]
  ) => void
  serializePidMeta: (meta: {
    pid: number
    startedAtMs: number
    cmd: string
    bootNonce: string
    identity?: unknown
  }) => string
  parsePidMeta: (text: string) => {
    pid: number
    startedAtMs: number
    cmd: string
    bootNonce: string
  }
  normalizeCommandIdentity: (
    cmd: string,
    opts?: { cwd?: string }
  ) => {
    nodeExecutable: string
    wranglerEntry: string
    subcommand: string
    ip: string
    port: string
    envFile: string
    cwd: string
    hasLocalFlag: boolean
  }
  healthcheckUrl: () => string
}

async function loadLib(): Promise<Lib> {
  const specifier = '../scripts/dogfood/lib.mjs'
  return (await import(specifier)) as Lib
}

describe('R2 B1 토큰 로그 제거', () => {
  it('성공·실패 로그 모두 userToken 원문을 거부한다', async () => {
    const { stripSecretsForLog, assertLogHasNoUserToken } = await loadLib()
    const dirty = {
      ok: true,
      golden: { userToken: 'sc_AAAAAAAAAAAAAA.BBBBBBBBBBBBBB', captureId: 'x' }
    }
    expect(() => assertLogHasNoUserToken(dirty)).toThrow(/userToken|sc_/)
    const clean = stripSecretsForLog(dirty)
    expect(() => assertLogHasNoUserToken(clean)).not.toThrow()
    expect(JSON.stringify(clean)).not.toMatch(/sc_AAAAAAAAAAAAAA/)
  })
})

describe('R2 B2 PID identity', () => {
  it('숫자-only stale PID 파일을 거부한다', async () => {
    const { parsePidMeta } = await loadLib()
    expect(() => parsePidMeta('13304')).toThrow(/구형 PID|identity/)
  })

  it('진단 PID 메타를 직렬화·파싱한다', async () => {
    const { serializePidMeta, parsePidMeta, normalizeCommandIdentity } = await loadLib()
    const cmd =
      '"C:/n/node.exe" C:/n/node_modules/wrangler/bin/wrangler.js dev --ip 127.0.0.1 --port 8787 --local --env-file .dev.vars.dogfood --persist-to C:/n/worker/.dogfood-runtime/.wrangler/state'
    const identity = normalizeCommandIdentity(cmd, {
      cwd: 'C:/n/worker/.dogfood-runtime'
    })
    const meta = {
      pid: 4242,
      startedAtMs: 1_700_000_000_000,
      cmd,
      bootNonce: 'abcdabcdabcdabcd',
      identity
    }
    const parsed = parsePidMeta(serializePidMeta(meta))
    expect(parsed.pid).toBe(4242)
    expect(parsed.bootNonce).toBe('abcdabcdabcdabcd')
  })
})

describe('R2 M1/M3 dogfood vars + health', () => {
  it('BOOTSTRAP 에 port free 와 dogfood health 단계가 있다', async () => {
    const { BOOTSTRAP_STEPS } = await loadLib()
    expect(BOOTSTRAP_STEPS).toContain('assertPortFree')
    expect(BOOTSTRAP_STEPS).toContain('waitDogfoodHealthcheck')
    expect(BOOTSTRAP_STEPS).not.toContain('waitHealthcheck')
  })

  it('dogfood vars 는 LOCAL marker 와 nonce 를 요구한다', async () => {
    const { buildDogfoodDevVarsContent, parseDevVars, validateDogfoodDevVars } =
      await loadLib()
    const body = buildDogfoodDevVarsContent({
      TOKEN_SIGNING_SECRET: 'a'.repeat(64),
      SNAPCONTEXT_BEARER_TOKEN: 'b'.repeat(64),
      DOGFOOD_BOOT_NONCE: 'c'.repeat(32)
    })
    expect(body).toContain('DOGFOOD_LOCAL=1')
    expect(body).toContain('DOGFOOD_BOOT_NONCE=')
    validateDogfoodDevVars(parseDevVars(body))
    expect(() =>
      validateDogfoodDevVars({
        TOKEN_SIGNING_SECRET: 'a'.repeat(64),
        SNAPCONTEXT_BEARER_TOKEN: 'b'.repeat(64)
      })
    ).toThrow(/DOGFOOD_LOCAL/)
  })

  it('wrangler 인자는 --env-file .dev.vars.dogfood 와 --local 이다', async () => {
    const { resolveWranglerDevArgs, DOGFOOD_VARS_FILENAME, dogfoodHealthUrl } =
      await loadLib()
    const args = resolveWranglerDevArgs()
    expect(args).toContain('--env-file')
    expect(args).toContain(DOGFOOD_VARS_FILENAME)
    expect(args).toContain('--local')
    expect(dogfoodHealthUrl('n'.repeat(16))).toContain('/dogfood-health?nonce=')
  })

  it('구형 healthcheckUrl 은 즉시 실패한다', async () => {
    const { healthcheckUrl } = await loadLib()
    expect(() => healthcheckUrl()).toThrow(/폐기/)
  })
})

describe('R2 M2 네트워크 allowlist', () => {
  it('localhost/data/chrome-extension 만 허용한다', async () => {
    const { isAllowedDogfoodRequestUrl, assertAllowedDogfoodRequestUrl } = await loadLib()
    expect(isAllowedDogfoodRequestUrl('http://127.0.0.1:8787/x')).toBe(true)
    expect(isAllowedDogfoodRequestUrl('data:image/png;base64,aa')).toBe(true)
    expect(isAllowedDogfoodRequestUrl('chrome-extension://abc/x')).toBe(true)
    expect(isAllowedDogfoodRequestUrl('https://evil.workers.dev')).toBe(false)
    expect(() =>
      assertAllowedDogfoodRequestUrl('https://example.com')
    ).toThrow(/비허용/)
  })
})

describe('R2 M4 NOT_FOUND 구조 검증', () => {
  it('isError true + text 정확 일치만 통과한다', async () => {
    const { assertMcpToolNotFound } = await loadLib()
    expect(() =>
      assertMcpToolNotFound({
        jsonrpc: '2.0',
        id: 1,
        result: {
          isError: true,
          content: [{ type: 'text', text: 'NOT_FOUND' }]
        }
      })
    ).not.toThrow()
    expect(() =>
      assertMcpToolNotFound({
        result: { isError: true, content: [{ type: 'text', text: 'NOT_FOUND owner=x' }] }
      })
    ).toThrow(/NOT_FOUND/)
    expect(() =>
      assertMcpToolNotFound({
        result: { content: [{ type: 'text', text: 'NOT_FOUND' }] }
      })
    ).toThrow(/isError/)
  })
})

describe('R2 N1 invalid-token 시퀀스', () => {
  it('401 → /token → 성공 POST → 추가 POST 0 을 강제한다', async () => {
    const { assertInvalidTokenRetrySequence } = await loadLib()
    const ok = [
      { url: 'http://127.0.0.1:8787/captures', method: 'POST', status: 401 },
      { url: 'http://127.0.0.1:8787/token', method: 'POST', status: 200 },
      { url: 'http://127.0.0.1:8787/captures', method: 'POST', status: 201 }
    ]
    expect(() => assertInvalidTokenRetrySequence(ok)).not.toThrow()
    expect(() =>
      assertInvalidTokenRetrySequence([
        { url: 'http://127.0.0.1:8787/captures', method: 'POST', status: 201 }
      ])
    ).toThrow(/시퀀스/)
    expect(() =>
      assertInvalidTokenRetrySequence([
        ...ok,
        { url: 'http://127.0.0.1:8787/captures', method: 'POST', status: 201 }
      ])
    ).toThrow(/추가/)
  })
})
