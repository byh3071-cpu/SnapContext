export const MAX_SHARED_CONTEXT_V2_BYTES = 64 * 1024
export const MAX_SHARED_CONTEXT_V2_INTENT_CHARS = 2_000

export const SHARED_CONTEXT_V2_MODES = [
  'context',
  'bug-report',
  'refactor',
  'reference'
] as const
export type SharedContextV2Mode = (typeof SHARED_CONTEXT_V2_MODES)[number]

const CAPTURE_TYPES = ['visible', 'element', 'document', 'full-page'] as const
export type SharedContextV2CaptureType = (typeof CAPTURE_TYPES)[number]

export interface SharedContextV2Pin {
  id: number
  memo: string
}

export interface SharedContextV2 {
  v: 2
  sourceUrl: string
  sourceTitle: string
  captureType: SharedContextV2CaptureType
  capturedAt: string
  viewport: { width: number; height: number }
  pins: SharedContextV2Pin[]
  intent: string
  mode: SharedContextV2Mode
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isOneOf<T extends string>(
  value: unknown,
  values: readonly T[]
): value is T {
  return typeof value === 'string' && values.some((item) => item === value)
}

function sanitizeSourceUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    url.username = ''
    url.password = ''
    url.search = ''
    url.hash = ''
    return url.href
  } catch {
    return null
  }
}

function parseViewport(value: unknown): { width: number; height: number } | null {
  if (!isRecord(value)) return null
  const { width, height } = value
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    width <= 0 ||
    height <= 0
  ) {
    return null
  }
  return { width, height }
}

function parsePins(value: unknown): SharedContextV2Pin[] | null {
  if (!Array.isArray(value)) return null
  const ids = new Set<number>()
  const pins: SharedContextV2Pin[] = []
  for (const entry of value) {
    if (!isRecord(entry)) return null
    const { id, memo } = entry
    if (
      typeof id !== 'number' ||
      !Number.isSafeInteger(id) ||
      id <= 0 ||
      ids.has(id) ||
      typeof memo !== 'string'
    ) {
      return null
    }
    ids.add(id)
    pins.push({ id, memo })
  }
  return pins
}

/** raw 크기부터 막은 뒤 JSON을 allowlist 구조로 재구성한다. */
export function parseSharedContextV2(raw: string): SharedContextV2 | null {
  if (new TextEncoder().encode(raw).byteLength > MAX_SHARED_CONTEXT_V2_BYTES) {
    return null
  }

  let value: unknown
  try {
    value = JSON.parse(raw) as unknown
  } catch {
    return null
  }
  if (!isRecord(value) || value.v !== 2) return null

  const sourceUrl = sanitizeSourceUrl(value.sourceUrl)
  const viewport = parseViewport(value.viewport)
  const pins = parsePins(value.pins)
  if (
    sourceUrl === null ||
    typeof value.sourceTitle !== 'string' ||
    !isOneOf(value.captureType, CAPTURE_TYPES) ||
    typeof value.capturedAt !== 'string' ||
    !Number.isFinite(Date.parse(value.capturedAt)) ||
    viewport === null ||
    pins === null ||
    typeof value.intent !== 'string' ||
    value.intent.length > MAX_SHARED_CONTEXT_V2_INTENT_CHARS ||
    !isOneOf(value.mode, SHARED_CONTEXT_V2_MODES)
  ) {
    return null
  }

  return {
    v: 2,
    sourceUrl,
    sourceTitle: value.sourceTitle,
    captureType: value.captureType,
    capturedAt: value.capturedAt,
    viewport,
    pins,
    intent: value.intent,
    mode: value.mode
  }
}
