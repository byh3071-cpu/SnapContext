---
vhk_format: 1
type: goal
id: 6
title: 0.4.6 — 프롬프트 UX 다듬기 (payload 숨기기·다이어트·안내·용어·핀 1비트·저장 배지)
status: IN_PROGRESS
priority: P1
version: v0.4.6
---

# Mission

> **구현 계획 영수증(승인 대기, 2026-08-29):** `goals/6-046-ux-polish-plan.md` — 웨이브·투입 AI·Orca 실행 시퀀스·결재 항목. 승인 전 구현 금지.

AI용 payload를 사람 화면에서 치우고, 프롬프트 노이즈를 빼고, 다음 행동을 알려주고, 한 뜻엔 한 단어만 쓴다. **ext-only** — worker 무변경. 스펙 SoT: `docs/PRD-0.4.6.md` (**approved** 2026-08-17 — D1~D3 확정: 용어 사전·버그/참고·스마트 디폴트).

## 착수 조건

- 0.4.3 랜딩(tag). worker 트랙 0.4.4~0.4.5와 병행 가능 — 단 동시 작업 시 worktree 분리.

## Done when

- [ ] T1 payload 숨기기 — 요약 카드 + 원문 접기 (ContextPackPanel.ts)
- [ ] T2 프롬프트 다이어트 — 기본 최소, 상세 메타는 bug+막힘 핀 조건부 (templates + prompt-builder.ts)
- [ ] T3 다음 행동 안내 1줄 — 복사 후·저장 후 (toast.ts 등)
- [ ] T4 용어 통일 — 용어 사전 SoT 문서 + ext UI·docs 전수 (worker 문구는 0.4.7)
- [ ] T5 핀 의도 1비트 — PinItem.kind 막힘/참고, 하위호환 (types·PinAnnotation·PinMemoList)
- [ ] T6 저장 상태 배지 — 저장됨/실패+재시도, 조용한 실패 0 (upload.ts·ImageActions·HistoryList)
- [ ] DoD: pnpm test green(신규 테스트 포함) + tsc + vite build + mission check 0 + 금지 용어 grep 0
- [ ] 수동 QA 첫 15초 흐름 + tag `v0.4.6` (사람)

## Gate

`node scripts/check-goal-6.mjs` — manifest 0.4.6 + PRD-0.4.6 status approved 이상 + 금지 용어 grep 0
