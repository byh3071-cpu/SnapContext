/**
 * dogfood supervise lifecycle helpers (V6) — import 가능한 poll/cleanup.
 */
import { existsSync, readFileSync, unlinkSync } from 'node:fs'
import { terminateOwnedChildTree } from './process-own.mjs'

function defaultSleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * 공용 cleanup — terminateOwnedChildTree 경유(listener 검증 포함).
 * listener 잔존 시 throw 하며 PID 메타는 terminate 쪽에서 보존.
 *
 * @param {Record<string, unknown>} ctx
 */
export async function cleanupOwnedChild(ctx) {
  const child = /** @type {{ exitCode?: number | null } | null} */ (ctx.child)
  const cleaned = /** @type {{ value: boolean }} */ (ctx.cleaned)
  const descendantPids = /** @type {number[]} */ (ctx.descendantPids)
  const pidPath = /** @type {string} */ (ctx.pidPath)
  const stopPath = /** @type {string} */ (ctx.stopPath)
  const reason = /** @type {string} */ (ctx.reason)

  if (cleaned.value || child == null) return
  cleaned.value = true
  console.error(`[dogfood:supervise] cleanup: ${reason}`)
  const terminate =
    /** @type {typeof terminateOwnedChildTree} */ (
      ctx.terminateOwnedChildTree ?? terminateOwnedChildTree
    )
  const exists = /** @type {typeof existsSync} */ (ctx.existsSync ?? existsSync)
  const unlink = /** @type {typeof unlinkSync} */ (ctx.unlinkSync ?? unlinkSync)
  await terminate({
    child,
    descendantPids,
    pidPath
  })
  if (exists(stopPath)) {
    try {
      unlink(stopPath)
    } catch {
      /* stop 파일 삭제 경쟁은 ownership 과 무관 */
    }
  }
}

/**
 * supervisor poll 1회.
 * child 종료를 stop 파일보다 먼저 검사하고, 자연 종료도 공용 cleanup 으로 보낸다.
 *
 * @param {Record<string, unknown>} ctx
 * @returns {Promise<'continue' | 'done'>}
 */
export async function pollSuperviseOnce(ctx) {
  const child = /** @type {{ exitCode: number | null, signalCode?: string | null }} */ (
    ctx.child
  )
  const exists = /** @type {typeof existsSync} */ (ctx.existsSync ?? existsSync)
  const read = /** @type {typeof readFileSync} */ (ctx.readFileSync ?? readFileSync)
  const unlink = /** @type {typeof unlinkSync} */ (ctx.unlinkSync ?? unlinkSync)
  const wait = /** @type {(ms: number) => Promise<void>} */ (ctx.sleep ?? defaultSleep)
  const stopPath = /** @type {string} */ (ctx.stopPath)
  const bootNonce = /** @type {string} */ (ctx.bootNonce)

  // V6: child 종료 검사 우선 -> 공용 cleanup (listener fail-loud)
  if (child.exitCode != null || child.signalCode != null) {
    await cleanupOwnedChild({
      ...ctx,
      reason: 'natural-exit'
    })
    return 'done'
  }

  if (exists(stopPath)) {
    let req = null
    try {
      req = JSON.parse(read(stopPath, 'utf8'))
    } catch {
      console.error('[dogfood:supervise] stop 파일 파싱 실패 - 무시하고 계속')
      await wait(200)
      return 'continue'
    }
    if (!req || req.nonce !== bootNonce) {
      console.error('[dogfood:supervise] stop nonce 불일치 - 무시하고 계속')
      try {
        unlink(stopPath)
      } catch {
        /* ignore */
      }
      await wait(200)
      return 'continue'
    }
    await cleanupOwnedChild({
      ...ctx,
      reason: 'stop-signal'
    })
    return 'done'
  }
  await wait(200)
  return 'continue'
}
