/**
 * dogfood:verify — golden path + failure probes 통합 (R2: 토큰 로그 제거).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runGoldenPath } from './golden-path.mjs'
import { runFailureProbes } from './failure-probes.mjs'
import {
  assertLogHasNoUserToken,
  countProductionUrls,
  stripSecretsForLog,
  summarizeVerifyResults
} from './lib/failure-probe-logic.mjs'
import { LOCAL_UPLOAD_ENDPOINT } from '../../../scripts/dogfood/lib.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const LOG_DIR = resolve(__dirname, 'logs')

async function main() {
  console.log(`[verify] 시작 — endpoint=${LOCAL_UPLOAD_ENDPOINT}`)
  const golden = await runGoldenPath()
  // B1: 로그용 객체에서 userToken 분리
  const { userToken, ...goldenPublic } = golden

  if (!golden.ok) {
    console.error('[verify] golden path 실패 — failure probes 생략')
    writeSummary({
      ok: false,
      golden: goldenPublic,
      probes: null,
      reason: 'golden-path-failed'
    })
    process.exitCode = 1
    return
  }

  if (!golden.captureId || !userToken || !golden.piUrl) {
    console.error('[verify] golden 결과에 captureId/token/piUrl 누락')
    process.exitCode = 1
    return
  }

  const probes = await runFailureProbes({
    deletedCaptureId: golden.captureId,
    userToken,
    piUrl: golden.piUrl
  })

  const allSteps = [
    ...golden.steps.map((s) => ({ ...s, name: `golden:${s.name}` })),
    ...probes.results.map((s) => ({ ...s, name: `probe:${s.name}` }))
  ]
  const seenUrls = [...(golden.seenUrls ?? []), ...(probes.seenUrls ?? [])]
  const productionRequestCount = countProductionUrls(seenUrls)

  let summary
  try {
    summary = summarizeVerifyResults(allSteps, productionRequestCount)
  } catch (err) {
    console.error('[verify] 요약 실패:', err instanceof Error ? err.message : err)
    writeSummary({
      ok: false,
      golden: goldenPublic,
      probes: { ok: probes.ok, results: probes.results },
      productionRequestCount,
      error: err instanceof Error ? err.message : String(err)
    })
    process.exitCode = 1
    return
  }

  console.log(
    `[verify] 요약: ${summary.passed}/${summary.total} 통과, 실패=${summary.failed}, production요청=${summary.productionRequestCount}`
  )
  writeSummary({
    ok: summary.ok,
    summary,
    golden: goldenPublic,
    probes: { ok: probes.ok, results: probes.results }
  })

  if (!summary.ok || !probes.ok) {
    process.exitCode = 1
    console.error('[verify] 실패')
    return
  }
  console.log('[verify] 전체 통과')
}

/**
 * @param {Record<string, unknown>} payload
 */
function writeSummary(payload) {
  mkdirSync(LOG_DIR, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const path = join(LOG_DIR, `verify-${stamp}.json`)
  const safe = stripSecretsForLog({ at: new Date().toISOString(), ...payload })
  assertLogHasNoUserToken(safe)
  writeFileSync(path, JSON.stringify(safe, null, 2), 'utf8')
  console.log(`[verify] 로그 저장: ${path}`)
}

main().catch((err) => {
  console.error('[verify] fatal:', err)
  process.exitCode = 1
})
