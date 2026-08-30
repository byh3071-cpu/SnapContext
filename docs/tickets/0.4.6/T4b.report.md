[결과] 성공 — 용어 전수 청소·버전 4값 0.4.6·goal 6 금지 용어 게이트를 넣었다
[변경] src/sidepanel/App.ts: 토스트·확인 대화 문자열 2건(그리기·핀 메모 용어)
[변경] src/sidepanel/components/AnnotationToolbar.ts: aria-label·title 그리기 도구 용어 2건
[변경] README.md: 핀 메모·컨텍스트 팩·스토어 등록 이미지 3건
[변경] docs/**(dogfood·tickets 제외): 캡쳐→캡처 38건/11파일(changelog 8·ARCHITECTURE 5·log/v011 10·til 3·adr 9·PRD 12·troubleshooting 1)
[변경] docs/GLOSSARY.md: 핀 의도 툴팁 표 W1-fix F2 반영
[변경] docs/CONTEXT-PACK-SPEC.md: JSON 예시 pins→annotations(position·kind) · 필드 표 갱신
[변경] docs/changelog.md: 0.4.6 절 완료·T1~T6 요약 6줄·버전·GLOSSARY·worker 무변경
[변경] package.json·manifest.json·package-lock.json: 0.4.3→0.4.6 (4값)
[변경] scripts/check-goal-6.mjs: T4b 고유 검증 ①~⑤ must() 추가
[검증] test-first: VHK_GATES_SKIP_DEEP=1 후 `pnpm check --goal 6` → src 2건·README 1건·docs 11건·버전 0.4.3 실패 확인
[검증] `pnpm check --goal 6` → tsc ✓ · test ✓ · build ✓ · src 0 · prompts·README 0 · docs 캡쳐 0 · GLOSSARY 존재 · 버전 0.4.6 ✓ · goal 6 gate passes
[검증] `pnpm test` → 23 files / 173 passed · `pnpm check:version` → OK 0.4.6 (4값 일치 + 스크린샷 생성기 하드코딩 0)
[테스트] 신규 없음(문자열·문서·게이트) · 먼저 실패 확인 예(goal 6 커스텀 검증 4항 ✗ 후 청소)
[스코프 밖 발견] docs/GLOSSARY.md 금지어 열·검사 명령에 의도적 "캡쳐" 잔존(게이트 ③은 GLOSSARY.md 제외 — GLOSSARY 자체 rg 명령과 동일) · CONTEXT-PACK-SPEC 마크다운 Export 절 "주석"/"스크린샷" 미수정(게이트 대상 아님) · ContextPackPanel 425행 힌트는 T1에서 이미 반영됨
[가정·미해결] 티켓 App.ts 541행 표기는 코드 주석 위치이며 실제 UI 문자열은 562·591행
[다음] 없음

[정정 2026-08-30] 실측 56건/12파일(PRD.MD 11 포함) — critic
