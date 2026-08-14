import { describe, expect, it } from 'vitest'

interface Lib {
  buildCommandIdentityFromArgv: (
    executable: string,
    argv: string[],
    opts?: { cwd?: string }
  ) => {
    nodeExecutable: string
    wranglerEntry: string
    subcommand: string
    ip: string
    port: string
    envFile: string
    cwd: string
  }
  formatDiagnosticCommand: (executable: string, argv: string[]) => string
  LOCAL_HOST: string
  LOCAL_PORT: number
  DOGFOOD_VARS_FILENAME: string
  STALE_PID_KILL_DISABLED: boolean
}

async function loadLib(): Promise<Lib> {
  const specifier = '../scripts/dogfood/lib.mjs'
  return (await import(specifier)) as Lib
}

describe('V4 B1 spaced executable path', () => {
  it('실제 process.execPath(공백 포함 가능)로 identity 를 만든다', async () => {
    const { buildCommandIdentityFromArgv, formatDiagnosticCommand, DOGFOOD_VARS_FILENAME } =
      await loadLib()
    const spaced = 'C:\\Program Files\\nodejs\\node.exe'
    const argv = [
      'C:/repo/worker/node_modules/wrangler/bin/wrangler.js',
      'dev',
      '--ip',
      '127.0.0.1',
      '--port',
      '8787',
      '--local',
      '--env-file',
      DOGFOOD_VARS_FILENAME,
      '--persist-to',
      'C:/repo/worker/.dogfood-runtime/.wrangler/state'
    ]
    const id = buildCommandIdentityFromArgv(spaced, argv, {
      cwd: 'C:/repo/worker/.dogfood-runtime'
    })
    expect(id.nodeExecutable).toMatch(/node\.exe$/i)
    expect(id.port).toBe('8787')
    const diagnostic = formatDiagnosticCommand(spaced, argv)
    expect(diagnostic).toContain('Program Files')
    expect(diagnostic.startsWith('"') || diagnostic.includes('"C:\\Program Files')).toBe(true)
  })

  it('stale PID kill 경로는 비활성 플래그로 고정한다', async () => {
    const { STALE_PID_KILL_DISABLED } = await loadLib()
    expect(STALE_PID_KILL_DISABLED).toBe(true)
  })
})

describe('V4 M1 PowerShell ErrorAction Stop', () => {
  it('존재하지 않는 CIM class 조회는 throw 한다(빈 결과와 구분)', async () => {
    const specifier = '../scripts/dogfood/process-own.mjs'
    const mod = (await import(specifier)) as {
      runPowerShellStrict: (script: string) => string
    }
    expect(() =>
      mod.runPowerShellStrict(
        'Get-CimInstance -ClassName Win32_ThisClassDoesNotExist_Dogfood -ErrorAction Stop | Out-Null'
      )
    ).toThrow(/PowerShell|CIM|실패/)
  })
})

describe('V4 design: PID-file kill 제거', () => {
  it('killOwnedProcessTree(pidPath) 는 거부한다', async () => {
    const specifier = '../scripts/dogfood/process-own.mjs'
    const mod = (await import(specifier)) as {
      killOwnedProcessTree: (pidPath: string) => Promise<number>
    }
    await expect(mod.killOwnedProcessTree('.dogfood-wrangler.pid')).rejects.toThrow(
      /stale PID|제거|금지|handle/
    )
  })
})
