# Tasks

## Active

- [ ] **P0 — Codex 일상 10분 dogfood smoke 1회 실행 (사람)**
  - `docs/dogfood.md` 절차대로: `pnpm dogfood:up` → 로컬 `/token` 발급 → `register-mcp.ps1 -Local` → Codex 재시작 → marker 판독 → 즉시 삭제 → `NOT_FOUND` 확인.
  - 통과하면 HTTPS staging 구성(사람 승인) → 3클라이언트 릴리즈 smoke로 진행.

- [ ] **P1 — 0.4.2 수동 검증·릴리즈 문서와 스크립트 정합화**
  - README에 사람 직접 전달/MCP 저장의 현재 플로우와 local/staging 검증 절차를 추가한다.
  - legacy 익명 `/upload`와 production URL을 사용하는 `scripts/e2e-smoke.ps1`는 private API 기반으로 교체하거나 production 실행을 명시적으로 차단한다.
  - `scripts/register-mcp.ps1`의 production 기본값과 환경변수·에디터 재시작 조건을 분명히 안내한다.

## Waiting On

- [ ] **0.4.2 HTTPS staging + 실제 AI 클라이언트 릴리즈 smoke**
  - production과 분리된 Worker/R2/D1/secret 구성이 필요하며 생성·변경은 사람 승인 후 진행한다.
  - Claude Code·Cursor·Codex가 서명 PNG의 pixel-only marker를 실제로 읽는지 확인한다.
  - 300초 만료, 403 후 tool 재호출, owner 격리, query log 노출 여부와 실제 binding을 함께 확인한다.
  - 이 검증 전에는 production 배포·스토어 제출·tag·merge를 진행하지 않는다.

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

- [x] **P0 — SnapContext 0.4.2 원클릭 로컬 dogfood 검증 환경** (2026-08-15, PR #24 머지)
  - `pnpm dogfood:up`(local Worker·D1·localhost 확장 build·전용 profile, supervisor handle-only 종료) + `pnpm dogfood:verify`(golden path 14 + failure probe 4 = 18/18, production 요청 0, 로그에 git HEAD·dirty 기록).
  - `register-mcp.ps1 -Local` + `docs/dogfood.md`(일상 Codex 10분 / 릴리즈 3클라이언트 구분).
  - 멀티벤더 적대 검증 7라운드(V1~V7)로 blocker 5건 발굴·수정 후 blocker 0 판정. 세션 로그: `docs/log/2026-08-15-dogfood-harness.md`.
