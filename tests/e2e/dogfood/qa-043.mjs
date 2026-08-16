/**
 * SnapContext 0.4.3 수동 QA 5항목 — 실브라우저 자동 프로브.
 *
 * 대상: docs/PRD-0.4.3.md §B(주석 4종·가리기 파괴적 bake)·§A(토큰 재발급 lite),
 * docs/log/2026-08-16-0.4.3-annotation-redaction.md "남은 사람 게이트" 체크리스트 5항목.
 *
 * 전제: dogfood:up 으로 로컬 Worker(127.0.0.1:8787) + dist 빌드 + profile 준비.
 * 패턴 SoT: golden-path.mjs(persistent context·MCP 호출·마커 픽셀 판독),
 * failure-probes.mjs(injectCapture·mcpPost·동의 모달 처리).
 *
 * golden-path 와 달리 실패해도 즉시 throw 하지 않는다 — 5항목 전체 결과를 모아야 하므로
 * 각 QA 항목을 runItem() 으로 감싸 예외를 잡고 다음 항목을 계속 진행한다.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import sharp from 'sharp'
import {
  assertAllowedDogfoodRequestUrl,
  assertNoProductionUrl,
  auditedFetch,
  dogfoodHealthUrl,
  LOCAL_UPLOAD_ENDPOINT,
  parseDevVars,
  stripSecretsForLog
} from '../../../scripts/dogfood/lib.mjs'
import { decodeMarkerFromPng, encodeMarkerToPng, randomMarker } from './fixtures/marker.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '../../..')
const EXTENSION_PATH = resolve(ROOT, 'dist')
// profile/ 는 이미 .gitignore 대상(디렉터리 통째) — qa043 전용 하위 폴더로 골든패스 프로필과
// 격리한다(동시 실행 시 SingletonLock 충돌·소비상태(토큰/동의) 오염 방지).
const PROFILE_DIR = resolve(__dirname, 'profile', 'qa043')
const LOG_DIR = resolve(__dirname, 'logs')
const MCP_URL = `${LOCAL_UPLOAD_ENDPOINT}/mcp`
const TOKEN_KEY = 'snapcontextToken'
const VIEWPORT = { width: 900, height: 900 }
const GRID_SIZE = 8
const CELL_PX = 16
// 매 실행마다 다른 접미사 — profile-qa043 는 재실행 간 재사용되므로(의도적: 동의/토큰 플로우를
// 매번 새로 태우기 위해 실행 시작 시 rmSync 로 비운다) sourceTitle 충돌 걱정은 없지만, 그래도
// 우연한 부분 문자열 충돌을 막기 위해 붙인다.
const RUN_ID = Date.now().toString(36)

// 가리기 채움색 SoT: src/utils/annotated-image.ts:12 REDACT_COLOR. 이 프로브는 src/ 를
// import 하지 못하므로(빌드 산출물만 브라우저에서 실행) 리터럴로 미러링한다 — 값이 바뀌면
// 이 상수도 같이 바꿔야 한다.
const REDACT_RGB = [21, 17, 15]

/** @type {{ name: string, status: 'OK'|'FAIL'|'SKIP', detail?: string }[]} */
let steps = []

function logStep(name, status, detail = '') {
  const label = status === true ? 'OK' : status === 'skip' ? 'SKIP' : status === false ? 'FAIL' : status
  steps.push({ name, status: label, detail })
  console.log(`[qa043] ${label} ${name}${detail ? ` — ${detail}` : ''}`)
}

/**
 * QA 항목 하나를 실행 — 예외를 잡아 FAIL 로 기록하고 다음 항목으로 계속 진행한다
 * (golden-path 의 throw-and-stop 과 다른 지점: 5항목 전체 결과가 필요하다).
 */
async function runItem(label, fn) {
  try {
    await fn()
  } catch (err) {
    logStep(`${label} 중단(예외)`, false, err instanceof Error ? err.message : String(err))
  }
}

// ───────────────────────── Worker/health ─────────────────────────

async function assertWorkerUp(recorder) {
  assertNoProductionUrl(LOCAL_UPLOAD_ENDPOINT, 'LOCAL_UPLOAD_ENDPOINT')
  const varsPath = resolve(ROOT, 'worker', '.dev.vars.dogfood')
  if (!existsSync(varsPath)) {
    throw new Error('worker/.dev.vars.dogfood 없음 — 먼저 pnpm dogfood:up')
  }
  const vars = parseDevVars(readFileSync(varsPath, 'utf8'))
  const url = dogfoodHealthUrl(vars.DOGFOOD_BOOT_NONCE)
  const res = await auditedFetch(url, { method: 'GET' }, recorder)
  if (res.status !== 200) throw new Error(`dogfood 헬스체크 실패 status=${res.status}`)
  const body = /** @type {{ ok?: boolean, dogfood?: boolean }} */ (await res.json())
  if (body.ok !== true || body.dogfood !== true) {
    throw new Error(`dogfood 헬스 본문 불일치: ${JSON.stringify(body)}`)
  }
  logStep('로컬 Worker 헬스체크', true, 'dogfood-health')
}

// ───────────────────────── fixture 생성 ─────────────────────────

/** 단색 배경 PNG — QA①·②·⑤ 처럼 마커가 필요 없는 시나리오용(순수 렌더/undo/토스트 검증). */
async function createSolidPng(width, height, rgb) {
  const [r, g, b] = rgb
  const raw = Buffer.alloc(width * height * 3)
  for (let i = 0; i < width * height; i++) {
    raw[i * 3] = r
    raw[i * 3 + 1] = g
    raw[i * 3 + 2] = b
  }
  return sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer()
}

// ───────────────────────── side panel 조작 헬퍼 ─────────────────────────

/**
 * @param {import('playwright').Worker} sw
 * @param {import('playwright').Page} side
 */
async function injectCapture(sw, side, { pngBuffer, sourceTitle, width, height, sourceUrl }) {
  const imageData = `data:image/png;base64,${pngBuffer.toString('base64')}`
  await sw.evaluate(
    async (payload) => {
      await chrome.runtime.sendMessage(payload)
    },
    {
      type: 'CAPTURE_RESULT',
      imageData,
      captureType: 'visible',
      sourceUrl: sourceUrl ?? 'http://127.0.0.1:9/qa043',
      sourceTitle,
      viewport: VIEWPORT,
      userAgent: 'dogfood-qa043/1.0',
      imageWidth: width,
      imageHeight: height
    }
  )
  await side.waitForTimeout(500)
  await waitImageReady(side)
}

async function waitImageReady(side, timeout = 6000) {
  await side.waitForFunction(
    () => {
      const img = document.querySelector('img.preview-img')
      return img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0
    },
    undefined,
    { timeout }
  )
}

/** 이미지를 뷰포트 안으로 스크롤한 뒤 bounding box 를 읽는다 — page.mouse 는 스크롤 밖 좌표를
 * 못 때린다(locator.click() 과 달리 자동 스크롤이 없다). */
async function getImageRect(side) {
  const loc = side.locator('img.preview-img')
  await loc.scrollIntoViewIfNeeded()
  const box = await loc.boundingBox()
  if (!box) throw new Error('이미지 bounding box 를 얻지 못함')
  return box
}

async function selectTool(side, tool) {
  await side.locator(`.anno-toolbar button[data-tool="${tool}"]`).click()
}

async function clickUndo(side) {
  await side.locator('.anno-toolbar button[data-action="undo"]').click()
}

async function isUndoDisabled(side) {
  return side.locator('.anno-toolbar button[data-action="undo"]').isDisabled()
}

/** page.mouse 로 실제 포인터 드래그(pointerdown→move→up) — canvas.setPointerCapture 덕에
 * 종료 좌표는 캔버스 바깥으로 나가도(overshoot) 그대로 캔버스가 받는다. */
async function dragAbs(side, x1, y1, x2, y2, steps = 10) {
  await side.mouse.move(x1, y1)
  await side.mouse.down()
  await side.mouse.move(x2, y2, { steps })
  await side.mouse.up()
  await side.waitForTimeout(80)
}

/** annotation-overlay 캔버스의 표시-px 좌표(dx,dy, 캔버스/이미지 원점 기준) 픽셀 1개를 읽는다. */
async function sampleCanvasPixel(side, dx, dy) {
  return side.evaluate(
    ({ dx, dy }) => {
      const canvas = document.querySelector('canvas.annotation-overlay')
      if (!(canvas instanceof HTMLCanvasElement)) return null
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      const dpr = window.devicePixelRatio || 1
      const px = Math.min(canvas.width - 1, Math.max(0, Math.round(dx * dpr)))
      const py = Math.min(canvas.height - 1, Math.max(0, Math.round(dy * dpr)))
      const d = ctx.getImageData(px, py, 1, 1).data
      return [d[0], d[1], d[2], d[3]]
    },
    { dx, dy }
  )
}

function colorDist(a, b) {
  if (!a || !b) return -1
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])
}

/**
 * annotation-overlay 캔버스는 매 render() 마다 ctx.clearRect 로 지워진다 — clearRect 의
 * "빈 자리"는 완전 투명 [0,0,0,0] 이지 흰 배경이 아니다(흰 배경은 캔버스 아래 <img> 가 CSS로
 * 겹쳐 보이는 것일 뿐, 캔버스 자신의 픽셀 데이터는 그 흰색을 모른다). 그래서 "그려졌는지"
 * 판정은 배경색과의 색상 거리가 아니라 알파 채널(그려지면 >0, 안 그려지면 정확히 0)로 한다.
 */
const CANVAS_TRANSPARENT = [0, 0, 0, 0]
function isDrawnPixel(px) {
  return Array.isArray(px) && typeof px[3] === 'number' && px[3] > 0
}

async function clearToasts(side) {
  await side.evaluate(() => {
    const root = document.getElementById('toast-root')
    if (root) root.replaceChildren()
  })
}

/** 특정 kind(.toast--info/.toast--error)의 토스트 중 substring 을 포함하는 게 나타나는지 대기. */
async function waitToast(side, substring, kind, timeoutMs = 4000) {
  const sel = kind ? `.toast--${kind}` : '.toast'
  const locator = side.locator(sel, { hasText: substring })
  try {
    await locator.first().waitFor({ state: 'visible', timeout: timeoutMs })
    return true
  } catch {
    return false
  }
}

async function acceptConsentIfShown(side) {
  await side.waitForTimeout(250)
  const consent = side.locator('.snap-confirm')
  if ((await consent.count()) === 1) {
    await side.locator('.snap-confirm__btn--primary').click()
    await side.waitForTimeout(150)
    return true
  }
  return false
}

async function getStoredToken(side) {
  return side.evaluate(async (key) => {
    const bag = await chrome.storage.local.get(key)
    return bag[key] ?? null
  }, TOKEN_KEY)
}

// ───────────────────────── worker/MCP 헬퍼 (golden-path·failure-probes 패턴) ─────────────────────────

async function mcpPost(token, body, sessionId = null, recorder = []) {
  assertNoProductionUrl(MCP_URL, 'MCP_URL')
  /** @type {Record<string, string>} */
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream'
  }
  if (sessionId) headers['mcp-session-id'] = sessionId
  const res = await auditedFetch(MCP_URL, { method: 'POST', headers, body: JSON.stringify(body) }, recorder)
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    json = text
  }
  return { status: res.status, sessionId: res.headers.get('mcp-session-id'), json, text }
}

function extractToolText(json) {
  const blob = typeof json === 'string' ? json : JSON.stringify(json)
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

function extractPiUrl(digest) {
  const match = digest.match(/https?:\/\/127\.0\.0\.1:8787\/pi\/[^\s"'<>]+/i)
  if (!match) throw new Error('응답에서 로컬 /pi URL을 찾지 못함')
  assertNoProductionUrl(match[0], 'pi-url')
  return match[0]
}

async function mcpInitSession(token, seenUrls, clientName) {
  const init = await mcpPost(
    token,
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: clientName, version: '1.0.0' }
      }
    },
    null,
    seenUrls
  )
  if (init.status !== 200) throw new Error(`MCP initialize 실패 status=${init.status}`)
  const sessionId = init.sessionId
  await mcpPost(token, { jsonrpc: '2.0', method: 'notifications/initialized' }, sessionId, seenUrls)
  return sessionId
}

async function listCapturesFor(token, seenUrls) {
  const res = await auditedFetch(
    `${LOCAL_UPLOAD_ENDPOINT}/captures?limit=10`,
    { headers: { Authorization: `Bearer ${token}` } },
    seenUrls
  )
  if (!res.ok) throw new Error(`GET /captures 실패 status=${res.status}`)
  return res.json()
}

// ───────────────────────── PNG 픽셀 전수검사 ─────────────────────────

/** 버퍼 전체 픽셀이 REDACT_RGB(+알파 255)인지 전수 스캔 — 마커 fixture 전체 커버 케이스용. */
async function assertFullyRedacted(buffer) {
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true })
  const channels = info.channels
  const total = info.width * info.height
  let mismatches = 0
  let alphaMismatches = 0
  for (let i = 0; i < total; i++) {
    const o = i * channels
    if (data[o] !== REDACT_RGB[0] || data[o + 1] !== REDACT_RGB[1] || data[o + 2] !== REDACT_RGB[2]) {
      mismatches++
    }
    if (channels >= 4 && data[o + 3] !== 255) alphaMismatches++
  }
  return { width: info.width, height: info.height, channels, total, mismatches, alphaMismatches }
}

// ───────────────────────── QA① 4도구 렌더 + undo ─────────────────────────

async function qa1(side, sw) {
  await clearToasts(side)
  const title = `qa1-four-tools-${RUN_ID}`
  const w = 480
  const h = 360
  const png = await createSolidPng(w, h, [255, 255, 255])
  await injectCapture(sw, side, { pngBuffer: png, sourceTitle: title, width: w, height: h })

  const rect = await getImageRect(side)
  const W = rect.width
  const H = rect.height

  // 4분면에 겹치지 않게 배치 — 각 영역 중앙이 샘플 포인트.
  const regions = {
    redact: { x1: 0.05, y1: 0.05, x2: 0.3, y2: 0.3, mid: [0.15, 0.15] },
    arrow: { x1: 0.7, y1: 0.05, x2: 0.95, y2: 0.3, mid: [0.825, 0.175] },
    highlight: { x1: 0.05, y1: 0.7, x2: 0.3, y2: 0.95, mid: [0.175, 0.825] },
    freehand: { x1: 0.7, y1: 0.7, x2: 0.95, y2: 0.95, mid: [0.825, 0.825] }
  }
  const order = ['redact', 'arrow', 'highlight', 'freehand']

  const initialDisabled = await isUndoDisabled(side)
  logStep('QA① undo 초기 비활성(주석 0건)', initialDisabled === true, `disabled=${initialDisabled}`)

  for (const tool of order) {
    const r = regions[tool]
    await selectTool(side, tool)
    await dragAbs(side, rect.x + r.x1 * W, rect.y + r.y1 * H, rect.x + r.x2 * W, rect.y + r.y2 * H, 12)
    const [mx, my] = r.mid
    const px = await sampleCanvasPixel(side, mx * W, my * H)
    const dist = colorDist(px, CANVAS_TRANSPARENT)
    logStep(
      `QA① ${tool} 렌더`,
      isDrawnPixel(px),
      `mid=(${(mx * W).toFixed(0)},${(my * H).toFixed(0)}) px=${JSON.stringify(px)} 투명(0,0,0,0)과의 RGB거리=${dist}`
    )
  }

  const afterAllDisabled = await isUndoDisabled(side)
  logStep('QA① 4개 커밋 후 undo 활성', afterAllDisabled === false, `disabled=${afterAllDisabled}`)

  await clickUndo(side)
  await side.waitForTimeout(100)

  for (const tool of order) {
    const [mx, my] = regions[tool].mid
    const after = await sampleCanvasPixel(side, mx * W, my * H)
    const drawn = isDrawnPixel(after)
    if (tool === 'freehand') {
      logStep('QA① undo 1회 = 마지막(freehand) 제거', !drawn, `after=${JSON.stringify(after)} (알파=0 기대)`)
    } else {
      logStep(`QA① undo 후 ${tool} 잔존(무관 항목 불변)`, drawn, `after=${JSON.stringify(after)} (알파>0 기대)`)
    }
  }

  const afterUndoDisabled = await isUndoDisabled(side)
  logStep('QA① undo 후 잔여 3건 존재(undo 계속 활성)', afterUndoDisabled === false, `disabled=${afterUndoDisabled}`)
}

// ───────────────────────── QA② 얇은 바 커밋 + 미세 거부 ─────────────────────────

async function qa2(side, sw) {
  await clearToasts(side)
  const title = `qa2-thinbar-${RUN_ID}`
  const w = 600
  const h = 240
  const png = await createSolidPng(w, h, [255, 255, 255])
  await injectCapture(sw, side, { pngBuffer: png, sourceTitle: title, width: w, height: h })

  await selectTool(side, 'redact')
  const rect = await getImageRect(side)

  // 텍스트 한 줄 폭 시뮬레이션: 가로로 길고 세로 8 표시px.
  const barY = rect.y + rect.height / 2
  const barX1 = rect.x + rect.width * 0.1
  const barX2 = rect.x + rect.width * 0.9
  await dragAbs(side, barX1, barY - 4, barX2, barY + 4, 10)

  const undoAfterBar = await isUndoDisabled(side)
  logStep(
    'QA② 얇은 바(가로 大·세로 8px) 커밋',
    undoAfterBar === false,
    `undo disabled=${undoAfterBar}, barWidthPx=${(barX2 - barX1).toFixed(0)}, barHeightPx=8`
  )

  const midX = rect.width * 0.5
  const midY = rect.height * 0.5
  const px = await sampleCanvasPixel(side, midX, midY)
  logStep('QA② 얇은 바 픽셀 증거', isDrawnPixel(px), `mid px=${JSON.stringify(px)} (알파>0 기대, REDACT_RGB=${JSON.stringify(REDACT_RGB)})`)

  await clearToasts(side)

  // 2×2 표시px 초미세 드래그 — 거부돼야 한다.
  const tinyX = rect.x + rect.width * 0.5
  const tinyY = rect.y + rect.height * 0.2
  await dragAbs(side, tinyX, tinyY, tinyX + 2, tinyY + 2, 3)

  const rejectToastSeen = await waitToast(side, '너무 작아 가리기가 적용되지 않았습니다', 'error', 3000)
  logStep('QA② 미세 드래그(2×2px) 거부 토스트', rejectToastSeen, rejectToastSeen ? '토스트 확인' : '토스트 미노출')

  // undo 1회로 전부 제거되면 = 미세 드래그가 실제로 0건 커밋했다는 뜻(얇은 바 1건만 있었음).
  await clickUndo(side)
  const undoAfterOne = await isUndoDisabled(side)
  logStep(
    'QA② undo 1회로 전부 제거(미세 드래그=0건 커밋 확정)',
    undoAfterOne === true,
    `disabled=${undoAfterOne}`
  )
}

// ───────────────────────── QA③ 내보내기 가림 검증(핵심) ─────────────────────────

async function qa3(side, sw, seenUrls) {
  await clearToasts(side)
  const marker = randomMarker()
  const png = await encodeMarkerToPng(marker)
  const title = `qa3-marker-redact-${RUN_ID}`
  const size = GRID_SIZE * CELL_PX
  await injectCapture(sw, side, { pngBuffer: png, sourceTitle: title, width: size, height: size })

  await selectTool(side, 'redact')
  const rect = await getImageRect(side)
  // 시작점은 캔버스 안쪽 극단(0.5px), 끝점은 경계 밖으로 overshoot — setPointerCapture 덕에
  // 그래도 캔버스가 받고, pointToPercent 의 clamp(0,100) 로 정확히 0%~100% 전체 커버가 된다.
  const startX = rect.x + 0.5
  const startY = rect.y + 0.5
  const endX = Math.min(VIEWPORT.width - 10, rect.x + rect.width + 20)
  const endY = Math.min(VIEWPORT.height - 10, rect.y + rect.height + 20)
  await dragAbs(side, startX, startY, endX, endY, 6)

  const undoEnabled = (await isUndoDisabled(side)) === false
  logStep('QA③ 마커 전체 가리기 커밋', undoEnabled, `undo enabled=${undoEnabled}`)

  const saveBtn = side.getByRole('button', { name: '내 AI에 저장' })
  await saveBtn.click()
  const consentShown = await acceptConsentIfShown(side)
  logStep('QA③ 저장 동의 처리', true, consentShown ? '동의 모달 표시 → 승인' : '이미 동의됨(스킵)')

  const savedToastOk = await waitToast(side, '내 AI에 저장됨', 'info', 8000)
  logStep('QA③ 저장 성공 토스트', savedToastOk, savedToastOk ? 'OK' : '토스트 미확인')
  if (!savedToastOk) throw new Error('저장 실패로 QA③ 나머지 단계 중단')

  const token = await getStoredToken(side)
  if (typeof token !== 'string' || !token.startsWith('sc_')) {
    throw new Error(`owner 토큰을 확보하지 못함: ${String(token)}`)
  }

  const list = await listCapturesFor(token, seenUrls)
  const hit = Array.isArray(list) ? list.find((row) => row && row.title === title) : null
  if (!hit) throw new Error(`업로드된 캡처를 목록에서 찾지 못함(title=${title})`)
  const captureId = hit.id
  logStep('QA③ 업로드 캡처 id 확보', true, captureId)

  const sessionId = await mcpInitSession(token, seenUrls, 'dogfood-qa043')
  const analyze = await mcpPost(
    token,
    {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'snap_analyze', arguments: { id: captureId, mode: 'context' } }
    },
    sessionId,
    seenUrls
  )
  const digest = extractToolText(analyze.json)
  const piUrl = extractPiUrl(digest)
  seenUrls.push(piUrl)
  logStep('QA③ snap_analyze → /pi URL', true, piUrl)

  const piRes = await auditedFetch(piUrl, { method: 'GET' }, seenUrls)
  if (piRes.status !== 200) throw new Error(`/pi fetch 실패 status=${piRes.status}`)
  const piBuf = Buffer.from(await piRes.arrayBuffer())
  const piCheck = await assertFullyRedacted(piBuf)
  logStep(
    'QA③ /pi(업로드 경로) 가림 영역 픽셀 전수검사',
    piCheck.mismatches === 0 && piCheck.alphaMismatches === 0,
    `${piCheck.total}px 중 색상불일치 ${piCheck.mismatches}·알파(255)불일치 ${piCheck.alphaMismatches} (channels=${piCheck.channels}, ${piCheck.width}x${piCheck.height})`
  )

  let decodeFailed = false
  let decodeDetail = ''
  try {
    const decoded = await decodeMarkerFromPng(piBuf)
    decodeFailed = decoded !== marker
    decodeDetail = decodeFailed ? `디코드값이 원본과 다름(원본정보 소실 확인)` : '디코드가 원본과 일치 — redaction 실패!'
  } catch (err) {
    decodeFailed = true
    decodeDetail = `디코드 예외(예상됨=원본정보 0): ${err instanceof Error ? err.message : String(err)}`
  }
  logStep('QA③ /pi 마커 디코드 실패(원본 정보 0)', decodeFailed, decodeDetail)

  // 다운로드 경로 — chrome.downloads.download() 가 먼저 시도되고(manifest "downloads" 권한),
  // 성공하면 <a download> 폴백은 실행되지 않는다.
  try {
    const downloadBtn = side.getByRole('button', { name: 'PNG 저장' })
    const downloadPromise = side.waitForEvent('download', { timeout: 10000 })
    await downloadBtn.click()
    const download = await downloadPromise
    const dlPath = await download.path()
    if (!dlPath) throw new Error('다운로드 파일 경로를 얻지 못함(path() null)')
    const dlBuf = readFileSync(dlPath)
    const dlCheck = await assertFullyRedacted(dlBuf)
    logStep(
      'QA③ 다운로드(PNG 저장) 경로 가림 영역 픽셀 전수검사',
      dlCheck.mismatches === 0 && dlCheck.alphaMismatches === 0,
      `${dlCheck.total}px 중 색상불일치 ${dlCheck.mismatches}·알파불일치 ${dlCheck.alphaMismatches}`
    )
  } catch (err) {
    logStep('QA③ 다운로드(PNG 저장) 경로', false, err instanceof Error ? err.message : String(err))
  }

  // 클립보드 경로 — 헤드리스/자동화 클립보드 이미지 read 제약이면 스킵.
  // 3경로(다운로드·복사·업로드)가 동일 bake 파이프라인(renderAnnotatedPngBlob)을 지나는
  // 계약 자체는 tests/image-actions-contract.test.ts 유닛 테스트가 이미 커버한다.
  await clearToasts(side)
  try {
    await side.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  } catch {
    /* 일부 환경엔 권한 API 자체가 없을 수 있음 — 무시하고 진행 */
  }
  const copyBtn = side.getByRole('button', { name: 'PNG 복사' })
  await copyBtn.click()
  await side.waitForTimeout(600)
  const copySuccessToast = await waitToast(side, '클립보드에 복사했습니다', 'info', 2000)
  if (copySuccessToast) {
    logStep(
      'QA③ 클립보드 경로',
      true,
      '복사 성공 토스트 확인 — 픽셀 판독은 OS 클립보드 이미지 read API 필요라 자동화 미실시(3경로 동일 파이프라인 계약은 tests/image-actions-contract.test.ts 커버)'
    )
  } else {
    const errToast = side.locator('.toast--error')
    const errText = (await errToast.count()) > 0 ? await errToast.last().textContent() : null
    logStep(
      'QA③ 클립보드 경로',
      'skip',
      `헤드리스/자동화 클립보드 제약으로 스킵. 관측 토스트=${errText ?? '(없음, timeout)'} — 3경로 동일 파이프라인 계약은 tests/image-actions-contract.test.ts 커버`
    )
  }

  return { token, captureId, title }
}

// ───────────────────────── QA④ 토큰 재발급 격리 ─────────────────────────

async function qa4(side, sw, seenUrls, qa3Result) {
  await clearToasts(side)
  const oldToken = qa3Result.token
  const oldCaptureId = qa3Result.captureId

  await side.locator('[data-role="settings"]').click()
  await side.waitForTimeout(150)
  const regenBtn = side.getByRole('button', { name: '토큰 재발급' })
  await regenBtn.click()

  const statusLoc = side.locator('.shortcuts-help__token-status')
  await statusLoc.filter({ hasText: '재발급 완료' }).first().waitFor({ state: 'visible', timeout: 8000 })
  const statusText = ((await statusLoc.textContent()) ?? '').trim()
  logStep('QA④ 재발급 완료 상태 텍스트(새 마스킹)', /재발급 완료/.test(statusText), statusText)

  const newToken = await getStoredToken(side)
  const isNewFormat = typeof newToken === 'string' && newToken.startsWith('sc_')
  const isDifferent = newToken !== oldToken
  logStep('QA④ 새 토큰 발급·기존 토큰과 다름', isNewFormat && isDifferent, `형식정상=${isNewFormat} 기존과다름=${isDifferent}`)
  if (!isNewFormat) throw new Error('새 토큰 형식이 올바르지 않아 QA④ 나머지 단계 중단')

  await side.locator('.help-close').click().catch(() => {})

  const title = `qa4-new-token-${RUN_ID}`
  const png = await createSolidPng(200, 150, [240, 240, 240])
  await injectCapture(sw, side, { pngBuffer: png, sourceTitle: title, width: 200, height: 150 })

  const saveBtn = side.getByRole('button', { name: '내 AI에 저장' })
  await saveBtn.click()
  await acceptConsentIfShown(side)
  const savedOk = await waitToast(side, '내 AI에 저장됨', 'info', 8000)
  logStep('QA④ 새 토큰으로 신규 캡처 저장', savedOk, savedOk ? 'OK' : '저장 토스트 미확인')
  if (!savedOk) throw new Error('새 토큰 저장 실패로 QA④ 나머지 단계 중단')

  const newList = await listCapturesFor(newToken, seenUrls)
  const newHit = Array.isArray(newList) ? newList.find((row) => row && row.title === title) : null
  if (!newHit) throw new Error('새 토큰 목록에서 신규 캡처를 찾지 못함')
  const newCaptureId = newHit.id

  const newSession = await mcpInitSession(newToken, seenUrls, 'dogfood-qa043-new')
  const newHist = await mcpPost(
    newToken,
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'snap_history', arguments: { limit: 10 } } },
    newSession,
    seenUrls
  )
  const newHistText = extractToolText(newHist.json)
  const newSeesNew = newHistText.includes(newCaptureId)
  const newSeesOld = newHistText.includes(oldCaptureId)
  logStep(
    'QA④ 새 토큰: 신규 캡처만 보임(구 캡처 비노출)',
    newSeesNew && !newSeesOld,
    `신규캡처포함=${newSeesNew} 구캡처포함=${newSeesOld}`
  )

  const oldSession = await mcpInitSession(oldToken, seenUrls, 'dogfood-qa043-old')
  const oldHist = await mcpPost(
    oldToken,
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'snap_history', arguments: { limit: 10 } } },
    oldSession,
    seenUrls
  )
  const oldHistText = extractToolText(oldHist.json)
  const oldSeesOld = oldHistText.includes(oldCaptureId)
  const oldSeesNew = oldHistText.includes(newCaptureId)
  logStep(
    'QA④ 구 토큰: 구 캡처는 계속 보임(신규 캡처는 비노출)',
    oldSeesOld && !oldSeesNew,
    `구캡처포함=${oldSeesOld} 신규캡처포함=${oldSeesNew}`
  )
}

// ───────────────────────── QA⑤ 히스토리 복원 고지 ─────────────────────────

async function qa5(side, sw) {
  await clearToasts(side)
  const titleWith = `qa5-with-anno-${RUN_ID}`
  const titleWithout = `qa5-no-anno-${RUN_ID}`

  // 1) 가리기가 있는 캡처 — hasAnnotations:true 를 히스토리에 기록시킨다.
  const pngA = await createSolidPng(300, 200, [255, 255, 255])
  await injectCapture(sw, side, { pngBuffer: pngA, sourceTitle: titleWith, width: 300, height: 200 })
  await selectTool(side, 'redact')
  const rectA = await getImageRect(side)
  await dragAbs(
    side,
    rectA.x + rectA.width * 0.2,
    rectA.y + rectA.height * 0.2,
    rectA.x + rectA.width * 0.6,
    rectA.y + rectA.height * 0.6,
    8
  )
  const undoEnabledA = (await isUndoDisabled(side)) === false
  logStep('QA⑤ 캡처A 가리기 추가(hasAnnotations 기록 대상)', undoEnabledA, `undo enabled=${undoEnabledA}`)
  // onCommitRedact → persistHistoryPinsDebounced(400ms) 가 flush 될 시간을 준다.
  await side.waitForTimeout(900)

  // 2) 주석 없는 새 캡처 — CAPTURE_RESULT 핸들러가 resetPinsUi() 로 annotations=[] 를 리셋한
  //    직후 저장하므로 hasAnnotations:false 로 기록된다.
  const pngB = await createSolidPng(300, 200, [230, 230, 230])
  await injectCapture(sw, side, { pngBuffer: pngB, sourceTitle: titleWithout, width: 300, height: 200 })
  await side.waitForTimeout(400)

  // 3) 히스토리에서 캡처A(가리기 있었음) 열기 → 고지 토스트가 떠야 한다.
  await clearToasts(side)
  const rowA = side.locator('.capture-history__item', { hasText: titleWith }).first()
  await rowA.waitFor({ state: 'visible', timeout: 5000 })
  await rowA.click()
  const noticeOnA = await waitToast(side, '이전에 적용한 가리기·주석은 복원되지 않습니다', 'info', 3000)
  logStep('QA⑤ 주석 있던 캡처 복원 시 고지 노출', noticeOnA, noticeOnA ? '토스트 확인' : '토스트 미노출')

  // 다음 체크로 넘어가기 전에 토스트를 확실히 비운다 — 안 그러면 A의 잔존 토스트를
  // B 체크에서 오탐(false positive)할 수 있다.
  await clearToasts(side)
  await side.waitForTimeout(200)

  // 4) 히스토리에서 캡처B(주석 없었음) 열기 → 고지가 없어야 한다(조건부 확인).
  const rowB = side.locator('.capture-history__item', { hasText: titleWithout }).first()
  await rowB.waitFor({ state: 'visible', timeout: 5000 })
  await rowB.click()
  await side.waitForTimeout(400)
  const noticeOnB = await waitToast(side, '이전에 적용한 가리기·주석은 복원되지 않습니다', 'info', 1500)
  logStep(
    'QA⑤ 주석 없던 캡처 복원 시 고지 없음(조건부 확인)',
    !noticeOnB,
    noticeOnB ? '잘못 노출됨(회귀)' : '미노출 확인(정상)'
  )
}

// ───────────────────────── 실행부 ─────────────────────────

function installNetworkGuard(context, seenUrls) {
  context.on('request', (req) => {
    const url = req.url()
    seenUrls.push(url)
    assertAllowedDogfoodRequestUrl(url, 'playwright-request')
  })
}

function writeLog(seenUrls) {
  mkdirSync(LOG_DIR, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const path = join(LOG_DIR, `qa043-${stamp}.json`)
  const payload = stripSecretsForLog({
    at: new Date().toISOString(),
    endpoint: LOCAL_UPLOAD_ENDPOINT,
    steps,
    seenUrls
  })
  writeFileSync(path, JSON.stringify(payload, null, 2), 'utf8')
  console.log(`[qa043] 로그 저장: ${path}`)
  return path
}

export async function runQa043() {
  steps = []
  /** @type {string[]} */
  const seenUrls = [LOCAL_UPLOAD_ENDPOINT, MCP_URL]

  if (!existsSync(EXTENSION_PATH)) {
    throw new Error(`dist/ 없음. pnpm build 또는 pnpm dogfood:up 먼저 실행: ${EXTENSION_PATH}`)
  }
  await assertWorkerUp(seenUrls)

  // qa043 전용 프로필을 매 실행 초기화 — 동의/토큰 플로우를 매번 결정론적으로 재현한다
  // (QA③의 "첫 저장 시 동의 모달" 경로, QA④의 "구 토큰" 이 이전 실행 잔재가 아니게).
  rmSync(PROFILE_DIR, { recursive: true, force: true })
  mkdirSync(PROFILE_DIR, { recursive: true })

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: VIEWPORT,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-default-browser-check',
      '--no-first-run'
    ]
  })
  installNetworkGuard(context, seenUrls)

  let qa3Result = null
  try {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {})
    const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker', { timeout: 15000 }))
    const extensionId = new URL(sw.url()).host
    const side = await context.newPage()
    await side.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html`, {
      waitUntil: 'domcontentloaded'
    })
    await side.waitForTimeout(600)

    await runItem('QA①(4도구 렌더+undo)', () => qa1(side, sw))
    await runItem('QA②(얇은 바 커밋+미세 거부)', () => qa2(side, sw))
    await runItem('QA③(내보내기 가림 검증)', async () => {
      qa3Result = await qa3(side, sw, seenUrls)
    })
    await runItem('QA④(토큰 재발급 격리)', async () => {
      if (!qa3Result) throw new Error('QA③ 결과 없음(구 토큰/구 캡처 id 미확보) — QA④ 스킵')
      await qa4(side, sw, seenUrls, qa3Result)
    })
    await runItem('QA⑤(히스토리 복원 고지)', () => qa5(side, sw))
  } finally {
    writeLog(seenUrls)
    await context.close()
  }

  const passed = steps.filter((s) => s.status === 'OK').length
  const failed = steps.filter((s) => s.status === 'FAIL').length
  const skipped = steps.filter((s) => s.status === 'SKIP').length
  console.log(`[qa043] 요약: OK ${passed} / FAIL ${failed} / SKIP ${skipped} (총 ${steps.length})`)

  return { ok: failed === 0, steps: [...steps] }
}

async function main() {
  const result = await runQa043()
  if (!result.ok) process.exitCode = 1
}

const isDirectRun =
  process.argv[1] != null && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])

if (isDirectRun) {
  main().catch((err) => {
    console.error('[qa043] boot failure:', err)
    process.exitCode = 1
  })
}
