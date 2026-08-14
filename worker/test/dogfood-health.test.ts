import { describe, expect, it } from 'vitest'

describe('dogfood-health', () => {
  it('DOGFOOD_LOCAL=1 과 nonce 일치 시에만 200', async () => {
    const { default: worker } = await import('../src/index')
    const base = {
      BUCKET: {} as R2Bucket,
      DB: {} as D1Database
    }
    const okEnv = {
      ...base,
      DOGFOOD_LOCAL: '1',
      DOGFOOD_BOOT_NONCE: 'test-nonce-12345678'
    }
    const ok = await worker.fetch(
      new Request('http://127.0.0.1:8787/dogfood-health?nonce=test-nonce-12345678'),
      okEnv,
      {} as ExecutionContext
    )
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({ ok: true, dogfood: true })
  })

  it('marker 누락·오값·nonce 단독은 모두 404', async () => {
    const { default: worker } = await import('../src/index')
    const base = {
      BUCKET: {} as R2Bucket,
      DB: {} as D1Database
    }
    const nonce = 'test-nonce-12345678'
    const req = () =>
      new Request(`http://127.0.0.1:8787/dogfood-health?nonce=${nonce}`)

    const missingMarker = await worker.fetch(
      req(),
      { ...base, DOGFOOD_BOOT_NONCE: nonce },
      {} as ExecutionContext
    )
    expect(missingMarker.status).toBe(404)

    const wrongMarker = await worker.fetch(
      req(),
      { ...base, DOGFOOD_LOCAL: 'true', DOGFOOD_BOOT_NONCE: nonce },
      {} as ExecutionContext
    )
    expect(wrongMarker.status).toBe(404)

    const nonceOnly = await worker.fetch(
      req(),
      { ...base, DOGFOOD_BOOT_NONCE: nonce },
      {} as ExecutionContext
    )
    expect(nonceOnly.status).toBe(404)

    const wrongNonce = await worker.fetch(
      new Request('http://127.0.0.1:8787/dogfood-health?nonce=wrong'),
      { ...base, DOGFOOD_LOCAL: '1', DOGFOOD_BOOT_NONCE: nonce },
      {} as ExecutionContext
    )
    expect(wrongNonce.status).toBe(404)
  })
})
