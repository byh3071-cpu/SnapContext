/* SnapContext 0.4.2 비공개 저장·온보딩 E2E. 실제 Worker 대신 window.fetch를 mock한다. */
import { chromium } from 'playwright'
import { existsSync, mkdirSync, rmSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { tmpdir } from 'os'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '..', '..')
const EXTENSION_PATH = resolve(PROJECT_ROOT, 'dist')
const SCREENSHOTS_DIR = resolve(__dirname, 'screenshots')
const USER_DATA_DIR = resolve(tmpdir(), `snapcontext-private-${Date.now()}`)

if (!existsSync(EXTENSION_PATH)) {
  console.error('[private-save] dist/ not found. Run "pnpm build" first.')
  process.exit(1)
}
mkdirSync(SCREENSHOTS_DIR, { recursive: true })

const results = []
function check(name, pass, detail = '') {
  results.push({ name, pass, detail })
  console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const imageBuffer = await sharp({
  create: {
    width: 200,
    height: 200,
    channels: 4,
    background: { r: 90, g: 110, b: 140, alpha: 1 }
  }
})
  .png()
  .toBuffer()
const IMAGE_DATA = `data:image/png;base64,${imageBuffer.toString('base64')}`
const CAPTURE_ID = '11111111-1111-4111-8111-111111111111'
const TOKEN = 'sc_AAAAAAAAAAAAAAAAAAAAAA.BBBBBBBBBBBBBBBBBBBBBB'

const capture = {
  type: 'CAPTURE_RESULT',
  imageData: IMAGE_DATA,
  captureType: 'visible',
  sourceUrl: 'https://test.local/private?token=secret#account',
  sourceTitle: 'Private Save Test',
  viewport: { width: 1280, height: 720 },
  userAgent: 'Test/1.0',
  debugLogs: [
    { id: 'd1', level: 'error', message: 'SECRET_LOG', timestamp: '2026' }
  ],
  imageWidth: 200,
  imageHeight: 200
}

async function serviceWorker(context) {
  return context.serviceWorkers()[0] ??
    context.waitForEvent('serviceworker', { timeout: 10000 })
}

async function installFetchMock(page) {
  await page.evaluate(({ captureId, token }) => {
    window.__privateRequests = []
    window.__saved = false
    window.__deleted = false
    const realFetch = window.fetch
    window.fetch = async (input, init = {}) => {
      const url = typeof input === 'string' ? input : input.url
      if (url.endsWith('/token')) {
        return new Response(JSON.stringify({ token }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }
      if (url.includes('/captures')) {
        const headers = init.headers ?? null
        if (init.method === 'DELETE') {
          window.__deleted = true
          window.__privateRequests.push({ method: 'DELETE', url, headers })
          return new Response(null, { status: 204 })
        }
        if (init.method === 'POST') {
          const form = init.body
          window.__privateRequests.push({
            method: 'POST',
            url,
            headers,
            context: String(form.get('context')),
            expiresInDays: String(form.get('expiresInDays'))
          })
          window.__saved = true
          return new Response(
            JSON.stringify({
              id: captureId,
              expiresAt: '2026-08-12T00:00:00.000Z'
            }),
            { status: 201, headers: { 'Content-Type': 'application/json' } }
          )
        }
        const list = window.__saved && !window.__deleted
          ? [{
              id: captureId,
              createdAt: '2026-08-05T00:00:00.000Z',
              url: 'https://test.local/private',
              title: 'Private Save Test',
              captureType: 'visible',
              pinCount: 0
            }]
          : []
        window.__privateRequests.push({ method: 'GET', url, headers })
        return new Response(JSON.stringify(list), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }
      return realFetch(input, init)
    }
  }, { captureId: CAPTURE_ID, token: TOKEN })
}

async function main() {
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    viewport: { width: 420, height: 980 },
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-default-browser-check',
      '--no-first-run'
    ]
  })

  let exitCode = 0
  try {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    const sw = await serviceWorker(context)
    const extensionId = new URL(sw.url()).host
    const page = await context.newPage()
    await page.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html`, {
      waitUntil: 'domcontentloaded'
    })
    await page.waitForTimeout(500)
    await installFetchMock(page)

    check(
      'AI 연결이 캡처 전에도 주 화면에 보임',
      (await page.getByText('1. AI 도구 연결', { exact: true }).count()) === 1
    )
    const initialSetup = await page.locator('.ai-relay__setup').textContent()
    check(
      '연결 안내는 환경변수와 snap_history를 사용',
      initialSetup.includes('SNAPCONTEXT_MCP_TOKEN') &&
        initialSetup.includes('snap_history') &&
        !initialSetup.includes(TOKEN)
    )
    for (const client of ['cursor', 'codex']) {
      // 0.4.4: 벤더 아이콘 드롭다운으로 교체(role=listbox) — 네이티브 select가 아니라
      // 트리거 클릭 → 옵션 클릭으로 선택한다(vendor-logo-policy.md 승인 A안).
      await page.locator('#ai-relay-client').click()
      await page.locator(`#ai-relay-client-listbox [data-value="${client}"]`).click()
      const setup = await page.locator('.ai-relay__setup').textContent()
      check(`${client} 연결 안내 노출`, setup.includes('/mcp'))
    }

    await sw.evaluate(async (payload) => {
      await chrome.runtime.sendMessage(payload)
    }, capture)
    await page.waitForTimeout(700)

    const directGuide = await page
      .locator('.image-actions__direct-guide')
      .textContent()
    check(
      '사람 직접 전달은 복사→붙여넣기→요청 순서를 안내',
      directGuide.includes('PNG 복사') &&
        directGuide.includes('AI 채팅에 붙여넣') &&
        directGuide.includes('원하는 일')
    )

    await page.locator('#ai-relay-mode').selectOption('refactor')
    await page.locator('#ai-relay-intent').fill('핀 위치를 더 잘 보이게 개선해 줘')
    const saveButton = page.getByRole('button', { name: '내 AI에 저장' })

    await saveButton.click()
    await page.waitForTimeout(200)
    const consent = page.locator('.snap-confirm')
    check('저장 전 전송 동의 표시', (await consent.count()) === 1)
    const consentText = await consent.textContent()
    check(
      '동의문에 Cloudflare·AI 제공자·공개 링크 없음 표시',
      consentText.includes('Cloudflare') &&
        consentText.includes('AI 제공자') &&
        consentText.includes('공개 링크')
    )
    await page.locator('.snap-confirm__btn--muted').click()
    await page.waitForTimeout(200)
    check(
      '동의 취소 시 POST 없음',
      (await page.evaluate(() => window.__privateRequests)).length === 0
    )

    await saveButton.click()
    await page.locator('.snap-confirm__btn--primary').click()
    await page.waitForTimeout(900)
    const requests = await page.evaluate(() => window.__privateRequests)
    const post = requests.find((request) => request.method === 'POST')
    const sent = post ? JSON.parse(post.context) : null
    check('신규 저장은 /captures 사용', post?.url.endsWith('/captures') === true)
    check(
      'owner bearer 필수',
      post?.headers?.Authorization === `Bearer ${TOKEN}`
    )
    check(
      'SharedContextV2 intent·mode 전송',
      sent?.v === 2 && sent?.mode === 'refactor' && sent?.intent.includes('개선')
    )
    check(
      'URL query·fragment와 debugLogs 미전송',
      sent?.sourceUrl === 'https://test.local/private' &&
        !post.context.includes('secret') &&
        !post.context.includes('SECRET_LOG')
    )
    check('보관 기간 기본 7일', post?.expiresInDays === '7')
    const clipboard = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''))
    check('저장 후 공개 /s 링크를 복사하지 않음', !clipboard.includes('/s/'))

    check(
      '서버 저장 목록 표시',
      (await page
        .locator('.ai-relay__saved-list')
        .getByText('Private Save Test', { exact: true })
        .count()) === 1
    )
    await page.getByRole('button', { name: '즉시 삭제' }).click()
    await page.locator('.snap-confirm__btn--primary').click()
    await page.waitForTimeout(600)
    check('즉시 삭제 요청 실행', await page.evaluate(() => window.__deleted === true))
    check(
      '삭제 뒤 빈 목록 표시',
      (await page.getByText('서버에 저장된 캡처가 없습니다.', { exact: true }).count()) === 1
    )

    await page.screenshot({
      path: resolve(SCREENSHOTS_DIR, '07-private-save.png'),
      fullPage: true
    })
    const failures = results.filter((result) => !result.pass)
    console.log(`\n[private-save] ${results.length - failures.length}/${results.length} checks passed`)
    if (failures.length > 0) exitCode = 1
  } catch (error) {
    console.error('[private-save] fatal:', error)
    exitCode = 1
  } finally {
    await context.close()
    try {
      rmSync(USER_DATA_DIR, { recursive: true, force: true })
    } catch {
      // 임시 브라우저 프로필 정리는 제품 동작 검증 결과에 영향을 주지 않는다.
    }
  }
  process.exit(exitCode)
}

main()
