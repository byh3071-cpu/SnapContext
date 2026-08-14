#!/usr/bin/env node
/**
 * dogfood supervise — wrangler child handle 소유. stop 파일(nonce)로만 종료.
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
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

  const child = spawn(execPath, [wranglerJs, ...wranglerArgs], {
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
    try {
      child.kill()
    } catch {
      /* ignore */
    }
    throw new Error(`spawn 직후 live 조회 실패 pid=${child.pid}`)
  }

  await sleep(300)
  const descendantPids = listDescendantPids(child.pid)

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

  const shutdown = async (reason) => {
    console.error(`[dogfood:supervise] 종료 시작: ${reason}`)
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

  child.on('exit', () => {
    console.error('[dogfood:supervise] wrangler exit 감지')
  })

  while (true) {
    if (existsSync(stopPath)) {
      let req
      try {
        req = JSON.parse(readFileSync(stopPath, 'utf8'))
      } catch (err) {
        throw new Error(
          `stop 파일 파싱 실패: ${err instanceof Error ? err.message : err}`
        )
      }
      if (req.nonce !== bootNonce) {
        throw new Error('stop nonce 불일치 — 종료 거부')
      }
      await shutdown('stop-signal')
      return
    }
    if (child.exitCode != null || child.signalCode != null) {
      if (existsSync(pidPath)) unlinkSync(pidPath)
      if (existsSync(stopPath)) unlinkSync(stopPath)
      return
    }
    await sleep(200)
  }
}

main().catch(async (err) => {
  console.error('[dogfood:supervise] 실패:', err instanceof Error ? err.message : err)
  process.exitCode = 1
})
