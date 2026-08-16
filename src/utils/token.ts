import { getStorageItem, removeStorageItem, setStorageItem } from '../storage'

/**
 * per-user 토큰 클라이언트 (PRD 0.4.0 F007).
 *
 * 저장 위치는 chrome.storage.local 만 쓴다 — 토큰은 시크릿이라 sync 로 기기 간 자동
 * 전파시키면 안 된다(다른 기기로 옮기는 건 P6 붙여넣기 UI 의 명시적 사용자 행위).
 *
 * 발급은 서비스워커가 아니라 이 모듈을 부르는 표면(사이드패널)에서 lazy 로 일어난다.
 * chrome.runtime.onInstalled 를 쓰지 않는 이유: (1) 확장에 onInstalled/onStartup
 * 핸들러가 하나도 없어 새 표면을 여는 비용이 크고, (2) e2e 의 fetch mock 이
 * 사이드패널 페이지 window.fetch 에만 걸려 있어 서비스워커 발급은 mock 을 우회한다.
 */
export const TOKEN_STORAGE_KEY = 'snapcontextToken'

/**
 * 토큰 형식 검증 — `sc_<body>.<sig>` (점 하나로 갈라지는 2조각, 양쪽 다 비어있지 않음).
 * HMAC 유효성은 서버만 판정할 수 있으므로 여기서는 형식만 본다.
 * 손상된 저장값 폐기와 P6(다른 기기 토큰 붙여넣기) 입력 검증이 이 함수를 공유한다.
 */
export function isValidTokenFormat(value: unknown): value is string {
  if (typeof value !== 'string') return false
  if (!value.startsWith('sc_')) return false
  const parts = value.slice(3).split('.')
  if (parts.length !== 2) return false
  return parts[0].length > 0 && parts[1].length > 0
}

// 동시 발급 방지용 in-flight 가드. 사이드패널 오픈과 업로드 직전이 겹칠 수 있는데,
// worker 에 분당 10회 rate-limit 이 있고 중복 발급은 owner 파편화(같은 사용자가
// 서로 다른 owner 로 나뉨)로 이어진다. 정착되면 null 로 되돌려 재시도를 허용한다.
let inFlight: Promise<string | null> | null = null

/**
 * 저장된 토큰을 돌려주고, 없거나 손상됐으면 worker 에서 발급받아 저장한다.
 *
 * 발급 실패는 null — 호출측은 저장을 중단하고 사용자에게 재시도를 안내한다.
 * storage I/O 실패는 예외를 그대로 드러낸다. 토큰을 읽거나 영구 저장하지 못한 상태에서
 * 새 owner로 업로드하면 다음 실행에서 그 캡처에 다시 접근할 수 없기 때문이다.
 */
export async function ensureUserToken(): Promise<string | null> {
  if (inFlight) return inFlight
  // 재발급이 이미 진행 중이면 그 결과를 그대로 재사용한다 — 여기서 별도로 발급을
  // 또 하나 시작하면 둘 다 storage 에 쓰면서 나중에 끝난 쪽이 owner 를 덮어써
  // owner 파편화(같은 사용자가 서로 다른 owner 로 갈라짐)로 이어진다.
  if (regenerateInFlight) return regenerateInFlight
  inFlight = resolveUserToken()
  try {
    return await inFlight
  } finally {
    inFlight = null
  }
}

// 재발급 전용 in-flight 가드. ensureUserToken 의 inFlight 와는 별개다 — 재발급은
// 저장된 토큰 유무와 무관하게 항상 새 발급을 강제하므로 같은 변수를 공유하면
// "이미 유효 토큰이 있어 재사용" 분기와 뒤섞여 강제성이 깨진다.
let regenerateInFlight: Promise<string> | null = null

/**
 * 저장된 토큰을 무시하고 서버에 새 토큰을 강제로 발급받아 교체한다 (설정 화면의
 * "토큰 재발급" 버튼용 — ADR-020 Tier 1).
 *
 * ensureUserToken 과 달리 기존 저장값이 유효해도 재사용하지 않고 항상 POST /token 을
 * 보낸다. 발급이나 저장 중 하나라도 실패하면 기존 토큰을 그대로 둔 채 예외를 던진다 —
 * 여기서 조용히 실패하면 사용자는 재발급이 안 됐다는 사실을 모른 채 이미 유출됐을 수
 * 있는 옛 토큰을 계속 신뢰하게 된다.
 */
export async function regenerateUserToken(): Promise<string> {
  if (regenerateInFlight) return regenerateInFlight
  // ensure 발급이 이미 진행 중이면 먼저 그 결과를 흡수(대기)한 뒤에 강제 재발급을
  // 시작한다 — 순서를 지키지 않으면 ensure 가 나중에 storage 에 쓰면서 방금 재발급한
  // 새 토큰을 구 토큰으로 덮어써 재발급이 조용히 무효화된다. ensure 실패는 여기서
  // 무시한다 — 재발급은 ensure 결과와 무관하게 항상 강제로 진행해야 한다.
  if (inFlight) {
    await inFlight.catch(() => null)
  }
  regenerateInFlight = performRegenerate()
  try {
    return await regenerateInFlight
  } finally {
    regenerateInFlight = null
  }
}

async function performRegenerate(): Promise<string> {
  const issued = await requestUserToken()
  if (issued === null) {
    throw new Error('토큰 재발급에 실패했습니다. 기존 토큰을 계속 사용합니다.')
  }
  try {
    await setStorageItem(TOKEN_STORAGE_KEY, issued)
  } catch (e) {
    console.warn('[token] 재발급받은 토큰을 저장하지 못해 기존 토큰을 유지합니다.', e)
    throw e
  }
  return issued
}

/**
 * 서버가 거부한 토큰을 폐기한다 (401 복구 경로).
 *
 * 폐기하지 않으면 시크릿 로테이션·엔드포인트 전환 뒤에 같은 토큰으로 계속 401 을 받아
 * 폐기하지 않으면 새 토큰 발급 없이 같은 401이 반복된다.
 * 지우기 실패를 숨기면 같은 토큰으로 재시도하게 되므로 오류를 그대로 드러낸다.
 */
export async function clearUserToken(): Promise<void> {
  try {
    await removeStorageItem(TOKEN_STORAGE_KEY)
  } catch (e) {
    console.warn('[token] 저장된 토큰을 지우지 못했습니다.', e)
    throw e
  }
}

/**
 * 저장된 토큰을 발급 없이 읽는다 (설정 화면 표시·복사용).
 *
 * ensureUserToken 을 쓰면 안 된다 — 그건 없으면 발급까지 해버려서 설정 화면을 열 때마다
 * rate-limit 슬롯을 쓰고 owner 파편화를 유발한다. 여기는 순수 조회만 한다.
 * 없거나 손상됐으면 null — "실패하면 null" 계약은 resolveUserToken 과 동일하다.
 */
export async function getStoredToken(): Promise<string | null> {
  let stored: unknown
  try {
    stored = await getStorageItem<unknown>(TOKEN_STORAGE_KEY)
  } catch (e) {
    console.warn('[token] 저장된 토큰을 읽지 못했습니다.', e)
    return null
  }
  return isValidTokenFormat(stored) ? stored : null
}

/**
 * 다른 기기에서 쓰던 토큰을 붙여넣어 저장한다 (P6 — 멀티기기 통합).
 *
 * 서버 발급(POST /token)을 우회하고 사용자가 가져온 값을 그대로 owner 로 쓴다.
 * 형식 위반은 저장하지 않고 false — 손상값을 owner 로 앉히면 이후 모든 업로드가
 * 조용히 401 로 실패하고, 그 원인을 사용자가 알 방법이 없다.
 */
export async function setUserToken(value: string): Promise<boolean> {
  if (!isValidTokenFormat(value)) return false
  try {
    await setStorageItem(TOKEN_STORAGE_KEY, value)
  } catch (e) {
    console.warn('[token] 토큰을 저장하지 못했습니다.', e)
    return false
  }
  return true
}

/**
 * 토큰을 화면 표시용으로 마스킹한다 — `sc_<body 앞4>…<sig 뒤4>`.
 *
 * 원문 토큰을 화면 텍스트 노드로 노출하지 않기 위한 것(복사만 원문을 쓴다).
 * isValidTokenFormat 통과분이 전제지만, 짧거나 비정상 입력도 slice 로 안전하게
 * 처리한다(범위 밖 slice 는 throw 하지 않고, 점이 항상 …로 바뀌어 원문과 달라진다).
 */
export function maskToken(token: string): string {
  const rest = token.slice(3)
  const dot = rest.indexOf('.')
  const body = dot >= 0 ? rest.slice(0, dot) : rest
  const sig = dot >= 0 ? rest.slice(dot + 1) : ''
  return `sc_${body.slice(0, 4)}…${sig.slice(-4)}`
}

async function resolveUserToken(): Promise<string | null> {
  let stored: unknown
  try {
    stored = await getStorageItem<unknown>(TOKEN_STORAGE_KEY)
  } catch (e) {
    console.warn('[token] 저장된 토큰을 읽지 못해 캡처 저장을 중단합니다.', e)
    throw e
  }
  if (isValidTokenFormat(stored)) return stored
  if (stored !== undefined) {
    // 손상된 값은 폐기하고 재발급. 발급이 실패하면 잔존하지만 다음 호출에서 다시
    // 이 분기로 떨어지고, 성공하면 덮어써진다 — 별도 remove 는 불필요.
    console.warn('[token] 저장된 토큰 형식이 올바르지 않아 폐기하고 재발급합니다.')
  }

  const issued = await requestUserToken()
  if (issued === null) return null
  try {
    await setStorageItem(TOKEN_STORAGE_KEY, issued)
  } catch (e) {
    console.warn('[token] 발급받은 토큰을 저장하지 못해 캡처 저장을 중단합니다.', e)
    throw e
  }
  return issued
}

async function requestUserToken(): Promise<string | null> {
  // 업로드와 같은 소스에서 베이스를 읽는다 (src/utils/upload.ts 와 동일)
  const endpoint: string | undefined = import.meta.env.VITE_UPLOAD_ENDPOINT
  if (!endpoint) {
    console.warn('[token] 캡처 저장 서버가 없어 토큰을 발급할 수 없습니다.')
    return null
  }
  const base = endpoint.replace(/\/+$/, '')

  let res: Response
  try {
    // 헤더를 직접 붙이지 않는다 — worker 는 chrome-extension:// Origin 을 요구하는데
    // Origin 은 forbidden header 라 브라우저가 자동으로 붙여줘야 통과한다.
    res = await fetch(`${base}/token`, { method: 'POST' })
  } catch (e) {
    console.warn('[token] 토큰 발급 요청이 네트워크 단계에서 실패했습니다.', e)
    return null
  }

  if (!res.ok) {
    console.warn(
      `[token] 토큰 발급 실패 (${res.status}) — 캡처 저장을 중단합니다.`
    )
    return null
  }

  // unknown 으로 받는다 — 본문이 JSON `null`(또는 배열·숫자)이면 res.json() 은 성공하므로
  // 위 catch 에 안 걸리고, 바로 .token 을 읽으면 TypeError 로 계약(Promise<string|null>)이 깨진다
  let data: unknown
  try {
    data = await res.json()
  } catch {
    console.warn('[token] 토큰 발급 응답을 해석할 수 없습니다.')
    return null
  }
  if (typeof data !== 'object' || data === null || !('token' in data)) {
    console.warn('[token] 토큰 발급 응답에 token이 없습니다.')
    return null
  }
  if (!isValidTokenFormat(data.token)) {
    console.warn('[token] 발급 응답의 토큰 형식이 올바르지 않습니다.')
    return null
  }
  return data.token
}
