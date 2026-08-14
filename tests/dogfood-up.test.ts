import { describe, expect, it } from 'vitest'

interface DogfoodLib {
  BOOTSTRAP_STEPS: readonly string[]
  LOCAL_UPLOAD_ENDPOINT: string
  DOGFOOD_VARS_FILENAME: string
  assertLocalUploadEndpoint: (url: string) => void
  assertNoProductionUrl: (value: string, label?: string) => void
  assembleViteBuildEnv: (
    baseEnv?: Record<string, string | undefined>
  ) => Record<string, string | undefined>
  buildDogfoodDevVarsContent: (secrets: {
    TOKEN_SIGNING_SECRET: string
    SNAPCONTEXT_BEARER_TOKEN: string
    DOGFOOD_BOOT_NONCE: string
  }) => string
  generateLocalSecrets: (randomHexFn?: () => string) => {
    TOKEN_SIGNING_SECRET: string
    SNAPCONTEXT_BEARER_TOKEN: string
  }
  parseDevVars: (text: string) => Record<string, string>
  resolveWranglerDevArgs: () => string[]
  validateDogfoodDevVars: (vars: Record<string, string>) => void
}

async function loadLib(): Promise<DogfoodLib> {
  const specifier = '../scripts/dogfood/lib.mjs'
  return (await import(specifier)) as DogfoodLib
}

describe('dogfood-up 가드', () => {
  it('workers.dev URL이면 즉시 throw 한다', async () => {
    const { assertNoProductionUrl } = await loadLib()
    expect(() =>
      assertNoProductionUrl(
        'https://snapcontext-worker.example.workers.dev',
        'VITE_UPLOAD_ENDPOINT'
      )
    ).toThrow(/workers\.dev|production/i)
  })

  it('로컬이 아닌 http(s) URL이면 즉시 throw 한다', async () => {
    const { assertNoProductionUrl } = await loadLib()
    expect(() =>
      assertNoProductionUrl('https://api.example.com/upload', 'endpoint')
    ).toThrow(/production|로컬/i)
  })

  it('127.0.0.1 로컬 URL은 통과한다', async () => {
    const { assertNoProductionUrl } = await loadLib()
    expect(() =>
      assertNoProductionUrl('http://127.0.0.1:8787', 'VITE_UPLOAD_ENDPOINT')
    ).not.toThrow()
  })

  it('업로드 엔드포인트는 정확히 로컬 8787만 허용한다', async () => {
    const { assertLocalUploadEndpoint, LOCAL_UPLOAD_ENDPOINT } = await loadLib()
    expect(() => assertLocalUploadEndpoint(LOCAL_UPLOAD_ENDPOINT)).not.toThrow()
    expect(() => assertLocalUploadEndpoint('http://localhost:8787')).toThrow()
    expect(() =>
      assertLocalUploadEndpoint('https://snapcontext-worker.byh3071-26a.workers.dev')
    ).toThrow(/workers\.dev|production/i)
  })
})

describe('dogfood-up env 조립', () => {
  it('시크릿을 dogfood vars 형식으로 직렬화한다', async () => {
    const { buildDogfoodDevVarsContent, DOGFOOD_VARS_FILENAME } = await loadLib()
    expect(DOGFOOD_VARS_FILENAME).toBe('.dev.vars.dogfood')
    const body = buildDogfoodDevVarsContent({
      TOKEN_SIGNING_SECRET: 'sign-secret',
      SNAPCONTEXT_BEARER_TOKEN: 'bearer-secret',
      DOGFOOD_BOOT_NONCE: 'n'.repeat(32)
    })
    expect(body).toContain('DOGFOOD_LOCAL=1')
    expect(body).toContain('TOKEN_SIGNING_SECRET=sign-secret')
    expect(body).toContain('SNAPCONTEXT_BEARER_TOKEN=bearer-secret')
    expect(body.endsWith('\n')).toBe(true)
  })

  it('로컬 시크릿은 충분한 엔트로피의 hex 문자열이다', async () => {
    const { generateLocalSecrets } = await loadLib()
    let n = 0
    const secrets = generateLocalSecrets(() => `${++n}`.padStart(64, 'a'))
    expect(secrets.TOKEN_SIGNING_SECRET).toHaveLength(64)
    expect(secrets.SNAPCONTEXT_BEARER_TOKEN).toHaveLength(64)
    expect(secrets.TOKEN_SIGNING_SECRET).not.toBe(secrets.SNAPCONTEXT_BEARER_TOKEN)
  })

  it('vite 빌드 env에 로컬 엔드포인트만 주입한다', async () => {
    const { assembleViteBuildEnv, assertNoProductionUrl, LOCAL_UPLOAD_ENDPOINT } =
      await loadLib()
    const env = assembleViteBuildEnv({
      PATH: '/usr/bin',
      VITE_UPLOAD_ENDPOINT: 'https://evil.workers.dev'
    })
    expect(env.VITE_UPLOAD_ENDPOINT).toBe(LOCAL_UPLOAD_ENDPOINT)
    expect(() =>
      assertNoProductionUrl(env.VITE_UPLOAD_ENDPOINT!, 'VITE_UPLOAD_ENDPOINT')
    ).not.toThrow()
  })

  it('dogfood vars 에 production URL이 있으면 throw 한다', async () => {
    const { parseDevVars, validateDogfoodDevVars } = await loadLib()
    const parsed = parseDevVars(
      'DOGFOOD_LOCAL=1\nDOGFOOD_BOOT_NONCE=nnnnnnnnnnnnnnnn\nTOKEN_SIGNING_SECRET=abc\nSNAPCONTEXT_BEARER_TOKEN=https://x.workers.dev/token\n'
    )
    expect(() => validateDogfoodDevVars(parsed)).toThrow(/workers\.dev|production/i)
  })

  it('dogfood vars 에 필수 키가 없으면 throw 한다', async () => {
    const { parseDevVars, validateDogfoodDevVars } = await loadLib()
    const parsed = parseDevVars(
      'DOGFOOD_LOCAL=1\nDOGFOOD_BOOT_NONCE=nnnnnnnnnnnnnnnn\nTOKEN_SIGNING_SECRET=only-one\n'
    )
    expect(() => validateDogfoodDevVars(parsed)).toThrow(/SNAPCONTEXT_BEARER_TOKEN/)
  })
})

describe('dogfood-up 순서', () => {
  it('부트스트랩 단계 순서는 고정이다', async () => {
    const { BOOTSTRAP_STEPS } = await loadLib()
    expect(BOOTSTRAP_STEPS).toEqual([
      'assertPortFree',
      'ensureDogfoodVars',
      'applyMigrations',
      'startWranglerDev',
      'waitDogfoodHealthcheck',
      'viteBuild',
      'prepareChromeProfile'
    ])
  })

  it('wrangler dev는 127.0.0.1:8787 로컬 + env-file 만 가리킨다', async () => {
    const { resolveWranglerDevArgs } = await loadLib()
    const args = resolveWranglerDevArgs()
    expect(args).toContain('127.0.0.1')
    expect(args).toContain('8787')
    expect(args).toContain('--env-file')
    expect(args).toContain('.dev.vars.dogfood')
    expect(args.join(' ')).not.toMatch(/workers\.dev/)
  })
})
