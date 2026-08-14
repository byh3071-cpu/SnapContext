/**
 * dogfood process helpers (V4: handle-owned terminate only, no stale-PID kill).
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { LOCAL_HOST, LOCAL_PORT, STALE_PID_KILL_DISABLED, parsePidMeta } from './lib.mjs'

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
  const wrapped = [
    "$ErrorActionPreference = 'Stop'",
    script
  ].join('\n')
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
 * @param {number} [port]
 * @param {string} [host]
 * @returns {boolean}
 */
export function hasPortListener(port = LOCAL_PORT, host = LOCAL_HOST) {
  try {
    const out = runPowerShellStrict(
      [
        `$c = @(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction Stop |`,
        `  Where-Object { $_.LocalAddress -eq '${host}' -or $_.LocalAddress -eq '0.0.0.0' -or $_.LocalAddress -eq '::' })`,
        `if ($c.Count -gt 0) { 'yes' } else { 'no' }`
      ].join('\n')
    )
    return out === 'yes'
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/No matching|MSFT_NetTCPConnection|not find|개체를 찾을 수 없습니다/i.test(msg)) {
      return false
    }
    throw err
  }
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
        `$c = @(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction Stop |`,
        `  Where-Object { $_.LocalAddress -eq '${host}' -or $_.LocalAddress -eq '0.0.0.0' -or $_.LocalAddress -eq '::' } |`,
        `  Select-Object -First 5 OwningProcess, LocalAddress)`,
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
 * @param {number[]} pids
 * @param {number} [timeoutMs]
 * @param {Parameters<typeof waitProcessGone>[2]} [opts]
 */
export async function waitAllGone(pids, timeoutMs = 15_000, opts = {}) {
  for (const pid of pids) {
    await waitProcessGone(pid, timeoutMs, opts)
  }
}

/**
 * 현재 프로세스가 spawn 한 child handle 로만 tree 종료.
 * @param {{
 *   child: { pid?: number | null, kill?: (signal?: string) => boolean },
 *   descendantPids: number[],
 *   pidPath?: string,
 *   taskkill?: (pid: number) => void,
 *   sleep?: (ms: number) => Promise<void>
 * }} owned
 */
export async function terminateOwnedChildTree(owned) {
  const pid = owned.child.pid
  if (pid == null || !Number.isInteger(pid) || pid <= 0) {
    throw new Error('owned child pid 없음 — 종료 거부')
  }
  const runTaskkill =
    owned.taskkill ??
    ((target) => {
      execFileSync('taskkill', ['/F', '/T', '/PID', String(target)], { stdio: 'ignore' })
    })
  try {
    runTaskkill(pid)
  } catch (err) {
    throw new Error(
      `owned taskkill 실패 pid=${pid}: ${err instanceof Error ? err.message : err}`
    )
  }
  const sleep = owned.sleep ?? defaultSleep
  await waitProcessGone(pid, 15_000, { sleep })
  await waitAllGone(owned.descendantPids, 15_000, { sleep })
  if (hasPortListener(LOCAL_PORT, LOCAL_HOST)) {
    throw new Error(`포트 ${LOCAL_HOST}:${LOCAL_PORT} listener 잔존 — owned 종료 미완`)
  }
  if (owned.pidPath && existsSync(owned.pidPath)) {
    unlinkSync(owned.pidPath)
  }
  return pid
}

/**
 * @deprecated V4: stale PID kill 제거. 항상 거부.
 * @param {string} _pidPath
 */
export async function killOwnedProcessTree(_pidPath) {
  if (STALE_PID_KILL_DISABLED) {
    throw new Error(
      'stale PID 기반 kill 경로 제거됨 — 현재 프로세스가 보유한 child handle(terminateOwnedChildTree) 또는 supervise stop 신호만 허용'
    )
  }
  throw new Error('unreachable')
}

/**
 * supervise 에 nonce stop 요청 (다른 프로세스에서 handle 없이 종료 요청).
 * @param {string} stopPath
 * @param {string} bootNonce
 */
export function requestOwnedStop(stopPath, bootNonce) {
  if (!bootNonce || bootNonce.length < 16) throw new Error('stop nonce 필요')
  writeFileSync(
    stopPath,
    JSON.stringify({ nonce: bootNonce, at: Date.now() }),
    'utf8'
  )
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
