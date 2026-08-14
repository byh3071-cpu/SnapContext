/**
 * dogfood:up 순수 로직 (가드 · env 조립 · 단계 순서).
 * 오케스트레이션은 up.mjs 가 담당한다.
 */
import { randomBytes } from 'node:crypto'

/** @typedef {{ TOKEN_SIGNING_SECRET: string, SNAPCONTEXT_BEARER_TOKEN: string }} LocalSecrets */

export const LOCAL_HOST = '127.0.0.1'
export const LOCAL_PORT = 8787
export const LOCAL_UPLOAD_ENDPOINT = `http://${LOCAL_HOST}:${LOCAL_PORT}`

export const BOOTSTRAP_STEPS = Object.freeze([
  'ensureDevVars',
  'applyMigrations',
  'startWranglerDev',
  'waitHealthcheck',
  'viteBuild',
  'prepareChromeProfile'
])

/**
 * workers.dev · 비로컬 URL 을 즉시 거부한다. 조용한 우회 없음.
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
 * 업로드 엔드포인트는 http://127.0.0.1:8787 만 허용 (localhost 별칭도 거부).
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
 * @param {LocalSecrets} secrets
 * @returns {string}
 */
export function buildDevVarsContent(secrets) {
  if (!secrets.TOKEN_SIGNING_SECRET || !secrets.SNAPCONTEXT_BEARER_TOKEN) {
    throw new Error('.dev.vars 필수 키 누락: TOKEN_SIGNING_SECRET, SNAPCONTEXT_BEARER_TOKEN')
  }
  assertNoProductionUrl(secrets.TOKEN_SIGNING_SECRET, 'TOKEN_SIGNING_SECRET')
  assertNoProductionUrl(secrets.SNAPCONTEXT_BEARER_TOKEN, 'SNAPCONTEXT_BEARER_TOKEN')
  return (
    `TOKEN_SIGNING_SECRET=${secrets.TOKEN_SIGNING_SECRET}\n` +
    `SNAPCONTEXT_BEARER_TOKEN=${secrets.SNAPCONTEXT_BEARER_TOKEN}\n`
  )
}

/**
 * @param {() => string} [randomHexFn] 32바이트 hex(64자) 생성기
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
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim()
    out[key] = value
  }
  return out
}

/**
 * 기존 파일이 불완전하거나 production URL 을 담으면 즉시 실패 (자동 보완 금지).
 * @param {Record<string, string>} vars
 */
export function validateExistingDevVars(vars) {
  const required = ['TOKEN_SIGNING_SECRET', 'SNAPCONTEXT_BEARER_TOKEN']
  for (const key of required) {
    const value = vars[key]
    if (value === undefined || value.length === 0) {
      throw new Error(`worker/.dev.vars 필수 키 누락: ${key}`)
    }
    assertNoProductionUrl(value, key)
  }
}

/**
 * 호출자 env 의 VITE_UPLOAD_ENDPOINT 를 덮어쓰고 로컬만 남긴다.
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
 * @returns {string[]}
 */
export function resolveWranglerDevArgs() {
  return [
    'wrangler',
    'dev',
    '--ip',
    LOCAL_HOST,
    '--port',
    String(LOCAL_PORT),
    '--local',
    '--show-interactive-dev-session',
    'false'
  ]
}

/**
 * @returns {string[]}
 */
export function resolveMigrationsArgs() {
  return ['wrangler', 'd1', 'migrations', 'apply', 'snapcontext-captures', '--local']
}

/**
 * @returns {string}
 */
export function healthcheckUrl() {
  return LOCAL_UPLOAD_ENDPOINT + '/'
}
