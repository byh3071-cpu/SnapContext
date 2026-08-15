---
id: readme-root
date: 2026-08-15
tags: [readme, snapcontext]
---

# SnapContext

Chrome·Whale MV3 확장 — 화면 캡처, 핀 주석, AI용 Context Pack 생성.

스토어 게시 버전은 v0.3.0(Chrome·Whale 심사 통과)이고, 현재 v0.4.2(Private-by-Design)를 개발 중이다.

- **Repository:** https://github.com/byh3071-cpu/SnapContext
- **Privacy Policy:** https://github.com/byh3071-cpu/SnapContext/blob/master/docs/PRIVACY.md

## 주요 기능

| 기능 | 단축키 |
|------|--------|
| 화면 캡처 | `Alt+Shift+V` |
| 요소 캡처 | `Alt+Shift+E` |
| 문서 캡처 | `Alt+Shift+M` |
| 전체 캡처 | `Alt+Shift+G` |

## AI 연동 (0.4.x)

캡처를 AI에 전달하는 방법은 두 가지다.

1. **사람 직접 전달** — 캡처·Context Pack을 복사해 AI 대화에 직접 붙여넣는다. 서버 저장 없이 동작한다.
2. **MCP 저장** — 확장의 `내 AI에 저장`으로 캡처를 서버에 올리고, MCP 툴(`snap_history`·`snap_pack`·`snap_analyze`)로 AI 클라이언트(Claude Code·Cursor·Codex)가 조회한다. 0.4.2부터 캡처는 소유자 토큰(`sc_`)으로 격리되며, 이미지 접근은 서명 URL을 쓴다.

MCP 등록은 `scripts/register-mcp.ps1`을 사용한다. 기본값은 production Worker이므로 로컬 검증에는 `-Local` 스위치를 쓴다. 토큰은 환경 변수(`SNAPCONTEXT_MCP_TOKEN`)로만 전달하고, 환경 변수를 바꾼 뒤에는 터미널·에디터를 완전히 재시작해야 반영된다.

## 검증 절차 (0.4.2)

| 단계 | 명령 | 비고 |
|------|------|------|
| 로컬 dogfood 기동 | `pnpm dogfood:up` | production 미접촉 — 로컬 Worker·전용 profile |
| 로컬 자동 검증 | `pnpm dogfood:verify` | golden path 14 + failure probe 4 |
| 일상 10분 smoke | [docs/dogfood.md](./docs/dogfood.md) | Codex 실클라이언트 marker 판독 |
| 릴리즈 게이트 | docs/dogfood.md 하단 | 3클라이언트 전체 + staging(사람 승인) |

`scripts/e2e-smoke.ps1`(legacy production 스모크)은 기본 차단이다 — 실행하려면 `$env:SNAPCONTEXT_ALLOW_PROD_SMOKE = '1'`을 명시해야 한다.

## 요구 사항

- Node.js 18+
- pnpm

## 설치·빌드

```bash
pnpm install
pnpm build
```

산출물은 `dist/`에 생성된다.

- Chrome: `chrome://extensions` → 개발자 모드 → 압축해제된 확장 프로그램 로드 → `dist` 선택
- Whale: `whale://extensions` → 동일

## 개발·테스트

```bash
pnpm dev
pnpm test
pnpm test:e2e:all
pnpm store:screenshots
```

## 구조

주요 코드는 `src/` 아래이며, 메시지 허브는 `src/background/service-worker.ts`, 사이드 패널은 `src/sidepanel/`이다.

스토어 스크린샷(1280×800)은 `docs/store/chrome-web-store/screenshots/`에 있다.
