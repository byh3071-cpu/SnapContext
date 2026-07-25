---
id: research-mcp-image-block-compat
date: 2026-07-25
tags: [research, mcp, image, private-delivery, v0.4.2, spike]
---

# 스파이크: MCP 인라인 이미지블록 클라이언트 호환 — 0.4.2 private delivery 착수 게이트

## 왜 이 스파이크가 있나

0.4.2(private-by-design)는 공개 `/i/{id}` 이미지 엔드포인트를 **인증된 전달**로 바꿔야 한다(현재 누구나 id 만 알면 fetch 가능). 두 방식이 있다:

- **C1 인라인 base64** — 이미지를 MCP 툴 응답 안에 image content block 으로 직접 실음. 공개 표면 0, 제일 프라이빗.
- **C2 서명 단수명 URL** — `/i/{id}?exp=&sig=` HMAC 서명 + 만료. AI 는 지금처럼 URL 을 fetch(mcp.ts:25 의 계약 유지).

C1 이 성립하려면 **타겟 클라이언트(Claude Code·Cursor·Codex CLI·Antigravity)가 툴 응답의 인라인 이미지를 실제로 렌더/인제스트**해야 한다. 이게 깨지면 private delivery 설계 전체가 C2 로 재작업된다 → **P 착수 전 판정 필수.**

## 결론

**C1 인라인 base64 는 4개 타겟 클라이언트 전부에서 깨지거나 손실된다(2025~2026 기준). → C2 서명 URL 채택.** C1 은 미래 opt-in 플래그(`imageEncoding: 'base64'`)로만 남긴다. 상세 결정 = ADR-017(0.4.2).

## 클라이언트별 근거

| 클라이언트 | 상태 | 근거 |
|-----------|------|------|
| Claude Code | ❌ 깨짐 | MCP `ImageContent` 를 이미지가 아닌 **텍스트로 반환**·10~20× 토큰 낭비([#31208]) · base64 가 모델이 못 읽는 **JSON 파일로 저장**([#14150]) · 인라인 표시 안 됨([#53256], [claude-ai-mcp #238]) |
| Cursor | ❌ 깨짐 | MCP base64 이미지 **표시·판독 불가 + 대화 길이한도 초과**([forum 63430]) |
| Codex CLI | ❌ 미지원 | MCP 툴 이미지 입력 = **오픈 이슈**([codex #9608], [#4819]) · `structuredContent` 있으면 `content[]` 블록 **드롭**([#10334]) · 모델이 이미지 못 봄([discussion #2085]) |
| Antigravity | ⚠️ 미검증 | 권위 있는 근거 없음. 나머지 3개 감안 = 인라인 신뢰 불가 가정 |

크기 맥락: 풀페이지 PNG(최대 10MB, `worker/src/lib.ts:7`)는 base64 로 ~13MB 텍스트. 인라인을 허용하는 클라이언트에서도 실용 툴응답 예산을 압도한다(Cursor 길이초과 리포트가 정확히 이 현상).

## C2 가 안전한 이유

- **경로 무변경**: `SERVER_INSTRUCTIONS`(mcp.ts:25)가 이미 "이미지 URL 을 fetch 하라"고 지시 → 클라 자체 fetch/이미지 파이프라인이 렌더. 서명·만료만 추가.
- **프라이버시 델타 수용가능**: 서명 URL 은 **owner 인증된 MCP 응답 안에서만 mint**되고 수분 내 만료. UUIDv4 비추측성 + 서버 전용 HMAC + 짧은 TTL 로 노출 창을 좁힌다(표준 presigned-URL 시맨틱).
- **잔여 리스크**: Codex 샌드박스 네트워크 정책·Antigravity 는 미검증 → 0.4.2 구현 시 클라별 스모크 1회.

## 출처

- https://github.com/anthropics/claude-code/issues/31208
- https://github.com/anthropics/claude-code/issues/14150
- https://github.com/anthropics/claude-code/issues/53256
- https://github.com/anthropics/claude-ai-mcp/issues/238
- https://forum.cursor.com/t/when-will-cursor-support-the-display-and-reading-of-images-in-mcp-conversations/63430
- https://github.com/openai/codex/issues/9608
- https://github.com/openai/codex/issues/4819
- https://github.com/openai/codex/issues/10334
- https://github.com/openai/codex/discussions/2085
- https://modelcontextprotocol.io/specification/2025-06-18/server/tools
