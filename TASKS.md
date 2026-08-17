# Tasks

## Active

- [ ] **P0 — 0.4.2 릴리즈 실행 (전부 사람 게이트) — 스토어 제출 제외**
  - **릴리즈 게이트 3클라이언트 전 절차 PASS 완료** — Codex·Claude Code·Cursor 모두 블라인드 marker 판독 일치·삭제 NOT_FOUND·(Codex) 300s 만료 후 재호출 복구. query log 실측 완료(sig= 노출되나 capture id CF REDACTED → 재구성 불가, 위험 낮음). 상세: tests/e2e/dogfood/logs/2026-08-15-release-smoke-staging.md(로컬).
  - 남은 것: production 배포(`wrangler deploy`) → PRIVACY 공개 → tag `v0.4.2`.
  - 선택(권장): staging TOKEN_SIGNING_SECRET 회전(smoke 토큰 일괄 무효화).

- [ ] **P0 — 0.4.4 구현 완료 → critic 수정 루프 마무리·배포(사람)**
  - 레거시 3경로(410·no-store) 제거 구현 완료(worker 커밋 f0ebbe2~f609424, 195 green). 감사 핸드오프 반영: H1→D2 3분기 판정, 편승 6건 적용(M1은 0.4.5 이월).
  - critic 1차 불통과(높음2·중간3) → 수정 루프 진행 중: deploy 스크립트 복구·레거시 fallback 뮤테이션 그물·/captures 실패경로 테스트·런북 D1 정리·PRIVACY 갱신.
  - 남은 사람 게이트: R2·D1 잔존 실측 → `pnpm run deploy`(worker) → 라이브 스모크 → tag `v0.4.4`. 절차: docs/runbook-0.4.4.md.

- [ ] **P1 — 스토어 재심사 제출: 0.4.6 랜딩 후 마지막에 1회 (로드맵 재편 2026-08-17)**
  - 0.4.2~0.4.6(UX 다듬기 포함)을 제출 없이 개발 진행 → 완성본으로 재심사 #1 제출(0.4.2·0.4.3·0.4.6 편승).
  - 0.4.4=PRD 초안 승인 대기 · 0.4.5(WAF RL — token-threat-model.md 근거)·0.4.6(프롬프트 UX)·0.4.7(revoke 완성형, A안 exp+kid 재검토)은 착수 시 정의.

## Someday

- [ ] **SnapContext 캡처→AI 인수 E2E 리서치** - 기존 문헌조사를 재사용하고 실제 클라이언트 동작과 Context Pack의 제품 가치를 검증
  - 범위 고정: `base64 vs 서명 URL`, Web Push 구조, 일반 캡처 경쟁사 조사는 반복하지 않는다.
  - 테스트 설계: Claude Code·Codex·Cursor에서 자연어 자발 호출, 명시 호출, 무관한 스크린샷 언급, 일반·full-page 캡처, 만료·잘못된 토큰 시나리오를 정의한다.
  - 기술 스모크: `snap_history → snap_analyze` 호출, 서명 이미지 URL fetch, 핀 메모 인식, 오류 회복, 응답 시간과 오발동을 기록한다.
  - 가치 비교: 실제 작업 5개에서 스크린샷 단독과 스크린샷＋핀＋Context Pack을 정확성·실행 가능성·소요 시간으로 비교한다. 가능하면 외부 사용자 3~5명을 포함한다.
  - 판정: 이미지 fetch 실패 시 0.4.2 전달 방식을 보완하고, 자발 호출 저조 시 온보딩을 강화하며, 오발동 다수 시 트리거 문구를 축소하고, Context Pack 효과가 미미하면 주석 확장을 보류한다.
  - 주의: 소표본 통과선은 통계적 입증이 아니라 실패 조기탐지 게이트로만 사용한다.
  - 예상 소요: 내부 스모크 약 2일, 사용자 테스트 포함 3~5일.

## Done

- [x] **P1 — 0.4.2 수동 검증·릴리즈 문서와 스크립트 정합화** (2026-08-15, c583d0d)
  - README: v0.3.0 게시/0.4.2 개발 중 반영, AI 연동 2경로(직접 전달/MCP 저장)·검증 절차 표, pnpm 통일.
  - `e2e-smoke.ps1`: production 실행 기본 차단(`SNAPCONTEXT_ALLOW_PROD_SMOKE='1'` 명시 필요, 실측 확인). `register-mcp.ps1`: 등록 URL 출력 + production 기본 경고.
  - dogfood.md: marker 인코딩 스킴 안내 문단(8/15 smoke 교훈 흡수). 부수: PS 5.1 BOM 파서 함정 발견 → PAT-003 등재.

- [x] **P0 — Codex 일상 10분 dogfood smoke** (2026-08-15, 지휘자 실측)
  - 실제 Codex CLI(`codex exec`)가 로컬 MCP(`snapcontext-local`)로 `snap_history`→`snap_analyze`→서명 이미지 fetch→픽셀 판독: marker `959495` 정확 일치.
  - 삭제 후 `snap_analyze` 재호출 = `isError=true`·정확히 `NOT_FOUND` (ADR-016). 부수 실증: 토큰 교체 시 이전 캡처 비노출(owner 격리).
  - 발견: marker 판독엔 인코딩 스킴 설명이 프롬프트에 필요(스킴은 공개 정보, 값만 비밀) — docs/dogfood.md 절차 보강 필요(P1에 흡수).

- [x] **P0 — SnapContext 0.4.2 원클릭 로컬 dogfood 검증 환경** (2026-08-15, PR #24 머지)
  - `pnpm dogfood:up`(local Worker·D1·localhost 확장 build·전용 profile, supervisor handle-only 종료) + `pnpm dogfood:verify`(golden path 14 + failure probe 4 = 18/18, production 요청 0, 로그에 git HEAD·dirty 기록).
  - `register-mcp.ps1 -Local` + `docs/dogfood.md`(일상 Codex 10분 / 릴리즈 3클라이언트 구분).
  - 멀티벤더 적대 검증 7라운드(V1~V7)로 blocker 5건 발굴·수정 후 blocker 0 판정. 세션 로그: `docs/log/2026-08-15-dogfood-harness.md`.
