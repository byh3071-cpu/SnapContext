# Next Task

_Auto-updated 2026-05-30T11:40:03.293Z via `vhk goal next`._

```
TASK: Goal 0 — Phase 0 — 경쟁사 리서치 + 스토어 설명문
  status: BLOCKED
  priority: P0
  file: goals\0-store-copy-research.md
```

## 2026-08-05 — SnapContext 0.4.2 검증 마감

```text
TASK: 0.4.2 원클릭 local dogfood harness 구축 및 Codex 10분 smoke
  status: READY
  priority: P0
  scope: package scripts, local-only test harness, 전용 fixture/profile, tests/docs
  forbidden: deploy, production binding/data, secret/config 변경, store 제출, tag/merge
  evidence:
    - 보안·정확성 코드 리뷰: 조건부 통과, critical/high 발견 없음
    - extension unit 66/66, Worker unit 240/240, D1 6/6
    - tsc + vite build 통과, 전체 E2E 72/72
  DoD:
    - 한 명령으로 격리된 local Worker/D1과 localhost endpoint 확장 build 실행
    - pixel-only marker golden path를 저장→조회→분석→삭제까지 검증
    - 동의 취소·Worker 중단·invalid token·삭제 후 접근의 실패 경로 검증
    - production binding·URL 사용 0건과 결과 로그 확인
  human_gate_after: 분리된 HTTPS staging 생성 및 Claude Code·Cursor·Codex 실클라이언트 smoke
```

## 2026-08-15 — dogfood harness 완료 (PR #24 머지) + Codex smoke 통과

```text
TASK: HTTPS staging 구성 (사람 승인 게이트)
  status: BLOCKED_ON_HUMAN
  priority: P0
  내용: production 과 분리된 Worker/R2/D1/secret 구성 -> Claude Code·Cursor·Codex 3클라이언트 릴리즈 smoke -> 0.4.2 배포·스토어·tag
  완료 근거(선행): harness PR #24 머지(6e714ed), 적대검증 V7 blocker 0, verify 18/18(HEAD=057f699·dirty=false·production 0),
    Codex 실클라이언트 smoke 통과(2026-08-15: marker 959495 픽셀 판독 일치·삭제 후 NOT_FOUND·owner 격리 실측 — docs/log/2026-08-15-dogfood-harness.md)
  참고: dogfood.md 에 marker 인코딩 스킴 문단 추가 필요(P1)
```

## 2026-08-15 — SnapContext 0.4.2 T4 착수 (완료됨 — 위 항목으로 대체)

```text
TASK: 0.4.2 로컬 MCP 등록과 Codex 일상 dogfood 절차 문서화
  status: IN_PROGRESS
  priority: P0
  scope: scripts/register-mcp.ps1, docs/dogfood.md, TASKS.md, 온보딩 계약 테스트
  forbidden: deploy, production binding/data, secret/config 변경, remote push, tag/merge
  evidence:
    - register-mcp.ps1 production 기본값을 유지한 -Local URL 분기
    - 로컬 /token 발급과 세션 전용 SNAPCONTEXT_MCP_TOKEN 절차
    - Codex 일상 검증과 세 클라이언트 릴리즈 게이트 분리
```

## 2026-08-29 — 0.4.6 구현 계획 영수증 제출 (Plan 승인 게이트)

```text
TASK: 0.4.6 프롬프트 UX 다듬기 — Fable 지휘 · Claude 하위모델 + Cursor 모델 Orca 오케스트레이션
  status: BLOCKED_ON_HUMAN (계획 승인 + 결재 3건)
  priority: P1
  plan: goals/6-046-ux-polish-plan.md
  spec: docs/PRD-0.4.6.md (approved 2026-08-17)
  execution_provider: orca-ready (ORCA_CLI_COMMAND=orca · runtime/graph ready 실측 2026-08-29)
  wave0_done: .claude 정비(설정 시크릿 제거·rules 3장·라우팅 카드 v0.5 동기화·국면 포인터) · 독푸딩 원장 개설
  next_after_approval: mission 0.4.6 재설정 → Orca Run 생성 → 스모크 1회(Cursor NOOP) → W1(T5 ∥ T4a)
  dogfood_ledger: docs/dogfood/2026-08-29-orchestration-ledger.md
```

## 2026-08-30 — 0.4.6 W1 PR 대기 · W2 수정 라운드

```text
TASK: 0.4.6 — W1 머지 결재 / W2-fix / W3 착수
  status: BLOCKED_ON_HUMAN (PR #25 머지) + IN_PROGRESS (W2-fix, Cursor grok, 046-w2)
  pr1: https://github.com/byh3071-cpu/snapcontext/pull/25  (046-w1 → master, critic PASS)
  w2: 046-w2 = 046-w1 + T1/T3a + T2 + T6/T3b (170 passed) → critic BLOCKER 1(E2E 접힘)·MAJOR 1(저장 문구) → W2-fix 티켓 진행
  w3_next: 046-w2 위에서 T4b(용어 전수·버전 4값 0.4.6·게이트) — `worktree create --agent cursor` 방식
  worktrees: master · 046-w1 · 046-w2 (끝난 워커 폴더 6개 제거, 브랜치 보존)
  adapter: manual-send (Orca dispatch 층 stall — 원장 DF-14), 완료 채널 = status 메일 + report.md 커밋
  ledger: docs/dogfood/2026-08-29-orchestration-ledger.md (DF-01~45)
```

## 2026-08-30 (2) — W2 PR 생성 · W3 진행

```text
TASK: 0.4.6 — PR #25·#26 머지 결재 / W3 T4b 진행
  status: BLOCKED_ON_HUMAN (PR #25 → #26 순서 머지) + IN_PROGRESS (T4b, composer-2.5, 046-t4b-terminology-version)
  pr1: https://github.com/byh3071-cpu/snapcontext/pull/25   pr2: https://github.com/byh3071-cpu/snapcontext/pull/26 (base 046-w1, 스택)
  w2_evidence: 173 passed · tsc 0 · build OK · E2E 6/7 (upload-share.mjs는 046-w1 기준선에서도 동일 실패 — 환경 의존, 0.4.7)
  w3_next: T4b 완료 → 046-w3 통합 재측정(+E2E 6종) → critic → PR #3 → 요한 수동 QA·tag v0.4.6 → 보고서 3종
```

## 2026-08-30 (3) — 0.4.6 구현·검증 완료, 사람 게이트만 잔여

```text
TASK: 0.4.6 마감 — PR 3개 머지 → 수동 QA → tag
  status: BLOCKED_ON_HUMAN
  prs: #25(W1) → #26(W2) → #27(W3)  (전부 critic PASS·MAJOR 0, 스택 순서대로 머지)
  evidence: vitest 173 passed · tsc 0 · build OK(0.4.6) · vhk check --goal 6 ✓ · BOM 0 · E2E 6/6 (upload-share는 기준선부터 실패=환경 의존)
  after_merge: pnpm dogfood:up 첫 15초 흐름(캡처→핀→요약 카드→복사→안내) + 실패 배지 재현 → tag v0.4.6 → vhk goal done --id 6
  carry_over: 재심사 준비(스토어 킷 재작성 + docs/store 게이트 제외 해제) — TASKS P0 · 0.4.7 후보: upload-share E2E 재배선·CIM flaky·UI 배선 Playwright 1건·SPEC JSON 예시 드리프트
  reports: docs/log/2026-08-30-0.4.6-orchestration-worklog.md · docs/dogfood/2026-08-30-report-1-ops-manual-feedback.md · docs/dogfood/2026-08-30-report-3-worker-report-contract.md
  worktrees: master · 046-w1 · 046-w2 · 046-w3 (머지 후 제거)
```

## 2026-08-30 (4) — PR 3개 머지 완료, master = 0.4.6

```text
TASK: 0.4.6 — 수동 QA → tag v0.4.6 (사람 게이트 2개)
  status: BLOCKED_ON_HUMAN
  merged: #25 (S1) → #26 (07daf72) → #27 (35a9774) squash + 지휘 문서 merge dafdb12 → master 0.4.6
  evidence(master): vitest 23 files / 173 passed · tsc 0 · build OK(version-sync 0.4.6) · vhk check --goal 6 ✓ · BOM 0
  next_human: 1) pnpm dogfood:up → 첫 15초 흐름(캡처→핀 버그/참고→요약 카드→복사→안내) + 실패 배지 재현  2) git tag v0.4.6 && git push origin v0.4.6  3) vhk goal done --id 6
  carry_over: 재심사 준비(스토어 킷 재작성 + docs/store 게이트 제외 해제, TASKS P0) · 0.4.7 후보(upload-share E2E·CIM flaky·UI 배선 Playwright·SPEC JSON 예시)
  cleanup_done: Orca worktree 전부 제거(master만) · 로컬/원격 046-* 브랜치 삭제 · Orca Run run_2865210e30b6 워커 전원 release
  lesson: 스택 PR + squash 머지는 충돌 유발(DF-60) → 다음엔 --merge 또는 하위 머지 후 rebase
```

