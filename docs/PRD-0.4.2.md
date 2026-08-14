---
id: prd-0.4.2
date: 2026-08-05
status: implemented-awaiting-release-gates
tags: [privacy, mcp, extension, worker, v0.4.2]
---

# SnapContext 0.4.2 — 사람과 AI가 헷갈리지 않는 비공개 전달

## 한 줄 목표

사람은 캡처를 어디로 보내는지 이해하고, 연결 토큰을 가진 AI 도구는 자기 사용자의 캡처만 불러온다.

## 두 가지 사용자 흐름

### AI 채팅에 직접 전달

1. 화면을 캡처하고 핀 메모를 남긴다.
2. PNG와 컨텍스트 프롬프트를 복사한다.
3. 사용자가 원하는 AI 채팅에 직접 붙여넣는다.

이 흐름은 SnapContext 서버에 저장하지 않는다.

### 코딩 AI가 MCP로 불러오기

1. 주 화면에서 Claude Code, Cursor, Codex 중 도구를 고르고 연결한다.
2. `AI가 할 일`을 고르고 필요하면 `AI에게 원하는 것`을 적는다.
3. `내 AI에 저장`을 누른다.
4. AI 도구는 `snap_history`로 최근 목록을 찾고 `snap_analyze` 또는 `snap_pack`으로 불러온다.
5. 사용자는 같은 화면에서 서버 저장 목록을 보고 즉시 삭제할 수 있다.

## 사용자 용어

| 사용자에게 보이는 말 | 뜻 |
|---|---|
| 내 AI에 저장 | 공개 링크 없이 연결한 코딩 AI가 불러올 수 있게 서버에 보관 |
| AI가 할 일 | 그대로 전달, 문제 해결, 화면 개선, 참고해서 만들기 |
| AI에게 원하는 것 | 캡처와 함께 전달할 선택 입력 |
| 연결 토큰 | 계정 대신 내 저장본을 구분하는 비밀 문자열 |
| 보관 기간 | 1일, 7일, 30일 뒤 자동 삭제 |
| 즉시 삭제 | 서버의 이미지·컨텍스트를 지금 삭제 |

`공유`, `익명 업로드`, `컨텍스트 포함`, `공개 링크 생성`은 0.4.2 신규 흐름에서 사용하지 않는다.

## 구현 계약

### 확장 프로그램

- 신규 저장은 `POST /captures`만 사용하며 `/upload`로 fallback하지 않는다.
- `SharedContextV2`는 `intent`와 중립 기본 mode `context`를 포함한다.
- 이미지·페이지 주소·핀 메모·요청을 항상 하나의 명시적 저장 단위로 보낸다.
- 페이지 URL의 username, password, query, fragment는 전송 전에 제거한다.
- 토큰 발급 실패 시 네트워크 저장을 중단한다.
- 401이면 기존 토큰을 삭제하고 새 토큰을 발급해 한 번만 재시도한다.
- 성공 후 URL을 만들거나 클립보드에 복사하지 않는다.
- Claude Code, Cursor, Codex 설정은 토큰 원문 대신 `SNAPCONTEXT_MCP_TOKEN` 환경변수를 참조한다.
- 연결 뒤 `snap_history` 검증과 터미널·에디터 재시작을 안내한다.

### Worker private API

- `POST /captures`: 유효한 `sc_` bearer 필수, `{id, expiresAt}` 반환.
- `GET /captures`: 현재 owner의 유효한 캡처만 반환.
- `DELETE /captures/{id}`: owner 확인 → R2 삭제 → D1 삭제, 성공 시 204.
- `GET /pi/{id}?exp=&sig=`: 5분 HMAC 서명 검증 뒤에만 R2 접근, `private, no-store`.
- private R2 key는 `HMAC-SHA256(secret, "obj.v2:" + id)`로 파생해 이전 Worker의 공개 `/i/{key}`로 찾을 수 없게 한다.
- 신규 D1 migration과 신규 secret은 없다.

### MCP

- user token은 `snap_history`, `snap_pack`, `snap_analyze` 모두 owner를 집행한다.
- 타인, owner 없음, 미존재는 같은 `NOT_FOUND` tool result(`isError: true`)다.
- R2 owner metadata를 우선하고 레거시는 D1 owner를 조회한다. D1 장애는 fail-closed다.
- admin은 읽기 복구용이며 REST 즉시 삭제 권한은 없다.
- `snap_analyze` mode 우선순위는 명시값 → 저장값 → `context`다.
- 캡처 제목·URL·intent·핀 메모는 `<untrusted_capture_data>` 경계 안에 둔다.
- server instructions 첫 512자는 `snap_history`, 즉시 이미지 fetch, 약 5분 만료, 403 재호출, untrusted data를 독립적으로 설명한다.

## 레거시 호환과 출시 순서

신규 private 객체는 처음부터 별도 key와 별도 route를 사용한다. 기존 `/upload`, `/i`, `/s`는 이미 설치된 확장의 호환 기간 동안만 남으며 0.4.2 확장은 호출하지 않는다.

1. 코드 검증과 preview 배포 준비.
2. 합성 이미지로 Claude Code·Cursor·Codex가 픽셀 속 marker를 읽는 smoke test.
3. 개인정보처리방침·스토어 문구·인앱 문구 일치 확인.
4. 사람 승인 후 Worker와 스토어 배포.
5. 제품 소유자가 승인한 버전 채택 기준에 도달한 뒤 레거시 write 차단.
6. 최대 30일 보관 기간과 안전 여유가 지난 뒤 `/upload`, `/i`, `/s` 제거.

Worker rollback은 R2·D1 상태를 되돌리지 않는다. 신규 private key는 이전 Worker에서 조회되지 않으므로 코드 rollback이 신규 캡처를 공개하는 privacy regression으로 이어지지 않는다.

## 개인정보와 운영

- owner hash는 지속되는 가명 식별자다.
- Cloudflare는 전송·저장 인프라 제공자다.
- 사용자가 선택한 AI 도구와 AI 제공자가 조회 데이터에 접근할 수 있다.
- 5분 이미지 URL은 만료 전 bearer URL이며 요청 URL이 인프라 로그에 남을 가능성이 있다.
- admin 읽기 접근은 지원, 보안 사고 대응, 법적 의무 이행에만 제한한다.
- full request URL, token, owner, capture id, 파생 R2 key를 애플리케이션 로그에 기록하지 않는다.

## 출시 차단 조건

- 세 실제 클라이언트 이미지 smoke test 미완료.
- Cloudflare preview binding과 invocation log 상태 미확인.
- 개인정보·스토어·인앱 문구 불일치.
- 레거시 write 차단 또는 route 제거에 대한 별도 사람 승인 없음.
- 배포, secret/config 변경, 스토어 제출, tag, merge에 대한 사람 승인 없음.

외부 사용자 dogfood와 제품 가치 검증은 0.5.0 범위다.

## 승인된 설계 기록

- ADR-015: private 경로와 레거시 호환 배포
- ADR-016: owner 오류와 admin 정책
- ADR-017: 5분 서명 이미지 URL
- ADR-018: rollback-safe private R2 key
- ADR-019: owner 승인 즉시 삭제 순서
