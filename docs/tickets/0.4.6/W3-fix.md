# W3-fix — critic BLOCKER 2 + MAJOR 3 + MINOR 2 (브랜치 046-w3 직접)

> 근거: 2026-08-30 critic(opus) W3 검증 — FAIL(BLOCKER 2·MAJOR 4). MAJOR 중 "스토어 등록 이미지 생성기"는 이 티켓이 아니라 **재심사 준비 티켓(tag 전 필수)** 으로 이월. 통합 브랜치 `046-w3`(현재 worktree, node_modules 있음)에서 수행. 티켓 밖은 손대지 않는다.

## 수정 항목

| # | 파일 | 결함(실측) | 수정 |
|---|---|---|---|
| **B1** | `docs/PRD-0.4.6.md` 47·52행 · `scripts/check-goal-6.mjs` | 일괄 치환이 **승인된 PRD의 D1 용어 표**를 깨뜨림: `\| 캡처 \| 캡처·스냅·스크린샷 \|`(확정=금지) · 52행 실태 문장 자기모순(`캡처 102 · 캡처/스냅/스크린샷 0 — "캡처" 59건`). 게이트 ③이 PRD를 대상에 넣어 **원복하면 빨간불** | ① 게이트 ③의 제외 목록에 `docs/PRD-0.4.6.md`(용어표·grep 실측 인용 문서) 추가 ② 두 줄을 원문으로 복원: 47행 `\| 화면을 찍은 것 \| 캡처 \| 캡쳐·스냅·스크린샷 \|`, 52행 `src는 이미 통일 완료(캡처 102 · 캡쳐/스냅/스크린샷 0) — **docs의 "캡쳐" 59건**` |
| **B2** | `tests/e2e/dogfood/qa-043.mjs` 702·715행 (허용 추가) | `waitToast(side, '이전에 적용한 가리기·주석은 복원되지 않습니다', …)`가 바뀐 문구를 못 만나 QA⑤가 **항상 실패/항상 통과**로 뒤집힘(`waitToast`는 타임아웃 시 false) | 두 문자열을 `'이전에 적용한 그리기(가리기 등)는 복원되지 않습니다'`로. `tests/e2e/**`(dogfood 포함) 전수에서 옛 UI 문자열(`주석`·`핀 주석`·`AI 디버그 팩`) 잔존 grep → 있으면 같이 갱신 |
| **M1** | `scripts/check-goal-6.mjs` | 게이트 거짓음성 8종(critic 뮤테이션 실증): 쌍따옴표·백틱 문자열 미검사(한글 UI 문자열 8%가 백틱) · 문자열 안 `//`(URL)을 주석으로 오인해 뒤를 절단 · 블록 주석 선삭제가 문자열 사이 코드를 은닉 · ①에 `캡쳐` 누락 · ② 목록에 `업로드\|공유\|어노테이션\|스냅` 누락 · ③ `캡쳐`만 · 4값 검사가 lock 2값 미포함 | ① 문자열 추출을 **문자 단위 파서**로(상태: 코드/`'`/`"`/`` ` ``/`//`/`/* */`, 이스케이프 처리) — 문자열 리터럴만 모아 검사. 단어 목록을 GLOSSARY 금지 열과 동일하게: src=`캡쳐\|스냅샷\|스크린샷\|주석\|어노테이션\|업로드\|공유\|프롬프트 팩\|Context Pack`(코드 식별자는 문자열이 아니므로 자연 제외) · ② prompts·README 동일 목록 · ③ docs는 `캡쳐\|스냅샷\|프롬프트 팩`(제외: GLOSSARY·PRD-0.4.6·dogfood·tickets·store) · ⑤ package·manifest·lock(top)·lock.packages[""] 4값을 직접 읽어 비교(build 의존 제거). 대상 확장자 `.ts,.tsx,.js`. 각 검사에 **양성 대조 자체 테스트**는 요구하지 않되, 보고에 "쌍따옴표·백틱·URL 포함 문자열 주입 시 빨간불" 실측 3줄 첨부 |
| **M2** | T4b가 만진 md 12개 | UTF-8 **BOM(EF BB BF)** 유입: `docs/ARCHITECTURE.md`·`PRD-0.4.6.md`·`PRD.MD`·`changelog.md`·`til.md`·`adr/001·002·003·005`·`log/2026-05-07-*`·`log/2026-05-10-*`·`troubleshooting/001-*`. frontmatter 파서 위험·diff 노이즈 | BOM 제거(내용 무변경). 확인 `head -c 3 <file> \| od -An -tx1` → `ef bb bf` 0건. 저장 시 `-Encoding utf8`(PS5.1은 BOM을 붙이므로 `[IO.File]::WriteAllText(path, text, [Text.UTF8Encoding]::new($false))` 또는 node로) |
| **M3** | `docs/changelog.md` | 0.4.6 절 재작성 때 타입 변경 2줄 삭제 | 두 줄 복원(T1~T6 요약과 병기): `- 타입: PinItem.kind?·ContextPack.annotations[].kind? 추가(하위호환, 기본 ref).` / `- 타입: CaptureHistoryItem.saveStatus?·savedCaptureId?·saveError? 추가(하위호환).` |
| m1 | `docs/tickets/0.4.6/T4b.report.md` | "38건/11파일" 주장 vs 실측 56건/12파일(`docs/PRD.MD` 11건 누락) | 맨 아래 `[정정 2026-08-30] 실측 56건/12파일(PRD.MD 11 포함) — critic` 1줄 |
| m2 | `scripts/check-goal-6.mjs` | `'0.4.6'` 하드코딩 | `goals/6-046-ux-polish.md` frontmatter `version: v0.4.6`에서 읽어 비교(`v` 제거). 없으면 명시 실패 |

## 순서

1. 게이트(M1)부터: 파서 교체 후 `VHK_GATES_SKIP_DEEP=1 node scripts/check-goal-6.mjs` — 현재 상태에서 **B1 원복 전엔 PRD 때문에 빨간불, 제외 추가 후 초록**이 되는지 확인. 임시로 `src`에 `"주석 도구"`·백틱 문자열·`'https://x/ 업로드'`를 넣어 빨간불 3종 실측(보고에 첨부) 후 원복.
2. B1 → B2 → M2 → M3 → m1 → m2. `pnpm exec vitest run --testTimeout 15000`·`pnpm build`·`vhk check --goal 6` 통과. E2E `node tests/e2e/coverage.mjs`·`smoke.mjs` 2종 재실행(qa-043은 로컬 서버 필요 — 실행 요구 안 함, 문자열만).

## 금지

- 위 파일 외 수정 금지. `scripts/generate-store-screenshots.mjs`·`docs/store/**`는 **손대지 말 것**(재심사 준비 티켓 이월). 용어 치환을 다시 일괄로 돌리지 말 것(B1 재발).
- master 커밋·push·merge 금지 · `git add -A` 금지 · 파일 저장은 BOM 없는 UTF-8.

## 완료 조건

- `vitest` 전부 통과(수치) · `pnpm build` · `vhk check --goal 6` 통과 원문 · BOM 0건 원문 · 허용 파일 밖 변경 0.
- 브랜치 `046-w3`에 커밋 1~2개. 메시지 예: `fix(0.4.6): W3-fix — PRD D1 표 원복+게이트 제외·QA 스크립트 문구·게이트 파서(인용부호 3종)·BOM 제거·changelog 타입 기록`.
- `docs/tickets/0.4.6/W3-fix.report.md`(T5.md 7항 + [근거 불일치]) 커밋 + 상태 메일 1통.
