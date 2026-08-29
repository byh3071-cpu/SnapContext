---
id: report-ops-manual-feedback
date: 2026-08-30
tags: [dogfood, orchestration, orca, vhk, yohan-agent-kit, yohan-brain, claude-code, cursor]
status: proposal
---

# 보고서 ① — 운영 매뉴얼·도구 독푸딩 피드백 (0.4.6 오케스트레이션, 원장 52건 분류)

> **정본은 하나도 고치지 않았다.** 이 문서는 원장 `docs/dogfood/2026-08-29-orchestration-ledger.md`(DF-01~52)를 정본별로 묶고, 각 건에 **반영 제안 / 보류 / 기각**을 붙인 것이다. 적용은 요한·노뚝이 결재 후.
> 읽는 법: 표마다 "우선"은 상(당장)·중(다음 라운드 전)·하(여유). 근거는 전부 원장 ID.

## 1. 한 줄 총평

생태계 도구는 **뼈대(Orca worktree·터미널·메일, VHK 게이트, 로스터 v0.5, critic 메모리, 워커 보고 계약)가 값을 했고**, 세 군데가 실전에서 무너졌다: ① Orca 자동 배분 층(Windows+Cursor 전멸) ② 지휘자 기동 절차(가이드가 경고한 안티패턴을 그대로 밟음) ③ DoD에 E2E가 빠진 구조. 그리고 로스터·`/goal`·전파 카드는 서로 다른 버전을 말하고 있었다.

## 2. 정본별 분류

### 2-1. Orca (지휘소) — 12건

| 우선 | DF | 요지 | 제안 | 판정 |
|---|---|---|---|---|
| **상** | 14 | `worker-start`·`dispatch --inject` 전부 6~11초 뒤 `agent_prompt_stalled`(Cursor, 엔터 타이밍 무관) → dispatch 층 사용 불가 | Orca 이슈: Cursor "프롬프트 접수" 훅 판정 수정 또는 stall 판정 시간 옵션. 그때까지 **manual-send 어댑터를 공식 폴백으로 플레이북에 명문화**(worktree·터미널·status 메일은 그대로 Orca) | 반영 |
| **상** | 37 | `worktree create`(--agent 없음) → 빈 "Terminal 1"이 활성 탭, 워커는 2번째 탭 → 사람이 "터미널 안 열린다"로 봄 | 플레이북 규칙: **`worktree create --agent cursor`(첫 탭=워커)** 만 허용. DF-51에서 실증(Trust 자동·폴백 셸 0) | 반영 |
| 중 | 15 | failed dispatch에 `worker-stop` → 프로세스 무행동, 터미널이 stale 스펙 계속 실행 → 재시도가 2번째 에이전트를 같은 worktree에 생성 | Orca: retry 전 잔존 터미널 close 또는 경고 | 반영(이슈) |
| 중 | 46 | PTY 장치속성 응답 `ESC[?61;4c`가 워커 입력창에 글자로 유입 → 지시문 꼬리에 쓰레기 | Orca 이슈. 우회(배너 후 3초·백스페이스)는 기동기 v2에 반영 | 반영(이슈) |
| 중 | 18·34 | 새 터미널 핸들을 사전에 못 얻어 폴링 오인 · `send ok`가 제출 증거 아님 | `worker-start --no-wait`(핸들 즉시 반환) 요청 · 플레이북 "주입 후 12초 재확인" | 반영 |
| 중 | 09 | 08-27 회귀 3건(deps·new-top-level·Claude 새 터미널) 여전 | 재측정: deps 미사용·2단계 생성으로 우회 성공, Claude는 Agent 도구로만 | 보류(상류) |
| 하 | 16 | `worker-start --terminal`에 `--worktree` 생략 시 지휘자 폴더로 기본 → 불일치 오류 | 터미널에서 worktree 역추적 | 반영(이슈) |
| 하 | 19 | `[Pasted text]` 줄이 스크롤백에 남아 제출 신호로 못 씀 | 플레이북 "맨 엔터" 절차에 `read --screen` 사용 명시 | 반영 |
| 하 | 23 | manual-send 태스크를 `dispatched`로 못 놓음(`task_not_startable`) | `in_progress` 상태 또는 `--adapter manual` | 보류 |
| 하 | 51 | `--agent cursor` 기본 모델이 Orca 설정값(Composer) | 기동기가 `/model` 전환 — 이미 반영 | 완료 |
| 칭찬 | 20·48 | `status` 메일이 capability 없이 도달 → 완료 채널로 채택 · worktree에서 Chromium E2E 그냥 됨 | — | 기록 |

### 2-2. Cursor Agent CLI — 3건

| 우선 | DF | 요지 | 제안 | 판정 |
|---|---|---|---|---|
| 중 | 33 | 3개 동시 기동 시 `cli-config.json` rename 경쟁 → 1개 EPERM 크래시 | 기동 8초 스태거(기동기 v2 반영) + Cursor 버그 리포트 | 반영 |
| 중 | 24 | 수동 런치는 Workspace Trust 프롬프트에서 정지(`--force`로 안 넘어감) | `--agent cursor` 경로로 회피(DF-51). 수동 런치 시 `[a]` 키 자동 | 완료 |
| 하 | 17 | 세션 중 자동 업데이트(08.11→08.25)로 버전 드리프트 | 로스터 `refresh_slugs_before_dispatch`에 CLI 버전 기록 | 반영 |

### 2-3. yohan-brain (로스터·전파·플레이북) — 6건

| 우선 | DF | 요지 | 제안 | 판정 |
|---|---|---|---|---|
| **상** | 02 | CLAUDE.md 카드 v0.4 + 세션 훅 v0.5 동시 주입 → L 규칙 2벌. 전파 스크립트가 dirty 레포를 사흘간 조용히 skip | ① skip 시 레포에 경고 ② 훅이 v0.5를 주입하면 CLAUDE.md 카드는 포인터 3줄로 축소(중복 제거) | 반영 |
| 중 | 05 | 로스터 cursor-agent 슬러그 stale(4.6 계열 실존, 4.5 medium/low 무효) | `cli_fleet.cursor-agent.models`를 실측으로 갱신(strong `cursor-grok-4.6-high`·balanced `composer-2.5`/`cursor-grok-4.6-medium`·cheap `composer-2.5-fast`/`cursor-grok-4.6-low`), verified_at 08-30 | 반영 |
| 중 | 41·44 | 같은 파일을 건드리는 티켓을 fix 라운드 전에 병행 분기 → 충돌·헬퍼 3벌 | 로스터 `orca_patterns.rules`에 `no_parallel_when_allowed_files_overlap` | 반영 |
| 하 | 03·04 | 전파 커밋 메시지 "v0.4.0" 고정 · PS5.1 출력 mojibake | 버전 문자열 읽기 · `OutputEncoding` 선두 설정 | 반영 |
| 칭찬 | 38·52 | "critic → 수정 티켓 → 같은 critic 재개" 루프 1회전 성립 · composer가 문서 티켓 3배 빠름(`implement_tier_sizing` 실증) | 플레이북 표준 절차로 | 기록 |

### 2-4. yohan-agent-kit (스킬·커맨드·매뉴얼) — 4건

| 우선 | DF | 요지 | 제안 | 판정 |
|---|---|---|---|---|
| 중 | 11 | `/goal` 커맨드가 카드 v0.4 시절 흐름(Codex·agy, "L=/goal 풀파이프라인"), `execution_provider` 개념 없음 → `goal-cycle`과 불일치 | `/goal`을 goal-cycle 호출 얇은 래퍼로 축소하거나 폐기 예고 | 반영 |
| 중 | 06 | explorer(haiku) 정찰 수치 오류(54 vs 44)·빈칸 | explorer 출력 계약에 "명령 원문+결과 원문" 강제 | 반영 |
| 하 | 12 | agent-team-operations의 workstream 카드 저장 위치 규약 없음 | `goals/<id>-*-plan.md`(`type: plan`이면 vhk가 goal로 오인 안 함 — 실증) 규약 1줄 | 반영 |
| 하 | 13 | 빌트인 에이전트(`claude-code-guide`)가 로스터 role_defaults에 없어 비용 미관리 | 등재 | 보류 |

### 2-5. yohan-core 플러그인(훅·가드) — 1건

| 우선 | DF | 요지 | 제안 | 판정 |
|---|---|---|---|---|
| 중 | 21 | PreToolUse 보안 가드가 **글로브 문자열 인자**(mission forbidden)·원장 본문까지 통째 차단 | 접근 동사(Read/cat/Edit) 결합 시만 발동 + 걸린 토큰 표시 | 반영 |

### 2-6. VHK — 5건

| 우선 | DF | 요지 | 제안 | 판정 |
|---|---|---|---|---|
| 중 | 35 | `verify`/`receipt`가 브랜치에 **자동 커밋**(`chore(vhk): evidence ledger`) → PR diff 오염 | 커밋 전 확인 또는 `--no-commit` 기본 | 반영 |
| 중 | 30 | `receipt --since`가 자기 파일 때문에 dirty/stale → 거짓 `block` | 자기 파일 제외 실적용 · verify→receipt 순서 안내 | 반영 |
| 중 | 08 | `vhk sync`가 CLAUDE.md에 아키텍처 규칙 미전파(06-06 발견 #4 여전) | 타깃별 섹션 매핑 설정 가능하게. 우회=`.claude/rules/` 포인터(이번 적용) | 반영 |
| 하 | 07·22 | goal 게이트 표면 2벌·양수 인자 오류 힌트 없음 · `receipt --mark-start`가 tracked `.gitignore` 수정 | 통일·힌트·untracked | 반영 |

### 2-7. Claude Code (제품) — 2건

| 우선 | DF | 요지 | 제안 | 판정 |
|---|---|---|---|---|
| **상** | 01 | 승인한 명령 문자열이 그대로 allowlist에 저장돼 **Notion 토큰 평문**이 프로젝트 설정에 영속(gitignore라 유출은 없었음) | 토큰 패턴 마스킹/거부 · `secret-pr-guard`에 `.claude/settings*.json` 스캔 | 반영 |
| 하 | 10 | `gh auth status`(읽기)가 `gh auth *` deny에 걸림 | deny를 login/logout/token으로 좁히기 | 반영 |

### 2-8. 지휘자(나) 결함 — 6건 · 전부 기동기 v2·규약에 반영

| DF | 결함 | 재발 방지(적용됨) |
|---|---|---|
| 18 | 잘못된 터미널에 엔터 | 알려진 핸들 제외·`--agent` 경로 |
| 25 | 지시문 마침표가 인자로 복사 | 명령은 문장부호 없이 별도 |
| 34 | `send ok`만 믿고 미제출 20분 방치(요한 발견) | 12초 뒤 제출 확인 → 맨 엔터 |
| 41 | fix 전 분기 → 충돌 | 허용 파일 겹치면 병행 금지 |
| 43 | 티켓 근거 오류를 워커가 맹종 | 근거에 파일:라인 + 워커 [근거 불일치] 항목 |
| 51 | 파이프 오류로 기동기 사망 → 중복 지시 | 결과를 파일에 직접 기록, 컨텍스트%>0이면 주입 생략 |

### 2-9. 테스트 인프라(SnapContext 자체) — 4건 → 0.4.7 티켓 후보

| DF | 요지 | 제안 |
|---|---|---|
| 42·47 | DoD에 E2E 부재 → 기존 E2E 파손을 critic이 잡음 · `upload-share.mjs`는 기준선부터 실패(환경 의존) | DoD에 E2E 6종 고정(이번 W3부터 적용) · upload-share는 dogfood 하네스 위 재배선 or 폐기 결정 |
| 36·39 | dogfood CIM 테스트 부하 flaky(직렬에서도 재현) → 뮤테이션 판정 위양성 | 타임아웃 상향·`test:unit`/`test:dogfood` 분리 |
| 45 | UI 배선 뮤턴트 9종 전부 생존(7연속 축) | Playwright 컴포넌트 테스트 1건 도입 |
| 50 | 런타임 단언이 성공 경로를 실패로 뒤집을 수 있음 | PAT 후보(`state`): 상수 검증은 테스트 시점에 |

### 2-10. W3에서 추가된 것 — 7건 (DF-53~59)

| 우선 | DF | 대상 | 요지 | 제안 | 판정 |
|---|---|---|---|---|---|
| **상** | 53 | 플레이북·티켓 템플릿 | 일괄 용어 치환이 **승인된 PRD의 용어 표**(금지어 열)까지 바꿔 확정=금지가 됨, 새 게이트가 원복을 차단(고착). 단위·build·게이트 초록 — critic만 잡음 | 규칙: 용어 청소 전 "금지어를 의도적으로 인용하는 문서" 제외 목록 확정 → **PAT-004** | 반영 |
| **상** | 56 | DoD | `tests/e2e/dogfood/qa-043.mjs`(수동 QA 스크립트)가 옛 토스트를 기다려 거짓 판정 — W2 때 `tests/e2e/*.mjs`만 grep해 하위 폴더 누락(DF-42 재발) | DoD 그물 `tests/e2e/**` | 반영 |
| **상** | 57 | 재심사 준비 | 스토어 이미지 생성기·스토어 카피가 0.4.2에서 폐지된 "익명 공유 링크"를 광고 | TASKS P0(tag 전) + 게이트 `docs/store/` 제외 해제 | 반영 |
| 중 | 54 | 워커 지시문·게이트 | composer가 만진 md 12개에 UTF-8 BOM 유입(PS5.1 저장 기본, PAT-003 역방향) | 게이트 BOM 검사 + 지시문 "BOM 없는 UTF-8" | 반영 |
| 중 | 55 | critic 체크리스트 | 워커가 만든 게이트가 홑따옴표만 검사(백틱 8% 사각)·URL을 주석으로 오인 → 거짓음성 8종 | "새 게이트는 양성·음성 뮤테이션 각 3종" | 반영 |
| 칭찬 | 58 | 워커 보고 규약 v2 | `[근거 불일치]` 5건 첫 적용 — 티켓의 틀린 주장을 원문 유지하며 공개 | 보고서 ③ 확정 | 기록 |
| 기록 | 59 | DoD | critic 6회·405k 토큰·75분에 게이트 사각 15건. 세 웨이브 전부 "초록→FAIL→수정→PASS" | 적대 검증 = DoD 필수 항목 | 반영 |

## 3. 우선순위 요약 (요한 결재용)

| 순위 | 할 일 | 정본 | 크기 |
|---|---|---|---|
| 1 | Claude Code 권한 저장의 토큰 마스킹 + `secret-pr-guard` 스캔 범위 | 전역 설정·yohan-agent-kit | S |
| 2 | 플레이북: manual-send 어댑터 공식화 + `worktree create --agent` 필수 + 기동기 v2 승격(`ops/orca/playbooks/`) | yohan-brain | M |
| 3 | 라우팅 카드 중복 제거(훅 v0.5 있으면 CLAUDE.md는 포인터) + 전파 skip 경고 | yohan-brain | S |
| 4 | 로스터: Cursor 슬러그 실측 갱신 · `no_parallel_when_allowed_files_overlap` · 워커 보고 규약 v2(보고서 ③) | yohan-brain | S |
| 5 | `/goal` 정리(goal-cycle 래퍼화) | yohan-agent-kit | S |
| 6 | VHK: 자동 커밋 확인·receipt 자기 파일 제외·sync 매핑 | vhk | M |
| 7 | yohan-core 가드 정밀화 | yohan-agent-kit(plugins/yohan-core) | S |
| 8 | Orca 이슈 4건 등록(DF-14·15·16·46) + Cursor 1건(DF-33) | 외부 | — |

## 4. 기각 목록

- "Orca 대신 Claude Agent 도구만으로 워커 운영" — Orca worktree·터미널·메일·Task 행이 증거로 값을 했고, 사람이 진행을 볼 수 있는 유일한 면이다. 기각.
- "critic을 웨이브당 1회로 줄이기" — fix 뒤 재검증에서 새 결함(스택 중복·죽은 블록 공백)을 또 잡았다. 기각.
- "워커에 Claude 모델을 Orca 터미널로" — Windows 새 터미널 정지(#16095) 미해소. 보류.
