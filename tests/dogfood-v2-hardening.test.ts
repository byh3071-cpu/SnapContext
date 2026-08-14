import { afterEach, describe, expect, it, vi } from 'vitest'

interface CommandIdentity {
  wranglerEntry: string
  hasLocalFlag: boolean
  envFile: string
  nodeExecutable: string
  subcommand: string
  ip: string
  port: string
  cwd: string
}

interface Lib {
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
  auditedFetch: (
    input: string,
    init?: RequestInit,
    recorder?: string[]
  ) => Promise<Response>
  DOGFOOD_VARS_FILENAME: string
  DEV_VARS_POLICY: {
    neverRenameGeneric: boolean
    useRuntimeCwd: boolean
    restoreAsideOnBoot: boolean
  }
}

const GOOD_CMD =
  '"C:/n/node.exe" C:/n/node_modules/wrangler/bin/wrangler.js dev --ip 127.0.0.1 --port 8787 --local --env-file .dev.vars.dogfood --persist-to C:/repo/worker/.dogfood-runtime/.wrangler/state --show-interactive-dev-session false'

async function loadLib(): Promise<Lib> {
  const specifier = '../scripts/dogfood/lib.mjs'
  return (await import(specifier)) as Lib
}

describe('V2 B1 process ownership fail-closed', () => {
  it('같은 PID + --label=wrangler 스푸핑 명령을 거부한다', async () => {
    const { assertProcessIdentityMatch, normalizeCommandIdentity } = await loadLib()
    const expected = {
      pid: 4242,
      startedAtMs: 1_700_000_000_000,
      cmd: GOOD_CMD,
      identity: normalizeCommandIdentity(GOOD_CMD, {
        cwd: 'C:/repo/worker/.dogfood-runtime'
      })
    }
    expect(() =>
      assertProcessIdentityMatch(expected, {
        pid: 4242,
        startedAtMs: expected.startedAtMs,
        cmd: 'node unrelated.js --label=wrangler'
      })
    ).toThrow(/identity|wrangler 진입|종료 거부/)
  })

  it('live 시작 시각 누락 시 종료를 거부한다', async () => {
    const { assertProcessIdentityMatch, normalizeCommandIdentity } = await loadLib()
    expect(() =>
      assertProcessIdentityMatch(
        {
          pid: 1,
          startedAtMs: 1000,
          cmd: GOOD_CMD,
          identity: normalizeCommandIdentity(GOOD_CMD, {
            cwd: 'C:/repo/worker/.dogfood-runtime'
          })
        },
        { pid: 1, cmd: GOOD_CMD }
      )
    ).toThrow(/시작 시각/)
  })

  it('정규화 identity 는 wrangler.js·--local·env-file 을 요구한다', async () => {
    const { normalizeCommandIdentity, DOGFOOD_VARS_FILENAME } = await loadLib()
    const id = normalizeCommandIdentity(GOOD_CMD, {
      cwd: 'C:/repo/worker/.dogfood-runtime'
    })
    expect(id.wranglerEntry).toMatch(/\/wrangler\/bin\/wrangler\.js$/)
    expect(id.hasLocalFlag).toBe(true)
    expect(id.envFile).toBe(DOGFOOD_VARS_FILENAME)
    expect(() => normalizeCommandIdentity('node foo.js --label=wrangler')).toThrow()
  })
})

describe('V2 M1 auditedFetch redirect', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('외부 redirect hop 에서 즉시 실패한다', async () => {
    const { auditedFetch } = await loadLib()
    const recorder: string[] = []
    let calls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls += 1
        if (calls === 1) {
          return new Response(null, {
            status: 302,
            headers: { Location: 'https://evil.workers.dev/x' }
          })
        }
        return new Response('should-not-follow')
      })
    )
    await expect(
      auditedFetch('http://127.0.0.1:8787/start', { method: 'GET' }, recorder)
    ).rejects.toThrow(/비허용|production/)
    expect(recorder[0]).toBe('http://127.0.0.1:8787/start')
    expect(calls).toBe(1)
  })

  it('localhost hop 만 허용하고 recorder 에 기록한다', async () => {
    const { auditedFetch } = await loadLib()
    const recorder: string[] = []
    let calls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        calls += 1
        const url = String(input)
        if (calls === 1) {
          return new Response(null, {
            status: 302,
            headers: { Location: 'http://127.0.0.1:8787/next' }
          })
        }
        expect(url).toBe('http://127.0.0.1:8787/next')
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      })
    )
    const res = await auditedFetch(
      'http://127.0.0.1:8787/start',
      { method: 'GET' },
      recorder
    )
    expect(res.status).toBe(200)
    expect(recorder).toContain('http://127.0.0.1:8787/start')
    expect(recorder).toContain('http://127.0.0.1:8787/next')
  })
})

describe('V2 M2 generic .dev.vars 불가침', () => {
  it('정책 상수는 rename 금지·runtime cwd·aside 복원을 선언한다', async () => {
    const { DEV_VARS_POLICY, DOGFOOD_VARS_FILENAME } = await loadLib()
    expect(DOGFOOD_VARS_FILENAME).toBe('.dev.vars.dogfood')
    expect(DEV_VARS_POLICY.neverRenameGeneric).toBe(true)
    expect(DEV_VARS_POLICY.useRuntimeCwd).toBe(true)
    expect(DEV_VARS_POLICY.restoreAsideOnBoot).toBe(true)
  })
})
