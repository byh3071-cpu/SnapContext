#!/usr/bin/env node
/**
 * dogfood supervise — wrangler ChildProcess handle 소유 (V6: natural-exit 공용 cleanup).
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildCommandIdentityFromArgv,
  formatDiagnosticCommand,
  serializePidMeta
} from './lib.mjs'
import {
  listDescendantPids,
  readLiveProcess
} from './process-own.mjs'
import { cleanupOwnedChild, pollSuperviseOnce } from './supervise-lifecycle.mjs'

export { cleanupOwnedChild, pollSuperviseOnce } from './supervise-lifecycle.mjs'

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
  const cleaned = { value: false }

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
        // 등록 전 - async 재시도
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
      const step = await pollSuperviseOnce({
        child,
        descendantPids,
        pidPath,
        stopPath,
        bootNonce,
        cleaned
      })
      if (step === 'done') return
    }
  } finally {
    if (!cleaned.value && child != null) {
      try {
        await cleanupOwnedChild({
          child,
          descendantPids,
          pidPath,
          stopPath,
          cleaned,
          reason: 'finally'
        })
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

const isDirectRun = (() => {
  const entry = process.argv[1]
  if (!entry) return false
  return fileURLToPath(import.meta.url).toLowerCase() === resolve(entry).toLowerCase()
})()

if (isDirectRun) {
  main().catch((err) => {
    console.error('[dogfood:supervise] 실패:', err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
}
