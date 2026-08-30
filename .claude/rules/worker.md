---
paths: ["worker/**"]
---

# 서버(worker/) 작업 규칙

- 배포·시크릿·원격 D1 마이그레이션·tag = 사람 게이트. `wrangler deploy` / `wrangler secret put` / `d1 migrations apply --remote`는 실행하지 않고 절차서만 쓴다(런북: `docs/runbook-0.4.4.md`).
- 배포 전 확인 고정: `wrangler d1 migrations list --remote`로 미적용 마이그레이션 0 (0.4.4 스모크 교훈 — 미적용 시 500).
- 불변식: 모든 R2 조회 키는 `private-v2/` 접두. 레거시 raw-ID fallback 재삽입 금지 — 회귀 그물은 상태코드가 아니라 **조회 키 접두 단언**으로 건다(다른 가드가 대신 막아주면 결과 단언은 무력).
- 레거시 3경로(`/s`·무서명 `/i`·`POST /upload`)는 메서드 무관 410 + `Cache-Control: no-store` 고정(ADR-015 2차).
- rate-limit은 per-isolate 임시 카운터다 — "전역 차단"이라고 쓰지 말 것. 승급은 0.4.5(CF 관문 규칙, 커스텀 도메인 선행).
- 실 D1 왕복 테스트 = `vitest.d1.config.mts`(`cloudflare:test`/`cloudflare:workers` 가상 모듈 사용 여부가 "진짜 pool" 증거). mock의 `all()`에 SQL 재구현 금지.
- 0.4.6 트랙(ext-only)에서는 이 폴더를 변경하지 않는다. 필요하면 지휘자에게 보고 후 별도 트랙(0.4.5/0.4.7)으로.
