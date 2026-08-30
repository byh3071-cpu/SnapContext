/**
 * SnapContext 0.4.6 수동 QA — 실브라우저 자동 프로브 ("첫 15초 흐름" + 저장 배지).
 *
 * 대상: docs/PRD-0.4.6.md DoD 4항(수동 QA: 캡처→핀→요약 카드→복사→안내 1줄 + 실패 배지 재현).
 * 전제: dogfood:up 으로 로컬 Worker(127.0.0.1:8787) + dist(로컬 endpoint) + profile 준비.
 * 패턴 SoT: qa-043.mjs(persistent context·injectCapture·waitToast·동의 처리·로그 저장).
 *
 * QA① 핀 의도 1비트 — 토글 기본 참고·클릭/키보드 전환·포커스 유지·이미지 배지 구분
 * QA② 요약 카드 — 템플릿·핀 N·버그 M 표시, 원문은 기본 접힘
 * QA③ 복사 + 안내 1줄 — 클립보드 원문 스마트 디폴트(버그 핀=환경 포함 / 참고 핀=미포함)
 * QA④ 내 AI에 저장 성공 — 안내 1줄(보관기간 포함) + 기록 항목 "저장됨" 배지
 * QA⑤ 저장 실패 — 서버 500 → "실패" 배지 + 재시도 버튼 → 복구 후 재시도 → "저장됨"
 * QA⑥ 용어·접근성 — 패널 표시 텍스트 금지어 0, toast root aria-live
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

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '../../..')
const EXTENSION_PATH = resolve(ROOT, 'dist')
const PROFILE_DIR = resolve(__dirname, 'profile', 'qa046')
const LOG_DIR = resolve(__dirname, 'logs')
const VIEWPORT = { width: 900, height: 1000 }
const RUN_ID = Date.now().toString(36)
const FORBIDDEN_UI = /캡쳐|스냅샷|스크린샷|어노테이션|업로드|프롬프트 팩|Context Pack/

/** @type {{ name: string, status: 'OK'|'FAIL'|'SKIP', detail?: string }[]} */
let steps = []

function logStep(name, status, detail = '') {
  const label = status === true ? 'OK' : status === 'skip' ? 'SKIP' : status === false ? 'FAIL' : status
  steps.push({ name, status: label, detail })
  console.log(`[qa046] ${label} ${name}${detail ? ` — ${detail}` : ''}`)
}

async function runItem(label, fn) {
  try {
    await fn()
  } catch (err) {
    logStep(`${label} 중단(예외)`, false, err instanceof Error ? err.message : String(err))
  }
}

async function assertWorkerUp(recorder) {
  assertNoProductionUrl(LOCAL_UPLOAD_ENDPOINT, 'LOCAL_UPLOAD_ENDPOINT')
  const varsPath = resolve(ROOT, 'worker', '.dev.vars.dogfood')
  if (!existsSync(varsPath)) throw new Error('worker/.dev.vars.dogfood 없음 — 먼저 pnpm dogfood:up')
  const vars = parseDevVars(readFileSync(varsPath, 'utf8'))
  const res = await auditedFetch(dogfoodHealthUrl(vars.DOGFOOD_BOOT_NONCE), { method: 'GET' }, recorder)
  if (res.status !== 200) throw new Error(`로컬 Worker 헬스체크 실패 status=${res.status} — pnpm dogfood:up 먼저`)
  const body = await res.json()
  if (body.ok !== true || body.dogfood !== true) throw new Error(`dogfood 헬스 본문 불일치: ${JSON.stringify(body)}`)
  logStep('로컬 Worker 헬스체크', true, 'dogfood-health')
}

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

async function injectCapture(sw, side, { pngBuffer, sourceTitle, width, height }) {
  const imageData = `data:image/png;base64,${pngBuffer.toString('base64')}`
  await sw.evaluate(
    async (payload) => {
      await chrome.runtime.sendMessage(payload)
    },
    {
      type: 'CAPTURE_RESULT',
      imageData,
      captureType: 'visible',
      sourceUrl: 'http://127.0.0.1:9/qa046',
      sourceTitle,
      viewport: VIEWPORT,
      userAgent: 'dogfood-qa046/1.0',
      imageWidth: width,
      imageHeight: height
    }
  )
  await side.waitForTimeout(500)
  await side.waitForFunction(
    () => {
      const img = document.querySelector('img.preview-img')
      return img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0
    },
    undefined,
    { timeout: 6000 }
  )
}

async function clearToasts(side) {
  await side.evaluate(() => {
    const root = document.getElementById('toast-root')
    if (root) root.replaceChildren()
  })
}

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

/** 이미지 중앙을 실제 포인터로 클릭해 핀을 추가한다(App.ts 핀 레이어 click 게이트). */
async function addPinAtCenter(side) {
  const img = side.locator('img.preview-img')
  await img.scrollIntoViewIfNeeded()
  const box = await img.boundingBox()
  if (!box) throw new Error('이미지 bounding box 없음')
  await side.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await side.waitForTimeout(200)
}

function kindButton(side, pinId) {
  return side.locator(`.pin-memo__row[data-pin-id="${pinId}"] .pin-memo__kind`)
}

async function readClipboard(side) {
  return side.evaluate(() => navigator.clipboard.readText())
}

// ───────────────────────── QA① 핀 의도 1비트 ─────────────────────────

async function qa1(side, sw) {
  await clearToasts(side)
  const png = await createSolidPng(320, 200, [245, 245, 245])
  await injectCapture(sw, side, { pngBuffer: png, sourceTitle: `qa046-pin-${RUN_ID}`, width: 320, height: 200 })
  await addPinAtCenter(side)

  const btn = kindButton(side, 1)
  await btn.waitFor({ state: 'visible', timeout: 4000 })
  const text0 = (await btn.textContent())?.trim()
  const pressed0 = await btn.getAttribute('aria-pressed')
  const title0 = await btn.getAttribute('title')
  logStep('QA① 새 핀 기본 = 참고(aria-pressed=false)', text0 === '참고' && pressed0 === 'false', `text=${text0} pressed=${pressed0}`)
  logStep('QA① 참고 상태 툴팁(선택 전 안내)', Boolean(title0 && title0.includes('누르면 버그로 표시')), title0 ?? '(없음)')

  await btn.click()
  await side.waitForTimeout(150)
  const text1 = (await btn.textContent())?.trim()
  const pressed1 = await btn.getAttribute('aria-pressed')
  const title1 = await btn.getAttribute('title')
  logStep('QA① 클릭 → 버그(aria-pressed=true)', text1 === '버그' && pressed1 === 'true', `text=${text1} pressed=${pressed1}`)
  logStep('QA① 버그 상태 툴팁', Boolean(title1 && title1.includes('예상과 다르게 동작해요')), title1 ?? '(없음)')
  const bugBadges = await side.locator('.pin-badge--bug').count()
  logStep('QA① 이미지 배지 버그 구분(pin-badge--bug)', bugBadges >= 1, `count=${bugBadges}`)

  // 키보드: 포커스 유지 확인(W1-fix F1) — Space 2연타
  await btn.focus()
  await side.keyboard.press('Space')
  await side.waitForTimeout(120)
  const afterFirst = await side.evaluate(() => {
    const el = document.activeElement
    return { tag: el?.tagName, cls: el?.className, text: el?.textContent?.trim() }
  })
  await side.keyboard.press('Space')
  await side.waitForTimeout(120)
  const afterSecond = await side.evaluate(() => {
    const el = document.activeElement
    return { tag: el?.tagName, cls: el?.className, text: el?.textContent?.trim() }
  })
  const focusKept = afterFirst.cls?.includes('pin-memo__kind') && afterSecond.cls?.includes('pin-memo__kind')
  logStep(
    'QA① 키보드 Space 2연타 — 포커스 유지·상태 왕복(버그→참고→버그)',
    focusKept && afterFirst.text === '참고' && afterSecond.text === '버그',
    `1회차=${afterFirst.text}(${afterFirst.tag}) 2회차=${afterSecond.text}(${afterSecond.tag})`
  )
}

// ───────────────────────── QA② 요약 카드 ─────────────────────────

async function qa2(side) {
  const card = side.locator('.context-pack-panel__summary')
  await card.scrollIntoViewIfNeeded()
  const visible = await card.isVisible()
  const inactive = (await card.getAttribute('class'))?.includes('--inactive')
  const text = ((await card.textContent()) ?? '').replace(/\s+/g, ' ')
  logStep('QA② 요약 카드 표시(활성)', visible && !inactive, `inactive=${inactive}`)
  logStep('QA② 카드에 템플릿 라벨', /버그 리포트|리팩토링|레퍼런스/.test(text), text.slice(0, 120))
  logStep('QA② 카드에 핀 1·버그 1', /1/.test(text) && /버그/.test(text), text.slice(0, 120))
  const rawOpen = await side.locator('details.context-pack-panel__raw').evaluate((d) => d.open)
  logStep('QA② 원문("자세히 보기") 기본 접힘', rawOpen === false, `open=${rawOpen}`)
  const copyBtns = await side.locator('.context-pack-panel__summary button', { hasText: 'AI 프롬프트 복사' }).count()
  logStep('QA② 카드 안 복사 버튼 1개', copyBtns === 1, `count=${copyBtns}`)
}

// ───────────────────────── QA③ 복사 + 안내 1줄 + 스마트 디폴트 ─────────────────────────

async function qa3(side) {
  await side.context().grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {})
  await clearToasts(side)
  const copyBtn = side.getByRole('button', { name: 'AI 프롬프트 복사' }).first()
  await copyBtn.click()
  const toastOk = await waitToast(side, 'AI 대화창에 붙여넣고 이미지를 함께 첨부하세요', 'info', 4000)
  logStep('QA③ 복사 직후 다음 행동 안내 1줄', toastOk, toastOk ? '토스트 확인' : '토스트 미노출')

  let clip = ''
  try {
    clip = await readClipboard(side)
  } catch (err) {
    logStep('QA③ 클립보드 읽기', 'skip', `자동화 클립보드 제약: ${err instanceof Error ? err.message : err}`)
  }
  if (clip) {
    const oneLine = clip.replace(/\s+/g, ' ')
    logStep('QA③ 원문: 핀 메모 절 + [버그] 태그', /## 핀 메모/.test(clip) && /\[버그\]/.test(clip), oneLine.slice(0, 160))
    logStep('QA③ 원문: 버그 핀 → 환경(UA·뷰포트·좌표) 포함', /## 환경/.test(clip) && /%/.test(clip), /## 환경/.test(clip) ? '환경 절 있음' : '환경 절 없음')
    logStep('QA③ 원문: 옛 용어 없음(핀 주석·캡쳐 방식·스크린샷)', !/핀 주석|캡쳐 방식|스크린샷/.test(clip), 'grep 0')
    logStep('QA③ 원문: 4항 번호 지시문 제거', !/\n1\. .*\n2\. .*\n3\. .*\n4\. /s.test(clip), '번호 목록 없음')
  }

  // 참고로 되돌려 lite 렌더 확인
  await kindButton(side, 1).click()
  await side.waitForTimeout(150)
  await clearToasts(side)
  await copyBtn.click()
  await waitToast(side, 'AI 대화창에', 'info', 3000)
  let clip2 = ''
  try {
    clip2 = await readClipboard(side)
  } catch {
    /* 위에서 skip 처리됨 */
  }
  if (clip2) {
    logStep('QA③ 원문(참고 핀만): 환경·좌표 미포함(스마트 디폴트)', !/## 환경/.test(clip2) && !/\d+\.\d%/.test(clip2), /## 환경/.test(clip2) ? '환경 절 잔존' : 'lite 렌더')
  }
  // 자세히 보기 열면 원문이 카드 아래에 보임
  const raw = side.locator('details.context-pack-panel__raw')
  await raw.locator('summary').click()
  await side.waitForTimeout(200)
  const pre = ((await side.locator('.context-pack-panel__raw-text').textContent()) ?? '').trim()
  logStep('QA③ 자세히 보기 → 원문 표시', pre.length > 20 && /핀 메모/.test(pre), `${pre.length}자`)
  await raw.locator('summary').click()
}

// ───────────────────────── QA④ 저장 성공 배지 ─────────────────────────

async function qa4(side, sw) {
  await clearToasts(side)
  const title = `qa046-save-ok-${RUN_ID}`
  const png = await createSolidPng(240, 160, [230, 240, 250])
  await injectCapture(sw, side, { pngBuffer: png, sourceTitle: title, width: 240, height: 160 })
  const saveBtn = side.getByRole('button', { name: '내 AI에 저장' })
  await saveBtn.scrollIntoViewIfNeeded()
  await saveBtn.click()
  const consentShown = await acceptConsentIfShown(side)
  logStep('QA④ 저장 동의 처리', true, consentShown ? '동의 모달 → 승인' : '이미 동의됨')
  const okToast = await waitToast(side, '내 AI에 저장됨', 'info', 10000)
  const toastText = okToast ? ((await side.locator('.toast--info', { hasText: '내 AI에 저장됨' }).first().textContent()) ?? '') : ''
  logStep('QA④ 저장 성공 안내 1줄(보관기간 + 다음 행동)', okToast && /후 삭제/.test(toastText) && /방금 캡처 분석해줘/.test(toastText), toastText || '토스트 미노출')
  const row = side.locator('.capture-history__item-wrap', { hasText: title }).first()
  await row.waitFor({ state: 'visible', timeout: 5000 })
  const badge = row.locator('.capture-history__save-badge--saved')
  const badgeText = (await badge.count()) ? (await badge.first().textContent())?.trim() : null
  logStep('QA④ 기록 항목 "저장됨" 배지', badgeText === '저장됨', `badge=${badgeText ?? '(없음)'}`)
  const retryCount = await row.locator('.capture-history__retry').count()
  logStep('QA④ 성공 항목엔 재시도 버튼 없음', retryCount === 0, `retry=${retryCount}`)
}

// ───────────────────────── QA⑤ 저장 실패 배지 + 재시도 ─────────────────────────

async function qa5(side, sw) {
  await clearToasts(side)
  const title = `qa046-save-fail-${RUN_ID}`
  const context = side.context()
  let intercepted = 0
  const handler = async (route) => {
    if (route.request().method() === 'POST') {
      intercepted += 1
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"qa046 injected"}' })
      return
    }
    await route.continue()
  }
  await context.route('**/captures', handler)
  try {
    const png = await createSolidPng(240, 160, [250, 235, 235])
    await injectCapture(sw, side, { pngBuffer: png, sourceTitle: title, width: 240, height: 160 })
    const saveBtn = side.getByRole('button', { name: '내 AI에 저장' })
    await saveBtn.scrollIntoViewIfNeeded()
    await saveBtn.click()
    await acceptConsentIfShown(side)
    const errToast = await waitToast(side, '', 'error', 10000)
    logStep('QA⑤ 서버 500 → 실패 토스트(조용한 실패 없음)', errToast && intercepted >= 1, `intercepted=${intercepted}`)
    const row = side.locator('.capture-history__item-wrap', { hasText: title }).first()
    await row.waitFor({ state: 'visible', timeout: 5000 })
    await side.waitForTimeout(300)
    const failedBadge = row.locator('.capture-history__save-badge--failed')
    const failedText = (await failedBadge.count()) ? (await failedBadge.first().textContent())?.trim() : null
    logStep('QA⑤ 기록 항목 "실패" 배지', failedText === '실패', `badge=${failedText ?? '(없음)'}`)
    const retry = row.locator('.capture-history__retry')
    logStep('QA⑤ 실패 항목에 재시도 버튼', (await retry.count()) === 1, `retry=${await retry.count()}`)
  } finally {
    await context.unroute('**/captures', handler)
  }

  // 복구 후 재시도
  await clearToasts(side)
  const row = side.locator('.capture-history__item-wrap', { hasText: title }).first()
  await row.locator('.capture-history__retry').click()
  await acceptConsentIfShown(side)
  const okToast = await waitToast(side, '내 AI에 저장됨', 'info', 10000)
  logStep('QA⑤ 재시도 → 저장 성공 토스트', okToast, okToast ? 'OK' : '토스트 미노출')
  await side.waitForTimeout(400)
  const row2 = side.locator('.capture-history__item-wrap', { hasText: title }).first()
  const savedNow = (await row2.locator('.capture-history__save-badge--saved').count()) === 1
  const retryGone = (await row2.locator('.capture-history__retry').count()) === 0
  logStep('QA⑤ 재시도 후 배지 "저장됨"·재시도 버튼 제거', savedNow && retryGone, `saved=${savedNow} retryGone=${retryGone}`)
}

// ───────────────────────── QA⑥ 용어·접근성 ─────────────────────────

async function qa6(side) {
  const text = await side.evaluate(() => document.body.innerText)
  const hits = text.match(new RegExp(FORBIDDEN_UI.source, 'g')) ?? []
  logStep('QA⑥ 패널 표시 텍스트 금지어 0', hits.length === 0, hits.length ? `발견: ${[...new Set(hits)].join(',')}` : '0건')
  const live = await side.evaluate(() => {
    const root = document.getElementById('toast-root')
    return { live: root?.getAttribute('aria-live'), role: root?.getAttribute('role') }
  })
  logStep('QA⑥ toast root aria-live=polite·role=status', live.live === 'polite' && live.role === 'status', JSON.stringify(live))
}

// ───────────────────────── 실행 ─────────────────────────

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
  const path = join(LOG_DIR, `qa046-${stamp}.json`)
  writeFileSync(path, JSON.stringify(stripSecretsForLog({ at: new Date().toISOString(), endpoint: LOCAL_UPLOAD_ENDPOINT, steps, seenUrls }), null, 2), 'utf8')
  console.log(`[qa046] 로그 저장: ${path}`)
}

export async function runQa046() {
  steps = []
  const seenUrls = [LOCAL_UPLOAD_ENDPOINT]
  if (!existsSync(EXTENSION_PATH)) throw new Error(`dist/ 없음 — pnpm dogfood:up 먼저: ${EXTENSION_PATH}`)
  await assertWorkerUp(seenUrls)
  rmSync(PROFILE_DIR, { recursive: true, force: true })
  mkdirSync(PROFILE_DIR, { recursive: true })

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: VIEWPORT,
    args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`, '--no-default-browser-check', '--no-first-run']
  })
  installNetworkGuard(context, seenUrls)
  try {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {})
    const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker', { timeout: 15000 }))
    const extensionId = new URL(sw.url()).host
    const side = await context.newPage()
    await side.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html`, { waitUntil: 'domcontentloaded' })
    await side.waitForTimeout(600)

    await runItem('QA①(핀 의도 1비트)', () => qa1(side, sw))
    await runItem('QA②(요약 카드)', () => qa2(side))
    await runItem('QA③(복사·안내·스마트 디폴트)', () => qa3(side))
    await runItem('QA④(저장 성공 배지)', () => qa4(side, sw))
    await runItem('QA⑤(저장 실패 배지·재시도)', () => qa5(side, sw))
    await runItem('QA⑥(용어·접근성)', () => qa6(side))
  } finally {
    writeLog(seenUrls)
    await context.close()
  }
  const passed = steps.filter((s) => s.status === 'OK').length
  const failed = steps.filter((s) => s.status === 'FAIL').length
  const skipped = steps.filter((s) => s.status === 'SKIP').length
  console.log(`[qa046] 요약: OK ${passed} / FAIL ${failed} / SKIP ${skipped} (총 ${steps.length})`)
  return { ok: failed === 0, steps: [...steps] }
}

const isDirectRun = process.argv[1] != null && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])
if (isDirectRun) {
  runQa046()
    .then((r) => {
      if (!r.ok) process.exitCode = 1
    })
    .catch((err) => {
      console.error('[qa046] boot failure:', err)
      process.exitCode = 1
    })
}
