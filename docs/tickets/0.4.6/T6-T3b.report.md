[결과] 성공 — 저장 상태 배지(저장됨/실패+재시도)·저장 후 안내 1줄·M7 무음 catch 제거를 넣었다
[변경] src/storage/save-status.ts: SaveStatus·SaveResult·applySaveResult·saveBadgeLabel 순수 함수 신설
[변경] src/storage/history.ts: CaptureHistoryItem에 saveStatus?·savedCaptureId?·saveError? 추가 · updateSaveStatus(id, r) (history-updated 발신)
[변경] src/sidepanel/components/ImageActions.ts: onSaveResult·saveCurrent() · 성공 시 반환 id/expiresAt, catch 시 failed+기존 error toast
[변경] src/utils/share-expiry.ts: 성공 문구 1줄(보관 일수 제거) · assertOneLine(줄바꿈 0·80자 이하)
[변경] src/sidepanel/components/HistoryList.ts: meta 배지(--saved/--failed) · 실패 항목만 재시도 버튼(aria-label 저장 재시도, stopPropagation)
[변경] src/sidepanel/App.ts: onSaveResult→updateSaveStatus(currentHistoryId 없으면 toast) · onRetrySave=onOpen 후 saveCurrent · M7 catch에 toast
[변경] src/sidepanel/styles/global.css: .capture-history__save-badge--saved/--failed · .capture-history__retry (기존 토큰만)
[변경] tests/save-status.test.ts: applySaveResult 전이·saveBadgeLabel·성공 문구 assertOneLine 7건
[변경] tests/mcp-onboarding-0.4.2.test.ts: 성공 문구를 새 1줄에 맞게 갱신
[변경] tests/share-expiry.test.ts: 동일 문구 계약 갱신(기존 성공 문구 검증, 안 고치면 pnpm test 빨강)
[변경] docs/changelog.md: 0.4.6 진행 중 절에 CaptureHistoryItem 3필드 1줄
[검증] pnpm test(기본 timeout 5s)는 dogfood CIM 조회가 7s를 넘겨 간헐 타임아웃 · `pnpm exec vitest run --testTimeout 15000` → 21 files / 158 passed (신규 save-status 7) · pnpm build → version-sync OK 0.4.3 · tsc 0 error · vite build OK (1.28s, 46 modules) · grep -n "catch {" src/sidepanel/App.ts → 649·687·711 세 곳 모두 showToast 있음(빈 catch 0)
[테스트] tests/save-status.test.ts (applySaveResult saved/failed/재시도 전이 · saveBadgeLabel undefined/저장됨/실패 · buildPrivateSaveSuccessMessage assertOneLine·캡처 분석해줘·업로드 미포함) · 먼저 실패 확인 예 (Cannot find module save-status)
[스코프 밖 발견] ContextPackPanel·toast.ts·prompt-builder·템플릿·types/index.ts·upload.ts 네트워크 계약·worker/** · 없음(손대지 않음)
[가정·미해결] 실패 배지는 레드 잠금(R5)을 피해 var(--ink)/var(--paper) 반전. 확장 사이드패널 DOM은 이 세션에서 브라우저 미검증. pnpm test 기본 5s는 이 머신에서 dogfood-v5/v6 CIM이 간헐 초과(단독 재실행·timeout 15s는 통과) — T6-T3b 파일 아님.
[다음] 없음
