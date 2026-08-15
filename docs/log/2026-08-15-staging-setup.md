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

## 릴리즈 smoke 실측 (같은 날 밤, 지휘자 실행 — 상세: tests/e2e/dogfood/logs/2026-08-15-release-smoke-staging.md)

- **Codex·Claude Code 전 절차 PASS** — 블라인드 marker 픽셀 판독 일치(204667), 올바른 id 자가 발견, 삭제 후 NOT_FOUND.
- **300초 만료 + 재호출 복구 실증** — 만료 URL 403 → Codex가 tool 재호출로 새 URL 받아 재판독 성공.
- **query log 실측** — tail에 `sig=` 쿼리스트링 노출되나 capture id는 Cloudflare가 REDACTED 마스킹 → 로그만으로 URL 재구성 불가 + 300초 만료. 위험도 낮음(사람 최종 판정 대기).

## 릴리즈 게이트 완주 (8/16 새벽)

- **Cursor(cursor-agent CLI)도 PASS** — 3/3 클라이언트 전 절차 통과. 발견: cursor-agent는 부모 셸을 상속해 Git Bash 부모면 훅이 bash로 실행돼 깨짐 → PowerShell 부모로 실행하면 정상(훅 무결).
- staging MCP 등록 3개 제거·러너 state(토큰) 삭제 완료.
- **0.4.2 잔여 = 릴리즈 실행뿐(전부 사람 게이트)**: production 배포 → 재심사 #1 → PRIVACY 공개 → tag `v0.4.2`. 선택: staging secret 회전.
