---
id: log-2026-08-15-staging-setup
date: 2026-08-15
tags: [log, staging, v0.4.2, release]
---

# 2026-08-15 — HTTPS staging 구성 + 기술 스모크 9/9

## 구성 (docs/staging-plan.md 승인 실행)

| 리소스 | 값 |
|--------|-----|
| Worker | `snapcontext-worker-staging` → https://snapcontext-worker-staging.byh3071-26a.workers.dev (Version 75f8e51e) |
| R2 | `snapcontext-uploads-staging` (APAC) |
| D1 | `snapcontext-captures-staging` (APAC, `d3374f0b-44df-43da-8c98-9ee218bda898`, 마이그레이션 0001·0002 적용) |
| secret | `TOKEN_SIGNING_SECRET`·`SNAPCONTEXT_BEARER_TOKEN` — 요한이 파이프 주입(값은 어디에도 미기록, production과 다른 랜덤) |

wrangler.jsonc `env.staging` 블록(binding 미상속 → 전부 재선언). deploy는 요한 실행(사람 게이트 준수).

## 기술 스모크 — 9/9 PASS (지휘자 실행, scratchpad/staging-smoke.mjs)

| # | 항목 | 결과 |
|---|------|------|
| P1 | `/token` 발급 A·B (chrome-extension Origin) | sc_ 2개 |
| P2 | no-bearer·wrong-bearer `/mcp` | 401/401 |
| P3 | `POST /captures` private 업로드 | 201, id 발급 |
| P4 | owner 격리 — A 목록 보임·B 목록 안 보임 | PASS |
| P5 | `snap_history` binding 실측 (staging D1) | PASS |
| P6 | `snap_analyze` 서명 URL fetch — staging `/pi`·200 | PASS |
| P7 | exp 미래 조작·과거 exp·sig 훼손 | 403/403/403 |
| P8 | DELETE 204 → `snap_analyze` = isError·NOT_FOUND | PASS (ADR-016) |
| P9 | staging 토큰으로 production `/mcp` | 401 (서명 비밀 분리 실증) |

production에 만든 데이터 0 (P9는 읽기 전용 401 확인 1회).

## 남은 릴리즈 게이트 (사람 참여)

- 3클라이언트(Claude Code·Cursor·Codex) 실클라이언트 smoke — staging URL 대상 marker 판독 + 403 후 tool 재호출 복구 관찰.
- query log 노출 실측 — Workers 대시보드/`wrangler tail`에서 서명 토큰 쿼리스트링 잔존 여부.
- 통과 시: production 배포·스토어 재심사 #1·PRIVACY 공개·tag `v0.4.2` (전부 사람 게이트).
