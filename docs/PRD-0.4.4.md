---
id: prd-0.4.4
date: 2026-08-17
status: approved
tags: [security, legacy-removal, worker, v0.4.4]
---

# SnapContext 0.4.4 — 레거시 공개 경로를 닫는다 (ADR-015 2차 배포)

## 한 줄 목표

id만 알면 열리던 문 3개(`/s` 뷰어·무서명 `/i`·레거시 `/upload`)를 제거해 **무서명 접근 0**을 만든다. **worker-only** — 확장 무변경.

> 승인: plan-audit 3회차(블라인드 대조·수정안 재감사·테스트 실사+Codex 교차) 완주 후 수정안 13건 반영, 요한 승인 2026-08-17. 실행 계획 SoT: `~/.claude/plans/giggly-splashing-finch.md`(승인됨).
> 근거 계약: ADR-015 결정 #6(2단계 롤아웃 — 1차 owner-gate는 0.4.2 완료). 정찰 실측: 확장(0.4.2+)은 `/captures`·`/pi`만 사용, `src/`에서 레거시 참조 **0건**.

## 스코프 (worker-only)

| # | 대상 | 위치 | 처리 |
|---|---|---|---|
| 1 | `GET /s/{id}` | index.ts:294-315 | 제거 → **410 Gone** |
| 2 | 무서명 `GET /i/{id}` | index.ts:262-292 | 제거 → **410 Gone** (이미지는 `/pi` 서명 URL만) |
| 3 | `POST /upload` | index.ts:146-260 | 제거 → **410 Gone** (write 차단 — ADR-015 선행 단계) |
| 4 | 레거시 3경로의 **OPTIONS**(preflight) | index.ts:29-33·94-113 전역 분기 | 410 정책 명시 — 경로만 지우면 preflight 200이 남는 불일치 방지 |
| 5 | `buildViewerHtml`·`buildExpiredHtml` + 전용 헬퍼(escapeHtml·sanitizeHttpUrl·formatExpiryKST) | lib.ts:32-49·115-217 | dead code 삭제 |
| 6 | `cleanupUploadObjects` | ingest.ts:77-84 | dead code 삭제 (/upload 전용) |
| 7 | **레거시 읽기 fallback 일괄** — /pi raw-ID fallback(private-capture-routes.ts:309-310) + **pack.ts raw-ID fallback(60-83·153-163, analyze.ts:120-129 연동)** + readExpiry legacy(lib.ts:74-79) | 좌기 | **단독 커밋으로 삭제** — 셋은 반드시 짝(하나만 지우면 snap_pack이 /pi URL을 주고 fetch만 410 되는 반쪽 상태). D2 잔존 실측 시 이 커밋만 revert해 배포 가능한 롤백 단위 |
| 8 | 레거시 커버 테스트 **47+개** | index.test.ts(21, 파일 삭제)·upload-bearer(5)·upload-ingest(16+, 누출 회귀 2개는 /s 부분만 조정)·upload-rate-limit(3 삭제·순수함수 2 유지)·**lib.test.ts viewer import it·expiry(94-112)·token-route(107-123) 조정** | 신규 계약 테스트로 교체 |

**유지 필수(삭제 금지):** `parseSharedContext`(pack.ts:124 사용)·`allowUploadRequest`(신규 경로 공용)·lib.ts 공유 상수(DAY_MS·EXPIRY_DAYS_ALLOWLIST·MAX_UPLOAD_BYTES·isPngMagic·isExpiredAt·parseExpiresInDays·safeDecodeId).

## 구현 순서 (test-first — Codex 지적 반영)

신규 계약 테스트 선투입(red: 레거시 3경로+OPTIONS=410·`Cache-Control: no-store`·본문 짧은 텍스트 + /captures·/pi·MCP 회귀 assert) → 라우트 제거(green) → dead code(#5·6) → fallback 일괄(#7, 단독 커밋) → 테스트 정리(#8). 각 단계 worker `npm test`+`tsc --noEmit`.

## 410 계약

- 명시 410 Gone + 짧은 안내 텍스트 + **`Cache-Control: no-store`**(중간 캐시 잔존 방지 — 롤백·forward-fix 시 오염 차단).
- 로드맵 DoD의 구 문구 "/i 403"은 410으로 정정(인증 요구가 아니라 경로 소멸이므로).
- 0.3.0 라이브 확장의 실제 UX: 2xx 아니면 본문을 읽지 않고 "업로드 실패 (410)" 토스트 — 사용자 ~0 근거로 수용, 별도 안내 채널 없음(Codex 실사).

## 확정된 결정

| # | 결정 | 내용 |
|---|---|---|
| D1 | 응답 방식 | 명시 410 (라우트 제거 404 아님) |
| D2 | ADR-015 "30일 대기" 대체 — **3분기 판정** (감사 H1 반영 2026-08-17) | **배포 직전**(사람 게이트) production R2의 레거시(raw-ID key) 객체 잔존 실측(수단: wrangler R2 목록 또는 대시보드). ①**잔존 0** → 일괄 배포. H1(삭제 핸들러가 레거시 평문 키를 안 지우는 결함)은 대상 객체가 없어 자연 소멸. ②**잔존 >0 + 스코프 #7 revert 경로** → revert 빌드에 **`handleDeleteCapture`(private-capture-routes.ts:264-266) 레거시 키(`id`·`${id}.json`) 병행 삭제 추가 필수** — 아니면 읽기 fallback이 살아있는 채 "지워도 R2에 남는" ADR-019 계약 위반 지속. ③**잔존 >0 + 일괄 배포(410)** → 접근은 차단되므로 코드 수정 불요, 단 PRIVACY "삭제" 약속 관점에서 잔존 객체 **수동 삭제 권장**(사람, lifecycle 30일이 상한). 근거: docs/state/handoff-audit-0.4.4.md H1 |
| D3 | worker 버전 | 표기 전수 grep 후 0.4.4 상향(확인분: mcp.ts:47 serverInfo). ext는 0.4.3 유지(ADR-014 2트랙) |

## 비목표

- 확장(src/) 변경 일체 — 이미 레거시 참조 0
- rate-limit 승급(→ 0.4.5) · 토큰 v2 exp+kid(→ 0.4.7 revoke 완성형, docs/research/token-threat-model.md)
- 스토어 제출 — **0.4.6 랜딩 후 일괄**(로드맵 재편 bcc0b8b, 요한 재확정 2026-08-17)

## 운영 문서 (구현 단계 7에서 작성)

- **롤백 런북**: 구버전 Worker 롤백 **금지**(공개 경로 재개방 = 개인정보 회귀) → 410 forward-fix 우선. 사람 게이트. **D2 3분기 판정표 포함** — 특히 ②경로(잔존>0+revert)의 삭제 핸들러 필수 수정을 절차로 명기.
- **라이브 스모크 체크리스트**: 레거시 3경로+OPTIONS 410·no-store / POST·GET·DELETE /captures / `/pi` 정상·변조·만료 / MCP history·pack·analyze / 로그 secret 노출 0.

## 완료 기준 (DoD)

1. worker `npm test` 전체 green(제거 후 수치 기록) + `tsc --noEmit`.
2. 루트 게이트(ext 무변경 확인 성격): `pnpm test`(142)·`tsc --noEmit`·`vite build` + `vhk mission check` 위반 0.
3. 신규 계약(410·no-store·OPTIONS) 테스트로 고정.
4. 로컬 스모크: `pnpm dogfood:up` → 레거시 3경로 410 실측 + `dogfood:verify`(17) green.
5. 적대 검증(critic) blocker 0.
6. 사람 게이트: D2 잔존 실측 기록 → `wrangler deploy` → 라이브 스모크 체크리스트 → tag `v0.4.4`.
