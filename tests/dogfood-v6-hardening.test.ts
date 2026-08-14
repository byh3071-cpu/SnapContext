import { afterEach, describe, expect, it, vi } from 'vitest'

describe('V6 M1 hasPortListener fail-closed', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('unused-port 는 false, missing-cmdlet 은 throw', async () => {
    const specifier = '../scripts/dogfood/process-own.mjs'
    const mod = (await import(specifier)) as {
      hasPortListener: (
        port?: number,
        host?: string,
        opts?: { cmdlet?: string }
      ) => boolean
    }
    expect(mod.hasPortListener(58432, '127.0.0.1')).toBe(false)
    expect(() =>
      mod.hasPortListener(58432, '127.0.0.1', {
        cmdlet: 'Get-DogfoodMissingCmdletV6'
      })
    ).toThrow(/PowerShell|CIM|실패|CommandNotFound|찾을 수 없/)
  })
})

describe('V6 M2 natural-exit shared cleanup', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('자연 종료 + leftover listener 는 공용 terminate 경로로 실패하고 PID 메타를 지우지 않는다', async () => {
    const specifier = '../scripts/dogfood/supervise-lifecycle.mjs'
    const mod = (await import(specifier)) as {
      pollSuperviseOnce: (ctx: {
        child: {
          exitCode: number | null
          signalCode: string | null
        }
        descendantPids: number[]
        pidPath: string
        stopPath: string
        bootNonce: string
        cleaned: { value: boolean }
        terminateOwnedChildTree: (owned: Record<string, unknown>) => Promise<number>
        existsSync: (p: string) => boolean
        unlinkSync: (p: string) => void
        readFileSync: (p: string, enc: string) => string
        sleep: (ms: number) => Promise<void>
      }) => Promise<'continue' | 'done'>
    }

    let pidUnlinked = false
    let terminateCalls = 0
    const cleaned = { value: false }
    const child = {
      exitCode: 0,
      signalCode: null as string | null,
      pid: 4242,
      kill: () => true
    }

    await expect(
      mod.pollSuperviseOnce({
        child,
        descendantPids: [99],
        pidPath: 'virtual.pid',
        stopPath: 'virtual.stop',
        bootNonce: 'nonce-abcdefghijklmnop',
        cleaned,
        existsSync: () => true,
        unlinkSync: (p: string) => {
          if (p === 'virtual.pid') pidUnlinked = true
        },
        readFileSync: () => '{}',
        sleep: async () => undefined,
        terminateOwnedChildTree: async () => {
          terminateCalls += 1
          throw new Error(
            '포트 127.0.0.1:8787 listener 잔존 — 프로세스를 죽이지 않고 실패한다.'
          )
        }
      })
    ).rejects.toThrow(/listener 잔존/)

    expect(terminateCalls).toBe(1)
    expect(pidUnlinked).toBe(false)
    expect(cleaned.value).toBe(true)
  })

  it('자연 종료 + listener 없음 은 공용 terminate 성공 후 done', async () => {
    const specifier = '../scripts/dogfood/supervise-lifecycle.mjs'
    const mod = (await import(specifier)) as {
      pollSuperviseOnce: (ctx: Record<string, unknown>) => Promise<'continue' | 'done'>
    }
    const cleaned = { value: false }
    let terminateCalls = 0
    const result = await mod.pollSuperviseOnce({
      child: {
        exitCode: 0,
        signalCode: null,
        pid: 4242,
        kill: () => true
      },
      descendantPids: [],
      pidPath: 'virtual.pid',
      stopPath: 'virtual.stop',
      bootNonce: 'nonce-abcdefghijklmnop',
      cleaned,
      existsSync: () => false,
      unlinkSync: () => undefined,
      readFileSync: () => '{}',
      sleep: async () => undefined,
      terminateOwnedChildTree: async () => {
        terminateCalls += 1
        return 4242
      }
    })
    expect(result).toBe('done')
    expect(terminateCalls).toBe(1)
    expect(cleaned.value).toBe(true)
  })
})
