---
vhk_format: 1
type: plan
goal: 6
title: 0.4.6 구현 계획 영수증 — Fable 지휘 · Claude 하위모델 + Cursor 모델 오케스트레이션
status: APPROVED
approved_at: 2026-08-29
decisions: "R1 승인 · R2=A(M7·L12만 편승: M7→2-C, L12→2-A) · R3=A(웨이브당 1 PR)"
date: 2026-08-29
conductor: Claude Fable 5 (Claude Code 2.1.251, Orca 1.4.188 지휘 터미널)
execution_provider: orca-ready
spec: docs/PRD-0.4.6.md (approved 2026-08-17)
ledger: docs/dogfood/2026-08-29-orchestration-ledger.md
---

# 0.4.6 구현 계획 영수증

> 용어 한 줄 사전 — **지휘자**: 계획·배분·검수·보고를 맡는 최상위 AI(이 세션의 Fable). **워커**: 티켓 하나를 격리된 작업 폴더(worktree)에서 구현하는 AI. **웨이브**: 함께 굴리는 티켓 묶음, 끝날 때마다 머지 결재 1회. **적대 검증**: 만든 AI와 다른 AI가 "깨뜨려 보는" 검수. **Orca**: 워커를 띄우고 완료 신호(worker_done)를 받는 지휘소 프로그램. **한 문서 한 어휘**: 검사·검증·테스트 중 이 문서는 "검증"만 쓴다.

## 1. 목적 한 줄

스토어 재심사 전 마지막 확장 개선인 **0.4.6 프롬프트 UX 다듬기(6개 티켓, 서버 무변경)** 를 Fable 지휘 아래 Claude 하위 모델과 Cursor 모델만으로 Orca 오케스트레이션해 구현·검증·PR까지 완주하고, 그 과정에서 생태계 도구(Orca·VHK·에이전트 킷·스킬·서브에이전트)의 마찰을 원장에 모아 종료 시 보고서 3종으로 낸다.

## 2. 현재 진행상황 (2026-08-29 실측)

| 항목 | 상태 |
|---|---|
| 마지막 릴리즈 | 0.4.4 (서버 전용, tag v0.4.4, 08-17 스모크 7/7) · 확장은 0.4.3 |
| 0.4.5 요청 폭주 방어 | PRD 초안, 요한 결재 D1~D3 대기(커스텀 도메인 선행) → **이번 범위 밖** |
| 0.4.6 프롬프트 UX | PRD approved(08-17) · VHK goal 6 등록 · 착수 전 · 게이트 스크립트 현 상태 green → **이번 구현 대상** |
| goal 0 스토어 문구 | OPS-001 보류(08-26) — 사흘간 미커밋이던 표시를 Wave 0에서 커밋(a94bdb3) |
| 스코프 계약(mission) | 0.4.4 목표로 낡음 → 승인 직후 0.4.6으로 재설정(부록 E) |
| 열린 블로커 | `scripts/e2e-smoke.ps1`이 폐쇄된 경로를 써서 즉시 실패(폐기/재작성 결정 필요) · Cursor 환경변수 상속 미확인 → **별도 결재, 이번 범위 밖** |
| 저장소 상태 | 열린 PR 0 · 작업 폴더 1(master) · 비상정지 파일 없음 · 원격 = github byh3071-cpu/snapcontext |
| 실행 환경 | Orca 실행 중(runtime·graph ready) · Cursor 에이전트 CLI 2026.08.11 · Claude Code 2.1.251 · vhk 2.15.0 |

## 3. 범위·리스크

| 구분 | 내용 |
|---|---|
| 손대는 곳 | 확장 코드(`src/`)·프롬프트 템플릿 3종·테스트·문서(용어 사전 신설, "캡쳐" 44건 청소)·버전 4값 → 0.4.6. **서버(`worker/`)는 금지 목록에 고정** |
| 영향받는 사람 | 스토어 사용자 ~0 → 요한 로컬 설치로 확인 |
| 예상 규모 | 파일 약 25개(코드 8·템플릿 3·테스트 6~8·문서 12+·버전 3) — L 등급(≥7 + 릴리즈급) |
| 리스크 1 | Orca 회귀 3건(08-27 실측: 의존성 옵션·최상위 작업 폴더 만들기·Windows에서 Claude 새 터미널 정지) → 의존성 옵션 안 쓰고 직렬 생성, 작업 폴더는 두 단계로 생성, **Claude 모델은 지휘자 프로세스 안 서브에이전트로만** 투입 |
| 리스크 2 | 같은 파일을 두 티켓이 건드림(요약 카드 T1과 안내 문구 T3 → 같은 화면 파일 / 저장 배지 T6과 T3 → 같은 저장 파일) → 티켓을 묶어 **한 작업 폴더 한 작성자** 유지 |
| 리스크 3 | 로스터의 Cursor 모델 이름이 낡음(4.5 세대 일부 무효) → 실측 목록의 이름을 쓰고 로스터는 보고서에서만 지적 |
| 리스크 4 | 프롬프트를 줄이면 AI 판독 품질이 떨어질 수 있음 → "자세히 보기"로 원문 보존 + 요한 첫 15초 흐름 수동 확인 |
| 리스크 5 | 워커가 스코프를 넘음(감사에서 반복 관측) → 스코프 계약 + 스펙 금지 줄 + 적대 검증 3중 |
| 비용 | 요한 = 승인 1회·머지 결재 3회·수동 확인 1회·tag 1회. 나머지 전부 AI. Claude 구독(Max)·Cursor 구독(Pro) 한도 안, 종량 전환 없음 |

## 4. 투입 AI

| 역할 | 모델 | 실행면 | 하는 일 |
|---|---|---|---|
| 지휘자 | Claude **Fable 5** (이 세션) | Orca 지휘 터미널(현재) | 계획·티켓 스펙·워커 배분·완료 신호 수신·통합·PR·보고 |
| 정찰 | Claude **haiku** (explorer) | 지휘자 프로세스 안 서브에이전트, 읽기 전용 | 파일·라인 근거 수집(수치는 지휘자가 재측정) |
| 구현 워커 (표준 티켓) | Cursor **`cursor-grok-4.6-high`** | Orca 작업 폴더 + 터미널, 승인 프롬프트 없이 실행 | T5·T1+T3a·T2·T6+T3b |
| 구현 워커 (소형·문서 티켓) | Cursor **`composer-2.5`** | 위와 동일 | T4a 용어 사전 · T4b 전수 청소 |
| 적대 검증 | Claude **opus** (critic — 0.3.0~0.4.4 반복 결함 메모리 보유) | 지휘자 프로세스 안 서브에이전트, 읽기 전용 | 웨이브마다 diff를 깨뜨려 봄, 문제 0까지 |
| 소형 수정·커밋 | Claude **sonnet** (shipper) | 지휘자 프로세스 안 | 검증 통과 후 통합 브랜치 정리(필요 시) |
| 다른 눈 원칙 | Cursor가 만들면 Claude가 검수, Claude가 만들면 Cursor 워커가 검수(리뷰 전용 스펙) | — | 만든 벤더 ≠ 검수 벤더 |

제외: Codex·Antigravity(요한 지시) · Claude 모델을 Orca 새 터미널로 띄우는 것(회귀 #16095 회피).

## 5. 단계표

### Wave 0 — 정비 (지휘자 단독, 완료 ✅ — 되돌리기 쉬운 정리라 승인 없이 실행)

| # | 담당 | 하는 일 | 완료 확인 |
|---|---|---|---|
| 0-1 | 지휘자 | 사흘 묵은 보류 표시(goal 0)를 커밋해 트리를 깨끗이 | 커밋 a94bdb3 |
| 0-2 | 지휘자 | 라우팅 카드 v0.4→v0.5 동기화(전파 스크립트 실제 실행) | 커밋 0ae638e, 3파일 |
| 0-3 | 지휘자 | Claude 설정 정비: 권한 파일에 박힌 **토큰 평문 제거**·재구성, 배포·시크릿 명령은 거부, push·tag는 물어보기 | `.claude/settings.json`에 `ntn_` 0건 |
| 0-4 | 지휘자 | 경로별 보조 규칙 3장(확장·서버·문서) — 본문 복제 없이 RULES.md 포인터 + 반복 결함 교훈 | `.claude/rules/*.md` 3개, git 추적 허용 |
| 0-5 | 지휘자 | CLAUDE.md의 낡은 "현재 버전 v0.1.3" 제거 → 현재 국면·진입점 포인터 블록 | CLAUDE.md §🧭 |
| 0-6 | 지휘자 | 독푸딩 원장 개설(발견 13건 선기록) + 이 영수증 문서화 | 원장·이 파일 |

### Wave 1 — 기반 (승인 후 착수)

| # | 담당 | 하는 일 | 완료 확인 |
|---|---|---|---|
| 1-0 | 지휘자 | 스코프 계약을 0.4.6으로 재설정 · Orca Run 생성 · **스모크 1회**(Cursor 워커에 "아무것도 바꾸지 말고 완료 신호만" 시켜 배선 증명, ≤5분) | worker_done 수신 + 원장에 계측 기록 |
| 1-1 | Cursor grok | **T5 핀 의도 1비트** — 핀에 "버그/참고" 토글 1개(기본 참고), 옛 핀은 참고로 취급, 버그 핀은 배지 색 구분. **먼저 실패하는 검증 작성** → 구현 | 새 검증 통과 + 기존 전부 통과 |
| 1-2 | Cursor composer | **T4a 용어 사전 문서 신설**(확정 5용어·금지어) + 컨텍스트 팩 명세에 kind 필드 기재 | 문서 2개, 명세 표 갱신 |
| 1-3 | Claude opus | 적대 검증(하위호환·UI 배선 검증 유무·스코프) | 문제 0 |
| 1-4 | 지휘자 → **요한** | 통합 브랜치에서 전체 검증 → PR #1 → **머지 결재 ★** | 머지 |

### Wave 2 — 본작업 (작업 폴더 3개 병렬, W1 머지 후)

| # | 담당 | 하는 일 | 완료 확인 |
|---|---|---|---|
| 2-A | Cursor grok | **T1 요약 카드 + T3a 복사 후 안내** — 프롬프트 원문 대신 "템플릿·핀 N개·이미지·메모" 요약 카드 + 복사 버튼 1개, 원문은 접기. 복사 직후 안내 1줄 | 요약 데이터는 순수 함수로 분리해 검증 |
| 2-B | Cursor grok | **T2 프롬프트 다이어트** — 기본은 URL+핀 메모+요청 1줄. 환경 정보(브라우저·화면 크기·좌표)는 **버그 템플릿 + 버그 핀 있을 때만**. 템플릿 3종의 형식 지시문 축소 | 조건부 렌더 검증: 버그 핀 유/무 × 템플릿 3종 |
| 2-C | Cursor grok | **T6 저장 배지 + T3b 저장 후 안내** — 항목마다 "저장됨 ✓ / 실패 ⚠ 재시도" 배지, 조용한 실패 0. 저장 직후 안내 1줄 | 상태 전이 검증: 성공·실패·재시도 |
| 2-D | Claude opus | 3건 적대 검증(조용한 실패·stale 문구·누출 표면 확장 시 누출 검증 상속) | 문제 0 |
| 2-E | 지휘자 → **요한** | 3개 브랜치 → 통합 브랜치(파일 겹침 없음) → 전체 검증 → PR #2 → **머지 결재 ★** | 머지 |

### Wave 3 — 마감 청소 (직렬, W2 머지 후)

| # | 담당 | 하는 일 | 완료 확인 |
|---|---|---|---|
| 3-1 | Cursor composer | **T4b 용어 전수 청소** — 화면 문자열 "주석"→"핀 메모/그리기 도구", 문서 "캡쳐" 44건→"캡처", README·changelog(타입 변경·용어 사전 기재) · **버전 4값 0.4.6** · 게이트 스크립트에 금지 용어 검사 추가 | 금지 용어 0건, 버전 동기화 통과 |
| 3-2 | Claude opus | 검증 + 전체 완료 기준 대조 | 문제 0 |
| 3-3 | 지휘자 → **요한** | PR #3 → **머지 결재 ★** | 머지 |

### Wave 4 — 마감 (사람 게이트 + 보고)

| # | 담당 | 하는 일 | 완료 확인 |
|---|---|---|---|
| 4-1 | **요한** | 로컬 환경(`dogfood:up`)에서 첫 15초 흐름(캡처→핀→요약 카드→복사→안내) + 실패 배지 재현 ★ | 요한 OK |
| 4-2 | **요한** | tag `v0.4.6` ★ (스토어 일괄 재심사 제출은 별도 결재) | tag |
| 4-3 | 지휘자 | 세션 로그·Dev Log 행(산출물 포인터 포함)·**독푸딩 보고서 3종**(운영 매뉴얼 피드백 / 작업 일지 / 워커 보고 규약 제안)·범용 패턴 후보(PAT)·메모리 역전파 | 문서 4+ |
| 4-4 | 지휘자 | goal 6 완료 처리(`vhk goal done`) · 스코프 계약 마감 · Orca 워커 전부 release | vhk·orca 잔존 0 |

## 6. 합격 기준

1. PRD-0.4.6 완료 기준 5항 그대로: 검증 전부 통과(신규 포함) · 타입검사+빌드 통과 · 스코프 계약 위반 0 · 금지 용어 0 · 요한 수동 확인 · tag.
2. 오케스트레이션 증거: 티켓마다 Orca Task·worker_done 영수증이 남고, 워커 보고는 부록 D 형식을 지킨다(지휘자 재측정과 불일치 0).
3. 다른 눈 원칙 위반 0(만든 벤더 = 검수 벤더인 경우 없음).
4. 독푸딩 보고서 3종 제출 + 원장의 모든 항목이 보고서에 분류됨(반영/보류/기각).

## 7. 요한 결재 사항

| # | 질문 | 선택지 |
|---|---|---|
| **R1** | 이 계획 승인? | ✅ 승인 (2026-08-29 "바로 실행하면 돼") |
| **R2** | 감사(08-17)에서 0.4.6으로 배치된 편승 후보 — M6 히스토리 갱신 경합 · M7 저장 착수 실패 무음(T6과 인접) · M8 확대에 금지된 확대 방식 사용 · L12 안내 문구 스크린리더 미고지(T3과 인접) · L13 미사용 스텁 3개 | ✅ **A** — M7(저장 착수 실패 무음)→2-C 티켓에, L12(안내 aria-live)→2-A 티켓에 편승 |
| **R3** | PR 단위 | ✅ **A** — 웨이브당 1 PR |
| R4 | (승인 후 순차) PR #1·#2·#3 머지 · 수동 확인 · tag | 각 시점에 요청 |
| 참고 | 범위 밖 별도 결재: `e2e-smoke.ps1` 폐기 vs 재작성 · 0.4.5 D1~D3 | 이번 세션 미포함 |

## 8. 독푸딩 보고 약속 (Wave 4에서 제출)

| 문서 | 내용 | 대상 정본 |
|---|---|---|
| 운영 매뉴얼 피드백 | 에이전트 킷 `agent-team-operations`·`supervised-session-conductor`·`goal-cycle`·`/goal`·로스터·Orca 플레이북에서 이번에 어긋난 것·빠진 것·중복 | yohan-agent-kit · yohan-brain (제안만, 직접 수정 0) |
| 작업 일지 | 웨이브별 타임라인·소요·재디스패치·blocker·비용 계측 | docs/log + Dev Log |
| 워커 보고 규약 제안 | "하위 모델이 끝났을 때 지휘자에게 이렇게 보고하라" 계약(부록 D)의 실측 준수율과 개정안 | 에이전트 킷 워커 템플릿 |

---

# 기술 부록 (구현 AI 전용)

## A. 티켓 → 파일·심볼 맵 (2026-08-29 실측, 라인은 참고값)

| 티켓 | 파일 | 심볼·위치 | 메모 |
|---|---|---|---|
| T1 | `src/sidepanel/components/ContextPackPanel.ts` | `buildPromptText`(401-409) · `sync`(371-388, 382행 "주석" 문자열) · `copyPack`(411-427) | 요약 카드 데이터는 `src/context-pack/`에 순수 함수(예: `buildPackSummary`)로 분리해 vitest(node)에서 검증 |
| T2 | `src/context-pack/prompt-builder.ts` | `buildTemplatePrompt`(31-58): `userAgent`·`captureType`·`viewport` 항상 포함 → 조건부 | `template-engine.ts` `renderTemplate`(40-58)이 `{{#if}}`/`{{#each}}` 지원 — 추가 엔진 작업 불필요 |
| T2 | `prompts/templates/{bug-report,refactor,reference}.md` | 환경 절(각 9-13행)·4항 지시문(23-31행) | 환경 절은 `{{#if debugContext}}`류 플래그로 감싸기, 플래그 = bug 템플릿 && 버그 핀 존재 |
| T3 | `src/sidepanel/toast.ts` | `showToast(message, kind?: 'error'\|'info')` | API 변경 불필요. 문구 1줄 상한 = 검증으로 고정(문자 수 또는 줄바꿈 0) |
| T3a | `ContextPackPanel.ts` 421-423 | 복사 성공 toast → "AI 대화창에 붙여넣고 이미지를 함께 첨부하세요." | 2-A 소유 |
| T3b | `src/sidepanel/components/ImageActions.ts` 627 | `buildPrivateSaveSuccessMessage(days)` → "Claude Code·Cursor에서 '방금 캡처 분석해줘'라고 하면 읽습니다." | 2-C 소유 |
| T4a | `docs/GLOSSARY.md`(신규) · `docs/CONTEXT-PACK-SPEC.md` pins 절(65-71) | D1 표 5용어 + 금지어 + 적용 범위 · `kind?: 'bug'\|'ref'` 기재 | 1-2 소유 |
| T4b | src UI 문자열 "주석"(실측 재확인: grep 30줄 중 대부분 코드 주석) · docs "캡쳐" 44건/12파일(changelog 8·CONTEXT-PACK-SPEC 6·ARCHITECTURE 5·log 12·adr 7·til 3·PRD-0.4.6 2·troubleshooting 1) · README 0 | 코드 식별자(`annotation` 등)·과거 로그의 인용문은 유지 판단을 스펙에 명시 | 3-1 소유 |
| T5 | `src/types/index.ts` `PinItem`(280-290) | `kind?: 'bug' \| 'ref'` 추가(optional) | 하위호환: 저장된 팩·히스토리 로드 경로(`src/storage/history.ts`·context-pack 파서)에서 kind 없음 → 'ref' 취급 — 로드 함수는 워커가 실측해 스펙 보고에 적기 |
| T5 | `PinAnnotation.ts` `render`(45-74) · `PinMemoList.ts` `render`(48-93) | 배지 시각 구분 · 토글 1개(폼·드롭다운 금지), 툴팁 "예상과 다르게 동작해요" | 1-1 소유 |
| T6 | `src/utils/upload.ts` `uploadPrivateCapture` → `{id, expiresAt}` · `ImageActions.ts` 592-636 저장 핸들러(catch→error toast 있음, 배지 없음) · `HistoryList.ts` `renderItem`(120-192) · `src/storage/history.ts` `CaptureHistoryItem` | `saveStatus: 'saved'\|'failed'\|undefined` 필드 → changelog 타입 변경 기록 · 상태 전이는 순수 리듀서로 분리해 검증 | 2-C 소유 |
| 버전 | `package.json` · `manifest.json` · `package-lock.json`(top + `packages[""]`) | `scripts/check-version-sync.mjs` 4값 + 스크린샷 생성기 하드코딩 0 | worker serverInfo 무변경(ADR-014) |
| 게이트 | `scripts/check-goal-6.mjs`(63-65행 goal 고유 검증 자리) | 금지 용어 grep 0 추가 | 3-1 소유 |

기존 검증 파일: `tests/context-pack.test.ts`(7) · `tests/upload.test.ts`(6) · `tests/image-actions-contract.test.ts`(3) · vitest node 환경 `tests/**/*.test.ts`.

## B. 작업 폴더·브랜치·PR

| 웨이브 | 작업 폴더(Orca name) = 브랜치 | 워커 | 소유 파일 |
|---|---|---|---|
| W1 | `046-t5-pin-kind` | grok | types · PinAnnotation · PinMemoList · 관련 테스트 |
| W1 | `046-t4a-glossary` | composer | docs/GLOSSARY.md · CONTEXT-PACK-SPEC.md |
| W2 | `046-t1t3-summary-card` | grok | ContextPackPanel · toast · context-pack 요약 함수 · 테스트 |
| W2 | `046-t2-prompt-diet` | grok | prompt-builder · templates 3종 · context-pack.test.ts |
| W2 | `046-t6t3-save-badge` | grok | upload · ImageActions · HistoryList · storage/history · 테스트 |
| W3 | `046-t4b-terminology-version` | composer | src 문자열 · docs 44건 · README · changelog · 버전 4값 · check-goal-6 |

통합: 지휘자가 `046-w1`·`046-w2`·`046-w3` 통합 브랜치에 워커 브랜치를 merge(파일 겹침 없음) → DoD 전체 실행 → critic → `gh pr create`(push는 피처 브랜치만) → 요한 "머지해" → 지휘자 squash merge → master 갱신 → 다음 웨이브 워커는 갱신된 master에서 분기. 자동 머지·main 직push 없음.

## C. Orca 실행 시퀀스 (검증된 경로 — FRAGILITY 08-27 회귀 우회 반영)

selector = `ORCA_CLI_COMMAND=orca`(한 번 선택, 폴백 없음). repoId = `d7d18e17-f9f3-4174-a62c-c49a2aa34674`. Cursor 에이전트 = `C:\Users\user\AppData\Local\cursor-agent\agent.cmd`(풀패스, `&` 호출 연산자 필수).

```text
# 1회
orca orchestration run-create --objective "SnapContext 0.4.6 ..." --json
# 티켓마다 (--deps 미사용: #16706 회귀 → 직렬 생성·직렬 대기)
orca orchestration task-create --spec "<≤600자, docs/tickets/0.4.6/<T>.md 경로 포함>" --json
orca worktree create --repo id:<repoId> --name 046-t5-pin-kind --base-branch master --no-parent --json     # (#16707 회귀 → new-top-level 대신 2단계)
orca terminal create --worktree id:<repoId>::<path> --title 046-t5 --command "& 'C:\Users\user\AppData\Local\cursor-agent\agent.cmd' --model cursor-grok-4.6-high --force --approve-mcps" --json
orca terminal wait --terminal <h> --for tui-idle --timeout-ms 120000 --json      # Trust 승인 직후 30초 보류 후 read
orca orchestration worker-start --task <task> --terminal <h> --json               # supervised 부착 + inject
orca terminal read --terminal <h> --json                                          # 페이스트 도달 확인(cursor 값 변화) — 무변화면 재inject 금지, terminal send 직접 주입 1회
orca orchestration check --wait --types worker_done,escalation,question --timeout-ms 900000 --json   # 롤링 대기(15~60분 정상, 3분 nudge 금지)
orca orchestration worker-release --dispatch <d> --json && orca orchestration check --ack <delivery> --json
```

**스모크 결과(2026-08-29 14:00~14:20, 원장 DF-14~22)**: Orca는 `cursor`를 알고 grok 4.6으로 정확히 부팅하지만, `worker-start`·`dispatch --inject` 모두 6~11초 뒤 `agent_prompt_stalled`로 dispatch가 실패하고 capability가 철회된다(엔터 타이밍 무관). → **이번 세션의 실행 어댑터 = manual-send**:

```text
orca orchestration task-create --spec "<티켓 파일 경로 + 완료 조건 1줄>" --json          # Task 행(증거)은 유지
orca worktree create --repo id:<repoId> --name <branch> --base-branch master --no-parent --json
orca terminal create --worktree id:<repoId>::<path> --title <branch> --json                  # PowerShell 셸
orca terminal send --terminal <h> --text "& 'C:\Users\user\AppData\Local\cursor-agent\agent.cmd' --model <model> --force --approve-mcps" --enter --json
orca terminal wait --terminal <h> --for tui-idle --timeout-ms 90000 --json                  # 배너 "Run Everything" 확인
orca terminal send --terminal <h> --text "<지시문: 티켓 경로·task id·run id·완료 신호 명령>" --enter --json
orca orchestration task-update --id <task> --status dispatched --json                       # 정직한 수동 기록(adapter=manual-send)
orca orchestration check --wait --types status --timeout-ms 900000 --json                   # 워커의 status 메일 DONE:<task> 대기
# 완료 판정 = status 메일 + 브랜치의 report.md 커밋 + 지휘자 재측정(pnpm test/build) 3중
orca orchestration task-update --id <task> --status completed --result '{"adapter":"manual-send",...}' --json
```

dispatch 행을 만들지 않으므로 "오케스트레이션됐다"고 주장하지 않는다 — Task·worktree·터미널·status 메일까지가 Orca 증거, 완료 권위는 지휘자 재측정.

Claude 서브에이전트(Agent 도구): `yohan-core:explorer`(haiku, 정찰) · `yohan-core:critic`(opus, 검증 — 작업 폴더 경로 + `git diff master...HEAD` 범위 지정) · `yohan-core:shipper`(sonnet). model 파라미터를 로스터 별칭으로 명시해 지휘자 모델 상속을 막는다.

## D. 워커 스펙 템플릿 + worker_done 보고 형식 (계약)

```text
You are Cursor worker on worktree <path>, branch <branch>. Ticket file: docs/tickets/0.4.6/<T>.md (read first).
Rules: RULES.md + .cursor/rules. Scope = files listed in the ticket only. worker/ is forbidden.
Test-first: write the failing test, run it, then implement. Run: pnpm test ; pnpm build.
Do not commit to master, do not merge, do not push, do not touch .vhk/mission.json.
When done, send exactly one worker_done via:
  orca orchestration send --type worker_done --subject "<T> <succeeded|failed>" --task-id <task> --dispatch-id <dispatch> --outcome <succeeded|failed> --files-modified "<paths>" --body "<report below>" --json
```

worker_done `--body` 보고 형식(지휘자 재측정과 대조 — 요약 금지, 숫자 원문):

```text
[결과] 성공|실패|NOOP — 한 줄
[변경] 경로: 무엇을 (파일당 1줄)
[검증] 실행 명령 + 원문 수치 (예: pnpm test → 96 passed · tsc 0 error · vite build OK)
[테스트] 신규/수정 테스트 이름 · "먼저 실패 확인" 여부(예/아니오)
[스코프 밖 발견] 손대지 않은 것 (없으면 "없음")
[가정·미해결] 
[다음] 지휘자 결정이 필요한 것 1개 이하
```

## E. 스코프 계약 (승인 직후 `vhk mission set`)

- objective: `SnapContext 0.4.6 구현 (ext-only, worker/ 무변경) — PRD-0.4.6 approved(2026-08-17) T1~T6: payload 요약 카드·프롬프트 다이어트(스마트 디폴트)·다음 행동 안내 1줄·용어 사전 SoT(GLOSSARY)·PinItem.kind 1비트(하위호환)·저장 상태 배지. test-first. 웨이브 3(W1 T5+T4a / W2 T1+T3a·T2·T6+T3b / W3 T4b+버전 4값). 금지: worker/ 변경·템플릿 시스템 재설계·스토어 제출·배포·tag(사람). 계획 SoT: goals/6-046-ux-polish-plan.md`
- scope: `src/** tests/** prompts/** docs/** scripts/** goals/** manifest.json package.json package-lock.json pnpm-lock.yaml TASKS.md README.md CLAUDE.md .gitignore .claude/rules/** .vhk/mission.json`
- forbidden: `worker/** **/*.env **/.dev.vars* docs/ui-audit/**`

## F. DoD 명령 (웨이브마다 통합 브랜치에서)

```text
vhk receipt --mark-start            # 웨이브 시작 기준선
pnpm test                           # vitest
pnpm build                          # check:version + clean + tsc --noEmit + vite build
vhk mission check                   # 스코프 위반 0
vhk check --goal 6                  # 게이트 스크립트 (주의: `vhk goal check 6` 양수 인자는 오류 — `--id 6`)
grep -rnE "캡쳐|스냅샷|업로드됨|프롬프트 팩|Context Pack" src prompts docs README.md   # 0건 (W3 이후; 코드 식별자·과거 인용 예외는 스펙에 명시)
vhk verify --json                   # 증거 latest.json
```

## G. critic 체크리스트 (에이전트 메모리 반복 결함 축 — 웨이브마다 대조)

1. 보고서 수치는 실행으로 재측정(테스트 수·통과 수 자기감사 오류 반복).
2. 정책값·문구가 바뀌면 같은 스코프 사용자 노출 문서(PRIVACY·README·스토어 카피)가 stale인지.
3. 조용한 실패·무관측 스킵 0(빈 catch, 로그 없는 skip) — T6 핵심.
4. 새 출력 표면이 늘면 누출 검증도 늘었는지(T1 요약 카드·T2 조건부 메타).
5. UI 배선 변경에 순수 함수 분리 + 계약 테스트 동반(5회 연속 지적).
6. 스코프 자기확장(같은 PR에서 mission scope 편입) 없음.
7. tsc include 범위 밖 테스트의 시그니처 드리프트(required 인자 추가 시 기존 호출부).
8. 하위호환: kind 없는 옛 핀·옛 히스토리 항목 로드 경로 실측.

## H. 우회 목록 (원장 DF-09 · FRAGILITY 08-27)

| 회귀 | 우회 |
|---|---|
| `--deps` (#16706) | task-create 직렬, 대기도 직렬. DAG 의존은 지휘자 순서로 보장 |
| `new-top-level` selector (#16707) | `worktree create` → `terminal create` 2단계 |
| Windows+Claude 새 터미널 prompt stalled (#16095) | Claude는 Agent 도구 서브에이전트로만. Orca 터미널 워커는 Cursor만 |
| Cursor 부팅 직후 inject 유실 | tui-idle 후 30초 보류 → read로 cursor 값 변화 확인 → 무변화면 terminal send 1회 |
| PS5.1 인자 깨짐(`--spec` 큰따옴표) | Orca 호출은 Git Bash에서, 스펙은 티켓 파일 경로 위주로 짧게 |
