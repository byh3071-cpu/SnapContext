[결과] 성공 — critic MAJOR 5건(F1~F6)을 046-w1에서 고쳤다. 토글은 제자리 갱신으로 포커스를 유지한다
[변경] tests/pin-kind.test.ts: restorePinsFromPack 3건 추가·인라인 복원 사본 제거 (먼저 실패 확인)
[변경] src/context-pack/pin-kind.ts: restorePinsFromPack 추출 (id·x·y·memo·kind, kind 없으면 undefined, memo null→'')
[변경] src/sidepanel/App.ts: onToggleKind가 memoList.updateKind 호출 · 히스토리 복원이 restorePinsFromPack 사용
[변경] src/sidepanel/components/PinMemoList.ts: updateKind(제자리 갱신, innerHTML 미사용) · 참고/버그 title·aria-label · 배치 메모→토글→삭제
[변경] src/sidepanel/components/ImageLightbox.ts: pinKind로 pin-badge--bug·의도 title 이식
[변경] docs/GLOSSARY.md: 검사 명령을 rg 2개로 교체 · 실측 55/48건 · W3 게이트 판정 명시
[변경] docs/tickets/0.4.6/T5.report.md: ImageLightbox kind 미반영 정정 1줄
[검증] pnpm exec vitest run tests/pin-kind.test.ts → 12 passed (함수 없음 실패 확인 후). pnpm test -- --maxWorkers=1 → 20 files / 154 passed (신규 3). pnpm build → version-sync OK 0.4.3 · tsc 0 error · vite build OK (3.19s). 기본 pnpm test(병렬)는 dogfood V5/V6 CIM 2건이 5s 타임아웃(허용 파일 밖·W1-fix 무관)
[테스트] restorePinsFromPack: treats every pin without kind as ref · preserves kind bug from a saved pack · maps null memo to an empty string · 먼저 실패 확인 예 (restorePinsFromPack is not a function)
[스코프 밖 발견] prompt-builder·템플릿·ContextPackPanel·ImageActions/HistoryList·worker/** 미수정. GLOSSARY 핀 의도 툴팁 표(참고 "—")는 F2 버튼 title과 불일치 — T4a 표라 이번 미수정. 기본 vitest 병렬 시 dogfood CIM 경합 타임아웃
[가정·미해결] F1은 코드로 확인(updateKind는 listRoot.innerHTML을 건드리지 않고 querySelector로 해당 .pin-memo__kind만 갱신). 사이드패널 DOM·키보드 포커스는 이 세션에서 브라우저 미검증
[다음] 없음
