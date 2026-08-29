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
