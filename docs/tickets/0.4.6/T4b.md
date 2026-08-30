# T4b — 용어 전수 청소 + 버전 4값 0.4.6 + 금지 용어 게이트

> 스펙 SoT: `docs/PRD-0.4.6.md` §T4·DoD 3항. 용어 SoT: `docs/GLOSSARY.md`(T4a). 계획: `goals/6-046-ux-polish-plan.md`(3-1). W1·W2가 머지된 master에서 분기한다.

## 목표

화면 문자열·문서·README를 용어 사전대로 통일하고, 확장 버전 4값을 0.4.6으로 올리며, 게이트 스크립트에 금지 용어 검사를 넣어 재유입을 막는다. 코드 식별자·CSS 클래스·JSON 키·파일명은 바꾸지 않는다.

## 허용 파일·할 일

| 대상 | 할 일 |
|---|---|
| `src/sidepanel/App.ts` 541·562행 | `'이전에 적용한 가리기·주석은 복원되지 않습니다.'` → `'이전에 적용한 그리기(가리기 등)는 복원되지 않습니다.'` · `'새 캡처를 시작하면 기존 핀과 주석(가리기 등)이 삭제됩니다. 계속할까요?'` → `'새 캡처를 시작하면 기존 핀 메모와 그리기(가리기 등)가 삭제됩니다. 계속할까요?'` |
| `src/sidepanel/components/AnnotationToolbar.ts` 58·84행 | aria-label `'주석 도구'` → `'그리기 도구'` · title `'실행취소 (마지막 주석 제거)'` → `'실행취소 (마지막 그리기 제거)'` |
| `src/sidepanel/components/ContextPackPanel.ts` | T1이 382행 힌트를 이미 바꿨는지 확인 — 남아 있으면 `'복사될 내용을 요약 카드에서 확인하고 AI 프롬프트를 복사하세요.'` |
| src 전체 재검사 | `grep -rnE "'[^']*(주석|어노테이션|업로드|공유|스냅샷|스크린샷)[^']*'" src --include=*.ts`(코드 주석 줄 제외) → **0건**까지. 코드 주석(`//`, `/* */`)·식별자는 손대지 않는다 |
| `README.md` 9·29·75행 | "핀 주석"→"핀 메모", "Context Pack"→"컨텍스트 팩", "스토어 스크린샷"→"스토어 등록 이미지" · 그 외 본문의 캡쳐/스냅/공유/업로드 표현 점검 |
| `docs/**` "캡쳐"→"캡처" 전수 | 2026-08-29 실측 38건/11파일(`docs/CONTEXT-PACK-SPEC.md`는 T4a가 완료): changelog 8 · ARCHITECTURE 5 · log/2026-05-10-v011-features 10 · til 3 · adr/002 3 · PRD-0.4.6 2 · log/2026-05-07-v0.1-complete 2 · adr/001 2 · adr/003 1 · adr/005 1 · troubleshooting/001 1. 단순 맞춤법 교정이므로 과거 로그·ADR도 고친다. `docs/dogfood/**`·`docs/tickets/**`는 **제외**(금지어를 의도적으로 인용) |
| `docs/changelog.md` | `## 0.4.6 — 진행 중 (ext-only)` 절 제목을 `## 0.4.6 — 구현 완료 · 수동 QA·tag 대기 (ext-only)`로, T1~T6 요약 6줄(한 티켓 1줄, 사용자 관점)·용어 사전 신설·버전 4값 기재. worker serverInfo 무변경(ADR-014) 명시 |
| `package.json` · `manifest.json` · `package-lock.json`(top + `packages[""]`) | `0.4.3` → `0.4.6`. `pnpm check:version`으로 4값 일치 + 스크린샷 생성기 하드코딩 0 확인 |
| `scripts/check-goal-6.mjs` 63~65행 자리 | goal 6 고유 검증 추가(node 내장만, 외부 grep 의존 금지): ① `src/**/*.ts`에서 코드 주석 줄을 뺀 문자열 리터럴 중 `주석|어노테이션|업로드|공유|스냅샷|스크린샷` 0건 ② `prompts/**/*.md`·`README.md`에 `캡쳐|스냅샷|스크린샷|주석|Context Pack|프롬프트 팩` 0건 ③ `docs/**/*.md`(dogfood·tickets 제외)에 `캡쳐` 0건 ④ `docs/GLOSSARY.md` 존재 ⑤ manifest version === package version === '0.4.6'. 각 항목 `must(cond, label)`로 출력 |

## 순서

1. 게이트부터: check-goal-6.mjs에 ①~⑤ 추가 → `vhk check --goal 6` 실행 → **실패 확인**(현재 금지어·버전이 남아 있으므로 빨간불이 정상).
2. 문자열·문서 청소 → 버전 4값 → changelog → `vhk check --goal 6` **통과** · `pnpm test`·`pnpm build` 통과.

## 금지

- 코드 식별자(`annotation*`, `upload*`, `share*`)·CSS 클래스·JSON 필드·파일명 변경 금지. 로직 변경 금지(문자열만).
- `worker/**`·`docs/dogfood/**`·`docs/tickets/**`·`docs/store/**`(재심사 준비 때 별도) 수정 금지.
- `.vhk/mission.json`·`TASKS.md`·`goals/**`는 지휘자 담당.
- master 커밋·push·merge·tag 금지 · `git add -A` 금지.

## 완료 조건

- `vhk check --goal 6` 통과 원문 · `pnpm test`·`pnpm build` 통과 수치 · 허용 파일 밖 변경 0.
- 브랜치 `046-t4b-terminology-version`에 커밋(문서 청소 1개 + 버전·게이트 1개로 나누면 좋음). 메시지 예: `docs(0.4.6): T4b 용어 전수 청소 — 캡쳐→캡처 38건·UI 문자열 5건·README` / `chore(0.4.6): 버전 4값 0.4.6 + goal 6 게이트 금지 용어 검사`.
- `docs/tickets/0.4.6/T4b.report.md`(보고 형식 = `T5.md`와 동일 7항, 게이트 출력 원문 포함) 커밋 + 상태 메일 1통.
