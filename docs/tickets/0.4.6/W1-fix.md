# W1-fix — critic MAJOR 5건 수정 (브랜치 046-w1 직접)

> 근거: 2026-08-29 critic(opus) 적대 검증 — 판정 PASS, MAJOR 5. 이 티켓은 통합 브랜치 `046-w1`에서 수행한다(worktree = 현재 폴더). 티켓 밖은 손대지 않는다.

## 수정 항목

| # | 파일 | 결함(실측) | 수정 |
|---|---|---|---|
| F1 | `src/sidepanel/components/PinMemoList.ts` · `src/sidepanel/App.ts` | `onToggleKind`가 `memoList.render()`를 불러 **방금 누른 토글 버튼이 DOM에서 사라짐** → 포커스가 BODY로 떨어져 키보드로 두 번째 토글 불가(Playwright 실측). 같은 파일 `App.ts` 245행 부근에 "memoList.render()가 textarea를 파괴해 포커스를 죽인다"는 경고 주석이 이미 있음 | `PinMemoListApi`에 `updateKind(pinId, kind: 'bug'\|'ref')` 추가 — 해당 행의 버튼만 **제자리 갱신**(textContent·aria-pressed·title·aria-label). `App.onToggleKind`는 `memoList.render` 대신 `memoList.updateKind(...)` 호출(배지 레이어 `pinLayerMain.render`·`preview.refreshImageLightbox()`·`syncPinOutputs()`는 유지). 버튼은 포커스를 잃지 않는다 |
| F2 | `src/sidepanel/components/PinMemoList.ts` | 참고 상태에 툴팁이 없어 "누르면 뭐가 되는지" 선택 전엔 알 수 없음(D2 의도 절반) · 버튼에 핀 번호 aria-label 없음 · 탭 순서가 토글→메모→삭제 | **지휘자 결정(D2 보완)**: 참고 상태 `title="누르면 버그로 표시 — 예상과 다르게 동작할 때"`, 버그 상태 `title="예상과 다르게 동작해요 (누르면 참고로)"`. `aria-label="핀 N 의도: 참고|버그"`. 배치를 `field.append(ta, kindBtn, del)`로(메모 → 토글 → 삭제) |
| F3 | `src/sidepanel/components/ImageLightbox.ts` (허용 추가) | 두 번째 핀 렌더러(126~148행)가 `pin-badge--bug` 클래스·의도 title을 안 붙여 전체화면에서 버그 핀 구분 안 됨 | `PinAnnotation.ts` 60~68행과 동일하게 3줄 이식(`pinKind` import) |
| F4 | `src/context-pack/pin-kind.ts` · `src/sidepanel/App.ts` 489~494행 · `tests/pin-kind.test.ts` | 히스토리 복원 매핑을 테스트가 **인라인으로 베껴** 검증 → `App.ts:493 kind: a.kind`를 지워도 151 green(vacuous). 뮤테이션 10종 생존 | `pin-kind.ts`에 `restorePinsFromPack(pack: ContextPack): PinItem[]`(id·x·y·memo·kind 매핑, kind 없으면 undefined 그대로) 추출 → `App.ts` 복원 경로가 이 함수를 쓰게 교체. 테스트: 기존 인라인 사본 제거 후 **같은 함수**로 ① 옛 팩(kind 없음) → 전부 `pinKind()==='ref'` ② `kind:'bug'` 저장분 → 'bug' 보존 ③ memo null → '' |
| F5 | `docs/GLOSSARY.md` | "검사 명령"이 GLOSSARY 자신(금지어 열·명령 줄)을 잡아 0건이 원리적으로 불가 · 정규식에 주석·어노테이션·업로드·공유 누락 · PowerShell엔 `grep -r` 없음 | 검사 절을 두 명령으로 교체(둘 다 `rg`, 실제로 1회 실행해 결과 수치를 문서에 적기): ① UI·프롬프트·README(전체 금지어): `rg -n "캡쳐\|스냅샷\|스크린샷\|주석\|어노테이션\|업로드\|공유\|프롬프트 팩\|Context Pack" src prompts README.md --glob '!**/*.test.ts'` (코드 주석 줄은 T4b 게이트 스크립트가 제외 — 문서엔 그 사실 명시) ② docs(맞춤법만): `rg -n "캡쳐" docs --glob '!docs/GLOSSARY.md' --glob '!docs/dogfood/**' --glob '!docs/tickets/**'`. "목표 0건은 W3 게이트(`scripts/check-goal-6.mjs`)가 판정" 한 줄 추가 |
| F6 | `docs/tickets/0.4.6/T5.report.md` | `[스코프 밖 발견] 없음`이 부정확(ImageLightbox 미반영 존재) | 맨 아래 `[정정 2026-08-29] 스코프 밖 발견: ImageLightbox 핀 렌더러 kind 미반영(critic 지적) → W1-fix F3에서 처리` 1줄 추가 |

## 순서 (test-first)

1. `tests/pin-kind.test.ts`에 F4의 3건을 `restorePinsFromPack` import로 먼저 작성 → `pnpm test` **실패 확인**(함수 없음).
2. F4 → F1 → F2 → F3 → F5 → F6 구현. `pnpm test`·`pnpm build` 통과.
3. F1 확인: 브라우저 없이도 `updateKind`가 `listRoot.innerHTML`을 건드리지 않고 `querySelector`로 해당 버튼만 바꾸는지 코드로 명확히.

## 금지

- 위 파일 외 수정 금지(특히 `prompt-builder`·템플릿·`ContextPackPanel`·`ImageActions`·`HistoryList`·`worker/**`·버전 파일).
- 금지어 신규 유입 0. master 커밋·push·merge 금지 · `git add -A` 금지.

## 완료 조건

- `pnpm test`(신규 3건 포함 수치)·`pnpm build` 통과 · 허용 파일 밖 변경 0.
- 브랜치 `046-w1`에 커밋 1~2개. 메시지 예: `fix(0.4.6): W1-fix — 핀 토글 제자리 갱신(포커스 유지)·라이트박스 kind·복원 매핑 추출+테스트·용어 사전 검사 명령 정정`.
- `docs/tickets/0.4.6/W1-fix.report.md`(보고 형식 = T5.md와 동일 7항) 커밋 + 상태 메일 1통.
