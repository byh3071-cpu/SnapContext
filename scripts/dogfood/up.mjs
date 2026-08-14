#!/usr/bin/env node
/**
 * SnapContext dogfood:up — 로컬 전용 원클릭 부트스트랩 (V2 hardened).
 */
import { spawn, execFileSync } from 'node:child_process'
import { createServer } from 'node:net'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  BOOTSTRAP_STEPS,
  DEV_VARS_POLICY,
  DOGFOOD_VARS_FILENAME,
  LOCAL_HOST,
  LOCAL_PORT,
  LOCAL_UPLOAD_ENDPOINT,
  assertLocalUploadEndpoint,
  assertNoProductionUrl,
  assembleViteBuildEnv,
  auditedFetch,
  buildCommandIdentityFromArgv,
  buildDogfoodDevVarsContent,
  dogfoodHealthUrl,
  formatDiagnosticCommand,
  generateBootNonce,
  generateLocalSecrets,
  parseDevVars,
  resolveMigrationsArgs,
  resolveWranglerDevArgs,
  validateDogfoodDevVars
} from './lib.mjs'
import {
  describePortOccupancy,
  hasPortListener,
  requestOwnedStop,
  waitOwnedStopComplete
} from './process-own.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '../..')
const WORKER_DIR = join(ROOT, 'worker')
const DEV_VARS_PATH = join(WORKER_DIR, '.dev.vars')
const DOGFOOD_VARS_PATH = join(WORKER_DIR, DOGFOOD_VARS_FILENAME)
/** wrangler cwd 격리 — generic worker/.dev.vars 를 읽지 않음 */
const DOGFOOD_RUNTIME = join(WORKER_DIR, '.dogfood-runtime')
const PROFILE_DIR = join(ROOT, 'tests/e2e/dogfood/profile')
const PID_PATH = join(ROOT, '.dogfood-wrangler.pid')
const STOP_PATH = join(ROOT, '.dogfood-stop')
const SUPERVISE_JS = join(__dirname, 'supervise.mjs')
const SUPERVISE_CONFIG = join(ROOT, '.dogfood-supervise.json')
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
 * R2 부작용으로 이동된 aside 백업을 원래 .dev.vars 로 복원. 이동/삭제는 하지 않는다.
 */
function restoreAsideDogfoodDevVars() {
  if (existsSync(DEV_VARS_PATH)) {
    log('worker/.dev.vars 이미 존재 — aside 복원 스킵')
    return
  }
  const asides = readdirSync(WORKER_DIR)
    .filter((n) => n.startsWith('.dev.vars.aside-dogfood-'))
    .sort()
  if (asides.length === 0) return
  const latest = asides[asides.length - 1]
  renameSync(join(WORKER_DIR, latest), DEV_VARS_PATH)
  log(`aside 복원: ${latest} → worker/.dev.vars (이후 건드리지 않음)`)
}

/**
 * generic .dev.vars 를 병합하지 않도록 전용 runtime cwd 준비.
 * 사용자 worker/.dev.vars 는 읽지도 쓰지도 않는다.
 */
function prepareDogfoodRuntime() {
  if (!DEV_VARS_POLICY.neverRenameGeneric || !DEV_VARS_POLICY.useRuntimeCwd) {
    throw new Error('DEV_VARS_POLICY 위반 — generic .dev.vars 격리가 꺼져 있다')
  }
  if (existsSync(DOGFOOD_RUNTIME)) {
    rmSync(DOGFOOD_RUNTIME, { recursive: true, force: true })
  }
  mkdirSync(DOGFOOD_RUNTIME, { recursive: true })
  copyFileSync(join(WORKER_DIR, 'wrangler.jsonc'), join(DOGFOOD_RUNTIME, 'wrangler.jsonc'))
  if (!existsSync(DOGFOOD_VARS_PATH)) {
    throw new Error(`${DOGFOOD_VARS_FILENAME} 없음 — ensureDogfoodVars 먼저`)
  }
  copyFileSync(DOGFOOD_VARS_PATH, join(DOGFOOD_RUNTIME, DOGFOOD_VARS_FILENAME))
  if (existsSync(join(DOGFOOD_RUNTIME, '.dev.vars'))) {
    throw new Error('dogfood runtime 에 generic .dev.vars 가 있으면 안 된다')
  }
  for (const name of ['src', 'migrations', 'node_modules']) {
    const target = join(WORKER_DIR, name)
    const link = join(DOGFOOD_RUNTIME, name)
    if (!existsSync(target)) {
      throw new Error(`worker/${name} 없음`)
    }
    execFileSync('cmd', ['/c', 'mklink', '/J', link, target], { stdio: 'ignore' })
  }
  // 사전 검증: wrangler 는 runtime cwd 의 env-file 만 보고, 상위 generic .dev.vars 를 병합하지 않는다
  if (existsSync(DEV_VARS_PATH)) {
    log('참고: worker/.dev.vars 존재하나 runtime cwd 격리로 병합하지 않음')
  }
  log(`dogfood runtime 준비: ${DOGFOOD_RUNTIME}`)
}

/**
 * 포트 점유 시 어떤 프로세스도 죽이지 않고 fail-loud.
 * @param {string} host
 * @param {number} port
 */
async function assertPortFreeOrFailLoud(host, port) {
  if (hasPortListener(port, host)) {
    throw new Error(describePortOccupancy(PID_PATH, port, host))
  }
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', (err) => {
      reject(
        new Error(
          `${describePortOccupancy(PID_PATH, port, host)}\nbind 오류: ${err instanceof Error ? err.message : err}`
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
 * @returns {{ bootNonce: string }}
 */
function ensureDogfoodVars() {
  assertLocalUploadEndpoint(LOCAL_UPLOAD_ENDPOINT)
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
  runNodeBin(WRANGLER_JS, wranglerArgs, { cwd: DOGFOOD_RUNTIME })
}

/**
 * supervise 기동 — wrangler 는 supervise 가 handle 로 소유.
 * spawn→handoff 단일 try/finally.
 * @param {string} bootNonce
 * @returns {Promise<{ supervisor: import('node:child_process').ChildProcess }>}
 */
async function startWranglerDev(bootNonce) {
  const persistTo = join(DOGFOOD_RUNTIME, '.wrangler', 'state')
  const args = resolveWranglerDevArgs(DOGFOOD_VARS_FILENAME, { persistTo })
  for (const a of args) {
    if (typeof a === 'string') assertNoProductionUrl(a, 'wrangler-arg')
  }
  const wranglerArgs = args.slice(1)
  log(`wrangler 기동(via supervise): wrangler ${wranglerArgs.join(' ')}`)
  assertBin(WRANGLER_JS, 'wrangler')
  assertBin(SUPERVISE_JS, 'supervise')
  const runtimeCwd = DOGFOOD_RUNTIME.replace(/\\/g, '/')
  buildCommandIdentityFromArgv(process.execPath, [WRANGLER_JS, ...wranglerArgs], {
    cwd: runtimeCwd
  })
  const diagnosticCmd = formatDiagnosticCommand(process.execPath, [
    WRANGLER_JS,
    ...wranglerArgs
  ])
  log(`executable(공백 안전): ${diagnosticCmd.slice(0, 120)}...`)

  if (existsSync(STOP_PATH)) unlinkSync(STOP_PATH)
  if (existsSync(PID_PATH)) unlinkSync(PID_PATH)

  writeFileSync(
    SUPERVISE_CONFIG,
    JSON.stringify({
      bootNonce,
      runtimeDir: DOGFOOD_RUNTIME,
      wranglerJs: WRANGLER_JS,
      wranglerArgs,
      pidPath: PID_PATH,
      stopPath: STOP_PATH,
      nodeExecutable: process.execPath
    }),
    'utf8'
  )

  const supervisor = spawn(process.execPath, [SUPERVISE_JS], {
    cwd: ROOT,
    stdio: 'ignore',
    env: { ...process.env, DOGFOOD_SUPERVISE_CONFIG: SUPERVISE_CONFIG },
    windowsHide: true,
    detached: true
  })
  if (supervisor.pid == null) throw new Error('supervise pid 없음')

  try {
    // PID 파일 handoff 대기 (async polling)
    const handoffDeadline = Date.now() + 15_000
    while (Date.now() < handoffDeadline) {
      if (existsSync(PID_PATH)) break
      if (supervisor.exitCode != null) {
        throw new Error(`supervise 조기 종료 code=${supervisor.exitCode}`)
      }
      await new Promise((r) => setTimeout(r, 100))
    }
    if (!existsSync(PID_PATH)) {
      throw new Error('supervise PID 진단 파일 handoff 시간 초과')
    }
    return { supervisor }
  } catch (err) {
    try {
      requestOwnedStop(STOP_PATH, bootNonce)
      await waitOwnedStopComplete(STOP_PATH, 10_000)
    } catch (cleanupErr) {
      const original = err instanceof Error ? err.message : String(err)
      const cleanup =
        cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr)
      throw new Error(`부트 handoff 실패: ${original} | cleanup: ${cleanup}`)
    }
    throw err
  }
}

/**
 * @param {string} bootNonce
 * @param {number} timeoutMs
 */
async function waitDogfoodHealthcheck(bootNonce, timeoutMs = 90_000) {
  const url = dogfoodHealthUrl(bootNonce)
  assertNoProductionUrl(url, 'healthcheck')
  const started = Date.now()
  let lastError = /** @type {unknown} */ (null)
  /** @type {string[]} */
  const recorder = []
  while (Date.now() - started < timeoutMs) {
    try {
      recorder.length = 0
      const res = await auditedFetch(url, { method: 'GET' }, recorder)
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

  restoreAsideDogfoodDevVars()
  await assertPortFreeOrFailLoud(LOCAL_HOST, LOCAL_PORT)
  log(`포트 여유 확인 OK ${LOCAL_HOST}:${LOCAL_PORT}`)
  const { bootNonce } = ensureDogfoodVars()
  prepareDogfoodRuntime()
  applyMigrations()

  const { supervisor } = await startWranglerDev(bootNonce)
  try {
    await waitDogfoodHealthcheck(bootNonce)
    viteBuild()
    prepareChromeProfile()
    supervisor.unref()
  } catch (err) {
    let cleanupErr = /** @type {unknown} */ (null)
    try {
      requestOwnedStop(STOP_PATH, bootNonce)
      await waitOwnedStopComplete(STOP_PATH, 20_000)
      log('부트 실패 cleanup: owned stop 완료')
    } catch (ce) {
      cleanupErr = ce
    }
    if (cleanupErr) {
      const original = err instanceof Error ? err.message : String(err)
      const cleanup = cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr)
      throw new Error(`부트 실패: ${original} | cleanup 실패: ${cleanup}`)
    }
    throw err
  }
  log('부트스트랩 완료. wrangler 는 supervise 가 소유한다.')
  log(`중지: stop 신호 ${STOP_PATH} (진단 PID ${PID_PATH})`)
}

main().catch((err) => {
  console.error('[dogfood:up] 실패:', err instanceof Error ? err.message : err)
  process.exitCode = 1
})
