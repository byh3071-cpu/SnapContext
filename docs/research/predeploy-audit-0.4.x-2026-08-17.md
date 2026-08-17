---
id: predeploy-audit-0.4.x
date: 2026-08-17
tags: [audit, security, release, v0.4.4, v0.4.5, v0.4.6, store]
---

# 0.4.x 배포 전 사전 감사 (2026-08-17)

> 4방면 병렬 감사(worker 보안 · 확장 품질 · 테스트/게이트 · 문서/재심사) → 지휘자 교차검증. 총 35건.
> "검증됨" = 지휘자가 원본 파일을 직접 열어 재확인한 항목.

## 판정

**배포 라인 진행 가능. 단 0.4.4 worker 배포 전 필수 수정 1건(레거시 삭제 결함)과, 일괄 재심사 제출 전 문서·자산 정비 묶음이 있다.** 가리기 bake 우회 경로·worker 테스트 공백·시크릿 유출·SQL 인젝션은 **없음 확인**.

## 🔴 High (5)

| # | 영역 | 발견 | 근거 | 조치 | 배치 |
|---|---|---|---|---|---|
| H1 | worker | **레거시 owner 캡처 삭제가 이미지를 안 지움** — 삭제 시 `private-v2/` 파생 키만 지우는데 0.4.0~0.4.1 업로드는 평문 `id`/`id.json` 키. D1 행만 지워지고 이미지·컨텍스트는 만료(≤30일)까지 `/i`·`/s`로 계속 서빙. ADR-019 "204=모두 삭제" 계약 위반 (검증됨) | private-capture-routes.ts:264-266 vs index.ts:214-224 | 삭제 시 레거시 키 병행 삭제 또는 D1 `storage_gen` 컬럼 | **0.4.4 배포 전 필수** |
| H2 | 게이트 | 스토어 스크린샷 masthead `V0.4.0` 하드코딩 스테일 — ADR-014가 예견한 회귀가 실제 발생, 4값 게이트가 못 잡음 (검증됨) | generate-store-screenshots.mjs:454 | V0.4.3+ 갱신 + check-version-sync 5번째 정합값 편입 | 0.4.4 |
| H3 | 게이트 | 가리기 파괴성의 유일한 실브라우저 검증(qa-043.mjs)이 npm script·게이트 어디에도 미편입 — 수동 실행 전용 (검증됨) | package.json scripts에 부재 | `dogfood:qa043` 스크립트 등록 + 릴리즈 게이트 편입 | 0.4.4 |
| H4 | 게이트 | check-goal-6.mjs 고유 검증이 전부 주석 템플릿 — goal 6이 스스로 정한 3검증(manifest·PRD status·금지 용어) 미구현 | scripts/check-goal-6.mjs:63-66 | 3개 assert 구현 | 0.4.6 착수 전 |
| H5 | 문서 | changelog가 0.4.3을 "수동 QA·tag 대기"로 표기 — 실제로는 QA 33/33·tag `v0.4.3` push 완료 (검증됨) | changelog.md:9 vs git tag | 완료로 갱신 | 즉시 가능 |

## 🟡 Mid (9)

| # | 영역 | 발견 | 근거 | 배치 |
|---|---|---|---|---|
| M1 | worker | `parseSharedContext` v1이 스키마 검증 없이 통과 → 미인증 `/upload`로 심은 `imageUrl` 등 공격자 필드가 `snap_pack` 응답에 스프레드됨 | lib.ts:132 · pack.ts:153 | 0.4.4 |
| M2 | worker | admin `snap_history`가 미인증 업로드 행을 untrusted 경계 없이 반환 — 프롬프트 인젝션 표면 (analyze엔 경계 있음) | history.ts:62-71 · mcp.ts:76-78 | 0.4.4 |
| M3 | worker | 만료 D1 행 영구 잔존(청소 경로 없음) — URL·제목이 무기한 남아 PRIVACY "기간 후 삭제"와 불일치 | history.ts:46 · cron 부재 | 0.4.5 |
| M4 | worker | R2 lifecycle 규칙이 `private-v2/` prefix를 덮는지 미확인 — 안 덮으면 만료 후 물리 잔존 | private-object-key.ts:3 | 0.4.4 배포 체크리스트 |
| M5 | worker | wrangler observability 미설정 — 데이터 유실 직결 warn 3종이 프로덕션에서 안 보임 | wrangler.jsonc | 0.4.4 |
| M6 | ext | 히스토리 갱신 race — `updateCaptureAnnotations` read→write 잠금 없음 + 체인 재대입 누락, 창 간 동기화 없음 | storage/history.ts:170-193 · App.ts:273-290 | 0.4.6 |
| M7 | ext | 캡처 기록 저장 착수 실패가 완전 무음(catch 빈손) → 이후 핀 저장이 조용히 no-op | App.ts:620-622 | 0.4.6 |
| M8 | ext | "크게 보기" 확대가 `transform: scale` 사용 — 프로젝트 금지 규칙 위반 재도입(ImageLightbox는 이미 width 방식) | Preview.ts:178 | 0.4.6 |
| M9 | 문서 | 완전 revoke 배정 버전이 문서 간 분열 — ADR-020·PRD-0.4.3·changelog=0.4.6 vs 로드맵·리서치=0.4.7 → 0.4.6 스코프 오염 위험 | adr/020 등 | 0.4.6 착수 전 정정 |

## 🟢 Low·문서 (재심사 전 정비 묶음 포함)

| # | 발견 | 배치 |
|---|---|---|
| L1 | 스토어 스크린샷 04가 폐기된 "공유 링크" UI — 리스팅-실기능 불일치, 리젝 사유 소지 (`pnpm store:screenshots` 재생성, 자체 체크리스트에도 미이행으로 남음) | 재심사 전 필수 |
| L2 | 벤더 로고 상표 면책 문구 미반영 (자체 조사 vendor-logo-policy.md 권고) | 재심사 전 |
| L3 | v0.4.3 태그 후 벤더 아이콘 드롭다운 커밋(f73dee6)이 PRD·changelog 미기재 — 미문서화 변경 누적 | 0.4.4 세션에 전달 |
| L4 | README "현재 0.4.2 개발 중" 스테일 | 재심사 전 |
| L5 | PRIVACY·리스팅에 가리기(redaction) 미언급 — 심사 방어에 유리한 고지 누락 | 일괄 제출 문서 개정 시 |
| L6 | 통합 listing·submit-kit(0.4.2+0.4.3+0.4.6) 미작성 | 0.4.6 랜딩 후 |
| L7 | 단축키 4종 최신 Chrome·Whale 재검증 로그 없음 (Whale 예약키 충돌 전례) | 재심사 직전 스모크 |
| L8 | 미인증 500 응답에 시크릿 env 이름 노출 (auth.ts:50 등) | 0.4.5 |
| L9 | `/i`·`/pi`·뷰어에 nosniff·CSP 없음 | 0.4.5 |
| L10 | admin 토큰 `sc_` 접두 금지가 주석뿐 — fail-closed 미구현 | 0.4.6 |
| L11 | deploy가 lockfile 고정 없음 (`npm ci` 없이 wrangler deploy) | 0.4.4 |
| L12 | 토스트 aria-live 부재 — 스크린리더 미고지 | 0.4.6 |
| L13 | 미사용 스텁 3개(capture/element·document, notion/api) — 오인 소지 | 0.4.6 |
| L14 | CLAUDE.md "Alt+Shift+P(프롬프트)" 단축키 미실재 — 문서 정정 | 언제든 |
| L15 | mission.json 0.4.3 고정 스테일 — goal 착수 시 갱신 절차 필요 | 0.4.6 착수 시 |
| L16 | AnnotationOverlay·Toolbar vitest 0건(결함 전례 지점), image-actions-contract는 정규식 스캔(qa-043 편입 시 보강됨) | 0.4.4~0.4.6 |
| L17 | confirm-dialog 포커스 트랩·service-worker/App 단위테스트·dogfood nonce constant-time | 0.5+ |
| L18 | ADR-014 보강 권고 2건 미이행(masthead 5값 — H2와 동일 건 · worker predeploy serverInfo 소프트 체크) | 0.4.4 |

## ✅ 이상 없음 확인 (감사 통과 항목)

- 가리기 bake: 3개 내보내기 경로 전부 단일 `renderAnnotatedPngBlob` — **우회 경로 없음**
- HMAC 토큰·서명 URL·owner 필터·D1 bind·입력 allowlist — 공백 없음
- 시크릿: git 이력 포함 유출 0건 · 빈 catch(worker) 0건
- worker 소스↔테스트 1:1 대응 · redaction.ts/token.ts 테스트 두터움
- PRIVACY 핵심 주장(5분 서명 URL·SHA-256 owner·1/7/30일·삭제 순서)은 코드와 정합
- 원격 코드 로딩 의심 요소 없음 · manifest 권한↔PRIVACY 1:1
