/**
 * POST /upload 인메모리 rate-limit.
 * token-rate-limit.ts 와 같은 fixed-window 방식이지만 카운터 Map 을 **분리**해
 * /token 발급과 /upload 가 서로의 한도를 잠식하지 않게 한다(다른 행위·다른 비용).
 * isolate 재시작 시 카운터가 리셋되는 한계는 동일 (Workers isolate 수명).
 *
 * 한도 20/분: 업로드는 발급보다 반복이 잦아(캡처마다) 정상 사용자 버스트에 헤드룸을
 * 두되, 플러딩(R2/D1 남용)을 isolate당 IP 분당 20으로 완화한다. **전역 상한은 아니다** —
 * CF 가 동시 다수 isolate 로 분산하면 실효 상한은 isolate 수 배수다(전역 강제는 KV/DO 필요).
 * /token 과 같은 계열의 수용된 트레이드다.
 */
const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 20

interface Counter {
  count: number
  windowStart: number
}

const counters = new Map<string, Counter>()

export function resetUploadRateLimitForTests(): void {
  counters.clear()
}

/** true = 허용, false = 한도 초과(429) */
export function allowUploadRequest(ip: string, nowMs: number = Date.now()): boolean {
  const key = ip.length > 0 ? ip : 'unknown'
  const cur = counters.get(key)
  if (!cur || nowMs - cur.windowStart >= WINDOW_MS) {
    counters.set(key, { count: 1, windowStart: nowMs })
    return true
  }
  if (cur.count >= MAX_PER_WINDOW) return false
  cur.count += 1
  return true
}
