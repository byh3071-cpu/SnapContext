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
  db?: D1Database
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

async function resolveCaptureObjects(
  bucket: R2Bucket,
  id: string,
  signingSecret: string | undefined
): Promise<CaptureObjects> {
  try {
    if (signingSecret !== undefined && signingSecret.length > 0) {
      const keys = await derivePrivateObjectKeys(id, signingSecret)
      const privateHead = await bucket.head(keys.imageKey)
      if (privateHead) {
        return {
          imageHead: privateHead,
          jsonKey: keys.jsonKey,
          isPrivateV2: true
        }
      }
    }

    const legacyHead = await bucket.head(id)
    if (!legacyHead) throw notFound()
    return {
      imageHead: legacyHead,
      jsonKey: `${id}.json`,
      isPrivateV2: false
    }
  } catch (error) {
    if (error instanceof SnapPackError) throw error
    throw notFound()
  }
}

async function readLegacyOwner(db: D1Database, id: string): Promise<string | null> {
  try {
    const row = await db
      .prepare('SELECT owner FROM captures WHERE id = ? LIMIT 1')
      .bind(id)
      .first<{ owner: string | null }>()
    return typeof row?.owner === 'string' ? row.owner : null
  } catch {
    throw notFound()
  }
}

async function assertOwner(
  objects: CaptureObjects,
  opts: GetSnapPackOptions
): Promise<void> {
  const auth = opts.auth ?? { scope: 'admin' }
  if (auth.scope === 'admin') return

  const metadataOwner = objects.imageHead.customMetadata?.owner
  const owner =
    typeof metadataOwner === 'string'
      ? metadataOwner
      : opts.db
        ? await readLegacyOwner(opts.db, opts.id)
        : null
  if (owner !== auth.owner) throw notFound()
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
