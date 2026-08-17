import type { McpAuthResult } from './auth'
import { createSignedImageUrl } from './image-url'
import {
  isExpiredAt,
  parseSharedContext,
  readExpiry,
  type SharedContext
} from './lib'
import { derivePrivateObjectKeys } from './private-object-key'
import {
  parseSharedContextV2,
  type SharedContextV2,
  type SharedContextV2Mode
} from './shared-context-v2'

export class SnapPackError extends Error {
  readonly code: 'NOT_FOUND' | 'EXPIRED' | 'INVALID'

  constructor(code: 'NOT_FOUND' | 'EXPIRED' | 'INVALID', message: string) {
    super(message)
    this.name = 'SnapPackError'
    this.code = code
  }
}

export interface SnapPackResult {
  v: 1 | 2
  sourceUrl: string
  sourceTitle: string
  captureType: string
  capturedAt: string
  viewport: { width: number; height: number }
  pins: Array<{ id: number; memo: string }>
  intent?: string
  mode?: SharedContextV2Mode
  id: string
  imageUrl?: string
}

export interface GetSnapPackOptions {
  id: string
  origin: string
  includeImage: boolean
  now: number
  signingSecret?: string
  auth?: McpAuthResult
}

interface CaptureObjects {
  imageHead: R2Object
  jsonKey: string
  isPrivateV2: boolean
}

function notFound(): SnapPackError {
  return new SnapPackError('NOT_FOUND', 'NOT_FOUND')
}

/**
 * 0.4.4(ADR-015 2차): 레거시 raw-ID(bucket.head(id)) fallback 을 제거했다 — private-v2
 * 키로만 찾는다. signingSecret 미설정(서버 설정 오류)이면 애초에 아무 것도 못 찾는다
 * (fail-closed. 조용히 레거시 경로로 넘기지 않는다).
 */
async function resolveCaptureObjects(
  bucket: R2Bucket,
  id: string,
  signingSecret: string | undefined
): Promise<CaptureObjects> {
  if (signingSecret === undefined || signingSecret.length === 0) {
    throw notFound()
  }
  try {
    const keys = await derivePrivateObjectKeys(id, signingSecret)
    const imageHead = await bucket.head(keys.imageKey)
    if (!imageHead) throw notFound()
    return { imageHead, jsonKey: keys.jsonKey, isPrivateV2: true }
  } catch (error) {
    if (error instanceof SnapPackError) throw error
    throw notFound()
  }
}

/**
 * owner 는 항상 customMetadata 에서 온다 — /captures 쓰기 경로(private-capture-routes.ts)가
 * 매 캡처에 owner 를 심는다. D1 조회로 되돌아가던 레거시 owner fallback 은 0.4.4에서 제거됐다.
 */
async function assertOwner(
  objects: CaptureObjects,
  opts: GetSnapPackOptions
): Promise<void> {
  const auth = opts.auth ?? { scope: 'admin' }
  if (auth.scope === 'admin') return

  const metadataOwner = objects.imageHead.customMetadata?.owner
  if (metadataOwner !== auth.owner) throw notFound()
}

function parseContext(
  raw: string,
  isPrivateV2: boolean
): SharedContext | SharedContextV2 | null {
  return isPrivateV2 ? parseSharedContextV2(raw) : parseSharedContext(raw)
}

/** owner 확인 뒤에만 컨텍스트와 5분 서명 이미지 URL을 반환한다. */
export async function getSnapPack(
  bucket: R2Bucket,
  opts: GetSnapPackOptions
): Promise<SnapPackResult> {
  const objects = await resolveCaptureObjects(bucket, opts.id, opts.signingSecret)
  await assertOwner(objects, opts)

  if (isExpiredAt(readExpiry(objects.imageHead).expiresAtMs, opts.now)) {
    throw new SnapPackError('EXPIRED', 'EXPIRED')
  }

  let object: R2ObjectBody | null
  try {
    object = await bucket.get(objects.jsonKey)
  } catch {
    throw notFound()
  }
  if (!object) throw notFound()
  if (isExpiredAt(readExpiry(object).expiresAtMs, opts.now)) {
    throw new SnapPackError('EXPIRED', 'EXPIRED')
  }

  const context = parseContext(await object.text(), objects.isPrivateV2)
  if (!context) throw new SnapPackError('INVALID', 'INVALID_CONTEXT')

  const result: SnapPackResult = { ...context, id: opts.id }
  if (opts.includeImage) {
    if (!opts.signingSecret) {
      throw new SnapPackError('INVALID', 'SERVER_MISCONFIGURED')
    }
    result.imageUrl = await createSignedImageUrl({
      origin: opts.origin,
      id: opts.id,
      secret: opts.signingSecret,
      nowMs: opts.now
    })
  }
  return result
}
