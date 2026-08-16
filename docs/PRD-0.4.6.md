---
id: prd-0.4.6
date: 2026-08-17
status: approved
tags: [ux, prompt, terminology, extension, v0.4.6]
---

# SnapContext 0.4.6 — 프롬프트 UX 다듬기 (사람에게 친절해지기)

## 한 줄 목표

AI용 payload(원문 마크다운)를 사람 화면에서 치우고, 프롬프트에서 노이즈를 빼고, 다음 행동을 알려주고, 한 뜻엔 한 단어만 쓴다. **ext-only** — worker 무변경.

> 근거 대화: 2026-08-17 브레인스토밍(로드맵 트랙 F 0.4.6 행). 배경 진단: "AI 프롬프트가 띡 나오는 구조가 낯설다" = AI-facing payload를 human-facing UI에 그대로 노출 + 메타데이터 노이즈 벽 + 산출 후 행동 공백.

## 왜 지금

- 0.5.0 = 외부 사용자 가치검증인데, "써보니 좋더라"는 첫 15초(캡처→건네주기)에서 결판난다. 그 15초의 마찰 3개(낯선 원문·노이즈·행동 공백)를 외부 유입 전에 제거.
- ext-only라 **0.4.6 랜딩 후 일괄 재심사**(0.4.2·0.4.3·0.4.6)에 편승 — 추가 심사 사이클 0.
- worker 트랙(0.4.4~0.4.5)과 코드가 안 겹쳐 병행 가능.

## 스코프 — 티켓 6

### T1. payload 숨기기 (`src/sidepanel/components/ContextPackPanel.ts`)

- 프롬프트 생성 결과를 원문 텍스트 대신 **요약 카드**로: 템플릿 종류 · 핀 N개 · 이미지 유무 · 추가 메모 유무 + 복사 버튼 1개.
- 원문은 "자세히 보기" 접기(기본 접힘). 복사 동작은 기존과 동일(원문 전체).

### T2. 프롬프트 다이어트 (`prompts/templates/*.md` + `src/context-pack/prompt-builder.ts`)

- 기본 출력 = URL + 핀(메모 중심) + 요청 1줄.
- UA·뷰포트·캡처방식·핀 좌표% = **버그 의도(bug 템플릿) + T5 "버그" 핀 존재 시에만** 포함.
- 템플릿의 형식적 4항 지시문 축소 — 사용자의 핀 메모가 본문 최상단.

### T3. 다음 행동 안내 1줄 (`src/sidepanel/toast.ts` · ContextPackPanel · ImageActions)

- 복사 직후: "AI 대화창에 붙여넣고 이미지를 함께 첨부하세요."
- `내 AI에 저장` 성공 직후: "Claude Code·Cursor에서 '방금 캡처 분석해줘'라고 하면 읽습니다."
- toast 또는 카드 하단 고정 1줄 — 어느 쪽이든 **1줄 초과 금지**.

### T4. 제품 용어 통일 (ext UI 문자열 + 레포 문서 전수)

용어 사전(확정):

| 개념 | 확정 용어 | 금지(혼용 중) |
|---|---|---|
| 화면을 찍은 것 | 캡처 | 캡쳐·스냅·스크린샷 |
| 핀+메모 | 핀 메모 | 주석·어노테이션(코드 내부 식별자는 유지) |
| 화살표·형광펜·가리기·자유선 | 그리기 도구 | 주석 도구·annotation |
| AI에게 줄 묶음 | 컨텍스트 팩 | Context Pack·프롬프트 팩 |
| 서버 저장 행위 | 내 AI에 저장 | 업로드·공유 |

- 실태(2026-08-17 grep): src는 이미 통일 완료(캡처 102 · 캡쳐/스냅/스크린샷 0) — **docs의 "캡쳐" 59건**과 UI의 "주석" 표기가 주 청소 대상.

- 적용 범위: ext UI 문자열·README·docs. **worker/MCP instructions 문구는 0.4.7 편승**(ext-only 유지 — 로드맵 트랙 F 주기).
- 산출물: 위 표를 `docs/CONTEXT-PACK-SPEC.md` 또는 신규 `docs/GLOSSARY.md`에 SoT로 고정.

### T5. 핀 의도 1비트 (`src/types` PinItem · PinAnnotation.ts · PinMemoList.ts)

- `PinItem.kind?: 'bug' | 'ref'` (버그/참고, optional — 기존 핀 하위호환).
- UI = 핀 생성·편집 시 토글 1개(기본 '참고'). 폼·드롭다운 금지. '버그' 툴팁: "예상과 다르게 동작해요" (Marker.io 방식 — 진단 부담 제거).
- T2의 상세 메타 포함 조건과 연동: '버그' 핀 존재 = 디버그성 컨텍스트로 판단.

### T6. 저장 상태 배지 (`src/utils/upload.ts` · ImageActions.ts · HistoryList.ts)

- `내 AI에 저장` 결과를 항목 단위 배지로: **저장됨 ✓ / 실패 ⚠(재시도 버튼)**.
- 조용한 실패 금지 — 실패는 반드시 보이게(작업 3원칙 §2와 정합).
- 표기는 T4 용어 사전 준수("저장됨", "업로드됨" 아님).

## 확정된 결정 (2026-08-17 요한 A — 조사 검증)

| # | 결정 | 근거 |
|---|---|---|
| D1 | 용어 사전 = T4 표 (캡처·핀 메모·그리기 도구·컨텍스트 팩·내 AI에 저장) | 국립국어원 외래어 표기법 "캡처" + src 실측 이미 통일(캡처 102·이형 0) — 코드가 정한 걸 문서가 따라감 |
| D2 | 핀 라벨 = **"버그 / 참고"** | Marker.io 기본 이슈 타입 2종(Bug/Improvement) = 1비트 업계 선례. 라벨은 관례어 "버그", 진단 부담은 툴팁 설명문으로 해소. "메모"는 핀 메모와 충돌해 탈락 |
| D3 | 다이어트 = **스마트 디폴트** (기본 최소 + bug 템플릿·버그 핀 시 조건부 상세, 설정 토글 없음) | Jared Spool 실증 — 설정 변경 사용자 <5%. 토글은 95%에게 부재 기능. 정보 손실 탈출구는 T1 "자세히 보기" |

**조사 출처**: [국립국어원 외래어 표기법](https://www.korean.go.kr/front/page/pageView.do?page_id=P000104&mn_id=97) · [Marker.io Issue Types](https://help.marker.io/en/articles/10680532-issue-types) · [Jared Spool — Do users change their settings?](https://archive.uie.com/brainsparks/2011/09/14/do-users-change-their-settings/)

## 비목표

- 템플릿 시스템 재설계·의도 선택 리브랜딩(bug/refactor/reference 구조 유지 — 0.5.x)
- 핀 중심 프롬프트 재구성·첫 화면 3단계 온보딩 (0.5.x)
- worker 변경 일체 (MCP 문구 포함 — 0.4.7)
- 스토어 재심사 제출 — 0.4.6 랜딩 후 일괄(사람 게이트)

## 버전·문서 계약

- ADR-014 2트랙: ext 4값만 0.4.6 bump, worker serverInfo 무변경.
- T4 용어 사전 = 신규 SoT 문서 → changelog에 스키마·문서 변경 기록.
- T5 PinItem 확장 = `docs/changelog.md` 타입 변경 기록 + CONTEXT-PACK-SPEC 반영.

## 완료 기준 (DoD)

1. `pnpm test` green — 신규: T2 조건부 렌더(막힘 핀 유/무·템플릿별), T5 kind 하위호환(기존 팩 로드), T6 상태 전이(성공·실패·재시도).
2. `tsc --noEmit` + `vite build` 통과, `vhk mission check` 위반 0.
3. 용어 검사: 금지 용어(스냅·업로드됨 등) UI 문자열 grep 0건.
4. 수동 QA: 첫 15초 흐름(캡처→핀→요약 카드→복사→안내 1줄) + 실패 배지 재현.
5. tag `v0.4.6` (사람). 직후 일괄 재심사 제출 가능 상태(사람).
