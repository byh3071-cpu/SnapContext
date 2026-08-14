#!/usr/bin/env node
/**
 * SnapContext dogfood:up — 로컬 전용 원클릭 부트스트랩 (R2 hardened).
 */
import { spawn, execFileSync } from 'node:child_process'
import { createServer } from 'node:net'
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  BOOTSTRAP_STEPS,
  DOGFOOD_VARS_FILENAME,
  LOCAL_HOST,
  LOCAL_PORT,
  LOCAL_UPLOAD_ENDPOINT,
  assertLocalUploadEndpoint,
  assertNoProductionUrl,
  assembleViteBuildEnv,
  buildDogfoodDevVarsContent,
  dogfoodHealthUrl,
  generateBootNonce,
  generateLocalSecrets,
  parseDevVars,
  resolveMigrationsArgs,
  resolveWranglerDevArgs,
  serializePidMeta,
  validateDogfoodDevVars
} from './lib.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '../..')
const WORKER_DIR = join(ROOT, 'worker')
const DEV_VARS_PATH = join(WORKER_DIR, '.dev.vars')
const DOGFOOD_VARS_PATH = join(WORKER_DIR, DOGFOOD_VARS_FILENAME)
const PROFILE_DIR = join(ROOT, 'tests/e2e/dogfood/profile')
const PID_PATH = join(ROOT, '.dogfood-wrangler.pid')
const WRANGLER_JS = join(WORKER_DIR, 'node_modules/wrangler/bin/wrangler.js')
const VITE_JS = join(ROOT, 'node_modules/vite/bin/vite.js')

function log(msg) {
  console.log(`[dogfood:up] ${msg}`)
}

function assertBin(path, label) {
  if (!existsSync(path)) {
    throw new Error(`${label} 바이너리 없음: ${path} (의존성 설치 후 재실행)`)
  }
}

/**
 * @param {string} binJs
 * @param {string[]} args
 * @param {import('node:child_process').ExecFileSyncOptions} [opts]
 */
function runNodeBin(binJs, args, opts = {}) {
  assertBin(binJs, binJs)
  execFileSync(process.execPath, [binJs, ...args], {
    stdio: 'inherit',
    ...opts
  })
}

/**
 * @param {string} host
 * @param {number} port
 */
function assertPortFree(host, port) {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', (err) => {
      reject(
        new Error(
          `포트 ${host}:${port} 사용 중 — dogfood:up 중단 (${err instanceof Error ? err.message : err})`
        )
      )
    })
    server.listen(port, host, () => {
      server.close((closeErr) => {
        if (closeErr) reject(closeErr)
        else resolve(undefined)
      })
    })
  })
}

/**
 * 기존 worker/.dev.vars 재사용 금지. 있으면 명시적으로 치운다(백업 rename).
 */
function refuseOrQuarantinePlainDevVars() {
  if (!existsSync(DEV_VARS_PATH)) return
  const bak = join(WORKER_DIR, `.dev.vars.aside-dogfood-${Date.now()}`)
  renameSync(DEV_VARS_PATH, bak)
  log(`기존 worker/.dev.vars 를 dogfood 격리 백업으로 이동: ${bak}`)
}

/**
 * @returns {{ bootNonce: string }}
 */
function ensureDogfoodVars() {
  assertLocalUploadEndpoint(LOCAL_UPLOAD_ENDPOINT)
  refuseOrQuarantinePlainDevVars()
  const secrets = generateLocalSecrets()
  const bootNonce = generateBootNonce()
  const body = buildDogfoodDevVarsContent({ ...secrets, DOGFOOD_BOOT_NONCE: bootNonce })
  writeFileSync(DOGFOOD_VARS_PATH, body, 'utf8')
  validateDogfoodDevVars(parseDevVars(body))
  log(`worker/${DOGFOOD_VARS_FILENAME} 생성 (DOGFOOD_LOCAL marker)`)
  return { bootNonce }
}

function applyMigrations() {
  const args = resolveMigrationsArgs()
  const wranglerArgs = args.slice(1)
  log(`D1 마이그레이션 적용: wrangler ${wranglerArgs.join(' ')}`)
  runNodeBin(WRANGLER_JS, wranglerArgs, { cwd: WORKER_DIR })
}

/**
 * @param {string} bootNonce
 * @returns {import('node:child_process').ChildProcess}
 */
function startWranglerDev(bootNonce) {
  const args = resolveWranglerDevArgs(DOGFOOD_VARS_FILENAME)
  for (const a of args) {
    if (typeof a === 'string') assertNoProductionUrl(a, 'wrangler-arg')
  }
  const wranglerArgs = args.slice(1)
  log(`wrangler 기동: wrangler ${wranglerArgs.join(' ')}`)
  assertBin(WRANGLER_JS, 'wrangler')
  const startedAtMs = Date.now()
  const cmd = `${process.execPath} ${WRANGLER_JS} ${wranglerArgs.join(' ')}`
  const child = spawn(process.execPath, [WRANGLER_JS, ...wranglerArgs], {
    cwd: WORKER_DIR,
    stdio: 'ignore',
    env: process.env,
    windowsHide: true,
    detached: true
  })
  /** @type {{ code: number | null, signal: NodeJS.Signals | null } | null} */
  let exited = null
  child.on('exit', (code, signal) => {
    exited = { code, signal }
    console.error(`[dogfood:up] wrangler 종료 감지 code=${code} signal=${signal}`)
  })
  child.on('error', (err) => {
    console.error(`[dogfood:up] wrangler spawn 실패: ${err.message}`)
  })
  // @ts-expect-error attach monitor
  child.__dogfoodExited = () => exited
  const pid = child.pid
  if (pid == null) throw new Error('wrangler pid 없음')
  writeFileSync(
    PID_PATH,
    serializePidMeta({
      pid,
      startedAtMs,
      cmd,
      bootNonce
    }),
    'utf8'
  )
  return child
}

/**
 * @param {import('node:child_process').ChildProcess} child
 * @param {string} bootNonce
 * @param {number} timeoutMs
 */
async function waitDogfoodHealthcheck(child, bootNonce, timeoutMs = 90_000) {
  const url = dogfoodHealthUrl(bootNonce)
  assertNoProductionUrl(url, 'healthcheck')
  const started = Date.now()
  let lastError = /** @type {unknown} */ (null)
  while (Date.now() - started < timeoutMs) {
    // @ts-expect-error monitor
    const exited = typeof child.__dogfoodExited === 'function' ? child.__dogfoodExited() : null
    if (exited) {
      throw new Error(`wrangler 조기 종료: ${JSON.stringify(exited)}`)
    }
    try {
      const res = await fetch(url, { method: 'GET' })
      if (res.status === 200) {
        const body = /** @type {{ ok?: boolean, dogfood?: boolean }} */ (await res.json())
        if (body.ok === true && body.dogfood === true) {
          log(`dogfood 헬스체크 OK ${url}`)
          return
        }
        throw new Error(`헬스 응답 본문 불일치: ${JSON.stringify(body)}`)
      }
      lastError = new Error(`status=${res.status}`)
    } catch (err) {
      lastError = err
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  const detail = lastError instanceof Error ? lastError.message : String(lastError)
  throw new Error(`dogfood 헬스체크 실패 (${timeoutMs}ms): ${url} — ${detail}`)
}

function viteBuild() {
  const env = assembleViteBuildEnv(process.env)
  assertLocalUploadEndpoint(env.VITE_UPLOAD_ENDPOINT ?? '')
  log(`vite build (VITE_UPLOAD_ENDPOINT=${env.VITE_UPLOAD_ENDPOINT})`)
  runNodeBin(VITE_JS, ['build'], { cwd: ROOT, env })
}

function prepareChromeProfile() {
  mkdirSync(PROFILE_DIR, { recursive: true })
  log(`Chrome profile 준비: ${PROFILE_DIR}`)
}

async function main() {
  log(`단계: ${BOOTSTRAP_STEPS.join(' → ')}`)
  log(`로컬 엔드포인트 고정: ${LOCAL_UPLOAD_ENDPOINT} (${LOCAL_HOST}:${LOCAL_PORT})`)

  await assertPortFree(LOCAL_HOST, LOCAL_PORT)
  log(`포트 여유 확인 OK ${LOCAL_HOST}:${LOCAL_PORT}`)
  const { bootNonce } = ensureDogfoodVars()
  applyMigrations()
  const child = startWranglerDev(bootNonce)
  try {
    await waitDogfoodHealthcheck(child, bootNonce)
  } catch (err) {
    try {
      if (child.pid) process.kill(child.pid)
    } catch {
      // 종료 실패는 원인 에러를 가리지 않는다
    }
    if (existsSync(PID_PATH)) unlinkSync(PID_PATH)
    throw err
  }
  viteBuild()
  prepareChromeProfile()
  child.unref()
  log('부트스트랩 완료. wrangler 는 백그라운드에서 계속 동작한다.')
  log(`중지: identity PID 메타 ${PID_PATH}`)
}

main().catch((err) => {
  console.error('[dogfood:up] 실패:', err instanceof Error ? err.message : err)
  process.exitCode = 1
})
