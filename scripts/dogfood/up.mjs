#!/usr/bin/env node
/**
 * SnapContext dogfood:up — 로컬 전용 원클릭 부트스트랩.
 * production / workers.dev URL 이 보이면 즉시 실패한다.
 */
import { spawn, execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  BOOTSTRAP_STEPS,
  LOCAL_HOST,
  LOCAL_PORT,
  LOCAL_UPLOAD_ENDPOINT,
  assertLocalUploadEndpoint,
  assertNoProductionUrl,
  assembleViteBuildEnv,
  buildDevVarsContent,
  generateLocalSecrets,
  healthcheckUrl,
  parseDevVars,
  resolveMigrationsArgs,
  resolveWranglerDevArgs,
  validateExistingDevVars
} from './lib.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '../..')
const WORKER_DIR = join(ROOT, 'worker')
const DEV_VARS_PATH = join(WORKER_DIR, '.dev.vars')
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
 * Windows 에서 npx.cmd + execFileSync 는 EINVAL 이 난다.
 * node 로 패키지 bin 을 직접 실행한다.
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

function ensureDevVars() {
  assertLocalUploadEndpoint(LOCAL_UPLOAD_ENDPOINT)
  if (!existsSync(DEV_VARS_PATH)) {
    const secrets = generateLocalSecrets()
    const body = buildDevVarsContent(secrets)
    writeFileSync(DEV_VARS_PATH, body, 'utf8')
    log(`worker/.dev.vars 생성 (로컬 전용 시크릿)`)
    return
  }
  const text = readFileSync(DEV_VARS_PATH, 'utf8')
  const parsed = parseDevVars(text)
  validateExistingDevVars(parsed)
  log('worker/.dev.vars 기존 파일 검증 OK')
}

function applyMigrations() {
  const args = resolveMigrationsArgs()
  // resolveMigrationsArgs[0] === 'wrangler' → bin 직접 실행 시 제외
  const wranglerArgs = args.slice(1)
  log(`D1 마이그레이션 적용: wrangler ${wranglerArgs.join(' ')}`)
  runNodeBin(WRANGLER_JS, wranglerArgs, { cwd: WORKER_DIR })
}

/**
 * @returns {import('node:child_process').ChildProcess}
 */
function startWranglerDev() {
  const args = resolveWranglerDevArgs()
  for (const a of args) {
    if (typeof a === 'string') assertNoProductionUrl(a, 'wrangler-arg')
  }
  const wranglerArgs = args.slice(1)
  log(`wrangler 기동: wrangler ${wranglerArgs.join(' ')}`)
  assertBin(WRANGLER_JS, 'wrangler')
  const child = spawn(process.execPath, [WRANGLER_JS, ...wranglerArgs], {
    cwd: WORKER_DIR,
    stdio: 'ignore',
    env: process.env,
    windowsHide: true,
    // 부모 종료 후에도 로컬 워커 유지
    detached: true
  })
  child.on('error', (err) => {
    console.error(`[dogfood:up] wrangler spawn 실패: ${err.message}`)
  })
  writeFileSync(PID_PATH, String(child.pid ?? ''), 'utf8')
  return child
}

/**
 * @param {number} timeoutMs
 */
async function waitHealthcheck(timeoutMs = 90_000) {
  const url = healthcheckUrl()
  assertNoProductionUrl(url, 'healthcheck')
  const started = Date.now()
  let lastError = /** @type {unknown} */ (null)
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url, { method: 'GET' })
      // 워커가 응답만 하면 OK (루트는 404 Not found)
      if (res.status > 0) {
        log(`헬스체크 OK (${res.status}) ${url}`)
        return
      }
    } catch (err) {
      lastError = err
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  const detail = lastError instanceof Error ? lastError.message : String(lastError)
  throw new Error(`헬스체크 실패 (${timeoutMs}ms): ${url} — ${detail}`)
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

  ensureDevVars()
  applyMigrations()
  const child = startWranglerDev()
  try {
    await waitHealthcheck()
  } catch (err) {
    child.kill('SIGTERM')
    throw err
  }
  viteBuild()
  prepareChromeProfile()

  // 부모 종료 후에도 wrangler 유지 (unref). PID 는 .dogfood-wrangler.pid
  child.unref()
  log('부트스트랩 완료. wrangler 는 백그라운드에서 계속 동작한다.')
  log(`중지: PID 파일 ${PID_PATH} 참고 후 프로세스 종료`)
}

main().catch((err) => {
  console.error('[dogfood:up] 실패:', err instanceof Error ? err.message : err)
  process.exitCode = 1
})
