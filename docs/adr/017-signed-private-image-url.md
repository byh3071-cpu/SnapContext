---
id: ADR-017
date: 2026-08-05
status: accepted
tags: [security, hmac, image, mcp, privacy, v0.4.2]
---

# ADR-017: 5분 서명 URL을 사용한 private 이미지 전달

## 상태

승인 — 2026-08-05 사용자 명시 승인.

## 결정 질문

서로 다른 MCP 클라이언트가 private PNG를 가져오게 하면서 장기 bearer나 공개 객체 주소를 노출하지 않으려면 어떤 전달 계약을 사용할 것인가?

## 범위와 비범위

- 범위: `/pi` 서명 형식, TTL, 검증 순서, cache·오류·재호출 의미
- 비범위: inline image 기본 전환, 이미지 변환·압축, 클라이언트별 vision 품질 보장

## 맥락

MCP 클라이언트가 이미지를 읽으려면 실제 PNG에 접근할 수 있어야 한다. raw `/i/{id}`는 ID를 아는 누구나 접근할 수 있고, Authorization header를 이미지 fetch에 전달한다고 모든 클라이언트에 가정할 근거는 부족하다. MCP 표준은 image content를 지원하지만 대용량 PNG의 base64 팽창과 클라이언트별 처리 차이가 남아 있다.

## 결정

1. private 이미지는 `GET /pi/{id}?exp=<unixSec>&sig=<base64url>`로만 전달한다.
2. 서명 재료는 UTF-8 `i.v1:${id}:${exp}`이고, `TOKEN_SIGNING_SECRET`의 HMAC-SHA256 앞 16바이트를 canonical base64url로 인코딩한다.
3. URL 발급 시 TTL은 300초다. `exp`는 정규 십진 정수만 허용하고 과거이거나 검증 시각보다 300초를 초과한 미래 값은 거부한다.
4. signature 부재·형식 오류·변조·만료는 R2를 읽기 전에 같은 HTTP 403으로 거부한다. 비교는 timing-safe 방식으로 한다.
5. 유효한 서명 뒤 객체가 없거나 데이터 보관 기간이 끝났으면 HTTP 410을 반환한다.
6. 성공 응답은 `Cache-Control: private, no-store`를 사용하고 redirect하지 않는다.
7. 서명 URL은 만료 전까지 bearer URL이다. URL 전문, query, signature를 애플리케이션 로그에 남기지 않고 개인정보 문구에도 이 성격을 알린다.
8. MCP server instructions 첫 512자 안에 “이미지 URL을 즉시 fetch, 약 5분 뒤 만료, 403이면 tool을 한 번 다시 호출해 새 URL 획득”을 독립적으로 이해할 수 있게 쓴다. tool description과 digest도 같은 의미를 유지한다.
9. inline image content는 0.4.2 기본값으로 사용하지 않고 이후 opt-in 후보로 남긴다.

## 대안

- raw 공개 URL 유지: 호환성은 가장 높지만 private 요구를 충족하지 못해 기각한다.
- 이미지 요청마다 bearer header 요구: 보안 경계는 단순하지만 실제 클라이언트 fetch 전달 동작이 확인되지 않아 기각한다.
- inline base64 image를 기본값으로 사용: URL 노출을 줄이지만 10MB PNG의 크기 증가와 클라이언트 호환 위험 때문에 기각한다.
- 32바이트 전체 MAC 사용: 보안 여유는 늘지만 URL이 길어진다. 128-bit MAC과 엄격한 TTL·도메인 분리를 함께 사용하는 현재 위협 모델에 필요 이상이라 판단한다.

## 결과

- owner 인증을 통과한 tool 호출만 짧은 수명의 이미지 접근 권한을 얻는다.
- URL 유출 시 최대 5분의 접근 창은 남으므로 “내 AI만 접근” 같은 절대 표현은 사용할 수 없다.
- 403 재호출은 새 URL을 얻기 위한 명시적 정상 복구 경로다. 반복 fallback은 허용하지 않는다.
- 배포 전 Claude Code·Cursor·Codex에서 픽셀 안의 임의 marker를 실제로 읽는 smoke test가 필요하다.

## 근거

- HMAC-SHA256과 truncation의 표준 사용 근거는 [RFC 4231](https://www.rfc-editor.org/info/rfc4231)과 [RFC 7518](https://www.rfc-editor.org/rfc/rfc7518.html)을 따른다(2026-08-05 확인).
- Codex는 server instructions의 앞부분을 독립적으로 이해할 수 있게 작성하도록 안내한다([OpenAI Codex MCP 문서](https://developers.openai.com/codex/mcp/), 2026-08-05 확인).

## 관련 ADR

- [ADR-011](011-per-user-hmac-token.md): HMAC secret과 stateless token
- [ADR-016](016-owner-errors-admin-policy.md): owner 검사 뒤 URL 발급
- [ADR-018](018-rollback-safe-private-object-key.md): URL ID와 내부 R2 key 분리
