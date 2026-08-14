/**
 * dogfood process helpers (V5: ChildProcess.kill handle-only, no taskkill).
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { LOCAL_HOST, LOCAL_PORT, STALE_PID_KILL_DISABLED, parsePidMeta } from './lib.mjs'

export const TASKKILL_FORBIDDEN = true
export const HANDLE_ONLY_TERMINATE = true

/**
 * @param {number} ms
 */
function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * PowerShell strict runner — ErrorAction Stop. 오류와 빈 결과 구분.
 * @param {string} script
 * @returns {string} stdout trim
 */
export function runPowerShellStrict(script) {
  const wrapped = ["$ErrorActionPreference = 'Stop'", script].join('\n')
  try {
    return execFileSync('powershell', ['-NoProfile', '-Command', wrapped], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim()
  } catch (err) {
    const detail =
      err && typeof err === 'object' && 'stderr' in err
        ? String(/** @type {{ stderr?: Buffer | string }} */ (err).stderr ?? '')
        : ''
    throw new Error(
      `PowerShell/CIM 조회 실패: ${err instanceof Error ? err.message : err}${detail ? ` | ${detail.trim()}` : ''}`
    )
  }
}

/**
 * @param {number} pid
 * @returns {{ pid: number, startedAtMs: number, cmd: string } | null}
 */
export function readLiveProcess(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error(`invalid pid: ${pid}`)
  }
  const out = runPowerShellStrict(
    [
      `$p = Get-CimInstance -ClassName Win32_Process -Filter "ProcessId=${pid}" -ErrorAction Stop`,
      `if ($null -eq $p) { Write-Output '' }`,
      `else {`,
      `  $ms = [DateTimeOffset]::new([DateTime]$p.CreationDate).ToUnixTimeMilliseconds()`,
      `  $cmd = $p.CommandLine`,
      `  if ($null -eq $cmd) { $cmd = '' }`,
      '  Write-Output ("{0}`t{1}" -f $ms, $cmd)',
      `}`
    ].join('\n')
  )
  if (!out) return null
  const tab = out.indexOf('\t')
  if (tab <= 0) throw new Error(`live 프로세스 메타 파싱 실패 pid=${pid}`)
  const startedAtMs = Number(out.slice(0, tab))
  const cmd = out.slice(tab + 1)
  if (!Number.isFinite(startedAtMs)) throw new Error(`CreationDate epoch 변환 실패 pid=${pid}`)
  if (cmd.length === 0) throw new Error(`CommandLine 비어 있음 pid=${pid}`)
  return { pid, startedAtMs, cmd }
}

/**
 * @param {number} parentPid
 * @returns {number[]}
 */
export function listDescendantPids(parentPid) {
  const out = runPowerShellStrict(
    [
      `$root = ${parentPid}`,
      `$all = @(Get-CimInstance -ClassName Win32_Process -ErrorAction Stop | Select-Object ProcessId, ParentProcessId)`,
      `$kids = New-Object System.Collections.Generic.List[int]`,
      `$queue = New-Object System.Collections.Generic.Queue[int]`,
      `$queue.Enqueue($root)`,
      `while ($queue.Count -gt 0) {`,
      `  $cur = $queue.Dequeue()`,
      `  foreach ($row in $all) {`,
      `    if ($row.ParentProcessId -eq $cur -and $row.ProcessId -ne $root) {`,
      `      $kids.Add([int]$row.ProcessId)`,
      `      $queue.Enqueue([int]$row.ProcessId)`,
      `    }`,
      `  }`,
      `}`,
      `($kids | Select-Object -Unique) -join ','`
    ].join('\n')
  )
  if (!out) return []
  return out
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0)
}

/**
 * PowerShell 내부에서 empty → "no". JS 오류 메시지 문자열 매칭 없음.
 * cmdlet 실패는 runPowerShellStrict 가 throw.
 * @param {number} [port]
 * @param {string} [host]
 * @returns {boolean}
 */
export function hasPortListener(port = LOCAL_PORT, host = LOCAL_HOST) {
  const out = runPowerShellStrict(
    [
      `$port = ${port}`,
      `$hostAddr = '${host}'`,
      `try {`,
      `  $all = @(Get-NetTCPConnection -State Listen -ErrorAction Stop)`,
      `} catch [Microsoft.PowerShell.Cmdletization.Cim.CimJobException] {`,
      `  if ($_.CategoryInfo.Category -eq 'ObjectNotFound') { Write-Output 'no'; return }`,
      `  throw`,
      `} catch {`,
      `  if ($_.CategoryInfo.Category -eq 'ObjectNotFound') { Write-Output 'no'; return }`,
      `  throw`,
      `}`,
      `$c = @($all | Where-Object {`,
      `  $_.LocalPort -eq $port -and (`,
      `    $_.LocalAddress -eq $hostAddr -or $_.LocalAddress -eq '0.0.0.0' -or $_.LocalAddress -eq '::'`,
      `  )`,
      `})`,
      `if ($c.Count -gt 0) { 'yes' } else { 'no' }`
    ].join('\n')
  )
  if (out !== 'yes' && out !== 'no') {
    throw new Error(`hasPortListener 예상치 못한 stdout: ${out}`)
  }
  return out === 'yes'
}

/**
 * 포트 점유 시 진단 문자열 (kill 하지 않음).
 * @param {string} [pidPath]
 * @param {number} [port]
 * @param {string} [host]
 */
export function describePortOccupancy(pidPath, port = LOCAL_PORT, host = LOCAL_HOST) {
  /** @type {string[]} */
  const lines = [`포트 ${host}:${port} 사용 중 — 어떤 프로세스도 종료하지 않는다.`]
  if (pidPath && existsSync(pidPath)) {
    try {
      const meta = parsePidMeta(readFileSync(pidPath, 'utf8'))
      lines.push(
        `진단 PID 파일: pid=${meta.pid} supervisorPid=${meta.supervisorPid} cmd=${meta.cmd}`
      )
    } catch (err) {
      lines.push(`진단 PID 파일 파싱 실패: ${err instanceof Error ? err.message : err}`)
    }
  } else {
    lines.push('진단 PID 파일 없음')
  }
  try {
    const out = runPowerShellStrict(
      [
        `$port = ${port}`,
        `$hostAddr = '${host}'`,
        `try { $all = @(Get-NetTCPConnection -State Listen -ErrorAction Stop) }`,
        `catch { if ($_.CategoryInfo.Category -eq 'ObjectNotFound') { Write-Output ''; return }; throw }`,
        `$c = @($all | Where-Object { $_.LocalPort -eq $port -and ($_.LocalAddress -eq $hostAddr -or $_.LocalAddress -eq '0.0.0.0' -or $_.LocalAddress -eq '::') } | Select-Object -First 5 OwningProcess, LocalAddress)`,
        `($c | ForEach-Object { "listener pid=$($_.OwningProcess) addr=$($_.LocalAddress)" }) -join '; '`
      ].join('\n')
    )
    lines.push(out || 'listener 상세 없음')
  } catch (err) {
    lines.push(`listener 조회 실패: ${err instanceof Error ? err.message : err}`)
  }
  lines.push('사람이 해당 프로세스를 정리한 뒤 dogfood:up 을 다시 실행하라.')
  return lines.join('\n')
}

/**
 * @param {number} pid
 * @param {number} [timeoutMs]
 * @param {{
 *   readLiveProcess?: typeof readLiveProcess,
 *   sleep?: (ms: number) => Promise<void>
 * }} [opts]
 */
export async function waitProcessGone(pid, timeoutMs = 15_000, opts = {}) {
  const reader = opts.readLiveProcess ?? readLiveProcess
  const sleep = opts.sleep ?? defaultSleep
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const live = reader(pid)
    if (live == null) return
    await sleep(200)
  }
  throw new Error(`프로세스 종료 미확인 pid=${pid}`)
}

/**
 * ChildProcess handle 로만 종료. taskkill/숫자 PID OS 호출 금지.
 * descendant 는 직접 죽이지 않음 — wrangler graceful 대기.
 * 종료 후 8787 listener 잔존 시 fail-loud (죽이지 않음).
 *
 * @param {{
 *   child: {
 *     pid?: number | null,
 *     exitCode: number | null,
 *     signalCode?: NodeJS.Signals | null,
 *     kill: (signal?: NodeJS.Signals | string) => boolean
 *   },
 *   descendantPids?: number[],
 *   pidPath?: string,
 *   hasPortListener?: typeof hasPortListener,
 *   sleep?: (ms: number) => Promise<void>
 * }} owned
 */
export async function terminateOwnedChildTree(owned) {
  if (!HANDLE_ONLY_TERMINATE || !TASKKILL_FORBIDDEN) {
    throw new Error('handle-only terminate 정책 위반')
  }
  const child = owned.child
  const pid = child.pid
  if (pid == null || !Number.isInteger(pid) || pid <= 0) {
    throw new Error('owned child pid 없음 — 종료 거부')
  }
  const sleep = owned.sleep ?? defaultSleep
  const portCheck = owned.hasPortListener ?? hasPortListener

  const isExited = () => child.exitCode !== null || child.signalCode != null

  if (!isExited()) {
    try {
      child.kill('SIGTERM')
    } catch (err) {
      throw new Error(
        `child.kill(SIGTERM) 실패: ${err instanceof Error ? err.message : err}`
      )
    }
    const softDeadline = Date.now() + 5_000
    while (Date.now() < softDeadline) {
      if (isExited()) break
      await sleep(100)
    }
    if (!isExited()) {
      try {
        child.kill('SIGKILL')
      } catch (err) {
        throw new Error(
          `child.kill(SIGKILL) 실패: ${err instanceof Error ? err.message : err}`
        )
      }
    }
    // 숫자 PID 재조회 금지 — ChildProcess exit 상태만 대기
    const hardDeadline = Date.now() + 15_000
    while (Date.now() < hardDeadline) {
      if (isExited()) break
      await sleep(100)
    }
    if (!isExited()) {
      throw new Error(`child handle exit 미확인 pid=${pid}`)
    }
  }
  // alreadyDead: kill 호출·숫자 PID 대기 모두 금지 (재사용 TOCTOU)

  // descendant 직접 kill 금지 — graceful 후에도 listener 남으면 fail-loud
  if (portCheck(LOCAL_PORT, LOCAL_HOST)) {
    const leftover = owned.descendantPids?.length
      ? `잔존 가능 descendant=[${owned.descendantPids.join(',')}]`
      : 'descendant 목록 없음'
    throw new Error(
      `포트 ${LOCAL_HOST}:${LOCAL_PORT} listener 잔존 — 프로세스를 죽이지 않고 실패한다. ${leftover}. 사람이 정리하라.`
    )
  }

  if (owned.pidPath && existsSync(owned.pidPath)) {
    unlinkSync(owned.pidPath)
  }
  return pid
}

/**
 * @deprecated V4+: stale PID kill 제거.
 * @param {string} _pidPath
 */
export async function killOwnedProcessTree(_pidPath) {
  if (STALE_PID_KILL_DISABLED) {
    throw new Error(
      'stale PID 기반 kill 경로 제거됨 — ChildProcess.kill handle 또는 supervise stop 신호만 허용'
    )
  }
  throw new Error('unreachable')
}

/**
 * stop 파일 atomic 게시 (temp write + rename).
 * @param {string} stopPath
 * @param {string} bootNonce
 */
export function requestOwnedStop(stopPath, bootNonce) {
  if (!bootNonce || bootNonce.length < 16) throw new Error('stop nonce 필요')
  const dir = dirname(stopPath)
  const tmp = join(dir, `.dogfood-stop.${process.pid}.${Date.now()}.tmp`)
  writeFileSync(tmp, JSON.stringify({ nonce: bootNonce, at: Date.now() }), 'utf8')
  renameSync(tmp, stopPath)
}

/**
 * @param {string} stopPath
 * @param {number} [timeoutMs]
 * @param {{
 *   sleep?: (ms: number) => Promise<void>,
 *   hasPortListener?: typeof hasPortListener,
 *   pidPath?: string
 * }} [opts]
 */
export async function waitOwnedStopComplete(stopPath, timeoutMs = 30_000, opts = {}) {
  const sleep = opts.sleep ?? defaultSleep
  const portCheck = opts.hasPortListener ?? hasPortListener
  const pidPath = opts.pidPath
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const listening = portCheck(LOCAL_PORT, LOCAL_HOST)
    const pidGone = pidPath ? !existsSync(pidPath) : !existsSync(stopPath)
    if (!listening && pidGone) return
    await sleep(200)
  }
  throw new Error('owned stop 완료 대기 시간 초과 — 사람이 포트를 확인하라')
}
