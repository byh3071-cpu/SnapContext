import { getStorageItem, setStorageItem } from '../storage'
import { EXPIRY_DAYS_ALLOWLIST, isExpiryDays, type ExpiryDays } from './upload'

/** 키 이름은 기존 사용자의 보관 기간 선택을 유지하기 위해 바꾸지 않는다. */
export const SHARE_EXPIRY_STORAGE_KEY = 'shareExpiryDays'
export const DEFAULT_SHARE_EXPIRY_DAYS: ExpiryDays = 7
export const SHARE_EXPIRY_CHANGED_EVENT = 'snapcontext:share-expiry-changed'

export function formatExpiryDays(days: ExpiryDays): string {
  return `${days}일`
}

export function buildPrivateSaveConsentMessage(days: ExpiryDays): string {
  return (
    `캡처 이미지, 페이지 주소, 핀 메모와 입력한 요청을 Cloudflare 기반 서버로 전송하고 ${formatExpiryDays(days)} 후 삭제합니다. ` +
    '공개 링크는 만들지 않습니다. 연결 토큰을 설정한 AI 도구와 사용자가 선택한 AI 제공자가 이 데이터에 접근할 수 있습니다. 계속할까요?'
  )
}

export function buildPrivateSaveSuccessMessage(days: ExpiryDays): string {
  return `내 AI에 저장됨 · ${formatExpiryDays(days)} 후 삭제 · 연결한 AI 도구에서 조회`
}

export function readConsentedDays(stored: unknown): ExpiryDays | null {
  return isExpiryDays(stored) ? stored : null
}

export function needsShareConsent(
  consentedDays: ExpiryDays | null,
  days: ExpiryDays
): boolean {
  return consentedDays === null || days > consentedDays
}

export async function loadShareExpiryDays(): Promise<ExpiryDays> {
  const stored = await getStorageItem<unknown>(SHARE_EXPIRY_STORAGE_KEY)
  return isExpiryDays(stored) ? stored : DEFAULT_SHARE_EXPIRY_DAYS
}

export async function saveShareExpiryDays(days: ExpiryDays): Promise<void> {
  if (!isExpiryDays(days)) {
    throw new Error(
      `보관 기간은 ${EXPIRY_DAYS_ALLOWLIST.join(', ')}일 중에서만 선택할 수 있습니다.`
    )
  }
  await setStorageItem(SHARE_EXPIRY_STORAGE_KEY, days)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SHARE_EXPIRY_CHANGED_EVENT))
  }
}
