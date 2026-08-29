---
id: report-worker-report-contract
date: 2026-08-30
tags: [dogfood, orchestration, worker-contract, yohan-agent-kit]
status: proposal
---

# 보고서 ③ — 워커 보고 규약 제안: "하위 모델이 끝났을 때 지휘자에게 이렇게 보고하라"

> 대상 정본: yohan-agent-kit `ops/orca/playbooks/cli-tooling/worker-*.md`·`dispatch-snippets.md`, yohan-brain `memory/core/orca-task-contract.md`(Implementer done 절). **정본은 고치지 않았다** — 여기는 실측과 제안뿐.
> 근거 데이터: 이번 0.4.6에서 워커 9명(Cursor grok 4.6 ×7, Composer 2.5 ×2)의 보고 9건 + 스모크 4건. 원장 DF-20·25·29·40·43·49·52.

## 1. 결론 한 줄

7항 고정 형식을 지시문에 넣었더니 **9/9 워커가 형식을 지켰고, 보고 수치 13개(테스트 수·파일 수·grep 건수)가 지휘자 재측정과 전부 일치**했다. 과거(0.4.0 P1P2: 보고 118 vs 실측 116)의 자기감사 오류가 사라졌다. 그래서 규약을 v2로 확정하되, 실측에서 드러난 구멍 3개(스코프 밖 발견의 누락·티켓 근거 오류의 맹종·완료 신호 중복)를 막는 항목을 더한다.

## 2. 실측 — 현행 7항 규약 준수 현황

| 워커/티켓 | 형식 준수 | 수치 일치 | 스코프 밖 공개 | red-first 정직 | 특이 |
|---|---|---|---|---|---|
| grok / 스모크 ×4 | ✅ | — | ✅ | — | 거절당하자 ask→escalation→status 순 에스컬레이션 후 지휘자 대기 |
| grok / T5 | ✅ | ✅ 151·신규 9 | ❌ "없음" — 실제로는 라이트박스 미반영(critic 발견) | ✅ | 정정 1줄을 W1-fix에서 추가 |
| composer / T4a | ✅ | ✅ 6→0 | ✅ docs 잔존·Export 절 미수정 | ✅(문서 티켓에도 red 확인) | 상태 메일 명령의 마침표를 인자로 복사(지휘자 지시문 결함) |
| grok / W1-fix | ✅ | ✅ 154·12·신규 3 | ✅ GLOSSARY 표 드리프트 자기 공개 | ✅ | 병렬 flaky를 직렬 재실행으로 판정 |
| grok / T1+T3a | ✅ | ✅ 155·신규 4 | ✅ 히스토리 행 토스트 범위 밖 명시 | ✅ | — |
| grok / T2 | ✅ | ✅ 156·신규 6 | ✅ 엔진 최소 수정 근거 명시 | ✅(5 failed 확인) | 렌더 예시 2개 첨부(티켓 요구) |
| grok / T6+T3b | ✅ | ✅ 158·신규 7 | ✅ **허용 목록 밖 `tests/share-expiry.test.ts` 수정을 스스로 공개** | ✅ | 티켓의 잘못된 근거("보관 일수는 옆에 표시")를 그대로 믿음 → MAJOR |
| grok / W2-fix | ✅ | ✅ 170 | ✅ | ✅ **"m1은 이미 구현과 일치해 red가 아니었다"고 정직 기재** | E2E 17/17 자발 실행 |
| composer / T4b | ✅ | ✅ 173·게이트 5항 | ✅ GLOSSARY 의도적 잔존·Export 절 | ✅(게이트 4항 ✗ 확인 후 청소) | **티켓의 틀린 행 번호를 정정 보고** |

관찰: 형식·수치·정직성은 이미 합격. 새는 곳은 **① "스코프 밖 발견"이 자기 파일 밖을 안 보고 "없음"이라 씀(T5)** ② **티켓의 사실 주장을 검증 없이 따름(T6)** ③ 완료 신호 채널 혼선(마침표 복사·메일 2통·PS 인용 깨짐).

## 3. 제안 — 워커 보고 규약 v2

### 3-1. 보고 본문 (report.md = 상태 메일 body, 8항)

```text
[결과] 성공|실패|NOOP — 한 줄
[변경] 경로: 무엇을 (파일당 1줄)
[검증] 실행 명령 + 원문 수치 (요약 금지. 예: vitest → 23 files / 173 passed · tsc 0 · vite build OK · E2E coverage 17/17)
[테스트] 신규/수정 테스트 이름 · 먼저 실패 확인: 예(무엇이 실패했는지) | 아니오(이유)
[스코프 밖 발견] 허용 파일 밖에서 같은 패턴/심볼을 grep한 결과 (명령 + 건수). "없음"은 grep 결과가 0일 때만
[근거 불일치] 티켓·지시문의 사실 주장(파일:라인·"이미 표시됨" 등)이 코드와 다른 곳 — 다르면 원문 유지하고 여기 기록
[가정·미해결] 
[다음] 지휘자 결정이 필요한 것 1개 이하
```

변경점 = 5항에 **grep 명령·건수 강제**(T5 재발 방지) + **[근거 불일치] 신설**(T6 재발 방지).

### 3-2. 완료 신호 (2중 채널, 정확히 1회)

| 채널 | 규칙 |
|---|---|
| 파일 | `docs/tickets/<ver>/<T>.report.md`를 **같은 브랜치에 커밋** — 지휘자 감시의 1순위 채널(메일보다 먼저 잡힘, DF-28) |
| 메일 | `orca orchestration send --type status --to run:<run> --subject "DONE:<task> <T>" --body "<[결과]·[변경] 두 줄>" --json` — **정확히 1통**, 실패해도 재전송은 1회까지 |
| 금지 | `worker_done`(dispatch 없는 manual-send에서는 거절됨) · `ask`/`check --wait`로 지휘자 대기 · 채팅 "done" |

### 3-3. 지시문 쪽 규약 (지휘자가 지킬 것 — 워커 결함 6건 중 4건이 지시문 탓)

- 명령은 **별도 줄·문장부호 없이**(마침표를 인자로 복사함, DF-25). 전체 지시문은 **한 줄**(줄바꿈이 있으면 접힌 페이스트로 표시돼 사람이 못 읽음, DF-46).
- 티켓의 사실 주장에는 **파일:라인 근거**(DF-43). 행 번호는 "참고값"이라고 명시.
- 허용 파일 목록에 "이미 있는 공용 헬퍼" 명시(중복 3벌 방지, DF-44).
- 주입 12초 뒤 **제출 확인**(스피너/컨텍스트%) — `send ok=true`는 제출 증거가 아님(DF-34).
- 커밋 trailer `Co-authored-by: Cursor <cursoragent@cursor.com>` 유지(귀속, DF-27).

### 3-4. 지휘자 쪽 수신 규약

1. 보고를 받으면 **[검증] 수치를 반드시 재측정**(이번엔 13/13 일치했지만 규칙은 유지).
2. [스코프 밖 발견]의 grep을 지휘자가 한 번 더 돌린다(다른 파일에서 같은 심볼).
3. critic에 넘길 때 워커 보고를 "주장"으로, 지휘자 재측정을 "사실"로 구분해 전달.
4. 다른 눈 원칙: 만든 벤더 ≠ 검수 벤더. Claude가 고친 1글자라도 PR 본문에 작성자를 적는다.

## 4. 정본 반영 제안 (패치 초안 — 적용은 요한/노뚝이)

| 정본 | 위치 | 제안 |
|---|---|---|
| yohan-brain `memory/core/orca-task-contract.md` | Implementer `done:` 4항 | 위 3-1 8항으로 교체 + "완료 신호 2중 채널" 표 추가 + `worker_done`은 dispatch 있을 때만 |
| yohan-agent-kit `cli-tooling/worker-cursor.md` | Dispatch 템플릿 | 한 줄 지시문 템플릿으로 교체(3-3), `--trailer` 규칙 추가 |
| yohan-agent-kit `cli-tooling/dispatch-snippets.md` | Cursor impl | `worker_done` 문구를 "status 메일 DONE + report.md 커밋"으로 |
| 로스터 `orca_patterns.rules` | — | `report_numbers_verbatim`·`out_of_scope_requires_grep`·`ticket_claims_need_line_refs` 3줄 추가 |

## 5. 기각·보류

- "워커가 지휘자에게 질문(ask)할 수 있게" — dispatch 없는 manual-send에서는 `ask`가 거절되고, 있어도 지휘자 블로킹이 생긴다. **막히면 실패 보고 후 정지**가 더 빠르다는 게 실측(전 워커 0 질문으로 완주). 보류.
- 보고를 JSON으로 — PowerShell 인용 깨짐이 심해 텍스트 7항이 더 안전. 기각.
