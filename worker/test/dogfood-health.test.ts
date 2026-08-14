import { describe, expect, it } from 'vitest'

describe('dogfood-health', () => {
  it('nonce 일치 시에만 200, 그 외 404', async () => {
    const { default: worker } = await import('../src/index')
    const env = {
      DOGFOOD_BOOT_NONCE: 'test-nonce-12345678',
      BUCKET: {} as R2Bucket,
      DB: {} as D1Database
    }
    const ok = await worker.fetch(
      new Request('http://127.0.0.1:8787/dogfood-health?nonce=test-nonce-12345678'),
      env,
      {} as ExecutionContext
    )
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({ ok: true, dogfood: true })

    const bad = await worker.fetch(
      new Request('http://127.0.0.1:8787/dogfood-health?nonce=wrong'),
      env,
      {} as ExecutionContext
    )
    expect(bad.status).toBe(404)

    const unset = await worker.fetch(
      new Request('http://127.0.0.1:8787/dogfood-health?nonce=test-nonce-12345678'),
      { BUCKET: {} as R2Bucket, DB: {} as D1Database },
      {} as ExecutionContext
    )
    expect(unset.status).toBe(404)
  })
})
