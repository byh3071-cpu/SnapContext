# W2-fix — critic BLOCKER 1 + MAJOR 1 + 저비용 MINOR 6 (브랜치 046-w2 직접)

> 근거: 2026-08-30 critic(opus) 적대 검증 — 판정 FAIL(BLOCKER 1·MAJOR 1). 통합 브랜치 `046-w2`(현재 worktree, node_modules 있음)에서 수행. 티켓 밖은 손대지 않는다.

## 수정 항목

| # | 파일 | 결함(실측) | 수정 |
|---|---|---|---|
| **B1** | `tests/e2e/coverage.mjs` (지휘자가 허용) | T1이 `JSON 복사`·`프롬프트＋JSON` 버튼을 기본 접힌 `details.context-pack-panel__raw` 안으로 옮겨 Phase J(#23)·K(#24)의 `.click()`이 `isVisible=false`로 타임아웃 | Phase J 시작 직전에 `await page.locator('.context-pack-panel__raw > summary').click(); await wait(200)` 추가(접힘 열기). Phase K에서도 열려 있어야 하면 상태 유지 확인. 다른 E2E 파일은 변경 금지 |
| **M1** | `src/utils/share-expiry.ts` · `tests/mcp-onboarding-0.4.2.test.ts` · `tests/share-expiry.test.ts` · `tests/save-status.test.ts` | `buildPrivateSaveSuccessMessage(days)`가 `void days`로 인자를 버려 "N일 후 삭제" 고지가 사라짐(섹션 옆 aside는 "7일" 세 글자뿐이라 삭제 의미 없음) | 문구를 `내 AI에 저장됨(${formatExpiryDays(days)} 후 삭제) — Claude Code·Cursor에서 '방금 캡처 분석해줘'라고 하면 읽습니다.`로(1줄·80자 이하 유지, `assertOneLine` 통과). 테스트 3곳을 새 계약에 맞춤: 7·30 넣으면 각각 "7일 후 삭제"/"30일 후 삭제" 포함, 줄바꿈 0 |
| m1 | `tests/pack-summary.test.ts` | `COPY_NEXT_ACTION`이 길이·줄바꿈만 검증돼 문구가 바뀌어도 모름 | `expect(COPY_NEXT_ACTION).toBe('AI 대화창에 붙여넣고 이미지를 함께 첨부하세요.')` 1줄 추가 · `hasUserNote`가 공백만인 메모(`'   '`)를 false로 보는 검증 1줄 추가 |
| m2 | `src/utils/one-line.ts`(신규) · `src/context-pack/next-action.ts` · `src/utils/share-expiry.ts` | `assertOneLine`이 2벌(에러 문구도 다름) | 한 곳(`src/utils/one-line.ts`)으로 합치고 두 파일이 import. 동작·시그니처 동일 |
| m3 | `src/context-pack/pack-summary.ts` · `src/context-pack/prompt-builder.ts` | `pack.annotations.map(` 직접 접근 — `restorePinsFromPack`에만 붙은 `?? []` 방어가 새 사본 2곳엔 없음 | 두 곳 모두 `(pack.annotations ?? []).map(`으로 |
| m4 | `src/sidepanel/components/ContextPackPanel.ts` | ① `intentInput`의 `input` 리스너가 키 하나마다 `sync()`→`tryBuildPack()`(팩 전체 재생성)을 돌림(핀 메모는 400ms 디바운스) ② 팩 히스토리 행의 복사 토스트 2곳(`프롬프트를 복사했습니다.`·`프롬프트와 JSON을 복사했습니다.`)만 옛 문구 | ① 같은 400ms 디바운스 적용(기존 핀 메모 패턴 재사용) ② 두 토스트를 `COPY_NEXT_ACTION`으로 |
| m5 | `src/sidepanel/components/ImageActions.ts` | `saveCurrent()`가 `saving` 중이면 조용히 return(재시도 버튼은 비활성화되지 않음) | `deps.showToast('이미 저장 중입니다.', 'info')` 후 return |
| m6 | `prompts/templates/refactor.md` · `reference.md` | `{{#if debug}}## 환경…{{/if}}` 블록이 영원히 렌더 안 되는 죽은 템플릿 코드(debug는 bug 템플릿 한정) | 두 템플릿에서 해당 블록 제거. bug-report.md는 그대로. 기존 T2 테스트가 계속 통과해야 함 |

## 순서 (test-first)

1. M1·m1 테스트를 먼저 고쳐 `pnpm exec vitest run tests/share-expiry.test.ts tests/mcp-onboarding-0.4.2.test.ts tests/save-status.test.ts tests/pack-summary.test.ts` → **실패 확인**.
2. 구현 → `pnpm exec vitest run --testTimeout 15000` 전부 초록(dogfood CIM flaky 회피) · `pnpm build` 통과.
3. B1은 Playwright 실행 없이도 코드로 명확히(summary 클릭 → details open). 가능하면 `node tests/e2e/coverage.mjs`를 돌려보고, 환경(빌드·Chromium) 때문에 못 돌면 그 사실을 보고에 적어라(거짓 성공 금지).

## 금지

- 위 파일 외 수정 금지(`worker/**`·버전 파일·`docs/**`(보고 파일 제외)·다른 E2E 파일).
- 요약 카드/접힘 구조 자체를 바꾸지 말 것(PRD T1 유지) — E2E를 구조에 맞추는 것이 수정이다.
- master 커밋·push·merge 금지 · `git add -A` 금지.

## 완료 조건

- `vitest run --testTimeout 15000` 전부 통과(수치) · `pnpm build` 통과 · 허용 파일 밖 변경 0.
- 브랜치 `046-w2`에 커밋 1~2개. 메시지 예: `fix(0.4.6): W2-fix — E2E 접힘 열기·저장 문구 보관기간 복원·안내 문구 계약 테스트·중복 제거·디바운스`.
- `docs/tickets/0.4.6/W2-fix.report.md`(보고 형식 = T5.md와 동일 7항) 커밋 + 상태 메일 1통.
