---
id: prd-0.4.4
date: 2026-08-17
status: draft-awaiting-approval
tags: [security, legacy-removal, worker, v0.4.4]
---

# SnapContext 0.4.4 — 레거시 공개 경로를 닫는다 (ADR-015 2차 배포)

## 한 줄 목표

id만 알면 열리던 마지막 문 3개(`/s` 뷰어·무서명 `/i`·레거시 `/upload`)를 제거해 **무서명 접근 0**을 만든다. **worker-only** — 확장 무변경.

> 근거 계약: ADR-015 결정 #6(2단계 롤아웃 — 1차 owner-gate는 0.4.2 완료). 정찰 실측: 확장(0.4.2+)은 `/captures`·`/pi`만 사용, `src/`에서 `/s`·무서명 `/i` 참조 **0건**.

## 왜 지금

- worker에 무서명 경로 3종이 여전히 활성: `/s/{id}`(index.ts:294-315)·무서명 `/i/{id}`(index.ts:262-292)·`POST /upload`(응답 `{id, url:/s/…}`, index.ts:259). id가 곧 열쇠인 0.4.2 이전 모델의 잔재.
- 이 경로들의 유일한 소비자는 **스토어 라이브 0.3.0 확장**("7일 익명 링크 공유") — 사용자 ~0(요한뿐, 요한은 0.4.3 로컬 설치)이라 지금이 제거 최저비용.

## 스코프 (worker-only)

| # | 대상 | 위치 | 처리 |
|---|---|---|---|
| 1 | `GET /s/{id}` | index.ts:294-315 | 제거 → **410 Gone**(짧은 텍스트) |
| 2 | 무서명 `GET /i/{id}` | index.ts:262-292 | 제거 → **410 Gone** (이미지는 `/pi` 서명 URL만) |
| 3 | `POST /upload` | index.ts:146-260 | 제거 → **410 Gone** (write 차단 — ADR-015 문면의 선행 단계) |
| 4 | `buildViewerHtml`·`buildExpiredHtml` | lib.ts:137-217 | dead code 삭제 |
| 5 | `/pi`의 레거시 객체 fallback | private-capture-routes.ts:309-310 | 삭제 (레거시 객체 소멸 후 무의미) |
| 6 | `readExpiry` 레거시 메타 경로 | lib.ts:74-79 | 삭제 (5와 동일 근거) |
| 7 | 레거시 커버 테스트 ~30개 | worker/test/index.test.ts:54-298 등 | 제거하고 **신규 계약 테스트로 교체**: `/s`·`/i`·`/upload` 각 410 + `/pi`·`/captures` 회귀 그린 |

**410 선택 근거**: 라우트를 지워 404로 떨어뜨리는 것보다, 명시 410("영구 종료" 시맨틱)이 구확장·북마크 링크 진단에 정직하고 비용은 몇 줄. (로드맵 DoD의 "무서명 /i 403" 문구는 410으로 정정 — 인증을 요구하는 게 아니라 경로 자체가 사라지는 것이므로 410이 정확.)

## 결정 포인트 (승인 시 확정)

| # | 질문 | 권고 |
|---|---|---|
| D1 | 레거시 3경로 응답: 명시 410 vs 라우트 제거(404) | **410** — 위 근거 |
| D2 | ADR-015 문면의 "write 차단 후 30일+1h 대기 후 제거" | **잔존 실측으로 대체 판정** — production R2에 레거시 객체(owner 파생 key가 아닌 raw id key)가 0이면 대기 없이 일괄 배포. 실측 명령은 사람 게이트에서(`wrangler r2 object` 목록). 0이 아니면 ADR 문면대로 2회 배포로 분할 |
| D3 | serverInfo 버전 | 0.4.4로 상향(worker 4값 — ADR-014 2트랙, ext는 0.4.3 유지) |

## 비목표

- 확장(src/) 변경 일체 — 이미 레거시 참조 0
- rate-limit 승급(→ 0.4.5) · 토큰 v2 exp+kid(→ 0.4.6, docs/research/token-threat-model.md)
- 스토어 제출(0.4.5 후 일괄)

## 완료 기준 (DoD)

1. worker `npm test` green — 신규 계약: `/s`·무서명 `/i`·`/upload` 전부 410, `/captures`·`/pi`·MCP 3툴 회귀 그린.
2. `tsc --noEmit`(worker)·`vhk mission check` 위반 0.
3. 배포 전 사람 게이트: production R2 레거시 객체 잔존 실측 기록(D2) → `wrangler deploy` → 라이브 스모크(레거시 3경로 410·신규 경로 정상).
4. tag `v0.4.4`. 스토어 제출 없음.
