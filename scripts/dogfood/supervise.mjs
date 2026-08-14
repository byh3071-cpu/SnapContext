#!/usr/bin/env node
/**
 * dogfood supervise — wrangler ChildProcess handle 소유 (V5 handle-only).
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildCommandIdentityFromArgv,
  formatDiagnosticCommand,
  serializePidMeta
} from './lib.mjs'
import {
  listDescendantPids,
  readLiveProcess,
  terminateOwnedChildTree
} from './process-own.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function main() {
  const configPath = process.env.DOGFOOD_SUPERVISE_CONFIG
  if (!configPath || !existsSync(configPath)) {
    throw new Error('DOGFOOD_SUPERVISE_CONFIG 없음')
  }
  const config = JSON.parse(readFileSync(configPath, 'utf8'))
  const {
    bootNonce,
    runtimeDir,
    wranglerJs,
    wranglerArgs,
    pidPath,
    stopPath,
    nodeExecutable
  } = config
  if (!bootNonce || !runtimeDir || !wranglerJs || !Array.isArray(wranglerArgs)) {
    throw new Error('supervise config 불완전')
  }
  const execPath = typeof nodeExecutable === 'string' ? nodeExecutable : process.execPath
  const identity = buildCommandIdentityFromArgv(execPath, [wranglerJs, ...wranglerArgs], {
    cwd: runtimeDir.replace(/\\/g, '/')
  })
  const cmd = formatDiagnosticCommand(execPath, [wranglerJs, ...wranglerArgs])

  /** @type {import('node:child_process').ChildProcess | null} */
  let child = null
  /** @type {number[]} */
  let descendantPids = []
  let cleaned = false

  const cleanupOwned = async (reason) => {
    if (cleaned || child == null) return
    cleaned = true
    console.error(`[dogfood:supervise] cleanup: ${reason}`)
    await terminateOwnedChildTree({
      child,
      descendantPids,
      pidPath
    })
    if (existsSync(stopPath)) {
      try {
        unlinkSync(stopPath)
      } catch {
        /* ignore */
      }
    }
  }

  try {
    child = spawn(execPath, [wranglerJs, ...wranglerArgs], {
      cwd: runtimeDir,
      stdio: 'ignore',
      env: process.env,
      windowsHide: true,
      detached: false
    })
    if (child.pid == null) throw new Error('wrangler pid 없음')

    let live = null
    for (let i = 0; i < 40; i++) {
      try {
        live = readLiveProcess(child.pid)
        if (live != null) break
      } catch {
        // 등록 전 — async 재시도
      }
      await sleep(50)
    }
    if (live == null) {
      throw new Error(`spawn 직후 live 조회 실패 pid=${child.pid}`)
    }

    await sleep(300)
    descendantPids = listDescendantPids(child.pid)

    writeFileSync(
      pidPath,
      serializePidMeta({
        pid: child.pid,
        supervisorPid: process.pid,
        startedAtMs: live.startedAtMs,
        cmd: live.cmd || cmd,
        bootNonce,
        identity
      }),
      'utf8'
    )

    while (true) {
      // V5: child 종료 검사를 stop 파일보다 먼저
      if (child.exitCode != null || child.signalCode != null) {
        cleaned = true
        if (existsSync(pidPath)) {
          try {
            unlinkSync(pidPath)
          } catch {
            /* ignore */
          }
        }
        if (existsSync(stopPath)) {
          try {
            unlinkSync(stopPath)
          } catch {
            /* ignore */
          }
        }
        return
      }

      if (existsSync(stopPath)) {
        let req = null
        try {
          req = JSON.parse(readFileSync(stopPath, 'utf8'))
        } catch {
          console.error('[dogfood:supervise] stop 파일 파싱 실패 — 무시하고 계속')
          await sleep(200)
          continue
        }
        if (!req || req.nonce !== bootNonce) {
          console.error('[dogfood:supervise] stop nonce 불일치 — 무시하고 계속')
          try {
            unlinkSync(stopPath)
          } catch {
            /* ignore */
          }
          await sleep(200)
          continue
        }
        await cleanupOwned('stop-signal')
        return
      }
      await sleep(200)
    }
  } finally {
    if (!cleaned && child != null) {
      try {
        await cleanupOwned('finally')
      } catch (cleanupErr) {
        console.error(
          '[dogfood:supervise] finally cleanup 실패:',
          cleanupErr instanceof Error ? cleanupErr.message : cleanupErr
        )
        throw cleanupErr
      }
    }
  }
}

main().catch((err) => {
  console.error('[dogfood:supervise] 실패:', err instanceof Error ? err.message : err)
  process.exitCode = 1
})
