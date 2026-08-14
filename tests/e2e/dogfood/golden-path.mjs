/**
 * SnapContext dogfood golden path.
 * 전제: dogfood:up 으로 로컬 Worker(127.0.0.1:8787) + dist 빌드 + profile 준비.
 */
import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import {
  assertAllowedDogfoodRequestUrl,
  assertMcpToolNotFound,
  assertNoProductionUrl,
  auditedFetch,
  dogfoodHealthUrl,
  LOCAL_UPLOAD_ENDPOINT,
  parseDevVars,
  stripSecretsForLog
} from '../../../scripts/dogfood/lib.mjs'
import {
  decodeMarkerFromPng,
  writeMarkerFixture
} from './fixtures/marker.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '../../..')
const EXTENSION_PATH = resolve(ROOT, 'dist')
const PROFILE_DIR = resolve(__dirname, 'profile')
const FIXTURE_OUT = resolve(__dirname, 'fixtures/out')
const LOG_DIR = resolve(__dirname, 'logs')
const MCP_URL = `${LOCAL_UPLOAD_ENDPOINT}/mcp`
const TOKEN_STORAGE_KEY = 'snapcontextToken'

/** @type {{ name: string, pass: boolean, detail?: string }[]} */
let steps = []

function resetSteps() {
  steps = []
}

function logStep(name, pass, detail = '') {
  steps.push({ name, pass, detail })
  console.log(`[golden] ${pass ? 'OK' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

function fail(name, detail) {
  logStep(name, false, detail)
  throw new Error(`${name}: ${detail}`)
}

/**
 * @param {string[]} recorder
 */
async function assertWorkerUp(recorder) {
  assertNoProductionUrl(LOCAL_UPLOAD_ENDPOINT, 'LOCAL_UPLOAD_ENDPOINT')
  const varsPath = resolve(ROOT, 'worker', '.dev.vars.dogfood')
  if (!existsSync(varsPath)) {
    throw new Error('worker/.dev.vars.dogfood 없음 — 먼저 pnpm dogfood:up')
  }
  const vars = parseDevVars(readFileSync(varsPath, 'utf8'))
  const url = dogfoodHealthUrl(vars.DOGFOOD_BOOT_NONCE)
  let res
  try {
    res = await auditedFetch(url, { method: 'GET' }, recorder)
  } catch (err) {
    throw new Error(
      `로컬 Worker 미기동 (${url}). 먼저 pnpm dogfood:up 실행. ${err instanceof Error ? err.message : err}`
    )
  }
  if (res.status !== 200) {
    throw new Error(`dogfood 헬스체크 실패 status=${res.status}`)
  }
  const body = /** @type {{ ok?: boolean, dogfood?: boolean }} */ (await res.json())
  if (body.ok !== true || body.dogfood !== true) {
    throw new Error(`dogfood 헬스 본문 불일치: ${JSON.stringify(body)}`)
  }
  logStep('로컬 Worker 헬스체크', true, 'dogfood-health')
}

/**
 * @param {string} rootDir
 * @returns {Promise<{ baseUrl: string, close: () => Promise<void> }>}
 */
function serveFixtureDir(rootDir) {
  assertNoProductionUrl('http://127.0.0.1', 'fixture-host')
  const server = createServer((req, res) => {
    const rel = (req.url ?? '/').split('?')[0]
    const path = rel === '/' ? '/index.html' : rel
    const file = join(rootDir, path.replace(/^\//, ''))
    if (!file.startsWith(rootDir) || !existsSync(file)) {
      res.writeHead(404)
      res.end('not found')
      return
    }
    const body = readFileSync(file)
    const type = file.endsWith('.html')
      ? 'text/html; charset=utf-8'
      : file.endsWith('.png')
        ? 'image/png'
        : 'application/octet-stream'
    res.writeHead(200, { 'Content-Type': type })
    res.end(body)
  })
  return new Promise((resolvePromise, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') {
        reject(new Error('fixture 서버 주소 확인 실패'))
        return
      }
      const baseUrl = `http://127.0.0.1:${addr.port}`
      assertNoProductionUrl(baseUrl, 'fixture-baseUrl')
      resolvePromise({
        baseUrl,
        close: () =>
          new Promise((r, j) => {
            server.close((err) => (err ? j(err) : r()))
          })
      })
    })
  })
}

/**
 * @param {string} token
 * @param {unknown} body
 * @param {string | null} sessionId
 * @param {string[]} recorder
 */
async function mcpPost(token, body, sessionId = null, recorder = []) {
  assertNoProductionUrl(MCP_URL, 'MCP_URL')
  /** @type {Record<string, string>} */
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream'
  }
  if (sessionId) headers['mcp-session-id'] = sessionId
  const res = await auditedFetch(
    MCP_URL,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    },
    recorder
  )
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    json = text
  }
  return {
    status: res.status,
    sessionId: res.headers.get('mcp-session-id'),
    json,
    text
  }
}

/**
 * @param {unknown} json
 * @returns {string}
 */
function extractToolText(json) {
  const blob = typeof json === 'string' ? json : JSON.stringify(json)
  // JSON-RPC result.content[].text
  if (json && typeof json === 'object' && !Array.isArray(json)) {
    const root = /** @type {Record<string, unknown>} */ (json)
    const result = root.result
    if (result && typeof result === 'object') {
      const content = /** @type {Record<string, unknown>} */ (result).content
      if (Array.isArray(content)) {
        const texts = content
          .filter((c) => c && typeof c === 'object' && 'text' in c)
          .map((c) => String(/** @type {{ text: unknown }} */ (c).text))
        if (texts.length > 0) return texts.join('\n')
      }
    }
  }
  return blob
}

/**
 * @param {string} digest
 * @returns {string}
 */
function extractPiUrl(digest) {
  const match = digest.match(/https?:\/\/127\.0\.0\.1:8787\/pi\/[^\s"'<>]+/i)
  if (!match) {
    throw new Error(`snap_analyze 응답에서 로컬 /pi URL을 찾지 못함`)
  }
  assertNoProductionUrl(match[0], 'pi-url')
  if (match[0].toLowerCase().includes('workers.dev')) {
    throw new Error('production URL 금지: /pi')
  }
  return match[0]
}

async function serviceWorker(context) {
  return (
    context.serviceWorkers()[0] ??
    (await context.waitForEvent('serviceworker', { timeout: 15000 }))
  )
}

function writeLog(extra = {}) {
  mkdirSync(LOG_DIR, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const path = join(LOG_DIR, `golden-${stamp}.json`)
  const payload = stripSecretsForLog({
    at: new Date().toISOString(),
    endpoint: LOCAL_UPLOAD_ENDPOINT,
    steps,
    ...extra
  })
  writeFileSync(path, JSON.stringify(payload, null, 2), 'utf8')
  console.log(`[golden] 로그 저장: ${path}`)
  return path
}

/**
 * @param {import('playwright').BrowserContext} context
 * @param {string[]} seenUrls
 */
function installNetworkGuard(context, seenUrls) {
  context.on('request', (req) => {
    const url = req.url()
    seenUrls.push(url)
    assertAllowedDogfoodRequestUrl(url, 'playwright-request')
  })
}

/**
 * @returns {Promise<{
 *   ok: boolean,
 *   steps: { name: string, pass: boolean, detail?: string }[],
 *   marker: string | null,
 *   captureId: string | null,
 *   userToken: string | null,
 *   piUrl: string | null,
 *   seenUrls: string[]
 * }>}
 */
export async function runGoldenPath() {
  resetSteps()
  /** @type {string[]} */
  const seenUrls = [LOCAL_UPLOAD_ENDPOINT, MCP_URL]
  /** @type {string | null} */
  let marker = null
  /** @type {string | null} */
  let captureId = null
  /** @type {string | null} */
  let userToken = null
  /** @type {string | null} */
  let piUrl = null

  if (!existsSync(EXTENSION_PATH)) {
    throw new Error(`dist/ 없음. pnpm dogfood:up 또는 vite build 먼저 실행: ${EXTENSION_PATH}`)
  }
  mkdirSync(PROFILE_DIR, { recursive: true })

  await assertWorkerUp(seenUrls)
  const fixture = await writeMarkerFixture(FIXTURE_OUT)
  marker = fixture.marker
  // N2: 정답 marker 는 픽셀 판독 비교 전에 콘솔/로그에 노출하지 않는다
  logStep('marker fixture 생성', true, 'pixel-only (정답 미공개)')

  const fixtureServer = await serveFixtureDir(FIXTURE_OUT)
  seenUrls.push(fixtureServer.baseUrl)
  logStep('fixture HTTP 서버', true, fixtureServer.baseUrl)

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
  installNetworkGuard(context, seenUrls)

  try {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    const page = await context.newPage()
    await page.goto(fixtureServer.baseUrl + '/', { waitUntil: 'domcontentloaded' })
    const imgCount = await page.locator('#marker-grid').count()
    if (imgCount !== 1) fail('fixture 페이지 로드', `img count=${imgCount}`)
    logStep('fixture 페이지 로드', true, fixtureServer.baseUrl)

    const sw = await serviceWorker(context)
    const extensionId = new URL(sw.url()).host
    const side = await context.newPage()
    await side.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html`, {
      waitUntil: 'domcontentloaded'
    })
    await side.waitForTimeout(600)

    const imageData = `data:image/png;base64,${fixture.png.toString('base64')}`
    const capture = {
      type: 'CAPTURE_RESULT',
      imageData,
      captureType: 'visible',
      sourceUrl: fixtureServer.baseUrl + '/',
      sourceTitle: 'dogfood-marker-fixture',
      viewport: { width: 900, height: 900 },
      userAgent: 'dogfood-golden/1.0',
      imageWidth: 128,
      imageHeight: 128
    }
    await sw.evaluate(async (payload) => {
      await chrome.runtime.sendMessage(payload)
    }, capture)
    await side.waitForTimeout(800)
    logStep('캡처 주입(마커 PNG)', true)

    const saveButton = side.getByRole('button', { name: '내 AI에 저장' })
    await saveButton.click()
    await side.waitForTimeout(200)
    const consent = side.locator('.snap-confirm')
    if ((await consent.count()) === 1) {
      await side.locator('.snap-confirm__btn--primary').click()
    } else {
      // 이미 동의한 프로필 — 바로 저장 진행
      logStep('동의 모달 스킵(기존 동의)', true)
    }

    await side.waitForTimeout(1500)
    const savedTitle = side
      .locator('.ai-relay__saved-list')
      .getByText('dogfood-marker-fixture', { exact: true })
    if ((await savedTitle.count()) !== 1) {
      fail('private /captures 저장', '목록에 캡처 없음')
    }
    logStep('private /captures 저장', true)

    const stored = await side.evaluate(async (key) => {
      const bag = await chrome.storage.local.get(key)
      return bag[key] ?? null
    }, TOKEN_STORAGE_KEY)
    if (typeof stored !== 'string' || !stored.startsWith('sc_')) {
      fail('owner 토큰', `형식 오류: ${String(stored)}`)
    }
    userToken = stored
    logStep('owner 토큰 확보', true)

    const listRes = await auditedFetch(
      `${LOCAL_UPLOAD_ENDPOINT}/captures?limit=5`,
      {
        headers: { Authorization: `Bearer ${userToken}` }
      },
      seenUrls
    )
    if (!listRes.ok) fail('captures 목록', `status=${listRes.status}`)
    const list = /** @type {{ id: string }[]} */ (await listRes.json())
    const hit = list.find((row) => typeof row.id === 'string')
    if (!hit) fail('captures 목록', '빈 목록')
    captureId = hit.id
    assertNoProductionUrl(`${LOCAL_UPLOAD_ENDPOINT}/captures/${captureId}`, 'capture-id-url')
    logStep('capture id', true, captureId)

    const init = await mcpPost(
      userToken,
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'dogfood-golden', version: '1.0.0' }
        }
      },
      null,
      seenUrls
    )
    if (init.status !== 200) fail('MCP initialize', `status=${init.status}`)
    const sessionId = init.sessionId
    await mcpPost(
      userToken,
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      sessionId,
      seenUrls
    )

    const hist = await mcpPost(
      userToken,
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'snap_history', arguments: { limit: 5 } }
      },
      sessionId,
      seenUrls
    )
    const histText = extractToolText(hist.json)
    if (!histText.includes(captureId)) {
      fail('snap_history', histText.slice(0, 200))
    }
    logStep('snap_history', true)

    const analyze = await mcpPost(
      userToken,
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'snap_analyze',
          arguments: { id: captureId, mode: 'context' }
        }
      },
      sessionId,
      seenUrls
    )
    const digest = extractToolText(analyze.json)
    if (/NOT_FOUND|"isError"\s*:\s*true/.test(JSON.stringify(analyze.json)) && !digest.includes('/pi/')) {
      fail('snap_analyze', digest.slice(0, 300))
    }
    piUrl = extractPiUrl(digest)
    seenUrls.push(piUrl)
    logStep('snap_analyze + /pi URL', true, piUrl)

    const piRes = await auditedFetch(piUrl, { method: 'GET' }, seenUrls)
    if (piRes.status !== 200) fail('/pi fetch', `status=${piRes.status}`)
    const piBuf = Buffer.from(await piRes.arrayBuffer())
    if (piBuf[0] !== 0x89 || piBuf[1] !== 0x50 || piBuf[2] !== 0x4e || piBuf[3] !== 0x47) {
      fail('/pi PNG 매직', piBuf.slice(0, 8).toString('hex'))
    }
    const decoded = await decodeMarkerFromPng(piBuf)
    if (decoded !== fixture.marker) {
      fail('픽셀 marker 복원', 'mismatch (정답은 비교 후에만 기록)')
    }
    // N2: 비교 성공 후에만 사람이 보는 결과에 marker 노출
    logStep('/pi PNG + marker 픽셀 복원', true, `marker=${decoded}`)

    const del = await auditedFetch(
      `${LOCAL_UPLOAD_ENDPOINT}/captures/${encodeURIComponent(captureId)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${userToken}` }
      },
      seenUrls
    )
    if (del.status !== 204) fail('DELETE /captures', `status=${del.status}`)
    logStep('DELETE /captures', true)

    const after = await mcpPost(
      userToken,
      {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'snap_analyze',
          arguments: { id: captureId, mode: 'context' }
        }
      },
      sessionId,
      seenUrls
    )
    try {
      assertMcpToolNotFound(after.json)
    } catch (err) {
      fail(
        '삭제 후 NOT_FOUND',
        err instanceof Error ? err.message : String(err)
      )
    }
    logStep('삭제 후 snap_analyze NOT_FOUND', true)

    writeLog({ marker: fixture.marker, captureId, piUrl, markerMatch: true })
    const failed = steps.filter((s) => !s.pass)
    if (failed.length > 0) {
      console.error(`[golden] 실패 ${failed.length}건`)
      return {
        ok: false,
        steps: [...steps],
        marker,
        captureId,
        userToken,
        piUrl,
        seenUrls
      }
    }
    console.log(`[golden] 전체 통과 (${steps.length} steps)`)
    return {
      ok: true,
      steps: [...steps],
      marker,
      captureId,
      userToken,
      piUrl,
      seenUrls
    }
  } catch (err) {
    logStep('fatal', false, err instanceof Error ? err.message : String(err))
    writeLog({
      captureId,
      error: err instanceof Error ? err.message : String(err),
      markerRevealed: false
    })
    console.error('[golden] fatal:', err)
    return {
      ok: false,
      steps: [...steps],
      marker,
      captureId,
      userToken,
      piUrl,
      seenUrls
    }
  } finally {
    await context.close()
    await fixtureServer.close()
  }
}

async function main() {
  const result = await runGoldenPath()
  if (!result.ok) process.exitCode = 1
}

const isDirectRun =
  process.argv[1] != null &&
  resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])

if (isDirectRun) {
  main().catch((err) => {
    console.error('[golden] boot failure:', err)
    process.exitCode = 1
  })
}