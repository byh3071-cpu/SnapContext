/**
 * dogfood 소유 wrangler process-tree 종료 (V3: fail-closed 조회·종료 검증).
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, unlinkSync } from 'node:fs'
import {
  LOCAL_HOST,
  LOCAL_PORT,
  assertDogfoodHealthOwnership,
  assertProcessIdentityMatch,
  parsePidMeta
} from './lib.mjs'

/**
 * @param {number} ms
 */
function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Win32_Process CreationDate → epoch ms + CommandLine.
 * 조회 오류는 throw (gone 과 구분). 프로세스 없음만 null.
 * @param {number} pid
 * @returns {{ pid: number, startedAtMs: number, cmd: string } | null}
 */
export function readLiveProcess(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error(`invalid pid: ${pid}`)
  }
  let out
  try {
    out = execFileSync(
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
  } catch (err) {
    throw new Error(
      `CIM/PowerShell 조회 실패 pid=${pid}: ${err instanceof Error ? err.message : err}`
    )
  }
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
}

/**
 * @param {number} parentPid
 * @returns {number[]}
 */
export function listDescendantPids(parentPid) {
  let out
  try {
    out = execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        [
          `$root = ${parentPid}`,
          `$all = @(Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId)`,
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
      ],
      { encoding: 'utf8' }
    ).trim()
  } catch (err) {
    throw new Error(
      `descendant 조회 실패 pid=${parentPid}: ${err instanceof Error ? err.message : err}`
    )
  }
  if (!out) return []
  return out
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0)
}

/**
 * @param {number} port
 * @param {string} [host]
 * @returns {boolean}
 */
export function hasPortListener(port = LOCAL_PORT, host = LOCAL_HOST) {
  let out
  try {
    out = execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `$c = Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalAddress -eq '${host}' -or $_.LocalAddress -eq '0.0.0.0' -or $_.LocalAddress -eq '::' }; if ($c) { 'yes' } else { 'no' }`
      ],
      { encoding: 'utf8' }
    ).trim()
  } catch (err) {
    throw new Error(
      `포트 listener 조회 실패 ${host}:${port}: ${err instanceof Error ? err.message : err}`
    )
  }
  return out === 'yes'
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
    // 조회 오류는 그대로 throw — null 만 "없음"
    const live = reader(pid)
    if (live == null) return
    await sleep(200)
  }
  throw new Error(`프로세스 종료 미확인 pid=${pid}`)
}

/**
 * @param {number[]} pids
 * @param {number} [timeoutMs]
 * @param {{
 *   readLiveProcess?: typeof readLiveProcess,
 *   sleep?: (ms: number) => Promise<void>
 * }} [opts]
 */
export async function waitAllGone(pids, timeoutMs = 15_000, opts = {}) {
  for (const pid of pids) {
    await waitProcessGone(pid, timeoutMs, opts)
  }
}

/**
 * PID 메타 검증 후 process tree 종료.
 * parent + descendants + 8787 listener 확인 후에만 메타 삭제.
 * parent-only kill fallback 없음.
 *
 * @param {string} pidPath
 * @param {{
 *   skipHealth?: boolean,
 *   readLiveProcess?: typeof readLiveProcess,
 *   listDescendantPids?: typeof listDescendantPids,
 *   hasPortListener?: typeof hasPortListener,
 *   taskkill?: (pid: number) => void,
 *   existsSync?: typeof existsSync,
 *   readFileSync?: typeof readFileSync,
 *   unlinkSync?: typeof unlinkSync,
 *   sleep?: (ms: number) => Promise<void>,
 *   assertHealth?: typeof assertDogfoodHealthOwnership
 * }} [opts]
 * @returns {Promise<number>}
 */
export async function killOwnedProcessTree(pidPath, opts = {}) {
  const exists = opts.existsSync ?? existsSync
  const read = opts.readFileSync ?? readFileSync
  const unlink = opts.unlinkSync ?? unlinkSync
  const reader = opts.readLiveProcess ?? readLiveProcess
  const listKids = opts.listDescendantPids ?? listDescendantPids
  const portCheck = opts.hasPortListener ?? hasPortListener
  const health = opts.assertHealth ?? assertDogfoodHealthOwnership
  const sleep = opts.sleep ?? defaultSleep

  if (!exists(pidPath)) {
    throw new Error(`wrangler PID 파일 없음: ${pidPath}`)
  }
  const meta = parsePidMeta(read(pidPath, 'utf8'))

  if (!opts.skipHealth) {
    await health(meta.bootNonce)
  }

  const live = reader(meta.pid)
  assertProcessIdentityMatch(meta, live)

  const descendants = listKids(meta.pid)

  const runTaskkill =
    opts.taskkill ??
    ((pid) => {
      execFileSync('taskkill', ['/F', '/T', '/PID', String(pid)], {
        stdio: 'ignore'
      })
    })

  try {
    runTaskkill(meta.pid)
  } catch (err) {
    // parent-only process.kill fallback 금지 — PID 메타 보존
    throw new Error(
      `taskkill 종료 실패 pid=${meta.pid}: ${err instanceof Error ? err.message : err}`
    )
  }

  await waitProcessGone(meta.pid, 15_000, { readLiveProcess: reader, sleep })
  await waitAllGone(descendants, 15_000, { readLiveProcess: reader, sleep })

  if (portCheck(LOCAL_PORT, LOCAL_HOST)) {
    throw new Error(
      `포트 ${LOCAL_HOST}:${LOCAL_PORT} listener 잔존 — PID 메타 보존`
    )
  }

  unlink(pidPath)
  return meta.pid
}
