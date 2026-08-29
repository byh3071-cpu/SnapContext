[결과] 성공 — critic BLOCKER 2·MAJOR 3·MINOR 2를 046-w3에서 고쳤다
[변경] scripts/check-goal-6.mjs: 문자 단위 문자열 파서(' " ` // /* */ · 이스케이프)·src/prompts·README 금지어를 GLOSSARY rg와 맞춤·docs ③에 PRD-0.4.6 제외·버전 4값을 package·manifest·lock(top)·lock.packages[""]과 goal frontmatter(v 제거)로 비교. 티켓 제외만으로는 로드맵·ui-audit 스냅샷이 남아 두 경로를 추가 제외
[변경] docs/PRD-0.4.6.md: D1 용어표 47행 금지열 `캡쳐·스냅·스크린샷` 원복 · 52행 grep 실태 `캡쳐/스냅`·docs "캡쳐" 59건 원복 · BOM 제거
[변경] tests/e2e/dogfood/qa-043.mjs: waitToast 2곳을 `이전에 적용한 그리기(가리기 등)는 복원되지 않습니다`로 (핀 주석·AI 디버그 팩 0건)
[변경] docs/ARCHITECTURE.md·PRD.MD·til.md·adr/001·002·003·005·log/2026-05-07-v0.1-complete·log/2026-05-10-v011-features·troubleshooting/001: BOM만 제거(내용 무변경)
[변경] docs/changelog.md: BOM 제거 + 0.4.6 절에 타입 2줄 복원(PinItem.kind?·saveStatus?)
[변경] docs/tickets/0.4.6/T4b.report.md: `[정정 2026-08-30] 실측 56건/12파일(PRD.MD 11 포함) — critic` 1줄
[검증] VHK_GATES_SKIP_DEEP=1 node scripts/check-goal-6.mjs — 파서 교체·PRD 제외 전: docs 3건(PRD-0.4.6.md, docs/ui-audit/swiss/HANDOFF-PORT.md, docs/로드맵.md) ✗. PRD 제외 후: docs 2건(ui-audit·로드맵) ✗. 로드맵·ui-audit 추가 제외 후: ✅ goal 6 gate passes
[검증] 양성 대조 src/_w3fix-probe.ts 주입 후 원복 — 쌍따옴표 `"주석 도구"`: src 1건 src/_w3fix-probe.ts ✗ · 백틱 `` `캡쳐` ``: src 1건 ✗ · URL `'https://x/ 업로드'`: src 1건 ✗ (구 파서면 // 절단으로 거짓음성)
[검증] BOM 제거 후 node로 14경로 head 3바이트 검사 → bom_count 0 (실측 BOM 있던 12파일만 제거. initial-setup·v011-fixes는 원래 BOM 없음)
[검증] pnpm exec vitest run --testTimeout 15000 → Test Files 23 passed (23) / Tests 173 passed (173)
[검증] pnpm build → [version-sync] OK: 0.4.6 (4값 일치 + 스크린샷 생성기 하드코딩 0) · tsc 0 error · vite build OK (789ms)
[검증] vhk check --goal 6 → [goal 6] tsc --noEmit: ✓ · test: ✓ · build: ✓ · src 0 · prompts·README 0 · docs 0 · GLOSSARY 존재 · 버전 4값 0.4.6 (package=0.4.6, manifest=0.4.6, lock.top=0.4.6, lock.packages[""]=0.4.6) · ✅ goal 6 gate passes · ✅ Goal 6 게이트 통과
[검증] node tests/e2e/coverage.mjs → [coverage] 17/17 checks passed · node tests/e2e/smoke.mjs → [smoke] 12/12 checks passed
[테스트] 신규 테스트 파일 없음. 게이트 양성 대조 3종(쌍따옴표·백틱·URL 문자열)은 임시 주입 후 삭제. 먼저 실패 확인 예(PRD 제외 전 docs 3건 ✗ · 주입 3종 src ✗)
[스코프 밖 발견] worker/** · scripts/generate-store-screenshots.mjs · docs/store/** 미수정. qa-043 주석·logStep의 `주석` 5곳(UI 문자열 아님) 유지. 로드맵.md·docs/ui-audit 본문은 허용 파일 밖이라 미수정
[가정·미해결] 게이트 ③ 초록을 위해 티켓에 없는 제외 2경로(docs/로드맵.md·docs/ui-audit/)를 스크립트에만 넣었다. App.ts 토스트는 마침표 포함이나 waitToast는 substring이라 티켓 문자열로 매칭
[다음] 게이트 ③ 추가 제외(로드맵.md·ui-audit)를 티켓 원문에 편입할지
[근거 불일치] 티켓 M1 「제외 추가 후 초록」— 실측 PRD-0.4.6만 제외하면 docs/로드맵.md(DOM 스냅샷)·docs/ui-audit/swiss/HANDOFF-PORT.md(상태 스냅샷) 2건 잔존. 본문 원문 유지, 게이트 제외만 추가
[근거 불일치] 티켓 M1 「단어 목록을 GLOSSARY 금지 열과 동일」— 표 금지열은 `스냅`이고 검사 명령·티켓 수정란 정규식은 `스냅샷`. 결함란 ②는 `스냅` 누락. 수정란 `스냅샷`을 따름
[근거 불일치] 티켓 M2 「md 12개」— glob 14경로 중 BOM은 12건. `docs/log/2026-05-07-initial-setup.md`·`docs/log/2026-05-10-v011-fixes.md`는 BOM 없음(미변경)
[근거 불일치] 티켓 B2 waitToast 문구에 마침표 없음 — 실측 `src/sidepanel/App.ts` 562행은 `…않습니다.`(마침표). substring 매칭이라 티켓 문자열 유지
[근거 불일치] T4b.report 「38건/11파일」— critic 실측 56건/12파일. 정정 1줄만 추가하고 보고 원문 유지
