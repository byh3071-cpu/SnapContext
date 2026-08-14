import {
  base64UrlDecode,
  base64UrlEncode,
  hmacSha256First16,
  timingSafeEqualBytes
} from './token'

export const IMAGE_URL_TTL_SECONDS = 300

export interface CreateSignedImageUrlOptions {
  origin: string
  id: string
  secret: string
  nowMs: number
}

export interface VerifyImageUrlSignatureOptions {
  id: string
  exp: string | null
  sig: string | null
  secret: string
  nowMs: number
}

function signatureMaterial(id: string, exp: string): Uint8Array {
  return new TextEncoder().encode(`i.v1:${id}:${exp}`)
}

function parseCanonicalExpiry(raw: string | null): number | null {
  if (raw === null || !/^(0|[1-9]\d*)$/.test(raw)) return null
  const value = Number(raw)
  return Number.isSafeInteger(value) ? value : null
}

/** owner를 통과한 MCP 응답에서만 호출하는 5분 bearer URL 발급기. */
export async function createSignedImageUrl(
  opts: CreateSignedImageUrlOptions
): Promise<string> {
  const exp = String(
    Math.floor(opts.nowMs / 1000) + IMAGE_URL_TTL_SECONDS
  )
  const mac = await hmacSha256First16(
    opts.secret,
    signatureMaterial(opts.id, exp)
  )
  const url = new URL(`/pi/${encodeURIComponent(opts.id)}`, opts.origin)
  url.searchParams.set('exp', exp)
  url.searchParams.set('sig', base64UrlEncode(mac))
  return url.href
}

/**
 * signature·expiry만 검증한다. 호출측은 true 전에는 R2에 접근하면 안 된다.
 * 과거뿐 아니라 현재 기준 300초를 넘는 미래 exp도 거부해 임의 장기 URL을 막는다.
 */
export async function verifyImageUrlSignature(
  opts: VerifyImageUrlSignatureOptions
): Promise<boolean> {
  const exp = parseCanonicalExpiry(opts.exp)
  if (exp === null || opts.exp === null || opts.sig === null) return false

  const provided = base64UrlDecode(opts.sig)
  if (provided === null || provided.byteLength !== 16) return false
  const expected = await hmacSha256First16(
    opts.secret,
    signatureMaterial(opts.id, opts.exp)
  )
  if (!timingSafeEqualBytes(provided, expected)) return false

  const nowSec = Math.floor(opts.nowMs / 1000)
  return exp >= nowSec && exp <= nowSec + IMAGE_URL_TTL_SECONDS
}
