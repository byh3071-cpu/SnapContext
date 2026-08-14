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
  decideTokenRetry: (input: {
    status: number
    retriesUsed: number
    maxRetries?: number
  }) => { action: 'retry' | 'stop'; retriesUsed: number }
  assertCapturesPostRetryBudget: (postCount: number, maxRetries?: number) => void
  isGenericNotFound: (text: string) => boolean
  assertGenericNotFound: (text: string) => void
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
}

async function loadLib(): Promise<FailureLogic> {
  const specifier = '../tests/e2e/dogfood/lib/failure-probe-logic.mjs'
  return (await import(specifier)) as FailureLogic
}

describe('dogfood failure-probe 순수 로직', () => {
  it('동의 취소 후 Worker 요청 0건을 강제한다', async () => {
    const { assertZeroWorkerRequests, countWorkerRequests } = await loadLib()
    const empty: { url: string }[] = []
    expect(assertZeroWorkerRequests(empty)).toBe(0)
    const hit = [{ url: 'http://127.0.0.1:8787/captures', method: 'POST' }]
    expect(countWorkerRequests(hit)).toBe(1)
    expect(() => assertZeroWorkerRequests(hit)).toThrow(/0건/)
  })

  it('workers.dev 요청 URL은 카운트 전에 throw 한다', async () => {
    const { countWorkerRequests } = await loadLib()
    expect(() =>
      countWorkerRequests([{ url: 'https://x.workers.dev/captures' }])
    ).toThrow(/workers\.dev|production/i)
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

  it('401 재시도는 최대 1회로 제한한다', async () => {
    const { decideTokenRetry, assertCapturesPostRetryBudget, MAX_TOKEN_RETRIES } =
      await loadLib()
    expect(MAX_TOKEN_RETRIES).toBe(1)
    expect(decideTokenRetry({ status: 401, retriesUsed: 0 })).toEqual({
      action: 'retry',
      retriesUsed: 1
    })
    expect(decideTokenRetry({ status: 401, retriesUsed: 1 })).toEqual({
      action: 'stop',
      retriesUsed: 1
    })
    expect(decideTokenRetry({ status: 500, retriesUsed: 0 }).action).toBe('stop')
    expect(() => assertCapturesPostRetryBudget(2)).not.toThrow()
    expect(() => assertCapturesPostRetryBudget(3)).toThrow(/한도 초과/)
  })

  it('generic NOT_FOUND와 verify 요약을 판정한다', async () => {
    const {
      assertGenericNotFound,
      isGenericNotFound,
      summarizeVerifyResults,
      countProductionUrls
    } = await loadLib()
    expect(isGenericNotFound('NOT_FOUND')).toBe(true)
    expect(() => assertGenericNotFound('missing id')).toThrow(/NOT_FOUND/)
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
    expect(() =>
      summarizeVerifyResults([{ name: 'a', pass: true }], 1)
    ).toThrow(/production/)
  })
})
