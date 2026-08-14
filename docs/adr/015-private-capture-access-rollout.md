---
id: ADR-015
date: 2026-08-05
status: accepted
tags: [privacy, access-control, rollout, compatibility, v0.4.2]
---

# ADR-015: 비공개 캡처 접근 모델과 캡처별 전환

## 상태

승인 — 2026-08-05 사용자 명시 승인. 이번 구현은 Orca 없이 단일 worktree에서 진행한다.

## 결정 질문

레거시 확장을 깨뜨리거나 rollback으로 신규 private 캡처를 공개하지 않으면서 사람 직접 전달과 MCP 저장 흐름을 어떻게 분리할 것인가?

## 범위와 비범위

- 범위: 확장 행동 이름, 신규·레거시 API 경계, write 차단·제거·rollback 승인 순서
- 비범위: 외부 사용자 제품가치 검증, OAuth·계정·동기화, 별도 staging 구축

## 맥락

기존 `/upload`, `/i/{id}`, `/s/{id}` 계약은 공개 링크를 전제로 한다. 이를 한 번에 잠그면 이미 설치된 확장이 깨지고, 두 단계로 잠근 뒤 이전 Worker로 롤백하면 공개 이미지 경로가 다시 열리는 privacy regression이 생긴다.

사람이 확장에서 바로 AI 채팅으로 전달하는 흐름은 서버 저장이 필요하지 않다. 반면 MCP로 연결된 코딩 AI가 나중에 불러오는 흐름은 owner 인증, 보관 기간, 삭제 계약이 필요하다. 두 흐름을 하나의 “공유” 동작으로 합치면 사용자는 어디로 데이터가 전송되는지 알기 어렵다.

## 결정

1. 사람용 기본 흐름을 두 가지로 분리한다.
   - `AI 채팅에 붙여넣기`: 이미지를 복사한 뒤 요청문을 복사하는 안내형 2단계. 서버 저장 없음.
   - `코딩 AI가 불러오게 저장`: 연결 코드를 사용하는 private 저장. 업로드 전 전송·보관·AI 제공자 접근을 알린다.
2. 신규 private 캡처는 기존 계약을 수정하지 않고 새 계약을 사용한다.
   - `POST /captures`
   - `GET /captures`
   - `DELETE /captures/{id}`
   - `GET /pi/{id}?exp=&sig=`
3. 0.4.2 확장은 private 저장에 `/captures`만 사용한다. `/upload`로 자동 fallback하지 않는다.
4. 기존 `/upload`, `/i`, `/s`, `{id,url}` 응답은 레거시 확장 호환을 위해 한시 유지한다. 신규 private 캡처는 처음부터 레거시 경로로 읽을 수 없어야 한다.
5. 레거시 write 차단은 제품 소유자가 실제 버전 채택률과 오류율을 확인한 뒤 별도 승인한다. 임의의 고정 채택률을 코드에 넣지 않는다.
6. 레거시 write 차단 뒤 기존 최대 보관 기간 30일과 1시간의 안전 여유가 지난 후 `/s`, 무서명 `/i`, 레거시 viewer와 fallback을 제거한다.
7. P2 이후 자동 rollback은 금지한다. 장애 시 호환 가능한 기준 버전 또는 forward fix를 사람이 선택한다.

이 결정은 ADR-010의 `/i`·`/s` 공개 예외와 ADR-012의 pack/analyze owner 미집행 범위를 신규 private 캡처에 대해 대체한다.

## 대안

- 기존 `/upload`와 `/i`를 전역으로 즉시 잠금: 계약은 단순하지만 설치된 확장을 깨뜨려 기각한다.
- 전역 P1/P2 배포 후 필요하면 이전 Worker로 rollback: 운영은 익숙하지만 공개 접근을 다시 여는 회귀가 생겨 기각한다.
- 별도 R2 bucket과 binding: 격리는 가장 명확하지만 새 인프라와 운영 계약이 추가된다. ADR-018의 파생 키 방식이 검증에 실패할 때 재검토한다.
- 외부 사용자 dogfood를 선행: 제품가치 검증에는 유용하지만 0.4.2의 보안·개인정보 결함 수정을 지연하므로 0.5.0으로 이관한다.

## 결과

- 사람은 서버 저장 여부를 행동 이름만으로 구분할 수 있다.
- 새 캡처는 배포 첫날부터 private 계약을 사용하며 레거시 공개 ID 경로에 의존하지 않는다.
- 레거시 제거까지 코드와 테스트가 두 계약을 함께 유지해야 한다.
- 배포, 레거시 write 차단, 제거, rollback은 각각 사람 승인 게이트다.
- 실제 Claude Code·Cursor·Codex 이미지 fetch는 배포 전 합성 이미지 smoke test가 필요하다.

## 근거

- Cloudflare Worker version에는 코드·binding·설정이 포함되지만 R2·D1 데이터 상태는 함께 rollback되지 않는다([Cloudflare Versions and Deployments](https://developers.cloudflare.com/workers/versions-and-deployments/), 2026-08-05 확인).
- MCP 업무 오류는 전송 오류와 분리된 tool execution error로 반환할 수 있다([MCP Tools Specification 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/server/tools), 2026-08-05 확인).

## 관련 ADR

- [ADR-010](010-mcp-auth-ingestion.md): 기존 `/upload`와 bearer 수집 계약
- [ADR-012](012-stateless-owner-admin-semantics.md): 기존 owner·admin 범위
- [ADR-016](016-owner-errors-admin-policy.md): owner 집행과 오류 의미
- [ADR-018](018-rollback-safe-private-object-key.md): rollback-safe 객체 주소
