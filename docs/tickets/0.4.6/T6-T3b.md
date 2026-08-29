# T6 + T3b — 저장 상태 배지(저장됨 / 실패+재시도) + 저장 후 다음 행동 안내 (+ 편승 M7)

> 스펙 SoT: `docs/PRD-0.4.6.md` §T6·§T3. 계획: `goals/6-046-ux-polish-plan.md`(2-C). 용어 SoT: `docs/GLOSSARY.md`. 작업 3원칙 §2(조용한 실패 금지)와 직결.

## 목표

`내 AI에 저장` 결과를 캡처 기록 항목마다 배지로 보인다: **저장됨 ✓ / 실패 ⚠ + 재시도 버튼**. 조용한 실패 0. 저장 성공 직후 안내 1줄: **"Claude Code·Cursor에서 '방금 캡처 분석해줘'라고 하면 읽습니다."** 편승 M7: 캡처 기록 저장 착수 실패를 삼키는 빈 catch(`App.ts` 620행 부근)를 없앤다.

## 허용 파일

| 파일 | 할 일 |
|---|---|
| `src/storage/save-status.ts` (신규, 순수 함수) | `type SaveStatus = 'saved' \| 'failed'` · `type SaveResult = { status:'saved'; id:string; expiresAt:string } \| { status:'failed'; message:string }` · `applySaveResult(item: CaptureHistoryItem, r: SaveResult): CaptureHistoryItem`(saveStatus·savedCaptureId·saveError 갱신, 성공 시 saveError 제거) · `saveBadgeLabel(item): '저장됨' \| '실패' \| null` |
| `src/storage/history.ts` | `CaptureHistoryItem`에 `saveStatus?: SaveStatus` `savedCaptureId?: string` `saveError?: string` 추가(하위호환 optional) · `updateSaveStatus(id, r: SaveResult)`(기존 `updateCaptureAnnotations` 패턴 + `snapcontext:history-updated` 발신) |
| `src/sidepanel/components/ImageActions.ts` | deps에 `onSaveResult(r: SaveResult): void` 추가. 저장 핸들러 성공 경로에서 `saveCaptureWithToken` 반환값(id·expiresAt)을 `onSaveResult({status:'saved',…})`, catch에서 `onSaveResult({status:'failed', message})` (기존 error toast 유지). 반환 API에 `saveCurrent(): Promise<void>`(저장 버튼 클릭과 동일 동작, 재시도용) 추가 |
| `src/utils/share-expiry.ts` | `buildPrivateSaveSuccessMessage(days)` 결과를 1줄로: `내 AI에 저장됨 — Claude Code·Cursor에서 '방금 캡처 분석해줘'라고 하면 읽습니다.` (보관 일수는 이미 섹션 옆에 표시되므로 문장에서 뺀다) · `assertOneLine`(줄바꿈 0·80자 이하) 같은 파일에 |
| `src/sidepanel/components/HistoryList.ts` | 항목 meta에 배지 `span.capture-history__save-badge` (`--saved`/`--failed`, 텍스트 '저장됨'/'실패', `title`에 saveError) · 실패 항목에만 재시도 버튼 `button.capture-history__retry`(aria-label '저장 재시도', `stopPropagation`, `deps.onRetrySave(item)`) · deps에 `onRetrySave` 추가 |
| `src/sidepanel/App.ts` | ① `onSaveResult` 배선: `history.updateSaveStatus(currentHistoryId, r)` (currentHistoryId 없으면 toast로 알림 — 조용히 넘기지 않음) ② `onRetrySave(item)`: 해당 항목을 현재 캡처로 연 뒤(`기존 onOpen 경로`) `imageActions.saveCurrent()` ③ 편승 M7: 620행 부근 `catch { /* … */ }` → `showToast('캡처 기록 저장을 시작하지 못했습니다.', 'error')` |
| 히스토리 스타일 CSS 1개 | `.capture-history__save-badge--saved/--failed` · `.capture-history__retry` — 기존 토큰만 |
| `tests/save-status.test.ts` (신규) · `tests/mcp-onboarding-0.4.2.test.ts` | 아래 검증 · 기존 성공 문구 검증을 새 문장에 맞게 갱신 |

## 순서 (test-first)

1. `tests/save-status.test.ts` 작성 → **실패 확인**:
   - `applySaveResult(item, {status:'saved', id, expiresAt})` → `saveStatus:'saved'`, `savedCaptureId`, `saveError` 없음
   - `applySaveResult(item, {status:'failed', message})` → `saveStatus:'failed'`, `saveError===message`
   - 실패 → 재시도 성공 전이: `applySaveResult(failedItem, saved)` → saved, saveError 제거
   - `saveBadgeLabel`: undefined→null, saved→'저장됨', failed→'실패'
   - 새 `buildPrivateSaveSuccessMessage(7)`가 `assertOneLine` 통과·"캡처 분석해줘" 포함·"업로드" 미포함
2. 구현 → `pnpm test`·`pnpm build` 통과. `tests/image-actions-contract.test.ts`(정적 소스 계약)가 깨지면 리팩터가 아니라 인자 누락인지 먼저 확인.

## 금지

- `ContextPackPanel`·`toast.ts`(T1) · `prompt-builder`·템플릿(T2) · `types/index.ts`(T5 완료분) · `upload.ts` 네트워크 계약 변경(반환 타입 그대로 사용) · `worker/**` · `docs/**`(T4b).
- 새 문자열에 "업로드·공유·주석·어노테이션" 금지 — "저장됨/실패/재시도/내 AI에 저장".
- master 커밋·push·merge 금지 · `git add -A` 금지 · 버전 파일 변경 금지.

## 완료 조건

- `pnpm test`·`pnpm build` 통과(수치 보고) · 허용 파일 밖 변경 0 · 빈 catch 0(`grep -n "catch {" src/sidepanel/App.ts` 결과 원문 보고).
- 브랜치 `046-t6t3-save-badge`에 커밋. 메시지 예: `feat(0.4.6): T6 저장 상태 배지+재시도 · T3b 저장 후 안내 1줄 · M7 무음 catch 제거`.
- `docs/tickets/0.4.6/T6-T3b.report.md`(보고 형식 = `T5.md`와 동일 7항) 커밋 + 상태 메일 1통(지시문의 명령). 타입 변경(`CaptureHistoryItem` 3필드)은 changelog에 1줄(`## 0.4.6 — 진행 중` 절, T5가 만든 절에 추가).
