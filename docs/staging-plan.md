---
id: staging-plan-0.4.2
date: 2026-08-15
tags: [staging, release, v0.4.2, cloudflare]
---

# 0.4.2 HTTPS staging 구성 계획 (승인 대기)

> 상태: **구성 완료 (2026-08-15)** — 승인 후 1~5단계 전부 실행됨. 기술 스모크 9/9 PASS. 실행 기록: [docs/log/2026-08-15-staging-setup.md](./log/2026-08-15-staging-setup.md). 남은 것: 3클라이언트 실클라이언트 smoke + query log 실측.

## 왜 필요한가 (한 줄)

로컬 dogfood는 통과했지만, 실제 AI 클라이언트 3종(Claude Code·Cursor·Codex)이 **HTTPS 환경에서** 서명 URL·만료·격리를 지키는지는 workers.dev 배포본에서만 확인할 수 있다 — production을 건드리지 않고 하려면 분리된 staging이 필요하다.

## 만드는 것 (전부 신규 — production 리소스는 손대지 않음)

| 리소스 | production (현행) | staging (신규) | 비용 |
|--------|------------------|----------------|------|
| Worker | `snapcontext-worker` | `snapcontext-worker-staging` (별도 workers.dev URL) | 무료 티어 |
| R2 버킷 | `snapcontext-uploads` | `snapcontext-uploads-staging` | 무료 티어 |
| D1 DB | `snapcontext-captures` (APAC) | `snapcontext-captures-staging` (APAC, 마이그레이션 0001·0002 적용) | 무료 티어 |
| secret ① | `TOKEN_SIGNING_SECRET` | **새 랜덤 값** (production과 다른 값 — 토큰·서명 URL이 양쪽에서 호환되지 않게) | — |
| secret ② | `SNAPCONTEXT_BEARER_TOKEN` | **새 랜덤 값** (admin 조회용) | — |

격리 원리: 코드는 같은 소스를 쓰되 `wrangler.jsonc`의 `env.staging` 블록으로 이름·바인딩만 갈아끼운다(Cloudflare 표준 방식). staging 토큰으로 production 데이터에 접근할 수 없고 그 반대도 불가 — 서명 비밀이 다르기 때문.

## 실행 절차 (승인 후)

| # | 작업 | 실행 주체 |
|---|------|-----------|
| 1 | `wrangler.jsonc`에 `env.staging` 블록 추가 (코드 변경, PR) | 에이전트 |
| 2 | R2 버킷·D1 DB 생성 + `database_id`를 1의 블록에 기입 | 에이전트 (승인된 생성 명령만) |
| 3 | D1 마이그레이션 적용 (`--env staging --remote`) | 에이전트 |
| 4 | secret 2종 생성·주입 (`wrangler secret put --env staging`) | **사람** (시크릿 게이트) |
| 5 | `wrangler deploy --env staging` | **사람** (배포 게이트) |
| 6 | 릴리즈 게이트 검증 (아래 표) — 3클라이언트 | 사람+에이전트 |

## staging에서 확인할 것 (TASKS.md Waiting On 그대로)

| 항목 | 통과 기준 |
|------|-----------|
| 3클라이언트 marker 판독 | Claude Code·Cursor·Codex 각각 pixel-only marker 정확 판독 (docs/dogfood.md 절차) |
| 서명 URL 300초 만료 | 만료 후 fetch = 403, 미래 exp 조작 = 거부 (`IMAGE_URL_TTL_SECONDS = 300`) |
| 403 후 tool 재호출 | 만료 403을 받은 클라이언트가 `snap_analyze` 재호출로 새 URL을 받아 복구 |
| owner 격리 | 다른 sc_ 토큰의 캡처 비노출 (로컬 실측 완료 → HTTPS 재확인) |
| query log 노출 | Workers 로그·대시보드에 서명 토큰 쿼리스트링이 남는지 실측 → 남으면 기록·판정 |
| 실제 binding | R2·D1 binding이 staging 리소스를 가리키는지 (`wrangler deployments`·응답 데이터로 교차 확인) |

## 리스크·뒷정리

- production 영향 0 — 신규 리소스만 생성, 기존 설정 파일의 top-level 항목은 수정하지 않음(`env.staging` 추가만).
- 전부 무료 티어 범위(트래픽 = 검증 몇십 요청).
- 검증 후 **유지 권장** — 0.4.3~0.4.6 각 릴리즈 게이트에서 재사용. 폐기 원하면 버킷·DB·Worker 삭제 3명령으로 원복.

## 승인 방법

"staging ㄱㄱ"라고 하면 1~3(코드·생성·마이그레이션)을 진행하고, 4~5(secret·deploy)는 명령을 준비해서 요한 실행분으로 넘긴다.
