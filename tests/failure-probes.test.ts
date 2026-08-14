import { describe, expect, it } from 'vitest'

interface FailureLogic {
  MAX_TOKEN_RETRIES: number
  countWorkerRequests: (
    requests: { url: string; method?: string }[],
    baseUrl?: string
  ) => number
  countCapturesPosts: (
    requests: { url: string; method?: string }[],
    baseUrl?: string
  ) => number
  assertZeroWorkerRequests: (
    requests: { url: string }[],
    baseUrl?: string
  ) => number
  isSoftSuccessMessage: (message: string) => boolean
  assertExplicitFailureMessage: (message: string) => void
  assertInvalidTokenRetrySequence: (
    requests: { url: string; method?: string; status?: number }[]
  ) => void
  assertMcpToolNotFound: (jsonRpc: unknown) => void
  summarizeVerifyResults: (
    results: { name: string; pass: boolean; detail?: string }[],
    productionRequestCount?: number
  ) => {
    total: number
    passed: number
    failed: number
    ok: boolean
    productionRequestCount: number
  }
  countProductionUrls: (urls: string[]) => number
  assertLogHasNoUserToken: (payload: unknown) => void
  stripSecretsForLog: (value: unknown) => unknown
}

async function loadLib(): Promise<FailureLogic> {
  const specifier = '../tests/e2e/dogfood/lib/failure-probe-logic.mjs'
  return (await import(specifier)) as FailureLogic
}

describe('dogfood failure-probe 순수 로직', () => {
  it('동의 취소 후 Worker 요청 0건을 강제한다', async () => {
    const { assertZeroWorkerRequests, countWorkerRequests } = await loadLib()
    expect(assertZeroWorkerRequests([])).toBe(0)
    const hit = [{ url: 'http://127.0.0.1:8787/captures', method: 'POST' }]
    expect(countWorkerRequests(hit)).toBe(1)
    expect(() => assertZeroWorkerRequests(hit)).toThrow(/0건/)
  })

  it('workers.dev 요청 URL은 카운트 전에 throw 한다', async () => {
    const { countWorkerRequests } = await loadLib()
    expect(() =>
      countWorkerRequests([{ url: 'https://x.workers.dev/captures' }])
    ).toThrow(/비허용|workers\.dev|production/i)
  })

  it('명시적 실패 메시지만 통과하고 가짜 성공은 거부한다', async () => {
    const { assertExplicitFailureMessage, isSoftSuccessMessage } = await loadLib()
    expect(isSoftSuccessMessage('서버에 저장했습니다.')).toBe(true)
    expect(() => assertExplicitFailureMessage('서버에 저장했습니다.')).toThrow(
      /가짜 성공/
    )
    expect(() =>
      assertExplicitFailureMessage('네트워크 오류가 발생했습니다.')
    ).not.toThrow()
  })

  it('invalid-token 시퀀스와 MAX_TOKEN_RETRIES=1 계약을 고정한다', async () => {
    const { assertInvalidTokenRetrySequence, MAX_TOKEN_RETRIES } = await loadLib()
    expect(MAX_TOKEN_RETRIES).toBe(1)
    expect(() =>
      assertInvalidTokenRetrySequence([
        { url: 'http://127.0.0.1:8787/captures', method: 'POST', status: 401 },
        { url: 'http://127.0.0.1:8787/token', method: 'POST', status: 200 },
        { url: 'http://127.0.0.1:8787/captures', method: 'POST', status: 201 }
      ])
    ).not.toThrow()
  })

  it('MCP NOT_FOUND 구조 검증과 verify 요약을 판정한다', async () => {
    const {
      assertMcpToolNotFound,
      summarizeVerifyResults,
      countProductionUrls,
      stripSecretsForLog,
      assertLogHasNoUserToken
    } = await loadLib()
    expect(() =>
      assertMcpToolNotFound({
        result: { isError: true, content: [{ type: 'text', text: 'NOT_FOUND' }] }
      })
    ).not.toThrow()
    expect(countProductionUrls(['http://127.0.0.1:8787/x', 'https://a.workers.dev'])).toBe(
      1
    )
    const summary = summarizeVerifyResults(
      [
        { name: 'a', pass: true },
        { name: 'b', pass: true }
      ],
      0
    )
    expect(summary).toMatchObject({ total: 2, passed: 2, failed: 0, ok: true })
    const redacted = stripSecretsForLog({
      golden: { userToken: 'sc_AAAA.BBBBBBBB' }
    })
    expect(() => assertLogHasNoUserToken(redacted)).not.toThrow()
  })
})
