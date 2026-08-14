import { ownerFromToken, verifyUserToken } from './token'
import { derivePrivateObjectKeys } from './private-object-key'
import { verifyImageUrlSignature } from './image-url'
import { parseSharedContextV2 } from './shared-context-v2'
import {
  DAY_MS,
  EXPIRY_DAYS_ALLOWLIST,
  MAX_UPLOAD_BYTES,
  isExpiredAt,
  isPngMagic,
  parseExpiresInDays,
  readExpiry,
  safeDecodeId
} from './lib'
import { allowUploadRequest } from './upload-rate-limit'
import { captureRowFromSharedContext, insertCapture } from './ingest'
import { DEFAULT_HISTORY_LIMIT, listCaptures } from './history'
import type { Env } from './env'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
}

const CAPTURE_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

interface UserAuth {
  owner: string
}

interface CaptureOwnerRow {
  owner: string | null
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS }
  })
}

function textResponse(
  body: string,
  status: number,
  extra: Record<string, string> = {}
): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', ...CORS, ...extra }
  })
}

function unauthorized(): Response {
  return textResponse('Unauthorized', 401, {
    'WWW-Authenticate': 'Bearer'
  })
}

function signingSecret(env: Env): string | Response {
  const secret = env.TOKEN_SIGNING_SECRET
  if (secret === undefined || secret.length === 0) {
    return textResponse(
      'Server misconfigured: TOKEN_SIGNING_SECRET unset',
      500
    )
  }
  return secret
}

async function resolveUserAuth(
  request: Request,
  env: Env
): Promise<UserAuth | Response> {
  const secret = signingSecret(env)
  if (secret instanceof Response) return secret

  const header = request.headers.get('Authorization')
  if (header === null || !header.startsWith('Bearer ')) return unauthorized()
  const token = header.slice('Bearer '.length)
  if (!token.startsWith('sc_') || !(await verifyUserToken(token, secret))) {
    return unauthorized()
  }
  return { owner: await ownerFromToken(token) }
}

function parseLimit(raw: string | null): number | null {
  if (raw === null) return DEFAULT_HISTORY_LIMIT
  if (!/^[1-9]\d*$/.test(raw)) return null
  const value = Number(raw)
  return Number.isSafeInteger(value) && value <= 100 ? value : null
}

async function cleanupPrivateObjects(
  bucket: R2Bucket,
  keys: readonly string[]
): Promise<void> {
  try {
    await bucket.delete([...keys])
  } catch {
    // 본래 오류를 성공으로 바꾸지 않는다. 식별자를 로그에 싣지 않고 정리 실패를 관측한다.
    console.warn('[private-capture] cleanup_failed')
  }
}

async function handleCreateCapture(
  request: Request,
  env: Env
): Promise<Response> {
  const auth = await resolveUserAuth(request, env)
  if (auth instanceof Response) return auth
  const secret = signingSecret(env)
  if (secret instanceof Response) return secret

  const ip = request.headers.get('CF-Connecting-IP') ?? ''
  if (!allowUploadRequest(ip)) {
    return textResponse('업로드 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.', 429)
  }
  const contentLength = Number(request.headers.get('content-length') ?? '0')
  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_UPLOAD_BYTES + 1024 * 1024
  ) {
    return textResponse('파일이 너무 큽니다. (최대 10MB)', 413)
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return textResponse('잘못된 업로드 형식입니다.', 400)
  }

  const image: unknown = form.get('image')
  if (!(image instanceof File) && !(image instanceof Blob)) {
    return textResponse('이미지가 없습니다.', 400)
  }
  if (image.size > MAX_UPLOAD_BYTES) {
    return textResponse('파일이 너무 큽니다. (최대 10MB)', 413)
  }

  const days = parseExpiresInDays(form.get('expiresInDays'))
  if (days === null) {
    return textResponse(
      `보관 기간은 ${EXPIRY_DAYS_ALLOWLIST.join(', ')}일 중에서만 선택할 수 있습니다.`,
      400
    )
  }

  const rawContext = form.get('context')
  if (typeof rawContext !== 'string') {
    return textResponse('SharedContextV2가 없습니다.', 400)
  }
  const context = parseSharedContextV2(rawContext)
  if (context === null) {
    return textResponse('SharedContextV2 형식이 올바르지 않습니다.', 400)
  }

  const imageBuffer = await image.arrayBuffer()
  if (!isPngMagic(new Uint8Array(imageBuffer.slice(0, 8)))) {
    return textResponse('PNG 이미지만 업로드할 수 있습니다.', 415)
  }

  const id = crypto.randomUUID()
  const nowMs = Date.now()
  const expiresAt = new Date(nowMs + days * DAY_MS).toISOString()
  const keys = await derivePrivateObjectKeys(id, secret)
  const metadata = {
    expiresAt,
    owner: auth.owner,
    access: 'private-v2'
  }

  try {
    await env.BUCKET.put(keys.imageKey, imageBuffer, {
      httpMetadata: { contentType: 'image/png' },
      customMetadata: metadata
    })
    await env.BUCKET.put(keys.jsonKey, JSON.stringify(context), {
      httpMetadata: { contentType: 'application/json' },
      customMetadata: metadata
    })
  } catch {
    await cleanupPrivateObjects(env.BUCKET, [keys.imageKey, keys.jsonKey])
    return textResponse('업로드에 실패했습니다. 잠시 후 다시 시도해 주세요.', 502)
  }

  try {
    await insertCapture(
      env.DB,
      captureRowFromSharedContext({
        id,
        ctx: context,
        nowMs,
        expiresAtIso: expiresAt,
        owner: auth.owner
      })
    )
  } catch {
    await cleanupPrivateObjects(env.BUCKET, [keys.imageKey, keys.jsonKey])
    return textResponse(
      '인덱스 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.',
      500
    )
  }

  return jsonResponse({ id, expiresAt }, 201)
}

async function handleListCaptures(
  request: Request,
  env: Env,
  url: URL
): Promise<Response> {
  const auth = await resolveUserAuth(request, env)
  if (auth instanceof Response) return auth
  const limit = parseLimit(url.searchParams.get('limit'))
  if (limit === null) return textResponse('limit은 1~100 정수여야 합니다.', 400)

  try {
    const entries = await listCaptures(env.DB, {
      owner: auth.owner,
      limit,
      nowIso: new Date().toISOString()
    })
    return jsonResponse(entries)
  } catch {
    return textResponse('캡처 목록을 불러오지 못했습니다.', 500)
  }
}

async function findCaptureOwner(
  db: D1Database,
  id: string
): Promise<CaptureOwnerRow | null> {
  return db
    .prepare('SELECT owner FROM captures WHERE id = ?')
    .bind(id)
    .first<CaptureOwnerRow>()
}

async function handleDeleteCapture(
  request: Request,
  env: Env,
  id: string
): Promise<Response> {
  const auth = await resolveUserAuth(request, env)
  if (auth instanceof Response) return auth
  const secret = signingSecret(env)
  if (secret instanceof Response) return secret
  if (!CAPTURE_ID_RE.test(id)) return textResponse('Not found', 404)

  let row: CaptureOwnerRow | null
  try {
    row = await findCaptureOwner(env.DB, id)
  } catch {
    return textResponse('캡처 소유자를 확인하지 못했습니다.', 500)
  }
  if (row === null || row.owner !== auth.owner) {
    return textResponse('Not found', 404)
  }

  const keys = await derivePrivateObjectKeys(id, secret)
  try {
    await env.BUCKET.delete([keys.imageKey, keys.jsonKey])
  } catch {
    return textResponse('서버 저장본을 삭제하지 못했습니다.', 502)
  }

  try {
    await env.DB
      .prepare('DELETE FROM captures WHERE id = ? AND owner = ?')
      .bind(id, auth.owner)
      .run()
  } catch {
    return textResponse('캡처 인덱스를 삭제하지 못했습니다.', 500)
  }
  return new Response(null, { status: 204, headers: CORS })
}

async function handlePrivateImage(
  request: Request,
  env: Env,
  url: URL,
  id: string
): Promise<Response> {
  const secret = signingSecret(env)
  if (secret instanceof Response) return secret
  const nowMs = Date.now()
  if (
    !CAPTURE_ID_RE.test(id) ||
    !(await verifyImageUrlSignature({
      id,
      exp: url.searchParams.get('exp'),
      sig: url.searchParams.get('sig'),
      secret,
      nowMs
    }))
  ) {
    return textResponse('Forbidden', 403, { 'Cache-Control': 'no-store' })
  }

  const keys = await derivePrivateObjectKeys(id, secret)
  let object: R2ObjectBody | null
  try {
    object = await env.BUCKET.get(keys.imageKey)
    if (object === null) {
      // 레거시 owner 캡처도 새 MCP 응답의 /pi URL로 읽을 수 있게 하는 호환 경로.
      object = await env.BUCKET.get(id)
    }
  } catch {
    return textResponse('이미지를 불러오지 못했습니다.', 502, {
      'Cache-Control': 'no-store'
    })
  }

  if (object === null || isExpiredAt(readExpiry(object).expiresAtMs, nowMs)) {
    return textResponse('이미지가 만료되었거나 존재하지 않습니다.', 410, {
      'Cache-Control': 'no-store'
    })
  }
  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType ?? 'image/png',
      'Cache-Control': 'private, no-store',
      ...CORS
    }
  })
}

/** 신규 private 경로만 처리하고 레거시 라우트는 index.ts에 남긴다. */
export async function handlePrivateCaptureRoutes(
  request: Request,
  env: Env,
  url: URL
): Promise<Response | null> {
  if (request.method === 'POST' && url.pathname === '/captures') {
    return handleCreateCapture(request, env)
  }
  if (request.method === 'GET' && url.pathname === '/captures') {
    return handleListCaptures(request, env, url)
  }
  if (request.method === 'DELETE' && url.pathname.startsWith('/captures/')) {
    const id = safeDecodeId(url.pathname.slice('/captures/'.length))
    return handleDeleteCapture(request, env, id)
  }
  if (request.method === 'GET' && url.pathname.startsWith('/pi/')) {
    const id = safeDecodeId(url.pathname.slice('/pi/'.length))
    return handlePrivateImage(request, env, url, id)
  }
  return null
}
