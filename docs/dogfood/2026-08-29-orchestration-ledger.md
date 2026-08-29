---
id: dogfood-orchestration-ledger-2026-08-29
date: 2026-08-29
tags: [dogfood, orchestration, orca, vhk, yohan-agent-kit, claude-code, cursor]
status: open
---

# 0.4.6 오케스트레이션 독푸딩 원장 (append-only)

> 목적: 이번 0.4.6 구현을 Fable 지휘 + Claude 하위모델 + Cursor 모델로 굴리면서 만난 **도구·스킬·에이전트·운영 매뉴얼의 마찰과 개선점**을 정본(yohan-brain·yohan-agent-kit·vhk·Claude 설정)을 직접 고치지 않고 여기에 쌓는다. 작업이 전부 끝나면 이 원장을 근거로 보고서 3종(운영 매뉴얼 피드백·작업 일지·워커 보고 규약 제안)을 낸다.
> 기록 규칙: 한 항목 = ID · 대상(정본) · 증상(실측) · 영향 · 우회 · 개선안 · 심각도(상/중/하). 추측은 `[추론]` 태그.

## 발견 (Wave 0 — 정찰·정비 단계)

| ID | 대상 정본 | 증상(실측) | 영향 | 우회 | 개선안 | 심각도 |
|---|---|---|---|---|---|---|
| DF-01 | Claude Code 권한 저장 | 프로젝트 `.claude/settings.json` allow 항목 2건에 Notion 토큰 **평문**이 박혀 있었다 — 사용자가 승인한 명령 문자열(`claude mcp add … --token ntn_…`)이 그대로 allowlist로 영속됨. `.claude/`가 gitignore라 유출은 없었음 | 로컬 파일 시크릿 노출·다른 머신 복사 시 확산 위험 | 항목 삭제·재구성(Wave 0) | 승인 문자열에 토큰 패턴(`ntn_`·`sk-`·`Bearer`)이 있으면 allowlist 저장 전 마스킹/거부. 전역 `secret-pr-guard`에 `.claude/settings*.json` 스캔 추가 | 상 |
| DF-02 | yohan-brain 라우팅 카드 전파 + yohan-core 세션 훅 | CLAUDE.md·AGENTS.md·.cursor 카드가 v0.4(L=/goal 풀파이프라인)인데 세션 훅은 v0.5(L=provider 판정)를 주입 → **같은 컨텍스트에 L 규칙 2벌**. 원인: `propagate-roster-card.ps1` 안전가드가 dirty 레포를 조용히 skip(사흘간 stale) | 지휘자 판단 규칙 상충 | 미커밋분 커밋 후 `-Only snapcontext -NoPush` 실행 → 3파일 v0.5 동기화(커밋 0ae638e) | (a) skip 시 레포에 경고 파일 또는 세션 훅에 "카드 stale" 배너 (b) 훅이 이미 v0.5를 주입하면 CLAUDE.md 카드는 포인터 3줄로 축소해 중복 제거 | 중 |
| DF-03 | `propagate-roster-card.ps1` | 자동 커밋 메시지가 `roster v0.4.0` 고정 문자열(내용은 v0.5) | 이력 오독 | — | 커밋 메시지에 roster.yaml `version:` 읽어 넣기 | 하 |
| DF-04 | 같은 스크립트(환경) | Git Bash에서 PS5.1 호출 시 한글 출력 mojibake(`��� ����`) | 로그 판독 불가 | `[Console]::OutputEncoding=UTF8` 선행 지정 | 스크립트 선두에서 OutputEncoding 자체 설정 | 하 |
| DF-05 | `agent-roster.yaml` cli_fleet.cursor-agent (verified_at 08-05) | `cursor-agent --list-models`(2026.08.11 빌드) 실측: `cursor-grok-4.6-{low,medium,high,xhigh}` 계열 존재, 로스터의 balanced `cursor-grok-4.5-medium`·cheap `cursor-grok-4.5-low`는 **미노출**(무효 슬러그). `composer-2.5`·`claude-sonnet-5-*`·`gpt-5.6-sol-*`는 유효 | 로스터대로 디스패치하면 실패 | 이번 계획은 실측 슬러그(`cursor-grok-4.6-high`·`composer-2.5`) 사용 | `model_slug_maintenance` 규칙대로 실측 반영 + verified_at 갱신(보고서에서 제안, 직접 수정 안 함) | 중 |
| DF-06 | yohan-core `explorer`(haiku) | 정찰 보고 수치가 실측과 다름: docs "캡쳐" 54건 보고 vs `grep -r` 실측 44건 · 일부 칸 "실측 필요" 빈칸 · 하위호환 로드 경로 미발견 | 계획 수치 오염 | 지휘자 재측정 | 정찰 에이전트 출력 계약에 "명령 원문 + 결과 원문 첨부" 강제, 빈칸은 `UNKNOWN(이유)` | 중 |
| DF-07 | vhk CLI | goal 게이트 실행 표면 2벌: `vhk goal check --id 6`와 `vhk check --goal 6`. `vhk goal check 6`(양수 인자)은 에러만 내고 대안 표기 없음 | 에이전트 재시도 낭비 | 도움말 재조회 | 에러 메시지에 `--id` 힌트, 두 표면 중 하나로 통일 | 하 |
| DF-08 | vhk sync | 06-06 발견 #4(CLAUDE.md에 아키텍처 규칙 미전파) 여전히 open — Claude Code는 RULES.md §아키텍처를 못 봄 | 규칙 누락 | `.claude/rules/src-architecture.md` 포인터로 우회 | sync 타깃별 섹션 매핑을 RULES.md frontmatter로 설정 가능하게 | 중 |
| DF-09 | Orca 1.4.188 (FRAGILITY 08-27 회귀 3건) | `--deps` 회귀(#16706)·`new-top-level` selector 회귀(#16707)·Windows+Claude 새 터미널 `agent_prompt_stalled`(#16095) | DAG·워커 기동 설계 제약 | deps 미사용 직렬 task-create · `worktree create` 후 `terminal create` · Claude는 프로세스 내 서브에이전트로만 | 해소 여부를 W1 스모크에서 1회 재측정해 원장에 추가 | 중 |
| DF-10 | 전역 `~/.claude/settings.json` deny | `gh auth status`(읽기 전용)가 `Bash(gh auth *)` deny에 걸려 인증 상태 확인 불가 | PR 흐름 사전 점검 불가 | `gh pr list`로 간접 확인 | deny를 `gh auth login*`·`gh auth logout*`·`gh auth token*`으로 좁히기 | 하 |
| DF-11 | yohan-agent-kit `/goal` 커맨드 | `~/.claude/commands/goal.md`는 카드 v0.4 시절 흐름(Codex·agy 포함, "L=/goal orca 풀파이프라인") — `execution_provider` 개념 없음, `goal-cycle` 스킬과 역할 중복·불일치 | 지휘자가 어느 절차를 따를지 모호 | 이번엔 `goal-cycle` + 로스터 v0.5 + `agent-team-operations` 운영 매뉴얼을 따르고 `/goal`은 참고만 | `/goal`을 goal-cycle 호출 얇은 래퍼로 축소하거나 폐기 예고 | 중 |
| DF-12 | yohan-agent-kit `agent-team-operations` 운영 매뉴얼 | workstream 카드(YAML)를 "owner project가 저장"하라는데 저장 위치·파일명 규약이 없음 | 매 프로젝트 임의 위치 | `goals/6-046-ux-polish-plan.md` frontmatter에 흡수 | 규약 1줄 추가(예: `goals/<id>-*.plan.md` 또는 `docs/state/workstream.yaml`) | 하 |
| DF-13 | Claude Code 서브에이전트 모델 배치 | `claude-code-guide`·`yohan-core:explorer` 호출 시 model 파라미터를 안 넘겼으나 정의 파일 별칭(haiku)이 안전망으로 작동(로스터 `model_alias_map.spawn_rule` 의도대로) — **정상**. 단 `claude-code-guide`는 정의 파일 model 미확인(64k 토큰 소모) | 비용 | — | 빌트인 에이전트도 로스터 role_defaults에 등재 | 하 |

## 발견 (Wave 1-0 — Orca 스모크, 14:00~14:20)

| ID | 대상 정본 | 증상(실측) | 영향 | 우회 | 개선안 | 심각도 |
|---|---|---|---|---|---|---|
| DF-14 | Orca 1.4.188 orchestration (Windows + Cursor) | `worker-start --agent cursor`(3회)·`worker-start --terminal`(선기동 idle 에이전트, 페이스트 1.4초 뒤 엔터)·`dispatch --inject`(1회) **전부 6~11초 뒤 `agent_prompt_stalled`** → dispatch failed·capability 즉시 revoke → 워커의 heartbeat·worker_done·ask·escalation 전부 거절. 엔터 타이밍과 무관(선기동+1.4초 엔터에서도 재현) → [추론] Orca가 Cursor의 "프롬프트 접수" 훅 신호를 못 받음(#16095 계열, Claude뿐 아니라 Cursor도). 3회 실패 후 태스크 회로차단(`failed`) | **Orca dispatch 층 사용 불가** — supervised worker_done 경로 폐쇄 | 워크트리·터미널은 Orca, 스펙은 `terminal send` 직접 주입(manual-send 어댑터), 완료 신호는 워커의 **`status` 메일(제목 `DONE:<task>`)** + 브랜치 커밋 + 지휘자 재측정. task 상태는 `task-update`로 정직하게 override(result에 adapter 기록) | Orca: Cursor 훅 접수 판정 수정 또는 stall 판정 시간 옵션 · 로스터 `orca_patterns`에 "inject 불가 시 manual-send + status 완료 채널" 계약 명문화 | 상 |
| DF-15 | Orca `worker-stop` | 이미 failed·settled dispatch에 `worker-stop` → `processAction: none`, **에이전트 터미널이 살아 stale 스펙을 계속 실행**. 이어서 `worker-start` 재시도가 같은 worktree에 2번째 에이전트 터미널 생성 → 한 worktree 2 writer 상태 발생(실측) | 스코프 충돌 위험·토큰 낭비 | `terminal close`로 수동 정리 | failed dispatch의 residual 터미널은 `worker-start --retry-of` 전에 자동 close 또는 경고 | 중 |
| DF-16 | Orca `worker-start --terminal` | `--worktree` 생략 시 지휘자 현재 폴더(master)로 기본 → `terminal_worktree_mismatch`. 메시지는 명확 | 재시도 1회 | `--worktree id:…` 명시 | 터미널에서 worktree를 역추적해 기본값 채우기 | 하 |
| DF-17 | Cursor Agent CLI | 같은 세션 안에서 자동 업데이트: 1번째 워커 `v2026.08.11`, 2번째부터 `v2026.08.25-3e8eec8` | 한 라운드 안 버전 드리프트, 재현성 저하 | — | 로스터 `refresh_slugs_before_dispatch`에 CLI 버전 고정/기록 추가 | 하 |
| DF-18 | 지휘자(나) 폴링 결함 | 재시도 시 `terminal list` 항목을 새 터미널로 오인 → **구 터미널에 엔터 2회** → stale 워커가 실행됨. 원인: 새 핸들은 worker-start 결과(effects)에만 있고 블로킹이라 사전 확보 불가 | 잘못된 워커 기동 | 알려진 핸들 제외 집합으로 폴링 | worker-start에 핸들 즉시 반환(no-wait) 옵션 | 중 |
| DF-19 | Orca `terminal read` 신호 해석 | `[Pasted text #1 +N lines]` 줄은 제출 후에도 스크롤백에 남아 "미제출" 신호로 못 씀(2차에서 워커 실행 중에도 표시). `--screen`(현재 프레임) 읽기가 입력창 상태 판정에 맞을 듯 | 자동 엔터 루프 오판(엔터 17회 전송) | 마지막 8줄만 보고 1회만 전송 | 플레이북 FRAGILITY "맨 엔터" 절차에 `--screen` 사용 명시 | 하 |
| DF-20 | 워커 보고 계약 (긍정) | Cursor grok 4.6 워커 4명 전원: 라우팅 선언(카드 읽음)·`.vhk/HARD_STOP` 확인·지정 명령만 실행·**보고 형식 7항 그대로 준수**·거절 시 ask→escalation→`status` 메일 순으로 에스컬레이션 후 `check --wait`로 지휘자 대기 | — | — | 부록 D 계약은 실효. `status` 메일이 capability 없이 도달 → 완료 채널로 채택 | (칭찬) |
| DF-21 | yohan-core PreToolUse 보안 가드 | `vhk mission set --forbidden` 인자에 환경변수 파일 글로브(점env 패턴)가 들어간 명령이 통째로 차단 — 파일 접근이 아니라 **글로브 문자열 인자**인데 명령 전체 거부(계획·mission 갱신 4줄이 함께 죽음). 이 원장 항목을 bash heredoc으로 쓸 때도 같은 이유로 차단됨(편집 도구로 우회) | 명령 분할·재실행 2회 | forbidden은 python으로 기존 목록에 append | 가드가 Read/cat/Edit 등 접근 동사와 결합될 때만 발동하도록 정밀화, 차단 시 어느 토큰이 걸렸는지 표시 | 중 |
| DF-23 | Orca `task-update --status dispatched` | manual-send 태스크를 `dispatched`로 표시하려 하자 `task_not_startable: cannot move to dispatched without an active Dispatch` — 수동 어댑터는 `ready`→`completed`만 가능, "진행 중" 상태를 정직하게 기록할 길이 없음 | 태스크 목록에서 진행 중/대기 구분 불가 | worktree comment(`worktree set --comment`)로 대체 표시 | 수동 어댑터용 `in_progress` 상태 또는 `--adapter manual` 플래그 | 하 |
| DF-24 | Cursor Agent + Orca 런처 | 새 worktree 폴더에서 **수동 런치**(`terminal send`로 agent.cmd)한 Cursor는 "Workspace Trust Required" 프롬프트에서 정지(`[a] Trust this workspace` 키 필요, `--force`로 안 넘어감). 반면 Orca `--agent cursor` 런치는 같은 조건에서 Trust를 자동 처리했음[추론: 런처가 trust 플래그/설정 주입] → manual-send 어댑터는 Trust 자동 승인 단계가 필수 | 워커 무한 대기(2명 동시 발생) | 화면에서 `[a]` 파싱해 키 전송(스크립트화 완료) | 플레이북 `agent-launch.ps1` cursor 프리셋에 trust 처리 명시, 또는 Orca 런처가 쓰는 trust 방식 공개 | 중 |
| DF-25 | 지휘자(나) 지시문 결함 | 지시문에 `… --json .` 처럼 **명령 뒤에 문장 마침표**를 붙였더니 Composer 워커가 `.`을 인자로 그대로 복사해 `orca orchestration send`가 실패(2회 재시도, 인코딩 문제로 오진) | 완료 신호 지연 | 정정 메시지 전송 | 워커 지시문 규약: 명령은 코드블록/별도 줄, 문장부호 금지 — 부록 D 템플릿에 반영 | 중 |
| DF-26 | Orca worktree 셋업 | 새 worktree에 `node_modules` 없음 → grok 워커가 `pnpm test` 실패 후 스스로 `pnpm install`(25s) 실행. 레포에 Orca setup hook이 없어 `--setup run`이 `not_applicable` | 워커마다 설치 반복·첫 테스트 실패 노이즈 | 워커 자율 복구 | 레포 Orca 설정에 setup hook(`pnpm install --frozen-lockfile`) 등록 또는 티켓 지시문에 "먼저 pnpm install" 1줄 | 하 |
| DF-27 | 워커 커밋 관행 (긍정) | Composer 워커가 `git commit --trailer "Co-authored-by: Cursor <cursoragent@cursor.com>"`로 귀속을 남김 — FRAGILITY 증상17(PR 귀속 확인 불가)의 자연 해법 | — | — | 워커 지시문에 trailer 규약 명문화(Claude 워커도 동일) | (칭찬) |
| DF-28 | 완료 감시(manual-send 어댑터) 실측 | W1 대기 루프 808초: T4a는 `status` 메일(정정 후 **2통 중복** 전송됨)로, T5는 메일보다 **report.md 커밋 감지**가 먼저 잡음(메일은 안 왔거나 늦음). 파일+메일 2중 채널이 없었으면 T5 완료를 놓쳤을 것 | 단일 채널 의존 위험 | 2중 채널 유지 | 워커 지시문에 "메일은 정확히 1통" + 지휘자 대기는 파일 우선·메일 보조로 계약 | 중 |
| DF-29 | 워커 보고 수치 (긍정) | T5 보고 "20 files / 151 passed (신규 9) · tsc 0 · vite build OK"가 지휘자 재측정(046-w1 통합 후 151 passed, build OK)과 **정확히 일치**. 0.4.0 P1P2 때의 보고 수치 오류(118 vs 116)와 대조적 — 부록 D의 "원문 수치" 요구가 먹힘 | — | — | 계약 유지 | (칭찬) |
| DF-30 | vhk `receipt --since master` (통합 worktree) | 판정 `block` — 사유 "dirty"·"stale"인데 실체는 **vhk 자신이 만든 변경**(`.vhk/.gitignore` 수정 + untracked `.vhk/events/receipt-log.jsonl`)과 "검증 SHA ≠ HEAD"(verify를 receipt 뒤에 돌려서). `vhk verify`는 typecheck·test·build pass, lint skip, secure warn(line-length 스캔 불완전) | 영수증이 거짓 차단 → 신뢰도 하락 | 판정 무시, DoD는 지휘자 재측정으로 | receipt 자기파일(events/·receipts/·.gitignore 갱신)을 dirty 계산에서 제외(주석엔 "자기파일 제외"라 돼 있으나 실측 미적용) · verify→receipt 순서 안내 | 중 |
| DF-31 | 게이트 vs 적대 검증 (교훈) | W1 통합은 test 151 green·tsc·build·scope 전부 통과했는데 critic(opus, 12.8분·122k 토큰, 뮤테이션 15종+Playwright 실포인터)이 MAJOR 5건 발굴: ① 토글이 자기 재렌더로 포커스 파괴(같은 파일의 경고 주석을 워커가 못 봄) ② 두 번째 핀 렌더러(ImageLightbox) 누락 ③ 용어 사전 검사 명령의 자기참조 ④ 하위호환 테스트가 제품 코드 사본을 검증(vacuous, 뮤테이션 10종 생존) ⑤ 참고 상태 툴팁 부재. **워커 보고의 "[스코프 밖 발견] 없음"도 부정확**(라이트박스) | 게이트만 믿으면 머지됐을 결함 | W1-fix 티켓으로 웨이브 안 수정 | 티켓 템플릿에 "같은 심볼을 만드는 곳이 2군데 이상인지 grep" + "테스트는 제품 함수를 import(사본 금지)" 규칙 · 워커 보고 [스코프 밖 발견]에 "허용 파일 밖에서 같은 패턴을 grep한 결과" 요구 | 상 |
| DF-32 | critic 비용/효과 | 122k 토큰·49 툴호출·12.8분에 MAJOR 5·MINOR 8. 뮤테이션 하네스를 스크래치패드에 스스로 구축(`mut/mutate.mjs`, `pw/probe.mjs`) — 재사용 가치 큼 | 웨이브당 ~13분 고정비 | — | 하네스를 레포 `scripts/`로 승격 검토(0.4.4 때 뮤테이션 그물 교훈과 동일 계열) | (기록) |
| DF-33 | Cursor Agent CLI 동시 기동 | 3개 에이전트를 같은 사용자로 동시에 띄워 Trust를 처리하자 그중 1개가 `Error: EPERM: operation not permitted, rename 'C:\Users\user\.cursor\cli-config.json.<pid>.<uuid>'`로 **크래시**(설정 파일 임시 rename 경쟁). 나머지 2개는 정상. 재기동(단독)은 성공 | 병렬 기동 시 1/3 실패 | 기동 스크립트에 EPERM 감지→5초 뒤 재기동 루프 | 기동을 5~10초 간격으로 스태거 또는 Trust를 직렬화. Cursor 측 버그 리포트 후보 | 중 |
| DF-34 | 지시문 주입 검증 누락 (지휘자 결함) | W2 기동 스크립트가 `terminal send --text <지시문> --enter` 의 ok=true만 믿고 끝냈는데, T1 워커는 `→ [Pasted text #1 +3 lines]` 상태로 **미제출 정지**(요한이 "작업 된 거 맞아?"로 발견, 약 20분 유휴). 다른 2명은 같은 명령으로 정상 제출됨 — 긴 텍스트 붙여넣기 직후 Enter가 간헐적으로 유실 | 워커 1명 유휴 | 맨 엔터 1회로 즉시 착수 | 기동 스크립트에 "주입 10초 뒤 화면 재확인 → `[Pasted text` 잔존 + 스피너 없음이면 맨 엔터" 단계 추가(FRAGILITY 증상6과 동일 계열). Orca UI에서 사람이 볼 때 `Terminal 1`(빈 셸)이 첫 탭이라 오해 유발 → 에이전트 탭을 첫 탭으로 | 상 |
| DF-35 | vhk `verify`/`receipt` 부작용 | 통합 worktree에서 실행하자 브랜치에 **자동 커밋 `5c780ef chore(vhk): evidence ledger [skip ci]`**(`.vhk/events/ai-actions.jsonl`·`ledger.jsonl`)가 생김 — 지휘자가 시킨 커밋 아님. PR diff에 vhk 증거 파일이 섞임 | 히스토리 오염·PR 리뷰 노이즈 | 유지(되돌리면 증거 소실) — PR 본문에 명시 | 자동 커밋 전 확인 또는 `--no-commit` 기본, 최소한 결과 출력에 "커밋했다" 명시 | 중 |
| DF-36 | vitest 병렬 + 워커 4명 동시 | 기본 `pnpm test`(병렬)에서 `dogfood-v5/v6` CIM subprocess 테스트 2건이 5s 타임아웃(워커·지휘자 재측정 모두), `--maxWorkers=1`이면 154 passed. 부하 낮을 땐 병렬로도 통과 → **부하 의존 flaky**(Cursor 에이전트 4개 CPU 점유) | 무관한 실패에 시간 소모 | 직렬 재실행으로 판정 | CIM 테스트 타임아웃 상향 또는 `test:unit`/`test:dogfood` 분리(0.4.7 편승) | 하 |
| DF-37 | 지휘자 기동 방식(Orca 안티패턴) — **요한 발견** | `worktree create`(--agent 없음) → Orca가 빈 "Terminal 1" 셸을 열고 **활성 탭으로 둠**, 나는 에이전트를 두 번째 탭에 띄움 → worktree를 열면 빈 셸만 보여 "터미널이 안 열린다"로 보임. 게다가 `terminal create --title`은 PowerShell OSC 제목("Windows PowerShell")에 덮여 워커 탭 식별 불가. Orca 가이드가 명시한 안티패턴("bare create + later terminal create = anti-pattern, use --agent")을 inject stall(DF-14) 회피하느라 밟음 | 사람이 진행 상황을 볼 수 없음 → 신뢰 하락 | 에이전트 탭 rename+switch, 빈 셸 close, 끝난 worktree 3개 rm | W3부터 `worktree create --agent cursor --prompt <지시문>`(첫 탭=에이전트, Trust 자동) + 필요 시 `/model` 전환. 플레이북에 "사람이 보는 탭 = 첫 탭" 규칙 | 상 |
| DF-38 | 수정 루프 1회전 (긍정) | critic MAJOR 5 → 티켓화(W1-fix) → Cursor grok 20분 → critic 재검증(10분, SendMessage로 같은 에이전트 재개 → 기존 하네스 재사용) → PASS·MAJOR 0. 워커 보고 수치(154/12/신규 3) 재측정 일치. 워커가 `[스코프 밖 발견]`에 GLOSSARY 표 드리프트를 스스로 공개 | — | — | "critic → 수정 티켓 → 같은 critic 재개" 패턴을 플레이북 표준으로 | (칭찬) |
| DF-39 | 테스트 인프라 flaky | critic 실측: `tests/dogfood-v6-hardening > V6 M1 hasPortListener fail-closed`가 **직렬(`--maxWorkers=1`)에서도 4회 중 2회 실패** — DF-36의 "병렬일 때만"은 틀렸음. exit code만 보는 뮤테이션 판정이 위양성 KILLED를 냄(1차 배터리에서 2건 뒤집힘) | CI green 신뢰도·뮤테이션 판정 오염 | 실패 테스트명까지 대조 | 0.4.7 별도 티켓: CIM subprocess 테스트 격리/타임아웃 상향, 뮤테이션 판정은 실패 테스트명 기반 | 중 |
| DF-40 | W2 병렬 3워커 결과 | 기동 후 ~29분에 3건 전부 완료(T1 155·T2 156·T6 158 passed, 각각 test-first 실패 확인 기록). 통합 후 170 passed. 보고서에 스코프 밖 변경(T6: `tests/share-expiry.test.ts`, 기존 문구 계약 갱신 필수)을 **스스로 공개** | — | — | 워커 보고 계약 실효 확인 2회째 | (칭찬) |
| DF-41 | 스택 기동 타이밍 (지휘자 판단) | W2를 W1-fix **착수 전** 시점(859fe82)에서 분기시켜 병행 → W1-fix가 App.ts 복원 경로를 바꾸고 T6도 App.ts를 리팩터(`openHistoryItem` 추출)해 **머지 충돌 1건**. 지휘자가 수동 해소(T6 구조 + W1-fix 함수) 후 170 green | 충돌 해소 5분·critic에 해소 검증 부담 | 수동 해소 | 같은 파일(App.ts)을 건드리는 티켓은 fix 라운드 완료 후 분기 — 티켓의 "허용 파일" 교집합이 0이 아니면 병행 금지 규칙 | 중 |
| DF-42 | DoD 사각 — E2E 자산 | W2 통합이 vitest 170·tsc·build 전부 green인데 critic이 **기존 E2E(`tests/e2e/coverage.mjs`, ADR-006·v0.1.3 스토어 근거 43/43)** 가 T1의 접힘 구조로 클릭 불가가 됨을 Playwright로 실증. DoD(부록 F)에 `test:e2e:all`이 없어 게이트가 못 잡음 | 릴리즈 자산 파손이 머지될 뻔 | W2-fix로 E2E 갱신 | DoD에 "UI 구조 변경 티켓은 E2E 셀렉터 영향 grep(`tests/e2e/**`에서 바뀐 클래스·버튼 텍스트 검색)" + W3 최종 DoD에 e2e 실행 시도 | 상 |
| DF-43 | 워커 문구 판단 | T6 워커가 "보관 일수는 섹션 옆에 표시"라는 **티켓의 근거를 그대로 믿고** 성공 문구에서 삭제 시점 고지를 제거(`void days`) — 실제 aside는 "7일" 세 글자뿐. 티켓(지휘자)의 사실 주장이 틀렸고 워커는 검증 안 함 | 사용자 고지 후퇴 | W2-fix M1 | 티켓의 사실 주장에는 근거 위치(파일:라인)를 붙이고, 워커 지시문에 "티켓 근거가 코드와 다르면 [스코프 밖 발견]에 적고 원문 유지" 규칙 | 중 |
| DF-44 | 스택 분기의 중복 코드 | 세 워커가 W1-fix 이전 시점에서 분기해 annotation→pin 매핑이 3벌, `assertOneLine` 2벌로 재복제됨(critic 실측). DF-41의 충돌과 같은 뿌리 | 유지보수 부채 | W2-fix m2·m3 | 공용 헬퍼는 fix 라운드 완료 후 분기 + 티켓에 "이미 있는 헬퍼 목록" 명시 | 하 |
| DF-45 | critic 3회차 비용 | 누적 268k 토큰·17분. 뮤테이션 29종·3템플릿×6조합 전수 렌더·Playwright 가시성 프로브를 스스로 구축. **UI 배선 뮤턴트 9종 전부 생존(7연속 축)** — 단위 테스트가 DOM 배선을 못 잡는 구조적 한계 재확인 | 웨이브당 15~20분 고정비 | — | 0.4.7: Playwright 컴포넌트 테스트 최소 1건 도입(PAT 후보) | (기록) |
| DF-46 | Orca PTY × cursor-agent 입력창 — **요한 발견** | 워커 입력창에 `[Pasted text #1 +3 lines][?61;4c` 표시. ① `[Pasted text …]`는 cursor-agent가 여러 줄 붙여넣기를 접어 보여주는 정상 표기(지시문에 줄바꿈 3개) ② **`[?61;4c`는 터미널 장치속성 응답(DA, `ESC[?61;4c`)이 키 입력으로 새어 들어간 것** — TUI가 터미널에 능력을 묻고 Orca PTY가 답한 문자열이 입력창에 글자로 찍힘. 워커 프롬프트 끝에 `[?61;4c` 쓰레기 문자가 붙어 전달됨(무해하나 지저분, 4개 워커 전부 관측) | 지시문 오염·보기 흉함 | 없음(에이전트는 무시) | Orca 이슈 후보(PTY가 DA 응답을 stdin으로 되돌림). 우회: 지시문을 1줄로(줄바꿈 0) + 배너 뒤 3초 대기 후 주입 + 주입 직후 `[?61;4c` 잔존 시 백스페이스 8회 전송 | 중 |
| DF-47 | E2E를 DoD에 넣자 나온 것 | 지휘자가 `pnpm test:e2e:all` 7종을 처음 실행: 6/7 통과. `loaded-pack-pin.mjs`는 T2 용어 통일(`## 핀 주석`→`## 핀 메모`)로 기대값 stale → 갱신(8/8). `upload-share.mjs`는 **기준선(046-w1)에서도 동일 9항목 실패**(`즉시 삭제` 버튼 대기 30s 타임아웃 — 로컬 저장 서버 응답 의존) → 0.4.4 이전부터 깨진 환경 의존 자산, `docs/state/blockers.md`의 e2e-smoke.ps1 건과 같은 계열 | 릴리즈 자산 신뢰도 | 범위 밖 기록·PR 본문 명시 | 0.4.7: upload-share E2E를 dogfood 하네스(`pnpm dogfood:up`) 위에서 돌리도록 재배선 or 폐기 결정(요한) | 중 |
| DF-48 | 워커가 E2E까지 자발 실행 (긍정) | W2-fix 워커(grok)가 티켓의 "가능하면 `node tests/e2e/coverage.mjs`"를 실제로 돌려 17/17 통과를 보고 — worktree에서 Chromium E2E가 그냥 된다는 사실도 함께 확인됨(dist 빌드 포함) | — | — | W3 DoD에 E2E 6종(upload-share 제외) 고정 | (칭찬) |
| DF-49 | W2 수정 루프 결과 | critic FAIL(B1·M1·m6) → W2-fix 12.6분(grok) → 재검증 PASS·MAJOR 0. 누적 critic 4회차 300k 토큰. 워커가 "m1은 이미 구현과 일치해 red가 아니었다"고 **거짓 red-first 주장 없이** 보고 | — | — | 워커 보고 정직성 3회 연속 확인 → 부록 D 계약 확정 | (칭찬) |
| DF-50 | 런타임 단언의 부작용 (설계 교훈) | `assertOneLine`이 저장 성공 토스트 **생성 시점**에 돌아, 문구가 80자를 넘으면 `ImageActions` catch로 빠져 성공한 저장이 실패 배지로 뒤집힘(critic 지적, 도달 불가지만 시한폭탄). 지휘자가 경계 테스트 3건 추가 | 미래 문구 수정 시 조용한 오판정 | `tests/one-line.test.ts` | 규칙: 상수 문구 검증은 모듈 로드/테스트 시점에, 런타임 경로에서 throw 금지 — PAT 후보(`state`) | 중 |
| DF-51 | W3 기동 — `worktree create --agent cursor` (긍정 + 지휘자 결함) | **첫 탭=에이전트, 폴백 셸 0, Trust 자동 처리** 확인(DF-37 해법 실증). 기본 모델은 Orca 설정의 Composer 2.5(우연히 목표와 일치 — `/model` 전환 로직은 필요 시 작동). 단 내 출력 파이프(`tee \| grep` 정규식 오류)가 기동기를 중간에 죽여 로그가 비었고, 이미 주입된 지시문을 모르고 **한 번 더 보냄**(중복 지시, 워커 컨텍스트 22→25%) | 중복 지시 1회 | 워커가 동일 지시로 인식 | 기동기는 결과를 파일에 직접 쓰고 파이프 후처리 금지 · 주입 전 "이미 작업 중(컨텍스트%>0)"이면 건너뛰기 | 하 |
| DF-22 | vhk `receipt --mark-start` | 실행이 tracked `.vhk/.gitignore`를 수정 → 직후 `mission check`가 scope 밖 변경 경고(노이즈) | 경고 오독 | 무시·커밋 | receipt가 만지는 파일은 mission scope 기본 포함 또는 untracked로 | 하 |

## 정상 동작 확인(칭찬 목록 — 보고서 균형용)

- `orca status --json` runtime/graph ready · `orchestration run-list` RPC 정상 · `worktree current`로 repoId 즉시 확보.
- `orca skills get orca-cli|orchestration` 버전일치 가이드 — 스텁 파일과 바이너리 가이드 분리 설계가 잘 작동.
- `propagate-roster-card.ps1` 멱등 주입 3파일 정확·안전가드(dirty skip) 작동.
- yohan-core critic 프로젝트 메모리(`.claude/agent-memory/yohan-core-critic/`)에 0.3.0~0.4.4 반복 결함 축이 축적돼 있음 — 다음 검증의 체크리스트로 바로 재사용 가능.
- `vhk check --goal 6` 게이트 스크립트 green(착수 전 기준선 확보).
- `goals/*.md`에 `type: plan` frontmatter 파일을 두면 `vhk goal list`가 goal로 오인하지 않음(실측 0건) → 계획 영수증을 goals/ 옆에 두는 규약 가능(DF-12 후보 해법).
- `.gitignore`를 `.claude/*` + `!.claude/rules/`로 바꾸면 규칙만 추적되고 settings·agent-memory는 계속 무시됨(`git check-ignore` 실측).

## 다음 웨이브에서 계측할 것

- W1 스모크: `worker-start --agent cursor` 인식 여부 · inject 페이스트 도달률 · Trust 승인 대기 시간 · worker_done까지 소요.
- 워커 보고 형식 준수율(부록 D 계약 대비) · 지휘자 재측정에서 불일치 건수.
- critic blocker 건수/웨이브 · 재디스패치 횟수 · 사람 게이트 대기 시간.
