/**
 * dogfood failure-probe 순수 로직.
 * decideTokenRetry 복제 없음 — assertInvalidTokenRetrySequence(공유) 사용.
 */
import {
  assertAllowedDogfoodRequestUrl,
  assertInvalidTokenRetrySequence,
  assertLogHasNoUserToken,
  assertMcpToolNotFound,
  assertNoProductionUrl,
  isAllowedDogfoodRequestUrl,
  LOCAL_UPLOAD_ENDPOINT,
  stripSecretsForLog
} from '../../../../scripts/dogfood/lib.mjs'

export {
  assertInvalidTokenRetrySequence,
  assertMcpToolNotFound,
  stripSecretsForLog,
  assertLogHasNoUserToken,
  isAllowedDogfoodRequestUrl,
  assertAllowedDogfoodRequestUrl
}

export const MAX_TOKEN_RETRIES = 1

/**
 * @param {{ url: string, method?: string }[]} requests
 * @param {string} [baseUrl]
 */
export function countWorkerRequests(requests, baseUrl = LOCAL_UPLOAD_ENDPOINT) {
  assertNoProductionUrl(baseUrl, 'worker-base')
  const normalized = baseUrl.replace(/\/$/, '')
  return requests.filter((r) => {
    if (typeof r?.url !== 'string') return false
    assertAllowedDogfoodRequestUrl(r.url, 'request-url')
    return r.url.startsWith(normalized)
  }).length
}

/**
 * @param {{ url: string, method?: string }[]} requests
 * @param {string} [baseUrl]
 */
export function countCapturesPosts(requests, baseUrl = LOCAL_UPLOAD_ENDPOINT) {
  assertNoProductionUrl(baseUrl, 'worker-base')
  const normalized = baseUrl.replace(/\/$/, '')
  return requests.filter((r) => {
    if (typeof r?.url !== 'string') return false
    assertAllowedDogfoodRequestUrl(r.url, 'request-url')
    const method = (r.method ?? 'GET').toUpperCase()
    return method === 'POST' && r.url.startsWith(`${normalized}/captures`)
  }).length
}

/**
 * @param {{ url: string }[]} requests
 * @param {string} [baseUrl]
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
 */
export function isSoftSuccessMessage(message) {
  if (typeof message !== 'string') return false
  return /저장했습니다|저장 완료|성공했습니다|saved successfully/i.test(message)
}

/**
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
 * @param {{ name: string, pass: boolean, detail?: string }[]} results
 * @param {number} [productionRequestCount]
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
 */
export function countProductionUrls(urls) {
  let n = 0
  for (const url of urls) {
    if (typeof url !== 'string') continue
    if (!isAllowedDogfoodRequestUrl(url)) n += 1
  }
  return n
}
