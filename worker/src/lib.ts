export const DAY_MS = 24 * 60 * 60 * 1000
export const EXPIRY_DAYS_ALLOWLIST = [1, 7, 30] as const
export type ExpiryDays = (typeof EXPIRY_DAYS_ALLOWLIST)[number]
export const DEFAULT_EXPIRY_DAYS: ExpiryDays = 7
/** 레거시 fallback 창(메타 없는 기존 객체) + 기본 보관창. 이름은 하위호환 유지 */
export const MAX_AGE_MS = DEFAULT_EXPIRY_DAYS * DAY_MS
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
export const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** R2Object·R2ObjectBody 가 구조적으로 만족 — 테스트가 리터럴로 생성 가능(as 캐스트 회피) */
export interface ExpiryMetaSource {
  readonly uploaded: Date
  readonly customMetadata?: Record<string, string>
}

export interface ExpiryInfo {
  readonly expiresAtMs: number
  readonly retentionDays: number
  readonly source: 'metadata' | 'legacy' | 'invalid'
}

export type SharedContext = {
  v: 1
  sourceUrl: string
  sourceTitle: string
  captureType: string
  capturedAt: string
  viewport: { width: number; height: number }
  pins: Array<{ id: number; memo: string }>
}

export function safeDecodeId(raw: string): string {
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

export function isPngMagic(bytes: Uint8Array): boolean {
  if (bytes.length < PNG_MAGIC.length) return false
  for (let i = 0; i < PNG_MAGIC.length; i++) {
    if (bytes[i] !== PNG_MAGIC[i]) return false
  }
  return true
}

/**
 * 만료 판정·표시의 단일 소스. customMetadata.expiresAt(절대시각) 이 SoT 이고,
 * 없으면 레거시 객체로 보고 uploaded + 7일로 되돌린다.
 */
export function readExpiry(obj: ExpiryMetaSource): ExpiryInfo {
  const uploadedMs = obj.uploaded.getTime()
  const raw = obj.customMetadata?.expiresAt
  if (raw === undefined) {
    return {
      expiresAtMs: uploadedMs + MAX_AGE_MS,
      retentionDays: DEFAULT_EXPIRY_DAYS,
      source: 'legacy'
    }
  }
  const parsed = Date.parse(raw)
  if (!Number.isFinite(parsed)) {
    // 조용히 7일로 되돌리면 1일 캡처가 7일 산다(과보관) → 만료 처리 (fallback 금지 규칙)
    console.warn('[expiry] customMetadata.expiresAt 파싱 실패 — 만료 처리')
    return { expiresAtMs: uploadedMs, retentionDays: 0, source: 'invalid' }
  }
  return {
    expiresAtMs: parsed,
    retentionDays: Math.round((parsed - uploadedMs) / DAY_MS),
    source: 'metadata'
  }
}

/** 경계는 기존 isExpired 와 동일 strict `<` (만료시각 정각은 아직 유효) */
export function isExpiredAt(expiresAtMs: number, now: number): boolean {
  return expiresAtMs < now
}

/**
 * 폼 값 → 보관일수. 부재(null·undefined)=기본 7일. 형식·allowlist 위반=null(호출측 400).
 *
 * 정규식이 먼저 형식을 막는 이유: Number() 만 쓰면 '0x7'·'7e0'·' 7 '·'7.0'·'+7' 이
 * 전부 7 로 통과한다. 빈 문자열도 400 이다 — "부재=7" 은 필드가 없을 때의 규칙이지
 * 빈 값의 규칙이 아니고, 빈 값을 7 로 흡수하면 조용한 우회다.
 */
export function parseExpiresInDays(raw: unknown): ExpiryDays | null {
  if (raw === null || raw === undefined) return DEFAULT_EXPIRY_DAYS
  if (typeof raw !== 'string') return null
  if (!/^\d+$/.test(raw)) return null
  const n = Number(raw)
  return EXPIRY_DAYS_ALLOWLIST.find((allowed) => allowed === n) ?? null
}

export function parseSharedContext(raw: string): SharedContext | null {
  try {
    const o = JSON.parse(raw) as unknown
    if (!o || typeof o !== 'object' || Array.isArray(o)) return null
    return o as SharedContext
  } catch {
    return null
  }
}

