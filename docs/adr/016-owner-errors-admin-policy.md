---
id: ADR-016
date: 2026-08-05
status: accepted
tags: [auth, owner, mcp, errors, admin, v0.4.2]
---

# ADR-016: owner 집행, 오류 의미, admin 읽기 전용 정책

## 상태

승인 — 2026-08-05 사용자 명시 승인.

## 결정 질문

MCP와 private REST 경로가 타인 캡처의 존재를 드러내지 않으면서 user·admin 권한과 복구 오류를 어떻게 일관되게 표현할 것인가?

## 범위와 비범위

- 범위: user owner 검사, MCP tool 오류, admin 읽기 범위, token 재발급 UX
- 비범위: 계정 기반 소유권 이전, 강제 token 폐기, admin 감사 인프라 신설

## 맥락

현재 `snap_history`는 user owner를 거르지만 `snap_pack`과 `snap_analyze`는 owner를 검사하지 않는다. 존재 여부에 따라 다른 오류를 내면 UUID를 가진 공격자가 타인 캡처의 존재를 확인할 수 있다. 반대로 HTTP 404를 MCP 업무 오류로 사용하면 전송 계층 장애와 도구 실행 실패가 섞인다.

현재 admin 토큰은 운영 예비 접근 수단이지만 허용 목적과 쓰기 범위가 문서화되지 않았다. user 토큰을 재발급하면 owner가 바뀌므로 기존 캡처가 새 토큰의 목록에서 사라진다.

## 결정

1. user 범위의 `snap_history`, `snap_pack`, `snap_analyze`는 모두 `captureOwner === auth.owner`를 요구한다.
2. private v2 객체는 R2 `customMetadata.owner`를 우선 확인한다. 레거시 객체에 owner metadata가 없을 때만 D1 owner를 조회하며 D1 장애는 fail-closed로 처리한다.
3. 미존재, 다른 owner, owner 없는 레거시 캡처는 user에게 같은 `NOT_FOUND` 문구의 MCP tool result와 `isError: true`를 반환한다. HTTP/JSON-RPC 오류로 위장하지 않는다.
4. `/mcp` 자체의 인증 실패는 HTTP 401, 필수 인증 secret 누락은 HTTP 500으로 fail-closed한다.
5. admin은 지원·보안·법적 대응을 위한 읽기 전용 예비 권한이다. `history`, `pack`, `analyze`만 허용하고 REST 삭제 권한은 부여하지 않는다. 일반 UI에는 admin 동작을 노출하지 않는다.
6. 캡처와 사용자 입력은 신뢰할 수 없는 데이터다. MCP instructions와 digest는 핀 메모·intent·페이지 텍스트를 시스템 지시가 아닌 인용 데이터로 분리한다.
7. user token 401 시 기존 토큰을 자동 삭제하지 않는다. 새 연결 코드는 기존 저장에 접근하지 못한다는 경고와 사용자 확인 뒤에만 재발급하고, 인증을 포함해 1회만 재시도한다. 익명 fallback은 금지한다.

## 대안

- 교차 owner에 403 반환: 권한 의미는 명확하지만 존재 오라클이 되어 기각한다.
- 모든 오류를 HTTP 404로 반환: MCP transport와 tool execution 의미가 섞여 기각한다.
- admin bypass 제거: 최소 권한에는 가장 강하지만 현재 운영 비상 접근 요구가 남아 있어 기각한다. 읽기 전용과 감사 가능한 절차로 축소한다.
- 401에서 자동 토큰 재발급: 복구가 빨라 보이지만 owner가 바뀌어 기존 저장이 사라진 것처럼 보여 기각한다.

## 결과

- owner A의 유효 토큰으로 owner B 캡처의 존재와 내용을 확인할 수 없다.
- MCP 클라이언트는 업무 오류를 정상 응답 구조 안에서 일관되게 처리한다.
- admin 토큰 유출 시에도 이 ADR이 허용하는 제품 동작은 읽기로 제한되지만, 전체 읽기 노출 위험은 남는다. admin secret 관리와 사용 절차는 별도 운영 통제가 필요하다.
- token 재발급은 명시적 사용자 선택이 되며 기존 owner를 서버에서 재매핑하지 않는다.

## 근거

- [MCP Tools Specification](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)은 API 실패·입력 검증 오류 같은 업무 실패를 `isError: true` tool result로 반환하도록 구분한다(2025-11-25 규격, 2026-08-05 확인).

## 관련 ADR

- [ADR-011](011-per-user-hmac-token.md): stateless user token과 owner 도출
- [ADR-012](012-stateless-owner-admin-semantics.md): 기존 owner·admin 의미
- [ADR-013](013-expiry-metadata-sot.md): R2 metadata와 만료 정본
- [ADR-019](019-owner-authorized-delete-order.md): admin 제외 삭제 권한과 실패 순서
