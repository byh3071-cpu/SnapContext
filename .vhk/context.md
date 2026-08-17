# 프로젝트 컨텍스트

> 이 파일은 `vhk context`로 자동 생성되었습니다.
> AI 어시스턴트에게 프로젝트 맥락을 제공합니다.

## 원본 지도 (Source of Truth)

> 같은 사실은 원본 한 곳에서만 고치세요. 스냅샷은 원본을 읽어 다시 만듭니다.

- **규칙(원본)**: `RULES.md` — 규칙은 여기 한 곳에서만 수정
- **작업 정의·수용 기준**: `RULES.md`나 프로젝트 문서가 지정한 추적 원본 — 경로를 추측하지 않음
- **로컬 Goal 실행 상태**: `goals/*.md` frontmatter — 원본에서 만든 비추적 실행 카드
- **Goal 검사 스크립트(파생)**: `scripts/check-goal-<번호>.mjs` — 직접 수정 금지, `vhk goal sync`로 재생성
- **파생 스냅샷**: `.vhk/context.md`, `docs/state/next-task.md` — 원본 아님
- **로컬 차단 기록**: `docs/state/blockers.md` — append-only, 작업 정의 원본 아님
- **버전·릴리스**: `package.json`, `CHANGELOG.md`
- **명령 목록**: `COMMANDS.md` (+ `vhk help`)
- **파생본(직접 수정 금지)**: `.cursorrules`·`.windsurfrules`·`.github/copilot-instructions.md`·`AGENTS.md`·`GEMINI.md` 등 7종 + `CLAUDE.md` 규칙 영역 → `vhk sync` 로 생성

## 기술 스택

> 기술 스택 상태: 확정

### 선언된 기술 스택 (RULES.md)

- (표준 기술 스택 목록 없음)

### 실제 감지된 기술 스택 (package.json)

- **언어**: TypeScript ^5.8.3
- **빌드**: Vite ^6.3.5
- **테스트**: vitest
- **패키지 매니저**: pnpm
- **패키지 이름**: snapcontext
- **버전**: 0.4.2

## 헌법(core-rules) 소스

- configured — 사용자 규칙 파일 (v0.1.5)

## 디렉토리 구조

```text
├── .env.example
├── AGENTS.md
├── BACKLOG.md
├── CLAUDE.md
├── COMMANDS.md
├── dashboard.html
├── docs/
│   ├── adr/
│   │   ├── 001-sidepanel-over-popup.md
│   │   ├── 002-host-permissions-over-activetab.md
│   │   ├── 003-capture-metadata-and-get-page-meta.md
│   │   ├── 004-template-system.md
│   │   ├── 005-full-page-capture.md
│   │   ├── 006-e2e-playwright-probes.md
│   │   ├── 007-lightbox-width-based-zoom.md
│   │   ├── 008-mcp-remote-transport.md
│   │   ├── 009-mcp-index-storage-d1.md
│   │   ├── 010-mcp-auth-ingestion.md
│   │   ├── 011-per-user-hmac-token.md
│   │   ├── 012-stateless-owner-admin-semantics.md
│   │   ├── 013-expiry-metadata-sot.md
│   │   ├── 014-version-scheme-dual-track.md
│   │   ├── 015-private-capture-access-rollout.md
│   │   ├── 016-owner-errors-admin-policy.md
│   │   ├── 017-signed-private-image-url.md
│   │   ├── 018-rollback-safe-private-object-key.md
│   │   ├── 019-owner-authorized-delete-order.md
│   │   └── ADR-000-template.md
│   ├── ARCHITECTURE.md
│   ├── changelog.md
│   ├── codex-research-v0.3-mcp.md
│   ├── CONTEXT-PACK-SPEC.md
│   ├── devlog/
│   │   ├── 2026-05-24-snapcontext-review-fixes.md
│   │   ├── 2026-05-24-snapcontext-store-submission.md
│   │   └── 2026-05-24-snapcontext-v013-store-candidate.md
│   ├── log/
│   │   ├── 2026-05-07-initial-setup.md
│   │   ├── 2026-05-07-v0.1-complete.md
│   │   ├── 2026-05-08-sidepanel-korean-i18n.md
│   │   ├── 2026-05-10-v011-features.md
│   │   ├── 2026-05-10-v011-fixes.md
│   │   ├── 2026-05-24-v013-store-candidate.md
│   │   ├── 2026-05-24-v013-store-submission.md
│   │   ├── 2026-07-18-v030-mcp-server.md
│   │   ├── 2026-07-22-v040-p3-expiry.md
│   │   ├── 2026-07-22-v040-p4-mcp-instructions.md
│   │   ├── 2026-07-22-v040-p5-extension.md
│   │   ├── 2026-07-23-v040-p6-onboarding.md
│   │   ├── 2026-07-25-v041-upload-ratelimit.md
│   │   └── 2026-08-05-snapcontext-0.4.2.md
│   ├── patterns/
│   │   ├── browser-api-capture-visible-tab-throttle.md
│   │   ├── browser-api-extension-command-reserved-shortcut.md
│   │   ├── PAT-001-powershell-compress-archive-backslash-zip.md
│   │   ├── PAT-001-windows-zip-store-upload-500.md
│   │   ├── PAT-002-base64-token-string-hash-identity.md
│   │   └── storage-large-payload-budget.md
│   ├── PRD-0.3.0.md
│   ├── PRD-0.4.0.md
│   ├── PRD-0.4.2.md
│   ├── PRD.MD
│   ├── PRIVACY.md
│   ├── prompts/
│   │   └── notion-devlog-v013-store-submission.md
│   ├── release-0.2.0-vs-0.1.3.html
│   ├── research/
│   │   ├── mcp-image-block-compat.md
│   │   ├── phase0-capture-trigger.md
│   │   ├── phase0-storage-auth-limits.md
│   │   ├── phase0-transport-clients.md
│   │   ├── phase1-verify-codex-r2.md
│   │   ├── phase1-verify-codex.md
│   │   ├── phase2-verify-claude.md
│   │   ├── phase3-verify-claude.md
│   │   ├── quality-backlog-notes.md
│   │   └── quality-backlog-verify.md
│   ├── state/
│   │   ├── blockers.md
│   │   ├── learnings.md
│   │   └── next-task.md
│   ├── store/
│   │   ├── chrome-web-store/
│   │   ├── competitor-research-2026-06-11.md
│   │   ├── listing-0.2.0-draft.md
│   │   ├── listing-0.2.0.md
│   │   ├── listing-0.3.0.md
│   │   ├── listing-0.4.0.md
│   │   ├── listing-0.4.2.md
│   │   ├── promo/
│   │   ├── submit-kit-0.3.0.md
│   │   ├── submit-kit-0.4.0.md
│   │   ├── v0.2/
│   │   └── yohan-studio/
│   ├── superpowers/
│   │   ├── plans/
│   │   └── specs/
│   ├── til.md
│   ├── troubleshooting/
│   │   ├── 001-activeTab-side-panel-warning.md
│   │   ├── 002-npm-build-output-truncated.md
│   │   ├── 003-side-panel-english-leak-after-reload.md
│   │   ├── 004-whale-alt-shift-d-conflict.md
│   │   ├── 005-gpu-compositor-blur-on-transform-scale.md
│   │   ├── 006-pin-memo-focus-loss-from-refresh.md
│   │   ├── 007-loaded-pack-pin-prompt-mismatch.md
│   │   ├── 008-notion-mcp-401-vscode-env.md
│   │   ├── 009-full-page-shortcut-alt-shift-f.md
│   │   ├── 009-npm-eresolve-workers-types-peer.md
│   │   └── README.md
│   ├── ui-audit/
│   │   ├── compare.md
│   │   ├── concept-darkroom-rail.html
│   │   ├── d6-preview.html
│   │   ├── d6-refined.html
│   │   ├── design-lab.html
│   │   ├── findings.md
│   │   ├── hermes/
│   │   ├── options.html
│   │   ├── p1-gamgwang.html
│   │   ├── preview-standalone.html
│   │   ├── preview.html
│   │   ├── recreate/
│   │   ├── swiss/
│   │   ├── tone3-refined.html
│   │   ├── vibes.html
│   │   ├── vibes2.html
│   │   ├── vibes3.html
│   │   ├── vibes4.html
│   │   ├── vibes5.html
│   │   ├── w2-preview.html
│   │   ├── w5-preview.html
│   │   └── x11-preview.html
│   ├── vhk-dogfooding-findings.md
│   └── 로드맵.md
├── GEMINI.md
├── goals/
│   ├── 0-store-copy-research.md
│   ├── 1-infra-setup.md
│   ├── 2-anonymous-upload.md
│   ├── 3-privacy-copy.md
│   ├── 4-test-ship.md
│   ├── 5-store-submit.md
│   └── _meta.md
├── logs/
├── manifest.json
├── package-lock.json
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── prompts/
│   ├── initial-setup.md
│   └── templates/
│       ├── bug-report.md
│       ├── refactor.md
│       └── reference.md
├── public/
│   ├── assets/
│   │   └── icons/
│   └── icons/
│       ├── icon128.png
│       ├── icon16.png
│       └── icon48.png
├── README.md
├── RULES.md
├── scripts/
│   ├── backfill-d1.mjs
│   ├── check-goal-0.mjs
│   ├── check-goal-1.mjs
│   ├── check-goal-2.mjs
│   ├── check-goal-3.mjs
│   ├── check-goal-4.mjs
│   ├── check-goal-5.mjs
│   ├── check-version-sync.mjs
│   ├── clean-dist.ps1
│   ├── copy-blog-screenshots.ps1
│   ├── e2e-smoke.ps1
│   ├── extract-symbol-icons.mjs
│   ├── generate-extension-icons.mjs
│   ├── generate-store-promo.mjs
│   ├── generate-store-screenshots.mjs
│   ├── lib/
│   │   ├── backfill-d1.mjs
│   │   └── goal-assert.mjs
│   ├── register-mcp.ps1
│   ├── resize-extension-icons-from-master.mjs
│   └── tighten-extension-icons.mjs
├── snapcontext-0.2.0.zip
├── snapcontext-v0.1.3-whale.zip
├── snapcontext-v0.1.3.zip
├── snapcontext-v0.2.0.zip
├── snapcontext-v0.3.0.zip
├── snapcontext-v0.4.0.zip
├── src/
│   ├── assets/
│   │   └── icons/
│   ├── background/
│   │   └── service-worker.ts
│   ├── capture/
│   │   ├── document.ts
│   │   ├── element.ts
│   │   └── visible.ts
│   ├── content/
│   │   ├── content-script.ts
│   │   ├── document-selector.ts
│   │   └── selectors.ts
│   ├── context-pack/
│   │   ├── generator.ts
│   │   ├── prompt-builder.ts
│   │   └── template-engine.ts
│   ├── notion/
│   │   └── api.ts
│   ├── sidepanel/
│   │   ├── App.ts
│   │   ├── components/
│   │   ├── confirm-dialog.ts
│   │   ├── fonts/
│   │   ├── index.html
│   │   ├── styles/
│   │   ├── toast.ts
│   │   └── utils/
│   ├── storage/
│   │   ├── history.ts
│   │   └── index.ts
│   ├── types/
│   │   └── index.ts
│   ├── utils/
│   │   ├── annotated-image.ts
│   │   ├── crop.ts
│   │   ├── image.ts
│   │   ├── mcp-onboarding.ts
│   │   ├── messaging.ts
│   │   ├── png-dimensions.ts
│   │   ├── share-expiry.ts
│   │   ├── share-upload.ts
│   │   ├── token.ts
│   │   └── upload.ts
│   └── vite-env.d.ts
├── TASKS.md
├── tests/
│   ├── context-pack.test.ts
│   ├── e2e/
│   │   ├── coverage.mjs
│   │   ├── full-page-shortcut.mjs
│   │   ├── loaded-pack-pin.mjs
│   │   ├── pin-delete.mjs
│   │   ├── pin-flow.mjs
│   │   ├── screenshots/
│   │   ├── smoke.mjs
│   │   └── upload-share.mjs
│   ├── helpers/
│   │   └── chrome-storage.ts
│   ├── mcp-onboarding-0.4.2.test.ts
│   ├── private-save-0.4.2.test.ts
│   ├── share-expiry.test.ts
│   ├── share-upload.test.ts
│   ├── token.test.ts
│   └── upload.test.ts
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
└── worker/
    ├── e2e-results.txt
    ├── e2e-smoke.ps1
    ├── migrations/
    │   ├── 0001_captures.sql
    │   └── 0002_captures_owner.sql
    ├── P3-REPORT.md
    ├── package-lock.json
    ├── package.json
    ├── release-gates.ps1
    ├── src/
    │   ├── analyze.ts
    │   ├── auth.ts
    │   ├── env.ts
    │   ├── history.ts
    │   ├── image-url.ts
    │   ├── index.ts
    │   ├── ingest.ts
    │   ├── lib.ts
    │   ├── mcp-route.ts
    │   ├── mcp.ts
    │   ├── origin.ts
    │   ├── pack.ts
    │   ├── private-capture-routes.ts
    │   ├── private-object-key.ts
    │   ├── shared-context-v2.ts
    │   ├── token-rate-limit.ts
    │   ├── token.ts
    │   └── upload-rate-limit.ts
    ├── test/
    │   ├── analyze.test.ts
    │   ├── auth.test.ts
    │   ├── backfill-d1.test.ts
    │   ├── expiry.test.ts
    │   ├── history-owner.test.ts
    │   ├── history.test.ts
    │   ├── image-url.test.ts
    │   ├── index.test.ts
    │   ├── lib.test.ts
    │   ├── mcp-integration.test.ts
    │   ├── mcp-owner-v2.test.ts
    │   ├── mcp-route.test.ts
    │   ├── pack.test.ts
    │   ├── private-capture-routes.test.ts
    │   ├── private-object-key.test.ts
    │   ├── resolve-mcp-auth.test.ts
    │   ├── setup.ts
    │   ├── shared-context-v2.test.ts
    │   ├── token-route.test.ts
    │   ├── token.test.ts
    │   ├── upload-bearer.test.ts
    │   ├── upload-ingest.test.ts
    │   └── upload-rate-limit.test.ts
    ├── test-d1/
    │   ├── apply-migrations.ts
    │   ├── d1-roundtrip.test.ts
    │   └── owner-isolation.test.ts
    ├── tsconfig.json
    ├── vitest.config.ts
    ├── vitest.d1.config.mts
    └── wrangler.jsonc
```

## VHK CLI 명령어

- `vhk gate — 아이디어 검증`
- `vhk start — 새 프로젝트 시작 마법사`
- `vhk bootstrap — Cursor/에이전트 배선 bootstrap (cursor)`
- `vhk init — 하네스 파일 생성`
- `vhk recap — 오늘 한 일 정리 + ADR 분리`
- `vhk sync — RULES.md → 규칙 파일 동기화`
- `vhk check — RULES.md 규칙 점검`
- `vhk secure — 보안 스캔 (시크릿 유출 검사)`
- `vhk cloud — .vhk 클라우드 백업·복원 (push/pull)`
- `vhk ship — 배포 체크리스트 + 회고`
- `vhk doctor — 개발 환경 점검 (+ --strict 드리프트 게이트)`
- `vhk save — git 저장 (add → commit → push)`
- `vhk undo — 최근 커밋 되돌리기`
- `vhk restore — sync 백업 복원`
- `vhk status — 프로젝트 상태 대시보드`
- `vhk stats — 통계 대시보드 — 패스율/차단율/진화 적용율 (읽기 전용)`
- `vhk diff — Git 변경사항 한국어 요약`
- `vhk diff-cover — 이번 변경이 테스트로 커버됐는지 측정 (자문형)`
- `vhk mcp — MCP 서버 시작 (stdio)`
- `vhk mcp-init — Cursor·Claude Desktop MCP 설정 생성`
- `vhk inject-bootstrap — tier S harness (ecosystem · CORE-RULES · context · mcp.example)`
- `vhk deploy — 프로덕션 배포 (자동 감지)`
- `vhk env — .env → .env.example 동기화`
- `vhk env-check — 필수 환경변수 누락 검사`
- `vhk publish — npm 배포 (버전 범프 → 빌드 → 테스트)`
- `vhk design — 디자인 토큰 생성`
- `vhk design-palette — 컬러 팔레트 프리셋 선택`
- `vhk theme — 다크/라이트 모드 CSS 생성`
- `vhk ref — 레퍼런스 URL 관리 (add/list/open)`
- `vhk harness — 통합 품질 점검 (lint+type+test+build)`
- `vhk audit — 보안 취약점 감사 (npm audit)`
- `vhk migrate — 패키지 매니저 전환 (npm/yarn/pnpm)`
- `vhk update — VHK CLI 셀프 업데이트`
- `vhk context — 프로젝트 맥락 파일 생성 (.vhk/context.md)`
- `vhk mode — Safety Mode 조회/변경 (lite|standard|strict)`
- `vhk verify — 검증 게이트 실행 + 증거 기록`
- `vhk cost — 비용·예산 가드 — add/check/budget (자문형)`
- `vhk preflight — 출고 전 안전점검 (2FA·shim·env·lint·타입·테스트·git, 치명 시 차단)`
- `vhk testmap — test-first 매핑 점검 (변경 기능 ↔ 테스트 누락 경고)`
- `vhk worktree — worktree 가드 — 생성 시 env/설정 자동 복사·누락 점검 (add/check)`
- `vhk standup — 아침 브리핑 (어제 한 일 + 오늘 추천 goal + 미해결)`
- `vhk today — 저녁 자축·회고 (오늘 커밋·완료 goal 카운트 + 격려)`
- `vhk review — 적대적 자기검증 (거짓완료 의심 탐지)`
- `vhk receipt — 증거 영수증 — 4대 기계증거로 거짓완료 판정 (block/caution/pass)`
- `vhk mission — 미션 계약 — 작업 목표·허용/금지 범위 선언·검증`
- `vhk context-show — 컨텍스트 파일 내용 출력`
- `vhk memory — 기억 관리 v2 (decisions/failures/successes)`
- `vhk recall — 기억 회상 (자연어 키워드 검색 — RFC 0049)`
- `vhk brief — 프로젝트 요약 보고서 생성`
- `vhk loop-brief — 루프 1틱 앵커 생성 (의도+goal1+교훈+STOP)`
- `vhk remind — 치명 규칙 재주입 (RULES.md NON-NEGOTIABLE/Forbidden 압축)`
- `vhk content — 콘텐츠 초안 프롬프트 (풀사이클 뒷단 — 콘텐츠/마케팅)`
- `vhk launch — 런칭 게시물 프롬프트 (풀사이클 뒷단 — 런칭)`
- `vhk ops — 운영 회고 프롬프트 (풀사이클 뒷단 — 운영)`
- `vhk sell — 판매 카피 프롬프트 (풀사이클 뒷단 — 판매)`
- `vhk work — AI 작업 시작/이어하기 (+ handoff)`
- `vhk goal — Goal 단계별 미션 관리`
- `vhk blocker — 블로커 기록 (3건 누적 시 HARD_STOP)`
- `vhk learn — 교훈 기록 → memory v2 단일 SoT`
- `vhk win — 성공 기록 → memory successes (reinforce 입력)`
- `vhk autonomy-log — 자율 루프 런 시작/종결 기록 (완주율 계측, #373)`
- `vhk watch — 무인 세션 정지 감시 — idle 초과 시 텔레그램·콘솔 알림`
- `vhk resume — .vhk/HARD_STOP 해제 (--confirm 필요)`
- `vhk pattern — 반복 패턴 감지·목록 (avoid/reinforce)`
- `vhk evolve — 패턴 → 7일 룰 후보 표시·사람 승인·되돌리기`
- `vhk loop — 자가진화 조율 1틱 — 다음 한 수 (읽기 전용)`
- `vhk seo — SEO·수익 대시보드 (init: 사이트 등록 + 자격증명 보관)`
- `vhk config — vhk 사용자 설정 (set-rules-file: 사용자 규칙 YAML, 재시작 불필요)`

## Active Goal

- **id**: 0
- **title**: Phase 0 — 경쟁사 리서치 + 스토어 설명문
- **status**: IN_PROGRESS
- **priority**: P0
- **file**: goals\0-store-copy-research.md

## Active Blockers

- [OPEN] `scripts/e2e-smoke.ps1`가 production URL과 legacy 익명 `/upload`를 사용하므로 0.4.2 검증에 실행하면 안 된다. private API 기반 교체 또는 production 실행 차단이 필요하다.
- [OPEN] Cursor desktop의 환경변수 상속과 현재 Cloudflare invocation log/query 기록 설정은 실제 환경에서 확인해야 한다.
- [GATE] 위 항목과 개인정보·스토어 문구 최종 대조 전까지 production 배포·스토어 제출·tag·merge를 진행하지 않는다.

---

_생성: 2026. 8. 15. 오전 12:13:36_
_vhk-context-git: 424dc8b20e79ffdb6be7c4682f41cbf007407b49_
