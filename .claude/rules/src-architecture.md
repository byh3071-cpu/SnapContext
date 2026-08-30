---
paths: ["src/**"]
---

# 확장(src/) 작업 규칙 — 포인터 (본문 SoT = RULES.md)

- 작업 전 `RULES.md`의 §아키텍처 규칙·§TypeScript·§에러 처리·§이미지 처리·§CSS 절을 읽는다. 여기에 본문을 복제하지 않는다(드리프트 방지).
- 절대 규칙 3개: SidePanel → Background → Content Script 단방향(직접 통신 금지) · background에서 DOM API 금지(Service Worker) · content script에서 `chrome.storage` 직접 접근 금지(background 경유).
- 새 메시지 타입은 `src/types/index.ts`에 먼저 정의. 타입 변경은 `docs/changelog.md`에 기록.
- 새 UI 문자열은 용어 사전 용어만 쓴다: 캡처 · 핀 메모 · 그리기 도구 · 컨텍스트 팩 · 내 AI에 저장 (SoT `docs/GLOSSARY.md`, 생성 전엔 `docs/PRD-0.4.6.md` D1 표). 코드 식별자(annotation 등)는 유지.
- 고유 함정: `captureVisibleTab` 연속 호출 ≥510ms · 확대는 width 변경(`transform: scale` 금지) · onFocus에서 풀 재렌더 금지.
- 테스트 = `tests/**/*.test.ts`(vitest, node 환경). UI 배선을 바꾸면 순수 함수로 분리해 계약 테스트를 동반한다 — 적대검증에서 "UI 배선 테스트 0"이 5회 연속 지적됐다.
- 0.4.6 트랙(ext-only)에서는 `worker/**`를 건드리지 않는다(`.vhk/mission.json` forbidden).
