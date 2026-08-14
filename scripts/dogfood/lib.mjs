/**
 * dogfood:up 순수 로직 (가드 · env 조립 · 단계 순서 · R2 hardening).
 */
import { randomBytes } from 'node:crypto'

/** @typedef {{ TOKEN_SIGNING_SECRET: string, SNAPCONTEXT_BEARER_TOKEN: string }} LocalSecrets */

export const LOCAL_HOST = '127.0.0.1'
export const LOCAL_PORT = 8787
export const LOCAL_UPLOAD_ENDPOINT = `http://${LOCAL_HOST}:${LOCAL_PORT}`
export const DOGFOOD_VARS_FILENAME = '.dev.vars.dogfood'
export const DOGFOOD_LOCAL_MARKER = '1'

export const BOOTSTRAP_STEPS = Object.freeze([
  'assertPortFree',
  'ensureDogfoodVars',
  'applyMigrations',
  'startWranglerDev',
  'waitDogfoodHealthcheck',
  'viteBuild',
  'prepareChromeProfile'
])

/**
 * @param {string} value
 * @param {string} [label]
 */
export function assertNoProductionUrl(value, label = 'url') {
  if (typeof value !== 'string') {
    throw new Error(`${label}: 문자열 URL만 검사한다`)
  }
  const trimmed = value.trim()
  if (trimmed.length === 0) return

  const lower = trimmed.toLowerCase()
  if (lower.includes('workers.dev')) {
    throw new Error(`production URL 금지 (${label}): workers.dev 감지 → ${trimmed}`)
  }
  if (lower.includes('cloudflareworkers.com')) {
    throw new Error(`production URL 금지 (${label}): cloudflareworkers.com 감지 → ${trimmed}`)
  }

  if (/^https?:\/\//i.test(trimmed)) {
    let parsed
    try {
      parsed = new URL(trimmed)
    } catch {
      throw new Error(`${label}: URL 파싱 실패 → ${trimmed}`)
    }
    const host = parsed.hostname.toLowerCase()
    if (host !== '127.0.0.1' && host !== 'localhost' && host !== '::1') {
      throw new Error(`production URL 금지 (${label}): 로컬이 아닌 호스트 ${host}`)
    }
  }
}

/**
 * @param {string} url
 */
export function assertLocalUploadEndpoint(url) {
  assertNoProductionUrl(url, 'VITE_UPLOAD_ENDPOINT')
  const normalized = url.replace(/\/$/, '')
  if (normalized !== LOCAL_UPLOAD_ENDPOINT) {
    throw new Error(
      `로컬 업로드 엔드포인트만 허용 (VITE_UPLOAD_ENDPOINT=${LOCAL_UPLOAD_ENDPOINT}): got ${url}`
    )
  }
}

/**
 * @param {string} url
 * @returns {boolean}
 */
export function isAllowedDogfoodRequestUrl(url) {
  if (typeof url !== 'string' || url.length === 0) return false
  if (
    url.startsWith('data:') ||
    url.startsWith('blob:') ||
    url.startsWith('chrome-extension:') ||
    url.startsWith('about:')
  ) {
    return true
  }
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  const host = parsed.hostname.toLowerCase()
  if (host !== '127.0.0.1' && host !== 'localhost' && host !== '::1') {
    return false
  }
  return (
    parsed.protocol === 'http:' ||
    parsed.protocol === 'https:' ||
    parsed.protocol === 'ws:' ||
    parsed.protocol === 'wss:'
  )
}

/**
 * @param {string} url
 * @param {string} [label]
 */
export function assertAllowedDogfoodRequestUrl(url, label = 'request') {
  if (!isAllowedDogfoodRequestUrl(url)) {
    throw new Error(`비허용 네트워크 (${label}): ${url}`)
  }
  if (/^https?:\/\//i.test(url) || /^wss?:\/\//i.test(url)) {
    assertNoProductionUrl(url.replace(/^ws/i, 'http'), label)
  }
}

/**
 * @param {LocalSecrets & { DOGFOOD_BOOT_NONCE: string }} secrets
 * @returns {string}
 */
export function buildDogfoodDevVarsContent(secrets) {
  if (!secrets.TOKEN_SIGNING_SECRET || !secrets.SNAPCONTEXT_BEARER_TOKEN) {
    throw new Error('dogfood vars 필수 키 누락: TOKEN_SIGNING_SECRET, SNAPCONTEXT_BEARER_TOKEN')
  }
  if (!secrets.DOGFOOD_BOOT_NONCE || secrets.DOGFOOD_BOOT_NONCE.length < 16) {
    throw new Error('DOGFOOD_BOOT_NONCE 누락 또는 너무 짧음')
  }
  assertNoProductionUrl(secrets.TOKEN_SIGNING_SECRET, 'TOKEN_SIGNING_SECRET')
  assertNoProductionUrl(secrets.SNAPCONTEXT_BEARER_TOKEN, 'SNAPCONTEXT_BEARER_TOKEN')
  return (
    `DOGFOOD_LOCAL=${DOGFOOD_LOCAL_MARKER}\n` +
    `DOGFOOD_BOOT_NONCE=${secrets.DOGFOOD_BOOT_NONCE}\n` +
    `TOKEN_SIGNING_SECRET=${secrets.TOKEN_SIGNING_SECRET}\n` +
    `SNAPCONTEXT_BEARER_TOKEN=${secrets.SNAPCONTEXT_BEARER_TOKEN}\n`
  )
}

/** @deprecated dogfood 는 buildDogfoodDevVarsContent 사용 */
export function buildDevVarsContent(secrets) {
  return buildDogfoodDevVarsContent({
    ...secrets,
    DOGFOOD_BOOT_NONCE: randomBytes(16).toString('hex')
  })
}

/**
 * @param {() => string} [randomHexFn]
 * @returns {LocalSecrets}
 */
export function generateLocalSecrets(randomHexFn = () => randomBytes(32).toString('hex')) {
  const a = randomHexFn()
  const b = randomHexFn()
  if (a.length < 32 || b.length < 32) {
    throw new Error('로컬 시크릿 생성 실패: 엔트로피 부족')
  }
  if (a === b) {
    throw new Error('로컬 시크릿 생성 실패: 두 값이 동일함')
  }
  return {
    TOKEN_SIGNING_SECRET: a,
    SNAPCONTEXT_BEARER_TOKEN: b
  }
}

export function generateBootNonce(randomHexFn = () => randomBytes(16).toString('hex')) {
  const nonce = randomHexFn()
  if (nonce.length < 16) throw new Error('boot nonce 엔트로피 부족')
  return nonce
}

/**
 * @param {string} text
 * @returns {Record<string, string>}
 */
export function parseDevVars(text) {
  /** @type {Record<string, string>} */
  const out = {}
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed.length === 0 || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) {
      throw new Error(`.dev.vars 형식 오류: ${trimmed}`)
    }
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
  }
  return out
}

/**
 * @param {Record<string, string>} vars
 */
export function validateDogfoodDevVars(vars) {
  if (vars.DOGFOOD_LOCAL !== DOGFOOD_LOCAL_MARKER) {
    throw new Error('dogfood vars 에 DOGFOOD_LOCAL=1 marker 가 없다')
  }
  if (!vars.DOGFOOD_BOOT_NONCE || vars.DOGFOOD_BOOT_NONCE.length < 16) {
    throw new Error('dogfood vars 에 DOGFOOD_BOOT_NONCE 가 없다')
  }
  for (const key of ['TOKEN_SIGNING_SECRET', 'SNAPCONTEXT_BEARER_TOKEN']) {
    const value = vars[key]
    if (value === undefined || value.length === 0) {
      throw new Error(`dogfood vars 필수 키 누락: ${key}`)
    }
    assertNoProductionUrl(value, key)
  }
}

/** @deprecated */
export function validateExistingDevVars(vars) {
  validateDogfoodDevVars(vars)
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [baseEnv]
 * @returns {NodeJS.ProcessEnv}
 */
export function assembleViteBuildEnv(baseEnv = process.env) {
  /** @type {NodeJS.ProcessEnv} */
  const env = { ...baseEnv }
  env.VITE_UPLOAD_ENDPOINT = LOCAL_UPLOAD_ENDPOINT
  assertLocalUploadEndpoint(env.VITE_UPLOAD_ENDPOINT)
  return env
}

/**
 * @param {string} [envFileName]
 * @returns {string[]}
 */
export function resolveWranglerDevArgs(envFileName = DOGFOOD_VARS_FILENAME) {
  return [
    'wrangler',
    'dev',
    '--ip',
    LOCAL_HOST,
    '--port',
    String(LOCAL_PORT),
    '--local',
    '--env-file',
    envFileName,
    '--show-interactive-dev-session',
    'false'
  ]
}

export function resolveMigrationsArgs() {
  return ['wrangler', 'd1', 'migrations', 'apply', 'snapcontext-captures', '--local']
}

/**
 * @param {string} nonce
 * @returns {string}
 */
export function dogfoodHealthUrl(nonce) {
  if (!nonce || nonce.length < 16) throw new Error('health nonce 필요')
  return `${LOCAL_UPLOAD_ENDPOINT}/dogfood-health?nonce=${encodeURIComponent(nonce)}`
}

export function healthcheckUrl() {
  throw new Error('healthcheckUrl() 폐기 — dogfoodHealthUrl(nonce) 를 사용하라')
}

/**
 * @param {unknown} value
 * @returns {unknown}
 */
export function stripSecretsForLog(value) {
  if (Array.isArray(value)) return value.map((item) => stripSecretsForLog(item))
  if (value && typeof value === 'object') {
    /** @type {Record<string, unknown>} */
    const out = {}
    for (const [key, child] of Object.entries(value)) {
      if (/token|secret|bearer|authorization/i.test(key)) {
        out[key] = '[redacted]'
        continue
      }
      out[key] = stripSecretsForLog(child)
    }
    return out
  }
  if (typeof value === 'string' && /sc_[A-Za-z0-9._-]{10,}/.test(value)) {
    return value.replace(/sc_[A-Za-z0-9._-]{10,}/g, 'sc_[redacted]')
  }
  return value
}

/**
 * @param {unknown} payload
 */
export function assertLogHasNoUserToken(payload) {
  const text = JSON.stringify(payload)
  if (/"userToken"\s*:\s*"sc_/.test(text)) {
    throw new Error('로그에 userToken 원문이 포함되면 안 된다')
  }
  if (/sc_[A-Za-z0-9]{8,}\.[A-Za-z0-9._-]{8,}/.test(text)) {
    throw new Error('로그에 sc_ 토큰 원문이 포함되면 안 된다')
  }
}

/**
 * @param {unknown} jsonRpc
 */
export function assertMcpToolNotFound(jsonRpc) {
  if (!jsonRpc || typeof jsonRpc !== 'object' || Array.isArray(jsonRpc)) {
    throw new Error('MCP 응답이 객체가 아니다')
  }
  const root = /** @type {Record<string, unknown>} */ (jsonRpc)
  if (root.error != null) {
    throw new Error('MCP transport error — tool result NOT_FOUND 가 아니다')
  }
  const result = root.result
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new Error('MCP result 누락')
  }
  const tool = /** @type {Record<string, unknown>} */ (result)
  if (tool.isError !== true) {
    throw new Error('NOT_FOUND 는 result.isError === true 여야 한다')
  }
  const content = tool.content
  if (!Array.isArray(content) || content.length !== 1) {
    throw new Error('NOT_FOUND content 는 text 1개여야 한다')
  }
  const item = content[0]
  if (!item || typeof item !== 'object') {
    throw new Error('NOT_FOUND content 항목 형식 오류')
  }
  const row = /** @type {Record<string, unknown>} */ (item)
  if (row.type !== 'text' || row.text !== 'NOT_FOUND') {
    throw new Error(`content text 가 정확히 NOT_FOUND 가 아님: ${String(row.text)}`)
  }
}

/**
 * @param {{ url: string, method?: string, status?: number }[]} requests
 * @param {string} [baseUrl]
 */
export function assertInvalidTokenRetrySequence(requests, baseUrl = LOCAL_UPLOAD_ENDPOINT) {
  assertNoProductionUrl(baseUrl, 'worker-base')
  const base = baseUrl.replace(/\/$/, '')
  const ordered = []
  for (const r of requests) {
    if (typeof r?.url !== 'string' || !r.url.startsWith(base)) continue
    const method = (r.method ?? 'GET').toUpperCase()
    if (method === 'POST' && (r.url.includes('/captures') || r.url.includes('/token'))) {
      ordered.push({ url: r.url, method, status: r.status })
    }
  }
  if (ordered.length < 3) {
    throw new Error(`invalid-token 시퀀스 부족: ${JSON.stringify(ordered)}`)
  }
  const first = ordered[0]
  if (!first.url.includes('/captures') || first.status !== 401) {
    throw new Error(`첫 요청은 /captures 401 이어야 한다: ${JSON.stringify(first)}`)
  }
  const second = ordered[1]
  if (!second.url.includes('/token') || (second.status != null && second.status !== 200)) {
    throw new Error(`두 번째는 /token 200 이어야 한다: ${JSON.stringify(second)}`)
  }
  const third = ordered[2]
  if (
    !third.url.includes('/captures') ||
    (third.status != null && third.status !== 201 && third.status !== 200)
  ) {
    throw new Error(`세 번째는 /captures 성공이어야 한다: ${JSON.stringify(third)}`)
  }
  const extra = ordered.slice(3).filter((r) => r.url.includes('/captures'))
  if (extra.length > 0) {
    throw new Error(`추가 /captures POST 금지: ${JSON.stringify(extra)}`)
  }
}

/**
 * @param {{ pid: number, startedAtMs: number, cmd: string, bootNonce: string }} meta
 */
export function serializePidMeta(meta) {
  if (!Number.isInteger(meta.pid) || meta.pid <= 0) throw new Error('pid 메타 오류')
  if (!meta.cmd.includes('wrangler')) throw new Error('pid 메타 cmd 에 wrangler 없음')
  return JSON.stringify(meta)
}

/**
 * @param {string} text
 */
export function parsePidMeta(text) {
  const trimmed = text.trim()
  if (/^\d+$/.test(trimmed)) {
    throw new Error('구형 PID 파일(숫자만) — identity 메타 없음. dogfood:up 을 다시 실행하라')
  }
  const raw = JSON.parse(trimmed)
  if (
    !raw ||
    typeof raw !== 'object' ||
    !Number.isInteger(raw.pid) ||
    typeof raw.startedAtMs !== 'number' ||
    typeof raw.cmd !== 'string' ||
    typeof raw.bootNonce !== 'string'
  ) {
    throw new Error('PID 메타 형식 오류')
  }
  if (!raw.cmd.includes('wrangler')) throw new Error('PID 메타 cmd 검증 실패')
  return {
    pid: raw.pid,
    startedAtMs: raw.startedAtMs,
    cmd: raw.cmd,
    bootNonce: raw.bootNonce
  }
}

/**
 * @param {{ pid: number, startedAtMs: number, cmd: string }} expected
 * @param {{ pid: number, startedAtMs?: number, cmd?: string } | null} live
 */
export function assertProcessIdentityMatch(expected, live) {
  if (live == null) throw new Error(`프로세스 없음 pid=${expected.pid} (stale)`)
  if (live.pid !== expected.pid) throw new Error('PID 불일치')
  if (typeof live.cmd === 'string' && !live.cmd.includes('wrangler')) {
    throw new Error(`command line 에 wrangler 없음: ${live.cmd}`)
  }
  if (
    typeof live.startedAtMs === 'number' &&
    Math.abs(live.startedAtMs - expected.startedAtMs) > 120_000
  ) {
    throw new Error('프로세스 시작 시각이 PID 메타와 크게 어긋남 — stale/재사용 가능')
  }
}
