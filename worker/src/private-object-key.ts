import { base64UrlEncode, hmacSha256 } from './token'

export const PRIVATE_OBJECT_PREFIX = 'private-v2/'

export interface PrivateObjectKeys {
  baseKey: string
  imageKey: string
  jsonKey: string
}

/** ADR-018: 외부 UUID를 공개 R2 key로 쓰지 않고 secret 기반 capability로 변환한다. */
export async function derivePrivateObjectKeys(
  captureId: string,
  secret: string
): Promise<PrivateObjectKeys> {
  const material = new TextEncoder().encode(`obj.v2:${captureId}`)
  const digest = await hmacSha256(secret, material)
  const baseKey = `${PRIVATE_OBJECT_PREFIX}${base64UrlEncode(digest)}`
  return {
    baseKey,
    imageKey: baseKey,
    jsonKey: `${baseKey}.json`
  }
}
