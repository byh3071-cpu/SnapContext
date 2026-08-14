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
/** V4: stale PID 기반 destructive kill 완전 제거 */
export const STALE_PID_KILL_DISABLED = true
/** 진단 비교용(kill 근거 아님). exact CreationDate 만 허용 */
export const CREATION_DATE_MAX_SKEW_MS = 0


/** M2: generic worker/.dev.vars 는 이동·삭제 금지. runtime cwd + --env-file 만. */
export const DEV_VARS_POLICY = Object.freeze({
  neverRenameGeneric: true,
  useRuntimeCwd: true,
  restoreAsideOnBoot: true
})

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
 * @param {{ persistTo?: string }} [options]
 * @returns {string[]}
 */
export function resolveWranglerDevArgs(envFileName = DOGFOOD_VARS_FILENAME, options = {}) {
  /** @type {string[]} */
  const args = [
    'wrangler',
    'dev',
    '--ip',
    LOCAL_HOST,
    '--port',
    String(LOCAL_PORT),
    '--local',
    '--env-file',
    envFileName
  ]
  if (typeof options.persistTo === 'string' && options.persistTo.length > 0) {
    args.push('--persist-to', options.persistTo)
  }
  args.push('--show-interactive-dev-session', 'false')
  return args
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
 * 진단용 PID 메타 — kill 근거 아님.
 * @param {{
 *   pid: number,
 *   supervisorPid?: number,
 *   bootNonce: string,
 *   cmd: string,
 *   startedAtMs?: number,
 *   identity?: CommandIdentity
 * }} meta
 */
export function serializePidMeta(meta) {
  if (!Number.isInteger(meta.pid) || meta.pid <= 0) throw new Error('pid 메타 오류')
  if (typeof meta.bootNonce !== 'string' || meta.bootNonce.length < 16) {
    throw new Error('pid 메타 bootNonce 필요')
  }
  return JSON.stringify({
    kind: 'dogfood-diagnostic',
    stalePidKillDisabled: STALE_PID_KILL_DISABLED,
    pid: meta.pid,
    supervisorPid: meta.supervisorPid ?? null,
    bootNonce: meta.bootNonce,
    cmd: meta.cmd,
    startedAtMs: meta.startedAtMs ?? null,
    identity: meta.identity ?? null,
    note: '진단 전용. stale PID kill 금지. 종료는 supervise stop 신호(nonce)만.'
  })
}

/**
 * @typedef {{
 *   nodeExecutable: string,
 *   wranglerEntry: string,
 *   subcommand: string,
 *   ip: string,
 *   port: string,
 *   hasLocalFlag: boolean,
 *   envFile: string,
 *   cwd: string
 * }} CommandIdentity
 */

/**
 * @param {string} p
 */
function normalizePathToken(p) {
  return p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

/**
 * @param {string} p
 */
export function quoteCmdArg(p) {
  if (p.length === 0) return '""'
  if (/[\s"]/g.test(p)) return `"${p.replace(/"/g, '\\"')}"`
  return p
}

/**
 * @param {string} executable
 * @param {string[]} argv
 */
export function formatDiagnosticCommand(executable, argv) {
  return [quoteCmdArg(executable), ...argv.map(quoteCmdArg)].join(' ')
}

/**
 * 분리된 executable/argv 로 identity 생성 — 공백 경로 안전.
 * @param {string} executable
 * @param {string[]} argv
 * @param {{ cwd?: string }} [opts]
 * @returns {CommandIdentity}
 */
export function buildCommandIdentityFromArgv(executable, argv, opts = {}) {
  if (typeof executable !== 'string' || executable.trim().length === 0) {
    throw new Error('executable 없음 — fail-closed')
  }
  if (!Array.isArray(argv)) throw new Error('argv 배열 필요')
  const nodeExecutable = normalizePathToken(executable)
  if (!/node(\.exe)?$/i.test(nodeExecutable)) {
    throw new Error(`node executable 아님: ${executable}`)
  }
  const tokens = argv.map((a) => String(a).replace(/\\/g, '/'))
  const wranglerEntryRaw = tokens.find((t) => /\/wrangler\/bin\/wrangler\.js$/i.test(t))
  if (!wranglerEntryRaw) {
    throw new Error('wrangler 진입 파일 없음(정확한 경로 필요)')
  }
  const wranglerEntry = normalizePathToken(wranglerEntryRaw)
  const wranglerIdx = tokens.findIndex((t) => /\/wrangler\/bin\/wrangler\.js$/i.test(t))
  const subcommand = tokens[wranglerIdx + 1]
  if (subcommand !== 'dev') {
    throw new Error(`subcommand 가 dev 아님: ${subcommand}`)
  }
  const ipIdx = tokens.indexOf('--ip')
  if (ipIdx < 0 || ipIdx + 1 >= tokens.length) throw new Error('명령에 --ip 없음')
  const ip = tokens[ipIdx + 1]
  if (ip !== LOCAL_HOST) throw new Error(`--ip 가 ${LOCAL_HOST} 가 아님: ${ip}`)
  const portIdx = tokens.indexOf('--port')
  if (portIdx < 0 || portIdx + 1 >= tokens.length) throw new Error('명령에 --port 없음')
  const port = tokens[portIdx + 1]
  if (port !== String(LOCAL_PORT)) throw new Error(`--port 가 ${LOCAL_PORT} 가 아님: ${port}`)
  if (!tokens.includes('--local')) throw new Error('명령에 --local 없음')
  const envIdx = tokens.indexOf('--env-file')
  if (envIdx < 0 || envIdx + 1 >= tokens.length) throw new Error('명령에 --env-file 없음')
  const envFile = tokens[envIdx + 1].split('/').pop() ?? ''
  if (envFile !== DOGFOOD_VARS_FILENAME) {
    throw new Error(`--env-file 값이 ${DOGFOOD_VARS_FILENAME} 가 아님: ${envFile}`)
  }
  let cwd = typeof opts.cwd === 'string' ? normalizePathToken(opts.cwd) : ''
  if (!cwd) {
    const persistIdx = tokens.indexOf('--persist-to')
    if (persistIdx >= 0 && persistIdx + 1 < tokens.length) {
      const persist = normalizePathToken(tokens[persistIdx + 1])
      const marker = '/.dogfood-runtime/'
      const at = persist.indexOf(marker)
      if (at >= 0) cwd = persist.slice(0, at + '/.dogfood-runtime'.length)
    }
  }
  if (!cwd || !cwd.endsWith('.dogfood-runtime')) {
    throw new Error(`runtime cwd 식별 실패: ${cwd}`)
  }
  return {
    nodeExecutable,
    wranglerEntry,
    subcommand: 'dev',
    ip,
    port,
    hasLocalFlag: true,
    envFile,
    cwd
  }
}

/**
 * 레거시/진단 — 따옴표 토큰 파싱 후 buildCommandIdentityFromArgv 위임.
 * @param {string} cmd
 * @param {{ cwd?: string }} [opts]
 * @returns {CommandIdentity}
 */
export function normalizeCommandIdentity(cmd, opts = {}) {
  if (typeof cmd !== 'string' || cmd.trim().length === 0) {
    throw new Error('명령줄을 읽지 못함 — fail-closed')
  }
  const tokens = []
  const re = /"([^"]+)"|(\S+)/g
  let m
  while ((m = re.exec(cmd)) !== null) {
    tokens.push(m[1] ?? m[2])
  }
  if (tokens.length < 2) throw new Error(`명령 토큰 부족: ${cmd}`)
  return buildCommandIdentityFromArgv(tokens[0], tokens.slice(1), opts)
}

/**
 * @param {CommandIdentity} a
 * @param {CommandIdentity} b
 */
export function commandIdentitiesEqual(a, b) {
  return (
    a.nodeExecutable === b.nodeExecutable &&
    a.wranglerEntry === b.wranglerEntry &&
    a.subcommand === b.subcommand &&
    a.ip === b.ip &&
    a.port === b.port &&
    a.hasLocalFlag === b.hasLocalFlag &&
    a.envFile === b.envFile &&
    a.cwd === b.cwd
  )
}

/**
 * @param {string} text
 */
export function parsePidMeta(text) {
  const trimmed = text.trim()
  if (/^\d+$/.test(trimmed)) {
    throw new Error('구형 PID 파일(숫자만) — dogfood:up 을 다시 실행하라')
  }
  const raw = JSON.parse(trimmed)
  if (
    !raw ||
    typeof raw !== 'object' ||
    !Number.isInteger(raw.pid) ||
    typeof raw.bootNonce !== 'string'
  ) {
    throw new Error('PID 메타 형식 오류')
  }
  return {
    pid: raw.pid,
    supervisorPid: typeof raw.supervisorPid === 'number' ? raw.supervisorPid : null,
    startedAtMs: typeof raw.startedAtMs === 'number' ? raw.startedAtMs : null,
    cmd: typeof raw.cmd === 'string' ? raw.cmd : '',
    bootNonce: raw.bootNonce,
    identity: raw.identity ?? null,
    kind: raw.kind ?? null
  }
}

/**
 * @param {string} bootNonce
 * @param {{ fetchFn?: typeof auditedFetch, recorder?: string[] }} [opts]
 */
export async function assertDogfoodHealthOwnership(bootNonce, opts = {}) {
  const fetchFn = opts.fetchFn ?? auditedFetch
  const recorder = opts.recorder ?? []
  const url = dogfoodHealthUrl(bootNonce)
  const res = await fetchFn(url, { method: 'GET' }, recorder)
  if (res.status !== 200) {
    throw new Error(`health 소유권 확인 실패 status=${res.status}`)
  }
  const body = /** @type {{ ok?: boolean, dogfood?: boolean }} */ (await res.json())
  if (body.ok !== true || body.dogfood !== true) {
    throw new Error(`health 소유권 본문 불일치: ${JSON.stringify(body)}`)
  }
}

/**
 * Node fetch 감사 wrapper — 매 hop + 최종 URL localhost allowlist.
 * @param {string | URL | Request} input
 * @param {RequestInit} [init]
 * @param {string[]} [recorder]
 * @returns {Promise<Response>}
 */
export async function auditedFetch(input, init = {}, recorder = []) {
  const initialUrl =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url
  let url = initialUrl
  assertAllowedDogfoodRequestUrl(url, 'audited-fetch')
  recorder.push(url)

  /** @type {RequestInit} */
  const baseInit = { ...init, redirect: 'manual' }
  let res = await fetch(url, baseInit)
  let hops = 0
  while (res.status >= 300 && res.status < 400 && hops < 10) {
    const loc = res.headers.get('location')
    if (loc == null || loc.length === 0) {
      throw new Error(`redirect Location 없음 status=${res.status}`)
    }
    const next = new URL(loc, url).href
    assertAllowedDogfoodRequestUrl(next, `audited-fetch-hop-${hops}`)
    recorder.push(next)
    url = next
    hops += 1
    // POST 본문 재전송은 하지 않는다 — dogfood 경로는 3xx 를 기대하지 않음
    res = await fetch(url, {
      method: 'GET',
      headers: init.headers,
      redirect: 'manual'
    })
  }
  if (res.url && res.url.length > 0) {
    assertAllowedDogfoodRequestUrl(res.url, 'audited-fetch-final')
    recorder.push(res.url)
  }
  assertAllowedDogfoodRequestUrl(url, 'audited-fetch-current')
  return res
}
