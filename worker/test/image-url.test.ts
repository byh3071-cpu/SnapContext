import { describe, expect, it } from 'vitest'
import {
  IMAGE_URL_TTL_SECONDS,
  createSignedImageUrl,
  verifyImageUrlSignature
} from '../src/image-url'

const SECRET = 'test-signing-secret'
const ID = '11111111-1111-4111-8111-111111111111'
const NOW_MS = 1_800_000_000_500

describe('private 이미지 서명 URL', () => {
  it('i.v1 도메인으로 현재 시각부터 정확히 300초인 /pi URL을 만든다', async () => {
    const value = await createSignedImageUrl({
      origin: 'https://worker.example',
      id: ID,
      secret: SECRET,
      nowMs: NOW_MS
    })
    const url = new URL(value)

    expect(url.pathname).toBe(`/pi/${ID}`)
    expect(url.searchParams.get('exp')).toBe(
      String(Math.floor(NOW_MS / 1000) + IMAGE_URL_TTL_SECONDS)
    )
    expect(url.searchParams.get('sig')).toMatch(/^[A-Za-z0-9_-]{22}$/)
  })

  it('발급한 서명은 발급 시각과 만료 정각에 유효하다', async () => {
    const url = new URL(
      await createSignedImageUrl({
        origin: 'https://worker.example',
        id: ID,
        secret: SECRET,
        nowMs: NOW_MS
      })
    )
    const exp = url.searchParams.get('exp')
    const sig = url.searchParams.get('sig')

    await expect(
      verifyImageUrlSignature({ id: ID, exp, sig, secret: SECRET, nowMs: NOW_MS })
    ).resolves.toBe(true)
    await expect(
      verifyImageUrlSignature({
        id: ID,
        exp,
        sig,
        secret: SECRET,
        nowMs: Number(exp) * 1000
      })
    ).resolves.toBe(true)
  })

  it.each([
    ['exp 없음', null, 'valid'],
    ['sig 없음', '1800000300', null],
    ['선행 0 exp', '01800000300', 'valid'],
    ['공백 exp', '1800000300 ', 'valid'],
    ['소수 exp', '1800000300.0', 'valid'],
    ['음수 exp', '-1', 'valid']
  ])('%s는 R2 접근 전에 거부할 수 있게 false다', async (_name, exp, sig) => {
    await expect(
      verifyImageUrlSignature({ id: ID, exp, sig, secret: SECRET, nowMs: NOW_MS })
    ).resolves.toBe(false)
  })

  it('만료·301초 미래·id 변조·signature 변조를 모두 거부한다', async () => {
    const url = new URL(
      await createSignedImageUrl({
        origin: 'https://worker.example',
        id: ID,
        secret: SECRET,
        nowMs: NOW_MS
      })
    )
    const exp = url.searchParams.get('exp')
    const sig = url.searchParams.get('sig')

    await expect(
      verifyImageUrlSignature({
        id: ID,
        exp,
        sig,
        secret: SECRET,
        nowMs: (Number(exp) + 1) * 1000
      })
    ).resolves.toBe(false)
    await expect(
      verifyImageUrlSignature({
        id: ID,
        exp: String(Math.floor(NOW_MS / 1000) + 301),
        sig,
        secret: SECRET,
        nowMs: NOW_MS
      })
    ).resolves.toBe(false)
    await expect(
      verifyImageUrlSignature({
        id: '22222222-2222-4222-8222-222222222222',
        exp,
        sig,
        secret: SECRET,
        nowMs: NOW_MS
      })
    ).resolves.toBe(false)
    await expect(
      verifyImageUrlSignature({
        id: ID,
        exp,
        sig: sig ? `${sig.slice(0, -1)}A` : sig,
        secret: SECRET,
        nowMs: NOW_MS
      })
    ).resolves.toBe(false)
  })
})
