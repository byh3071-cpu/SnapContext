# T1 + T3a — 컨텍스트 팩 요약 카드(원문 접기) + 복사 후 다음 행동 안내 (+ 편승 L12)

> 스펙 SoT: `docs/PRD-0.4.6.md` §T1·§T3·결정 D3. 계획: `goals/6-046-ux-polish-plan.md`(2-A). 용어 SoT: `docs/GLOSSARY.md`. 이 티켓 밖은 손대지 않는다.

## 목표

지금 컨텍스트 팩 패널은 "무엇이 복사되는지" 안 보여주고 버튼만 있다. 복사될 내용을 **요약 카드**(템플릿 종류 · 핀 N개(버그 M개) · 이미지 첨부 여부 · 추가 메모 여부)로 먼저 보여주고, 원문은 **"자세히 보기"(기본 접힘)** 에서만 보인다. 복사 버튼은 카드에 **1개**. 복사 직후 안내 1줄: **"AI 대화창에 붙여넣고 이미지를 함께 첨부하세요."** 안내 문구는 스크린리더에도 읽히게(편승 L12).

## 허용 파일

| 파일 | 할 일 |
|---|---|
| `src/context-pack/pack-summary.ts` (신규, 순수 함수) | `buildPackSummary(pack: ContextPack, template: PromptTemplateId, extras: { hasImage: boolean; userNote?: string }): PackSummary` → `{ templateLabel: '버그 리포트'\|'리팩토링'\|'레퍼런스', pinCount, bugPinCount, hasImage, hasUserNote }`. `bugPinCount`는 `pin-kind.ts`의 `pinKind` 사용 |
| `src/context-pack/next-action.ts` (신규) | `export const COPY_NEXT_ACTION = 'AI 대화창에 붙여넣고 이미지를 함께 첨부하세요.'` + `assertOneLine(msg)`(줄바꿈 없음·80자 이하, 아니면 throw) |
| `src/sidepanel/components/ContextPackPanel.ts` | ① `btnStack` 위에 요약 카드 `section.context-pack-panel__summary`(카드 항목 4개 + `btnPrompt` 이동) ② `details.context-pack-panel__raw`(summary 텍스트 "자세히 보기", 기본 접힘) 안에 `pre.context-pack-panel__raw-text`(열릴 때·복사 직후 `buildPromptText`로 갱신) + `btnJson`·`btnCopyAll` 이동 ③ `sync()`에서 카드 갱신, 캡처 없으면 카드 비활성 ④ 복사 성공 toast를 `COPY_NEXT_ACTION`으로(프롬프트·전체 복사 둘 다) ⑤ 382행 hint "AI용 디버그 프롬프트, JSON 팩 또는 주석이 포함된 PNG를 복사하세요." → "복사될 내용을 요약 카드에서 확인하고 AI 프롬프트를 복사하세요." · 섹션 제목 'AI 디버그 팩' → '컨텍스트 팩' |
| `src/sidepanel/toast.ts` | 편승 L12: `#toast-root`에 `aria-live="polite"` `role="status"`가 없으면 설정(첫 호출 시 1회). 시그니처 변경 없음 |
| 패널 스타일이 있는 CSS 1개 | `.context-pack-panel__summary`(카드·항목·비활성) · `.context-pack-panel__raw` 최소 스타일. 기존 토큰(CSS 변수)만 사용 |
| `tests/pack-summary.test.ts` (신규) | 아래 검증 |

## 순서 (test-first)

1. `tests/pack-summary.test.ts` 작성 → `pnpm test` **실패 확인**:
   - 핀 0개·메모 없음·이미지 있음 → `{pinCount:0,bugPinCount:0,hasImage:true,hasUserNote:false}`
   - 핀 3개 중 kind 'bug' 1개 → `pinCount:3,bugPinCount:1` · kind 없는 옛 핀은 참고로 셈
   - template 'bug'→'버그 리포트', 'refactor'→'리팩토링', 'reference'→'레퍼런스'
   - `COPY_NEXT_ACTION`이 `assertOneLine`을 통과(줄바꿈 0·≤80자)
2. 구현 → `pnpm test` 전부 초록 · `pnpm build` 통과.
3. DOM 테스트는 요구하지 않는다(순수 함수 분리로 대체). 단 E2E 계약 유지: 마지막 `.context-pack-panel__hint.muted`가 상태 힌트라는 기존 주석(호스트 append 순서) 깨지 않기.

## 금지

- `prompt-builder.ts`·템플릿(T2) · `ImageActions`/`HistoryList`/`upload`/`share-expiry`(T6) · `types/index.ts`(T5 완료분 사용만) · `worker/**` · `docs/**`(T4b).
- 새 문자열에 금지어(주석·어노테이션·업로드·공유·스냅·스크린샷·Context Pack) 사용 금지.
- 복사 동작·내용 변경 금지(원문 전체 그대로). 복사 버튼 수를 늘리지 않는다(카드 1개 + 접힘 안 보조 2개).
- master 커밋·push·merge 금지 · `git add -A` 금지 · 버전 파일 변경 금지.

## 완료 조건

- `pnpm test`·`pnpm build` 통과(수치 보고) · 허용 파일 밖 변경 0.
- 브랜치 `046-t1t3-summary-card`에 커밋. 메시지 예: `feat(0.4.6): T1 컨텍스트 팩 요약 카드 + 원문 접기 · T3a 복사 후 안내 1줄 · toast aria-live`.
- `docs/tickets/0.4.6/T1-T3a.report.md`(보고 형식 = `T5.md`와 동일 7항) 커밋 + 상태 메일 1통(지시문의 명령).
