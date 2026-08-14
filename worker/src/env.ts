export interface Env {
  BUCKET: R2Bucket
  DB: D1Database
  SNAPCONTEXT_BEARER_TOKEN?: string
  /** per-user HMAC 토큰 서명. 미설정 시 /token 500, /upload 토큰 검증만 비활성 */
  TOKEN_SIGNING_SECRET?: string
  /** dogfood:up 전용. 미설정 시 /dogfood-health 는 항상 404 (production fail-closed) */
  DOGFOOD_BOOT_NONCE?: string
  DOGFOOD_LOCAL?: string
}
