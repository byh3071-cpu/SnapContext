import { describe, expect, it } from 'vitest'
import {
  PRIVATE_OBJECT_PREFIX,
  derivePrivateObjectKeys
} from '../src/private-object-key'

const SECRET = 'test-signing-secret'
const ID = '11111111-1111-4111-8111-111111111111'

function base64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

async function expectedDigest(id: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`obj.v2:${id}`)
  )
  return base64Url(new Uint8Array(mac))
}

describe('private v2 R2 객체 키', () => {
  it('obj.v2 도메인의 HMAC-SHA256 전체 32바이트로 키를 만든다', async () => {
    const keys = await derivePrivateObjectKeys(ID, SECRET)
    const digest = await expectedDigest(ID)

    expect(keys.baseKey).toBe(`${PRIVATE_OBJECT_PREFIX}${digest}`)
    expect(digest).toHaveLength(43)
    expect(keys.imageKey).toBe(keys.baseKey)
    expect(keys.jsonKey).toBe(`${keys.baseKey}.json`)
  })

  it('외부 capture id를 실제 R2 key에 그대로 포함하지 않는다', async () => {
    const keys = await derivePrivateObjectKeys(ID, SECRET)

    expect(keys.baseKey).not.toContain(ID)
    expect(keys.baseKey).toMatch(/^private-v2\/[A-Za-z0-9_-]{43}$/)
  })

  it('capture id가 다르면 내부 key도 달라진다', async () => {
    const first = await derivePrivateObjectKeys(ID, SECRET)
    const second = await derivePrivateObjectKeys(
      '22222222-2222-4222-8222-222222222222',
      SECRET
    )

    expect(first.baseKey).not.toBe(second.baseKey)
  })
})
