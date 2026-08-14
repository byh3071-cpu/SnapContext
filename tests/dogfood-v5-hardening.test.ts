import { afterEach, describe, expect, it, vi } from 'vitest'

describe('V5 B1 handle-only terminate', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('taskkill 금지 플래그가 켜져 있다', async () => {
    const specifier = '../scripts/dogfood/process-own.mjs'
    const mod = (await import(specifier)) as {
      TASKKILL_FORBIDDEN: boolean
      HANDLE_ONLY_TERMINATE: boolean
    }
    expect(mod.TASKKILL_FORBIDDEN).toBe(true)
    expect(mod.HANDLE_ONLY_TERMINATE).toBe(true)
  })

  it('이미 종료된 child 에는 kill 을 호출하지 않는다', async () => {
    const specifier = '../scripts/dogfood/process-own.mjs'
    const mod = (await import(specifier)) as {
      terminateOwnedChildTree: (owned: {
        child: {
          pid?: number | null
          exitCode: number | null
          signalCode: string | null
          kill: (signal?: string) => boolean
        }
        descendantPids: number[]
        hasPortListener?: () => boolean
        sleep?: (ms: number) => Promise<void>
      }) => Promise<number>
    }
    let killCalls = 0
    const child = {
      pid: 4242,
      exitCode: 0,
      signalCode: null as string | null,
      kill: () => {
        killCalls += 1
        return true
      }
    }
    await mod.terminateOwnedChildTree({
      child,
      descendantPids: [1, 2],
      hasPortListener: () => false,
      sleep: async () => undefined
    })
    expect(killCalls).toBe(0)
  })

  it('살아있는 child 는 SIGTERM 을 먼저 보낸다', async () => {
    const specifier = '../scripts/dogfood/process-own.mjs'
    const mod = (await import(specifier)) as {
      terminateOwnedChildTree: (owned: Record<string, unknown>) => Promise<number>
    }
    const signals: string[] = []
    let exitCode: number | null = null
    const child = {
      pid: 4242,
      get exitCode() {
        return exitCode
      },
      signalCode: null as string | null,
      kill: (sig?: string) => {
        signals.push(sig ?? 'SIGTERM')
        exitCode = 0
        return true
      }
    }
    await mod.terminateOwnedChildTree({
      child,
      descendantPids: [],
      hasPortListener: () => false,
      sleep: async () => undefined
    })
    expect(signals).toEqual(['SIGTERM'])
  })
})

describe('V5 M2 hasPortListener empty vs error', () => {
  it('실제 subprocess 로 listener 없음은 false 이고 CIM 오류는 throw', async () => {
    const specifier = '../scripts/dogfood/process-own.mjs'
    const mod = (await import(specifier)) as {
      hasPortListener: (port?: number, host?: string) => boolean
      runPowerShellStrict: (script: string) => string
    }
    expect(mod.hasPortListener(58432, '127.0.0.1')).toBe(false)
    expect(() =>
      mod.runPowerShellStrict(
        'Get-CimInstance -ClassName Win32_ThisClassDoesNotExist_DogfoodV5 -ErrorAction Stop | Out-Null'
      )
    ).toThrow(/PowerShell|CIM|실패/)
  })
})

describe('V5 Minor: assertProcessIdentityMatch 제거', () => {
  it('lib 에 assertProcessIdentityMatch export 가 없다', async () => {
    const specifier = '../scripts/dogfood/lib.mjs'
    const lib = (await import(specifier)) as Record<string, unknown>
    expect(lib.assertProcessIdentityMatch).toBeUndefined()
  })
})
