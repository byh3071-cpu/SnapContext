import { afterEach, describe, expect, it, vi } from 'vitest'

interface CommandIdentity {
  nodeExecutable: string
  wranglerEntry: string
  subcommand: string
  ip: string
  port: string
  envFile: string
  cwd: string
  hasLocalFlag: boolean
}

interface Lib {
  LOCAL_HOST: string
  LOCAL_PORT: number
  CREATION_DATE_MAX_SKEW_MS: number
  normalizeCommandIdentity: (cmd: string, opts?: { cwd?: string }) => CommandIdentity
  assertProcessIdentityMatch: (
    expected: {
      pid: number
      startedAtMs: number
      cmd: string
      identity?: CommandIdentity
    },
    live: { pid: number; startedAtMs?: number; cmd?: string } | null
  ) => void
  DOGFOOD_VARS_FILENAME: string
}

const GOOD_CMD =
  '"C:/n/node.exe" C:/n/node_modules/wrangler/bin/wrangler.js dev --ip 127.0.0.1 --port 8787 --local --env-file .dev.vars.dogfood --persist-to C:/repo/worker/.dogfood-runtime/.wrangler/state --show-interactive-dev-session false'

const OTHER_PORT_CMD =
  '"C:/n/node.exe" C:/n/node_modules/wrangler/bin/wrangler.js dev --ip 0.0.0.0 --port 9999 --local --env-file .dev.vars.dogfood --persist-to C:/repo/worker/.dogfood-runtime/.wrangler/state --show-interactive-dev-session false'

async function loadLib(): Promise<Lib> {
  const specifier = '../scripts/dogfood/lib.mjs'
  return (await import(specifier)) as Lib
}

describe('V3 B1 exact ownership', () => {
  it('다른 port/IP (+30s) 프로세스를 거부한다', async () => {
    const { assertProcessIdentityMatch, normalizeCommandIdentity, CREATION_DATE_MAX_SKEW_MS } =
      await loadLib()
    expect(CREATION_DATE_MAX_SKEW_MS).toBeLessThanOrEqual(2000)
    const startedAtMs = 1_700_000_000_000
    const expected = {
      pid: 4242,
      startedAtMs,
      cmd: GOOD_CMD,
      identity: normalizeCommandIdentity(GOOD_CMD, {
        cwd: 'C:/repo/worker/.dogfood-runtime'
      })
    }
    expect(() =>
      assertProcessIdentityMatch(expected, {
        pid: 4242,
        startedAtMs: startedAtMs + 30_000,
        cmd: OTHER_PORT_CMD
      })
    ).toThrow(/identity|port|ip|시작 시각|어긋남/)
  })

  it('동일 명령 PID 재사용(+59s)을 거부한다', async () => {
    const { assertProcessIdentityMatch, normalizeCommandIdentity } = await loadLib()
    const startedAtMs = 1_700_000_000_000
    const expected = {
      pid: 4242,
      startedAtMs,
      cmd: GOOD_CMD,
      identity: normalizeCommandIdentity(GOOD_CMD, {
        cwd: 'C:/repo/worker/.dogfood-runtime'
      })
    }
    expect(() =>
      assertProcessIdentityMatch(expected, {
        pid: 4242,
        startedAtMs: startedAtMs + 59_000,
        cmd: GOOD_CMD
      })
    ).toThrow(/시작 시각|어긋남|stale/)
  })

  it('identity 에 node·dev·ip·port·cwd 를 포함한다', async () => {
    const { normalizeCommandIdentity, LOCAL_HOST, LOCAL_PORT, DOGFOOD_VARS_FILENAME } =
      await loadLib()
    const id = normalizeCommandIdentity(GOOD_CMD, {
      cwd: 'C:/repo/worker/.dogfood-runtime'
    })
    expect(id.nodeExecutable).toMatch(/node(\.exe)?$/i)
    expect(id.subcommand).toBe('dev')
    expect(id.ip).toBe(LOCAL_HOST)
    expect(id.port).toBe(String(LOCAL_PORT))
    expect(id.envFile).toBe(DOGFOOD_VARS_FILENAME)
    expect(id.cwd).toMatch(/\.dogfood-runtime$/i)
  })
})

describe('V3 M1 process-own fail-closed', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('CIM 조회 오류는 waitProcessGone 에서 throw 한다', async () => {
    const specifier = '../scripts/dogfood/process-own.mjs'
    const mod = (await import(specifier)) as {
      waitProcessGone: (
        pid: number,
        timeoutMs?: number,
        opts?: {
          readLiveProcess?: (pid: number) => unknown
          sleep?: (ms: number) => Promise<void>
        }
      ) => Promise<void>
    }
    await expect(
      mod.waitProcessGone(27628, 500, {
        readLiveProcess: () => {
          throw new Error('CIM/PowerShell 조회 실패 pid=1: mocked')
        },
        sleep: async () => undefined
      })
    ).rejects.toThrow(/CIM|조회 실패/)
  })

  it('taskkill 실패 시 PID 메타를 보존하고 parent-only fallback 이 없다', async () => {
    const lib = await loadLib()
    const meta = {
      pid: 4242,
      startedAtMs: Date.now(),
      cmd: GOOD_CMD,
      bootNonce: 'n'.repeat(32),
      identity: lib.normalizeCommandIdentity(GOOD_CMD, {
        cwd: 'C:/repo/worker/.dogfood-runtime'
      })
    }
    let pidFile = JSON.stringify(meta)
    let unlinked = false
    const specifier = '../scripts/dogfood/process-own.mjs'
    const mod = (await import(specifier)) as {
      killOwnedProcessTree: (
        pidPath: string,
        opts?: Record<string, unknown>
      ) => Promise<number>
    }
    await expect(
      mod.killOwnedProcessTree('virtual-pid.json', {
        skipHealth: true,
        readLiveProcess: () => ({
          pid: 4242,
          startedAtMs: meta.startedAtMs,
          cmd: GOOD_CMD
        }),
        listDescendantPids: () => [],
        taskkill: () => {
          throw new Error('taskkill failed')
        },
        existsSync: () => true,
        readFileSync: () => pidFile,
        unlinkSync: () => {
          unlinked = true
          pidFile = ''
        }
      })
    ).rejects.toThrow(/taskkill|종료 실패/)
    expect(unlinked).toBe(false)
    expect(pidFile).toContain('"pid":4242')
  })
})
