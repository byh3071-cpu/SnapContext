/**
 * dogfood failure-probe 순수 로직 (카운터 · 재시도 한도 · 실패 메시지 · 요약).
 */
import { assertNoProductionUrl, LOCAL_UPLOAD_ENDPOINT } from '../../../../scripts/dogfood/lib.mjs'

/** 401 이후 토큰 재발급 재시도 최대 횟수 (saveCaptureWithToken 계약) */
export const MAX_TOKEN_RETRIES = 1

/**
 * @param {{ url: string, method?: string }[]} requests
 * @param {string} [baseUrl]
 * @returns {number}
 */
export function countWorkerRequests(requests, baseUrl = LOCAL_UPLOAD_ENDPOINT) {
  assertNoProductionUrl(baseUrl, 'worker-base')
  const normalized = baseUrl.replace(/\/$/, '')
  return requests.filter((r) => {
    if (typeof r?.url !== 'string') return false
    assertNoProductionUrl(r.url, 'request-url')
    return r.url.startsWith(normalized)
  }).length
}

/**
 * @param {{ url: string, method?: string }[]} requests
 * @param {string} [baseUrl]
 * @returns {number}
 */
export function countCapturesPosts(requests, baseUrl = LOCAL_UPLOAD_ENDPOINT) {
  assertNoProductionUrl(baseUrl, 'worker-base')
  const normalized = baseUrl.replace(/\/$/, '')
  return requests.filter((r) => {
    if (typeof r?.url !== 'string') return false
    assertNoProductionUrl(r.url, 'request-url')
    const method = (r.method ?? 'GET').toUpperCase()
    return method === 'POST' && r.url.startsWith(`${normalized}/captures`)
  }).length
}

/**
 * 동의 취소 후 Worker 요청이 0건인지 검증.
 * @param {{ url: string }[]} requests
 * @param {string} [baseUrl]
 * @returns {number}
 */
export function assertZeroWorkerRequests(requests, baseUrl = LOCAL_UPLOAD_ENDPOINT) {
  const n = countWorkerRequests(requests, baseUrl)
  if (n !== 0) {
    throw new Error(`동의 취소 후 Worker 요청은 0건이어야 한다 (실제 ${n}건)`)
  }
  return n
}

/**
 * @param {string} message
 * @returns {boolean}
 */
export function isSoftSuccessMessage(message) {
  if (typeof message !== 'string') return false
  return /저장했습니다|저장 완료|성공했습니다|saved successfully/i.test(message)
}

/**
 * 조용한 성공/fallback 없이 명시적 실패 문구인지 검증.
 * @param {string} message
 */
export function assertExplicitFailureMessage(message) {
  if (typeof message !== 'string' || message.trim().length === 0) {
    throw new Error('명시적 실패 메시지가 없다')
  }
  if (isSoftSuccessMessage(message)) {
    throw new Error(`가짜 성공 메시지 금지: ${message}`)
  }
  if (!/오류|실패|네트워크|거부|Unauthorized|401|연결/i.test(message)) {
    throw new Error(`명시적 실패로 보기 어려움: ${message}`)
  }
}

/**
 * 401 재시도 정책: 최대 1회만 retry.
 * @param {{ status: number, retriesUsed: number, maxRetries?: number }} input
 * @returns {{ action: 'retry' | 'stop', retriesUsed: number }}
 */
export function decideTokenRetry(input) {
  const maxRetries = input.maxRetries ?? MAX_TOKEN_RETRIES
  if (input.status !== 401) {
    return { action: 'stop', retriesUsed: input.retriesUsed }
  }
  if (input.retriesUsed >= maxRetries) {
    return { action: 'stop', retriesUsed: input.retriesUsed }
  }
  return { action: 'retry', retriesUsed: input.retriesUsed + 1 }
}

/**
 * /captures POST 횟수가 (최초 1 + 재시도 한도)를 넘으면 무한 재시도로 본다.
 * @param {number} postCount
 * @param {number} [maxRetries]
 */
export function assertCapturesPostRetryBudget(postCount, maxRetries = MAX_TOKEN_RETRIES) {
  if (!Number.isInteger(postCount) || postCount < 0) {
    throw new Error(`POST 횟수가 정수여야 한다: ${postCount}`)
  }
  const maxAllowed = 1 + maxRetries
  if (postCount > maxAllowed) {
    throw new Error(
      `토큰 재시도 한도 초과: /captures POST ${postCount}회 > 최대 ${maxAllowed}회`
    )
  }
}

/**
 * @param {string} text
 * @returns {boolean}
 */
export function isGenericNotFound(text) {
  return typeof text === 'string' && /\bNOT_FOUND\b/.test(text)
}

/**
 * @param {string} text
 */
export function assertGenericNotFound(text) {
  if (!isGenericNotFound(text)) {
    throw new Error(`generic NOT_FOUND 아님: ${String(text).slice(0, 200)}`)
  }
}

/**
 * @param {{ name: string, pass: boolean, detail?: string }[]} results
 * @returns {{ total: number, passed: number, failed: number, ok: boolean, productionRequestCount: number }}
 */
export function summarizeVerifyResults(results, productionRequestCount = 0) {
  const passed = results.filter((r) => r.pass).length
  const failed = results.filter((r) => !r.pass).length
  if (productionRequestCount !== 0) {
    throw new Error(`production 요청 0건이어야 한다 (실제 ${productionRequestCount})`)
  }
  return {
    total: results.length,
    passed,
    failed,
    ok: failed === 0,
    productionRequestCount
  }
}

/**
 * @param {string[]} urls
 * @returns {number} production URL 건수
 */
export function countProductionUrls(urls) {
  let n = 0
  for (const url of urls) {
    if (typeof url !== 'string') continue
    const lower = url.toLowerCase()
    if (lower.includes('workers.dev') || lower.includes('cloudflareworkers.com')) {
      n += 1
    }
  }
  return n
}
