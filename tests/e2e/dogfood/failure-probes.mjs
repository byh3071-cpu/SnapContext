/**
 * dogfood failure probes (4종) — R2 hardened.
 * 순서: 동의 취소 → invalid token → 삭제 후 접근 → Worker 중단(마지막).
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import {
  assertAllowedDogfoodRequestUrl,
  assertInvalidTokenRetrySequence,
  assertMcpToolNotFound,
  assertNoProductionUrl,
  assertProcessIdentityMatch,
  LOCAL_UPLOAD_ENDPOINT,
  parsePidMeta,
  stripSecretsForLog
} from '../../../scripts/dogfood/lib.mjs'
import { encodeMarkerToPng } from './fixtures/marker.mjs'
import {
  assertExplicitFailureMessage,
  assertZeroWorkerRequests,
  countProductionUrls
} from './lib/failure-probe-logic.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '../../..')
const EXTENSION_PATH = resolve(ROOT, 'dist')
const PROFILE_DIR = resolve(__dirname, 'profile')
const LOG_DIR = resolve(__dirname, 'logs')
const PID_PATH = resolve(ROOT, '.dogfood-wrangler.pid')
const MCP_URL = `${LOCAL_UPLOAD_ENDPOINT}/mcp`
const TOKEN_KEY = 'snapcontextToken'
const CONSENT_KEY = 'snapcontext.privateUploadConsent'
const INVALID_TOKEN = 'sc_AAAAAAAAAAAAAAAAAAAAAA.BBBBBBBBBBBBBBBBBBBBBB'

/**
 * @param {{
 *   deletedCaptureId: string,
 *   userToken: string,
 *   piUrl: string
 * }} opts
 */
export async function runFailureProbes(opts) {
  /** @type {{ name: string, pass: boolean, detail?: string }[]} */
  const results = []
  /** @type {string[]} */
  const seenUrls = [LOCAL_UPLOAD_ENDPOINT, MCP_URL, opts.piUrl]

  function logProbe(name, pass, detail = '') {
    results.push({ name, pass, detail })
    console.log(`[probe] ${pass ? 'OK' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  }

  if (!existsSync(EXTENSION_PATH)) {
    throw new Error(`dist/ 없음: ${EXTENSION_PATH}`)
  }
  assertNoProductionUrl(opts.piUrl, 'piUrl')
  mkdirSync(PROFILE_DIR, { recursive: true })
  mkdirSync(LOG_DIR, { recursive: true })

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 900, height: 900 },
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-default-browser-check',
      '--no-first-run'
    ]
  })
  context.on('request', (req) => {
    const url = req.url()
    seenUrls.push(url)
    assertAllowedDogfoodRequestUrl(url, 'playwright-request')
  })

  try {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    const sw =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent('serviceworker', { timeout: 15000 }))
    const extensionId = new URL(sw.url()).host
    const side = await context.newPage()
    await side.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html`, {
      waitUntil: 'domcontentloaded'
    })
    await side.waitForTimeout(500)

    // —— (a) 동의 취소 ——
    await side.evaluate(async (key) => {
      await chrome.storage.local.remove(key)
    }, CONSENT_KEY)
    await installRequestProbe(side)
    await injectCapture(sw, side, 'probe-consent-cancel')
    await side.getByRole('button', { name: '내 AI에 저장' }).click()
    await side.waitForTimeout(300)
    const consent = side.locator('.snap-confirm')
    if ((await consent.count()) !== 1) {
      logProbe('동의 취소', false, '동의 모달 없음')
    } else {
      await side.locator('.snap-confirm__btn--muted').click()
      await side.waitForTimeout(400)
      const reqs = await readReqs(side)
      for (const r of reqs) seenUrls.push(r.url)
      try {
        assertZeroWorkerRequests(reqs)
        logProbe('동의 취소', true, 'Worker 요청 0건')
      } catch (err) {
        logProbe('동의 취소', false, err instanceof Error ? err.message : String(err))
      }
    }

    // —— (c) invalid token 시퀀스 ——
    await side.evaluate(
      async ({ tokenKey, token, consentKey }) => {
        await chrome.storage.local.set({
          [tokenKey]: token,
          [consentKey]: 7
        })
      },
      { tokenKey: TOKEN_KEY, token: INVALID_TOKEN, consentKey: CONSENT_KEY }
    )
    await installRequestProbe(side)
    await injectCapture(sw, side, 'probe-invalid-token')
    await side.getByRole('button', { name: '내 AI에 저장' }).click()
    await side.waitForTimeout(3000)
    const tokenReqs = await readReqs(side)
    for (const r of tokenReqs) seenUrls.push(r.url)
    try {
      assertInvalidTokenRetrySequence(tokenReqs)
      logProbe('invalid token 재시도 한도', true, '401→/token→POST 시퀀스 OK')
    } catch (err) {
      logProbe(
        'invalid token 재시도 한도',
        false,
        err instanceof Error ? err.message : String(err)
      )
    }

    // —— (d) 삭제 후 NOT_FOUND ——
    try {
      const init = await mcpPost(opts.userToken, {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'dogfood-probe', version: '1.0.0' }
        }
      })
      const sessionId = init.sessionId
      await mcpPost(
        opts.userToken,
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        sessionId
      )
      const analyze = await mcpPost(
        opts.userToken,
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'snap_analyze',
            arguments: { id: opts.deletedCaptureId, mode: 'context' }
          }
        },
        sessionId
      )
      assertMcpToolNotFound(analyze.json)
      const piRes = await fetch(opts.piUrl)
      seenUrls.push(opts.piUrl)
      if (piRes.status === 200) {
        throw new Error(`삭제 후 /pi 가 200을 반환함 (status=${piRes.status})`)
      }
      logProbe(
        '삭제 후 접근 NOT_FOUND',
        true,
        `analyze=NOT_FOUND /pi=${piRes.status}`
      )
    } catch (err) {
      logProbe(
        '삭제 후 접근 NOT_FOUND',
        false,
        err instanceof Error ? err.message : String(err)
      )
    }

    // —— (b) Worker 중단 (identity kill only) ——
    try {
      await installRequestProbe(side)
      const pid = killWranglerWithIdentity()
      await waitWorkerDown(15000)
      await side.evaluate(async (key) => {
        await chrome.storage.local.set({ [key]: 7 })
      }, CONSENT_KEY)
      await injectCapture(sw, side, 'probe-worker-down')
      const saveBtn = side.getByRole('button', { name: '내 AI에 저장' })
      await saveBtn.waitFor({ state: 'visible', timeout: 5000 })
      await side.waitForFunction(() => {
        const buttons = Array.from(document.querySelectorAll('button'))
        const target = buttons.find((b) => (b.textContent ?? '').includes('내 AI에 저장'))
        return target instanceof HTMLButtonElement && !target.disabled
      }, { timeout: 10000 })
      await saveBtn.click()
      await side.waitForTimeout(200)
      if ((await side.locator('.snap-confirm').count()) === 1) {
        await side.locator('.snap-confirm__btn--primary').click()
      }
      const errorToast = side.locator('.toast--error')
      await errorToast.waitFor({ state: 'visible', timeout: 20000 })
      const toastText = (await errorToast.textContent()) ?? ''
      assertExplicitFailureMessage(toastText)
      const downReqs = await readReqs(side)
      for (const r of downReqs) seenUrls.push(r.url)
      const infoToasts = await side.locator('.toast--info').allTextContents()
      if (infoToasts.some((t) => /저장했습니다/.test(t))) {
        throw new Error('Worker 중단인데 성공 토스트가 표시됨')
      }
      logProbe('Worker 중단 명시 실패', true, `pid=${pid} toast=${toastText}`)
    } catch (err) {
      logProbe(
        'Worker 중단 명시 실패',
        false,
        err instanceof Error ? err.message : String(err)
      )
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const logPath = join(LOG_DIR, `probes-${stamp}.json`)
    writeFileSync(
      logPath,
      JSON.stringify(
        stripSecretsForLog({
          at: new Date().toISOString(),
          results,
          deletedCaptureId: opts.deletedCaptureId,
          productionUrlCount: countProductionUrls(seenUrls)
        }),
        null,
        2
      ),
      'utf8'
    )
    console.log(`[probe] 로그 저장: ${logPath}`)

    return { ok: results.every((r) => r.pass), results, seenUrls }
  } finally {
    await context.close()
  }
}

/**
 * @param {import('playwright').Worker} sw
 * @param {import('playwright').Page} side
 * @param {string} sourceTitle
 */
async function injectCapture(sw, side, sourceTitle) {
  const png = await encodeMarkerToPng('112233')
  const imageData = `data:image/png;base64,${png.toString('base64')}`
  await sw.evaluate(
    async (payload) => {
      await chrome.runtime.sendMessage(payload)
    },
    {
      type: 'CAPTURE_RESULT',
      imageData,
      captureType: 'visible',
      sourceUrl: 'http://127.0.0.1:9/',
      sourceTitle,
      viewport: { width: 800, height: 600 },
      userAgent: 'dogfood-probe/1.0',
      imageWidth: 128,
      imageHeight: 128
    }
  )
  await side.waitForTimeout(700)
}

/** @param {import('playwright').Page} side */
async function installRequestProbe(side) {
  await side.evaluate(() => {
    window.__dogfoodReqs = []
    if (window.__dogfoodFetchPatched) {
      window.__dogfoodReqs = []
      return
    }
    const realFetch = window.fetch.bind(window)
    window.fetch = async (input, init = {}) => {
      const url = typeof input === 'string' ? input : input.url
      const method = (init.method ?? 'GET').toUpperCase()
      try {
        const res = await realFetch(input, init)
        window.__dogfoodReqs.push({ url, method, status: res.status })
        return res
      } catch (err) {
        window.__dogfoodReqs.push({ url, method, status: 0 })
        throw err
      }
    }
    window.__dogfoodFetchPatched = true
  })
}

/** @param {import('playwright').Page} side */
async function readReqs(side) {
  return /** @type {{ url: string, method: string, status?: number }[]} */ (
    await side.evaluate(() => window.__dogfoodReqs ?? [])
  )
}

/**
 * @param {string} token
 * @param {unknown} body
 * @param {string | null} sessionId
 */
async function mcpPost(token, body, sessionId = null) {
  assertNoProductionUrl(MCP_URL, 'MCP_URL')
  /** @type {Record<string, string>} */
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream'
  }
  if (sessionId) headers['mcp-session-id'] = sessionId
  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    json = text
  }
  return { status: res.status, sessionId: res.headers.get('mcp-session-id'), json, text }
}

/**
 * identity 검증 후 해당 process tree 만 종료. 포트 전체 Force kill 금지.
 */
function killWranglerWithIdentity() {
  if (!existsSync(PID_PATH)) {
    throw new Error(`wrangler PID 파일 없음: ${PID_PATH}`)
  }
  const meta = parsePidMeta(readFileSync(PID_PATH, 'utf8'))
  const live = readLiveProcess(meta.pid)
  assertProcessIdentityMatch(meta, live)
  try {
    execFileSync('taskkill', ['/F', '/T', '/PID', String(meta.pid)], {
      stdio: 'ignore'
    })
  } catch {
    try {
      process.kill(meta.pid)
    } catch (err) {
      throw new Error(
        `wrangler 종료 실패 pid=${meta.pid}: ${err instanceof Error ? err.message : err}`
      )
    }
  }
  unlinkSync(PID_PATH)
  return meta.pid
}

/**
 * @param {number} pid
 * @returns {{ pid: number, cmd: string } | null}
 */
function readLiveProcess(pid) {
  try {
    const out = execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `$p = Get-CimInstance Win32_Process -Filter "ProcessId=${pid}"; if ($null -eq $p) { '' } else { $p.CommandLine }`
      ],
      { encoding: 'utf8' }
    ).trim()
    if (!out) return null
    return { pid, cmd: out }
  } catch {
    return null
  }
}

/** @param {number} timeoutMs */
async function waitWorkerDown(timeoutMs) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      await fetch(`${LOCAL_UPLOAD_ENDPOINT}/`, { method: 'GET' })
    } catch {
      return
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error('Worker가 아직 응답 중 — 중단 실패')
}

const isDirectRun =
  process.argv[1] != null &&
  resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])

if (isDirectRun) {
  console.error('[probe] pnpm dogfood:verify 로 실행하라.')
  process.exitCode = 1
}
