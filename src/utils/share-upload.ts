import type { SharedContextV2 } from '../types'
import { clearUserToken, ensureUserToken } from './token'
import {
  isUnauthorizedCaptureUploadError,
  uploadPrivateCapture,
  type ExpiryDays,
  type PrivateCaptureUploadResult
} from './upload'

function tokenRequiredMessage(): Error {
  return new Error(
    '새 토큰을 발급하지 못했습니다. 네트워크 연결을 확인한 뒤 다시 시도해 주세요.'
  )
}

/** 토큰이 없으면 중단하고, 401일 때만 새 토큰으로 정확히 한 번 재시도한다. */
export async function saveCaptureWithToken(
  imageBlob: Blob,
  context: SharedContextV2,
  expiresInDays: ExpiryDays
): Promise<PrivateCaptureUploadResult> {
  const token = await ensureUserToken()
  if (token === null) throw tokenRequiredMessage()

  try {
    return await uploadPrivateCapture(imageBlob, context, {
      token,
      expiresInDays
    })
  } catch (error) {
    if (!isUnauthorizedCaptureUploadError(error)) throw error

    console.warn(
      '[capture-save] 저장된 토큰이 거부되어 폐기하고 새 토큰을 발급합니다.'
    )
    await clearUserToken()
    const renewedToken = await ensureUserToken()
    if (renewedToken === null) throw tokenRequiredMessage()

    return uploadPrivateCapture(imageBlob, context, {
      token: renewedToken,
      expiresInDays
    })
  }
}
