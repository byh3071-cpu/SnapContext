import type { SharedContextV2 } from '../types'

export const EXPIRY_DAYS_ALLOWLIST = [1, 7, 30] as const
export type ExpiryDays = (typeof EXPIRY_DAYS_ALLOWLIST)[number]

export function isExpiryDays(value: unknown): value is ExpiryDays {
  return (
    typeof value === 'number' &&
    EXPIRY_DAYS_ALLOWLIST.some((allowed) => allowed === value)
  )
}

export function sanitizeSourceUrlForUpload(raw: string): string {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error('페이지 주소를 해석할 수 없습니다.')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('페이지 주소는 http 또는 https여야 합니다.')
  }
  url.username = ''
  url.password = ''
  url.search = ''
  url.hash = ''
  return url.href
}

export class CaptureUploadError extends Error {
  readonly status: number

  constructor(status: number) {
    super(`캡처 저장 실패 (${status})`)
    this.name = 'CaptureUploadError'
    this.status = status
  }
}

export function isUnauthorizedCaptureUploadError(error: unknown): boolean {
  return error instanceof CaptureUploadError && error.status === 401
}

export interface PrivateCaptureUploadOptions {
  token: string | null
  expiresInDays: ExpiryDays
}

export interface PrivateCaptureUploadResult {
  id: string
  expiresAt: string
}

function isPrivateCaptureUploadResult(
  value: unknown
): value is PrivateCaptureUploadResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const record = value as Record<string, unknown>
  return (
    typeof record.id === 'string' &&
    record.id.length > 0 &&
    typeof record.expiresAt === 'string' &&
    Number.isFinite(Date.parse(record.expiresAt))
  )
}

/** 공개 링크를 만들지 않고 현재 사용자 owner에 캡처를 저장한다. */
export async function uploadPrivateCapture(
  imageBlob: Blob,
  context: SharedContextV2,
  options: PrivateCaptureUploadOptions
): Promise<PrivateCaptureUploadResult> {
  const endpoint: string | undefined = import.meta.env.VITE_UPLOAD_ENDPOINT
  if (!endpoint) throw new Error('캡처 저장 서버가 설정되지 않았습니다.')
  if (!options.token) {
    throw new Error('AI 연결 토큰을 발급하지 못해 저장을 중단했습니다.')
  }
  if (!isExpiryDays(options.expiresInDays)) {
    throw new Error(
      `보관 기간은 ${EXPIRY_DAYS_ALLOWLIST.join(', ')}일 중에서만 선택할 수 있습니다.`
    )
  }

  const form = new FormData()
  form.append('image', imageBlob, 'capture.png')
  form.append(
    'context',
    JSON.stringify({
      ...context,
      sourceUrl: sanitizeSourceUrlForUpload(context.sourceUrl)
    })
  )
  form.append('expiresInDays', String(options.expiresInDays))

  const base = endpoint.replace(/\/+$/, '')
  const response = await fetch(`${base}/captures`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${options.token}` },
    body: form
  })
  if (!response.ok) throw new CaptureUploadError(response.status)

  let data: unknown
  try {
    data = await response.json()
  } catch {
    throw new Error('서버 응답을 해석할 수 없습니다.')
  }
  if (!isPrivateCaptureUploadResult(data)) {
    throw new Error('서버 응답에 캡처 ID 또는 삭제 예정 시각이 없습니다.')
  }
  return data
}

export interface PrivateCaptureListItem {
  id: string
  createdAt: string
  url: string
  title: string
  captureType: string
  pinCount: number
}

function privateApiBase(): string {
  const endpoint: string | undefined = import.meta.env.VITE_UPLOAD_ENDPOINT
  if (!endpoint) throw new Error('캡처 저장 서버가 설정되지 않았습니다.')
  return endpoint.replace(/\/+$/, '')
}

function requireToken(token: string | null): string {
  if (!token) throw new Error('AI 연결 토큰이 필요합니다.')
  return token
}

function isPrivateCaptureListItem(value: unknown): value is PrivateCaptureListItem {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const record = value as Record<string, unknown>
  return (
    typeof record.id === 'string' &&
    typeof record.createdAt === 'string' &&
    typeof record.url === 'string' &&
    typeof record.title === 'string' &&
    typeof record.captureType === 'string' &&
    typeof record.pinCount === 'number' &&
    Number.isSafeInteger(record.pinCount)
  )
}

export async function listPrivateCaptures(
  token: string | null,
  limit = 20
): Promise<PrivateCaptureListItem[]> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('목록 개수는 1~100 사이여야 합니다.')
  }
  const response = await fetch(`${privateApiBase()}/captures?limit=${limit}`, {
    headers: { Authorization: `Bearer ${requireToken(token)}` }
  })
  if (!response.ok) throw new CaptureUploadError(response.status)

  let data: unknown
  try {
    data = await response.json()
  } catch {
    throw new Error('저장 목록 응답을 해석할 수 없습니다.')
  }
  if (!Array.isArray(data) || !data.every(isPrivateCaptureListItem)) {
    throw new Error('저장 목록 응답 형식이 올바르지 않습니다.')
  }
  return data
}

export async function deletePrivateCapture(
  token: string | null,
  id: string
): Promise<void> {
  if (!id) throw new Error('삭제할 캡처 ID가 없습니다.')
  const response = await fetch(
    `${privateApiBase()}/captures/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${requireToken(token)}` }
    }
  )
  if (!response.ok) throw new CaptureUploadError(response.status)
}
