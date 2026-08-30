---
id: ADR-022
date: 2026-08-30
status: proposed
tags: [security, token, revoke, worker, extension, v0.4.7]
---

# ADR-022: 연결 토큰 v2 — 만료(exp)·비밀 세대(kid) + 회전 시 저장본 소유권 이전 (무상태 유지)

> 상태: **proposed — 요한 결재 대기** (`goals/7-047-token-revoke-plan.md` R2·R3·R4). 승인 시 `status: approved`로 바꾸고 ADR-020의 "Tier 2 = 0.4.6" 참조를 이 문서로 정정한다.

## 맥락 (Context)

현행(ADR-011·012·020, 코드 실측 2026-08-30):

| 사실 | 근거 |
|---|---|
| 토큰 = `sc_<base64url(rand 16B)>.<base64url(HMAC-SHA256 앞 16B)>`, 서버는 발급 장부 없이 HMAC 재계산으로 검증(무상태) | `worker/src/token.ts:101-113`, ADR-011 |
| **owner = SHA-256(토큰 전문)** — 토큰이 바뀌면 owner가 바뀐다 | `worker/src/token.ts:135-142`, ADR-012 |
| 만료·비밀 세대 없음 → 유출 토큰은 비밀 교체 전까지 영구 유효, 개별 무효화 0 | `docs/research/token-threat-model.md` §갭 |
| 0.4.3 "재발급 lite" = 새 토큰(=새 owner). 옛 캡처는 옛 토큰으로만, 30일 TTL로 자연 소멸 | ADR-020 Tier 1 |
| **R2 객체 키 = HMAC(TOKEN_SIGNING_SECRET, "obj.v2:"+captureId)** — 서명 비밀을 교체하면 기존 객체 경로를 못 찾는다 | `worker/src/private-object-key.ts:12-24` |
| R2 객체 키에 owner 미포함 → owner 변경은 D1 `captures.owner` UPDATE만으로 끝난다 | 위 + `worker/migrations/0002_captures_owner.sql` |
| 토큰 소비자 = 확장(chrome.storage.local) **+ AI 도구의 정적 설정**(Claude Code·Cursor·Codex MCP 헤더에 사용자가 붙여넣음) | `src/utils/token.ts`, `docs/PRD-0.4.0` 온보딩 |

리서치(2026-08-30, `docs/research/token-revoke-research-2026-08-30.md` 요약):
- 정론(OWASP JWT/Session, RFC 7519): 완전 무상태 개별 revoke는 불가 — 최소 상태(거부 목록) 필요. 만료(exp)는 필수, 비밀 회전은 kid 4단계(신키 추가 → 신키 서명 → 구키 유예 수용 → 구키 폐기).
- 실전(GitHub PAT·Cloudflare 서비스 토큰·Sentry DSN): 주력은 "만료 + 회전", 개별 즉시 revoke는 장부가 있는 제품의 부가 기능.
- 권고 만료: 장기 API 키 90일(고위험 30일), 무만료는 명시적 선택.

## 결정 (Decision)

**A+안 — 토큰 v2(exp·kid) + "회전 = 새 토큰 + 저장본 소유권 이전" + 객체 키 비밀 분리. 서버 무상태 검증 유지.**

1. **토큰 v2 형식**: `sc_` + base64url(`rand 16B ‖ exp uint32 BE(초, UTC) ‖ kid uint8`) + `.` + base64url(HMAC-SHA256(secret[kid], body 21B) 앞 16B). 접두·마스킹·확장의 형식 검사(`sc_` + 점 1개)는 그대로. v1(body 16B)과 v2(body 21B)는 body 길이로 구분한다. base64url 정규형 강제 유지.
2. **owner 파생 유지**: owner = SHA-256(토큰 전문) (ADR-012 불변). **회전(`POST /token/rotate`)** = 옛 토큰 서명 검증 → 새 v2 발급 → D1 `UPDATE captures SET owner = ? WHERE owner = ?`(1회) → `{ token, expiresAt, movedCaptures }`. R2는 건드리지 않는다(객체 키에 owner 없음).
   - 효과: 옛 토큰은 **즉시 소유 0**(목록 빈 값·삭제 불가·MCP 조회 0건), exp 도달 시 401. 이것이 0.4.7의 "완전 revoke" 정의다.
   - 한계(정직하게): 옛 토큰이 exp 전까지 **401이 아니라 "빈 사용자"**로 남는다(새 캡처 업로드는 가능 — 아무 토큰으로나 가능한 일이라 위협 증가 없음). 즉시 401은 상태 없이는 불가 → B안 승급 트리거(아래)로 남긴다.
3. **만료**: 절대 만료, 기본 **90일**(결재 R3: 180일 대안). 갱신은 **사용자 행동으로만** — 자동·조용한 갱신은 기각한다(이유: 토큰이 AI 도구의 정적 설정에도 들어가 있어, 확장이 조용히 바꾸면 도구 쪽 연결이 조용히 끊긴다 = 제품 원칙 "조용한 실패 0" 위반). 확장은 만료 D-14·D-3·만료 후에 안내하고 원클릭 "새 열쇠 받기 → 복사 → 도구에 다시 붙여넣기"를 제공한다.
   - **만료 후 유예 30일**(= 캡처 최대 보관 기간): 서명이 맞으면 `/token/rotate`만 허용(저장본 이전용). 다른 모든 경로는 401. 유예가 지나면 이전할 캡처가 없으므로 그냥 새 발급.
4. **kid·비밀 회전**: 환경값 `TOKEN_KID`(정수, `wrangler.jsonc` vars) · 시크릿 `TOKEN_SIGNING_SECRET`(현재 kid) · `TOKEN_SIGNING_SECRET_PREV`(kid−1, 없으면 미설정). 검증은 토큰의 kid와 일치하는 비밀 **하나로만** HMAC 재계산(순차 시도 금지 — 오분류·타이밍 표면 방지). v1 토큰은 kid 0(초기 비밀)로 검증하되 **0.4.7 한 릴리즈만 유예**, 0.4.8에서 v1 검증 제거.
   - 회전 절차(런북): 새 비밀 생성 → `PREV = 현재`, `SECRET = 새`, `KID += 1` 배포 → 최대 exp(90일) 뒤 `PREV` 제거. **비상 스위치** = `PREV` 즉시 제거 + `KID += 1` → 구세대 토큰 전부 401(전원 재발급, 사용자 ~0이라 비용 낮음).
5. **객체 키 비밀 분리**: 시크릿 `OBJECT_KEY_SECRET` 신설, `derivePrivateObjectKeys`·`/pi` 서명·pack 조회가 이것을 쓴다. **배포 시 초기값 = 현재 `TOKEN_SIGNING_SECRET` 값**(기존 객체 경로 보존, 데이터 이동 0). 이후 서명 비밀은 자유롭게 회전. `OBJECT_KEY_SECRET`은 회전하지 않는다(회전 = 전 객체 재키잉, 범위 밖).
6. **엔드포인트 계약**: `POST /token`(v2 발급, 현행 게이트 유지: Origin `chrome-extension://` 필수·분당 10회/IP) · `POST /token/rotate`(Bearer 필수·Origin 동일 규칙·분당 5회/IP·유예 규칙 §3). 응답 실패는 전부 구조화 에러(빈 성공 금지). D1 스키마 변경 없음.
7. **확장 계약**: 저장 구조에 `expiresAt`(토큰 body에서 파싱, 서버 왕복 없음) 추가. 설정 화면의 "토큰 재발급" 버튼 → "새 열쇠 받기(저장본 유지)" = rotate 호출. 저장된 v1 토큰을 발견하면 **첫 실행에 rotate 1회 + 1회성 고지**("연결 토큰 형식이 바뀌었습니다 — AI 도구에 다시 붙여넣어 주세요"). v1 보유자는 요한 기기뿐(0.4.0+ 확장은 스토어 미게시).

## 대안 (Alternatives)

| 안 | 기각 이유 |
|---|---|
| **B안** D1 발급 장부 + 거부 목록(ADR-020 Tier 2) | 매 요청 D1 read → 무상태(ADR-011) 포기. 사용자 ~0·단일 운영자·캡처 TTL ≤30일 조건에서 과투자. "그때 가서" 항목으로 유지(아래 트리거) |
| 토큰에 불변 uid(subject) 넣고 owner = uid | 무상태에서 uid를 고정하면 **회전해도 옛 토큰이 같은 uid로 계속 읽는다** = revoke가 사라진다. 정론의 "sub 불변"은 장부 기반 revoke가 있는 세계의 관행. 우리 구조에선 owner = 토큰 해시가 곧 revoke 장치 |
| 만료 임박 시 확장이 조용히 자동 갱신 | AI 도구의 정적 설정이 조용히 끊김(조용한 실패). 갱신은 사용자 행동 + 재붙여넣기 안내로 |
| 만료 없음 유지 + kid만 | 유출 토큰의 수명이 무한 — 위협모델 갭 그대로 |
| 짧은 만료(7일) + 자동 갱신 | 위와 같은 이유로 자동 갱신 불가 → 사용자 재붙여넣기 주기가 너무 잦음 |
| 서명 비밀 회전 시 R2 객체 재키잉 | 전 객체 복사·삭제, 비용·리스크 과다. 객체 키 비밀 분리로 회피 |

## 결과 (Consequences)

- (+) 유출 토큰의 수명이 유한(≤90일)해지고, 사용자가 원하면 즉시 "내 저장본에서 분리"할 수 있다. 서버 검증은 여전히 D1 read 0.
- (+) 비상 시 전 토큰 일괄 무효화 스위치가 생긴다(운영 런북 1장).
- (−) 90일마다 AI 도구에 토큰을 다시 붙여넣어야 한다 → 설정 화면 안내·원클릭 복사로 마찰 최소화. 결재 R3에서 180일로 완화 가능.
- (−) 옛 토큰은 exp 전까지 "빈 사용자"로 남는다(즉시 401 아님). 로드맵 DoD 문구("revoke 즉시 구토큰 401")를 **"revoke 즉시 옛 토큰의 조회·삭제 0건 + exp 뒤 401"**로 정정한다(결재 R2에 포함).
- 시크릿 추가 2개(`OBJECT_KEY_SECRET`, `TOKEN_SIGNING_SECRET_PREV`(회전 시)) + vars 1개(`TOKEN_KID`) → 배포 런북 `docs/runbook-0.4.7.md`에 등록·회전·비상 절차와 **배포 전 확인**(OBJECT_KEY_SECRET = 현재 서명 비밀 값) 고정.
- 문서 갱신: `docs/PRIVACY.md`(연결 토큰 만료·재발급 시 저장본 이전) · `docs/GLOSSARY.md`(연결 토큰 만료/새 열쇠 받기) · ADR-020(Tier 2 참조 0.4.6 → 이 문서) · 스토어 문구 0.4.7 델타.
- **B안 승급 트리거(하나라도 발생 시 ADR 재개)**: ① 본인 외 실사용자가 생겨 kid 일괄 회전의 재발급 비용이 커질 때 ② "이 토큰 하나만 지금 당장 죽여줘"(탈취 신고·기기 분실) 요구가 실제로 발생할 때 ③ 결제·PII 등 실패 비용이 큰 데이터가 캡처에 결합될 때(전역 규칙: 상태 기반 통제 필수).
