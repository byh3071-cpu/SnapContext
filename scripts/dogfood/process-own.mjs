/**
 * dogfood 소유 wrangler process-tree 종료 (B1 fail-closed + M3 cleanup 공용).
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, unlinkSync } from 'node:fs'
import { assertProcessIdentityMatch, parsePidMeta } from './lib.mjs'

/**
 * Win32_Process CreationDate → epoch ms + CommandLine.
 * @param {number} pid
 * @returns {{ pid: number, startedAtMs: number, cmd: string } | null}
 */
export function readLiveProcess(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error(`invalid pid: ${pid}`)
  }
  try {
    const out = execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        [
          `$p = Get-CimInstance Win32_Process -Filter "ProcessId=${pid}"`,
          `if ($null -eq $p) { Write-Output '' }`,
          `else {`,
          `  $ms = [DateTimeOffset]::new([DateTime]$p.CreationDate).ToUnixTimeMilliseconds()`,
          `  $cmd = $p.CommandLine`,
          `  if ($null -eq $cmd) { $cmd = '' }`,
          '  Write-Output ("{0}`t{1}" -f $ms, $cmd)',
          `}`
        ].join('\n')
      ],
      { encoding: 'utf8' }
    ).trim()
    if (!out) return null
    const tab = out.indexOf('\t')
    if (tab <= 0) {
      throw new Error(`live 프로세스 메타 파싱 실패 pid=${pid}`)
    }
    const startedAtMs = Number(out.slice(0, tab))
    const cmd = out.slice(tab + 1)
    if (!Number.isFinite(startedAtMs)) {
      throw new Error(`CreationDate epoch 변환 실패 pid=${pid}`)
    }
    if (cmd.length === 0) {
      throw new Error(`CommandLine 비어 있음 pid=${pid} — fail-closed`)
    }
    return { pid, startedAtMs, cmd }
  } catch (err) {
    if (err instanceof Error && /fail-closed|CreationDate|CommandLine|파싱/.test(err.message)) {
      throw err
    }
    return null
  }
}

/**
 * @param {number} pid
 * @param {number} [timeoutMs]
 */
export function waitProcessGone(pid, timeoutMs = 15_000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const live = (() => {
      try {
        return readLiveProcess(pid)
      } catch {
        return null
      }
    })()
    if (live == null) return
    const until = Date.now() + 200
    while (Date.now() < until) {
      /* spin wait — dogfood cleanup 전용 */
    }
  }
  throw new Error(`프로세스 종료 미확인 pid=${pid}`)
}

/**
 * PID 메타 검증 후 process tree 종료. 자식 포함 종료 확인 후에만 메타 삭제.
 * @param {string} pidPath
 * @returns {number} killed pid
 */
export function killOwnedProcessTree(pidPath) {
  if (!existsSync(pidPath)) {
    throw new Error(`wrangler PID 파일 없음: ${pidPath}`)
  }
  const meta = parsePidMeta(readFileSync(pidPath, 'utf8'))
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
  waitProcessGone(meta.pid)
  unlinkSync(pidPath)
  return meta.pid
}
