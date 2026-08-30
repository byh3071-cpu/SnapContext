# Tasks

## Active

- [ ] **P0 — 0.4.6 마감: 수동 QA → tag v0.4.6** (2026-08-30 PR #25·#26·#27 머지 완료, master=0.4.6·173 passed, 계획 `goals/6-046-ux-polish-plan.md`)
  - 남은 사람 게이트: `pnpm dogfood:up` 첫 15초 흐름 + 실패 배지 재현 ★ → tag `v0.4.6` ★ → `vhk goal done --id 6`.
  - 독푸딩 보고서 3종: `docs/dogfood/2026-08-30-report-1-ops-manual-feedback.md`(정본별 52건+) · `docs/log/2026-08-30-0.4.6-orchestration-worklog.md` · `docs/dogfood/2026-08-30-report-3-worker-report-contract.md`.

- [ ] **P0 — 재심사 준비: 스토어 킷 재작성 (tag 전 필수, 0.4.6 critic 발견 DF-57)**
  - `scripts/generate-store-screenshots.mjs` scene ④가 0.4.2에서 폐지된 "익명 공유·공유 링크·7일 업로드"를 광고 + 금지어(핀 주석·Context Pack). `docs/store/listing-0.2.0-draft.md`도 동일.
  - 0.4.2/0.4.4 프라이빗 전환("내 AI에 저장"·서명 URL·`/s` 폐쇄) 기준으로 스크린샷 시나리오·스토어 문구 재작성 → 용어 사전 준수 → 생성기 실행 확인. 재심사 제출물의 허위 광고 방지.
  - 완료 조건에 **`scripts/check-goal-6.mjs`의 `docs/store/` 게이트 제외 해제**를 포함(critic: 제외가 이월 항목을 영구 무검사로 만듦). 생성기(`generate-store-screenshots.mjs`)도 금지어 검사 대상에 편입.

- [x] **P0 — 0.4.2 릴리즈 실행** — 2026-08-17 0.4.4 배포로 잔여 소화(production 배포 겸행·PRIVACY 410 현행화 공개 완료). v0.4.2 단독 태그는 생략(v0.4.3 태그 존재로 무의미).
  - 선택(권장) 잔존: staging TOKEN_SIGNING_SECRET 회전(smoke 토큰 일괄 무효화).

- [x] **P0 — 0.4.4 릴리즈 종결 (2026-08-17, tag v0.4.4)**
  - 구현·적대검증 통과(worker 201 green·뮤테이션 그물) → 배포(Version `2feb2238`) → **스모크 7/7 전항목 PASS**(삭제→R2 실물까지 소멸 실전 증명 포함). 실행 기록: docs/runbook-0.4.4.md §6.
  - 스모크가 잡은 실전 결함 2건 해결·문서화(troubleshooting/): dist 로컬 endpoint 잔존·프로덕션 D1 0002 미적용 500. 교훈: 배포 런북에 `d1 migrations list --remote` 확인 단계 고정.
  - 이월 후보(0.4.6): 로컬 히스토리 삭제 vs 서버 "즉시 삭제" 이원화 UX 혼동.

- [ ] **P1 — 스토어 재심사 제출: 0.4.6 랜딩 후 마지막에 1회 (로드맵 재편 2026-08-17)**
  - 0.4.2~0.4.6(UX 다듬기 포함)을 제출 없이 개발 진행 → 완성본으로 재심사 #1 제출(0.4.2·0.4.3·0.4.6 편승).
  - 0.4.5=**PRD 초안 완료, 요한 결재 D1~D3 대기**(docs/PRD-0.4.5.md — 선행 조건: 커스텀 도메인, workers.dev엔 관문 규칙 불가 확정) · 0.4.6(프롬프트 UX)·0.4.7(revoke 완성형, A안 exp+kid 재검토)은 착수 시 정의.

## Someday

- [ ] **서버 수탁 구조 재검토 (2026-08-17 결정: 현행 유지 A — 트리거 발동 시에만 재개)**
  - 배경: "내 AI에 저장"의 서버 = 요한 소유(Worker·R2·D1). 사용자 데이터 수탁 + 비용 부담 구조. 방어는 완비(7일 소멸·owner 게이트·삭제 실물 소멸 — v0.4.4 실전 증명).
  - 트리거 ①: 본인 외 실사용자 등장 or 0.4.6 스토어 재심사 제출 → PRIVACY에 보관 주체·소멸 시점이 사용자 눈높이로 명시됐는지 최종 점검.
  - 트리거 ②: Cloudflare 청구서 0원 초과 → 비용 재계산 + 셀프호스팅 옵션(B) 검토 개시.
  - 트리거 ③: 수익화 설계 착수 → A(현행)/B(셀프호스팅)/C(로컬 전용) 정식 비교 ADR.

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
