---
id: prd-0.4.7
date: 2026-08-30
status: draft
tags: [security, token, revoke, worker, extension, v0.4.7]
---

# SnapContext 0.4.7 — 연결 토큰 무효화 완성형 (만료 · 비밀 세대 · 새 열쇠 받기)

> 상태: **draft — 요한 결재 대기**(`goals/7-047-token-revoke-plan.md` §7). 설계 결정 = `docs/adr/022-token-v2-exp-kid-rotate.md`. 순서 결정(2026-08-30 요한 "B로"): **0.4.7은 0.4.5(관문 승급·커스텀 도메인)와 분리해 지금 착수**, 스토어 일괄 제출은 0.4.7 랜딩 후 1회(0.4.2·0.4.3·0.4.6·0.4.7).

## 한 줄 목표

연결 토큰에 **만료(90일)** 와 **비밀 세대번호**를 넣고, "새 열쇠 받기"를 누르면 **내 저장본이 새 열쇠로 옮겨져 옛 열쇠는 즉시 아무것도 못 읽게** 한다. 서버는 여전히 장부 없이 검증한다(무상태 유지). **worker + ext** 둘 다 변경 → 재심사 대상(일괄 제출에 포함).

## 왜 지금

- 위협모델(08-17)의 유일한 갭 = 유출 토큰을 죽일 수 없음(만료 없음). 0.4.3 재발급은 "새 열쇠"일 뿐 옛 열쇠가 계속 산다.
- 확장 변경이 필요한 마지막 0.4.x 항목 → 이걸 끝내야 일괄 제출이 닫힌다. 0.4.5는 서버·도메인 문제라 독립.
- 사용자 ~0인 지금이 토큰 형식을 바꾸는 최저 비용 시점(v1 보유자 = 요한 기기뿐).

## 스코프 — 티켓 7

### T1. 서버 열쇠 v2 (`worker/src/token.ts` · `auth.ts` · `env.ts`)
- v2 형식 발급·검증(ADR-022 §1): body = rand16 ‖ exp ‖ kid, HMAC은 kid 일치 비밀 하나로만. `TOKEN_KID`·`TOKEN_SIGNING_SECRET`·`TOKEN_SIGNING_SECRET_PREV` 해석. v1(body 16B)은 kid 0 비밀로 검증(유예, 0.4.8 제거 예정 — 코드 주석에 명시).
- exp 검사: `now ≥ exp` → 만료. 만료 후 30일 이내 + 서명 유효 = `expiredGrace` 상태(rotate만 허용). 시계 = `Date.now()`.
- 실패는 전부 구분된 이유(`invalid` / `expired` / `expired-grace` / `kid-unknown` / `secret-unset` → 500 fail-closed)로 반환. 조용한 통과 0.
- 테스트(먼저 실패 확인): v2 왕복 · exp 경계(−1초/+0초/+1초) · kid 불일치 401 · PREV로 서명된 kid−1 토큰 통과 · PREV 미설정 시 kid−1 401 · v1 유예 통과 · 비정규형 거부 · 위조 MAC 거부 · 비밀 미설정 500.

### T2. 서버 회전 `POST /token/rotate` (`worker/src/index.ts` 또는 신규 `token-routes.ts` · `history.ts`)
- Bearer 필수(유효 또는 expired-grace), Origin `chrome-extension://` 필수, 분당 5회/IP(기존 카운터 모듈 패턴, `/token`과 Map 분리).
- 순서: 옛 토큰 검증 → 새 v2 발급 → `UPDATE captures SET owner=? WHERE owner=?` → 응답 `{ token, expiresAt, movedCaptures }`. UPDATE 실패 시 새 토큰을 **응답하지 않는다**(500) — 반쪽 성공 금지.
- 테스트: 회전 후 옛 토큰으로 `GET /captures` 빈 목록 · `DELETE` 404 · MCP `snap_history` 0건 · 새 토큰으로 이전 개수 일치 · expired-grace 토큰은 rotate만 200, 그 외 401 · rate-limit 429 · Origin 403.

### T3. 객체 키 비밀 분리 (`worker/src/private-object-key.ts` · `image-url.ts` · `pack.ts` · `private-capture-routes.ts` · `env.ts` · `wrangler.jsonc`)
- `OBJECT_KEY_SECRET`으로 객체 키·`/pi` 서명 파생. 미설정 시 500 fail-closed(서명 비밀로 폴백 금지 — 폴백은 "조용한 우회").
- 테스트: 같은 captureId·같은 OBJECT_KEY_SECRET → 같은 키(회귀 고정) · 서명 비밀만 바꿔도 키 불변 · OBJECT_KEY_SECRET 미설정 500.
- 런북 항목: 배포 전 `OBJECT_KEY_SECRET` = 현재 `TOKEN_SIGNING_SECRET` 값으로 등록(기존 저장본 경로 보존) — 사람 게이트.

### T4. 확장 열쇠 클라이언트 (`src/utils/token.ts` · `src/utils/upload.ts`)
- 저장 구조 `{ token, expiresAt }`(v2 body 파싱, 서버 왕복 없음). `rotateUserToken()` 신설(= `POST /token/rotate`), 기존 `regenerateUserToken`은 rotate로 대체(옛 함수는 삭제, 호출처 수정).
- 시작 시 저장 토큰이 v1이면 rotate 1회 + 1회성 고지 플래그 저장. 실패하면 고지와 함께 기존 토큰 유지(조용히 버리지 않음).
- 서버 401 `expired` 응답을 구분해 상위(UI)로 전달.
- 테스트: v2 파싱 · v1 자동 전환(1회만) · rotate in-flight 가드 · 실패 시 기존 토큰 보존 · 만료 판정 경계.

### T5. 설정 화면·안내 (`src/sidepanel/components/ShortcutsHelp.ts` · `toast.ts` · `ImageActions.ts`)
- 토큰 행에 **"만료 D-N"** 표시(D≤14 강조). 버튼 문구 "토큰 재발급" → **"새 열쇠 받기(저장본 유지)"**, 성공 시 "저장본 N개 이전됨 · 새 토큰을 복사해 AI 도구에 다시 붙여넣으세요" + 복사 버튼 포커스.
- 사이드패널 열 때 만료 검사(alarms·백그라운드 미사용): D-14·D-3·만료 후 각 1회 안내(중복 안내 억제 플래그). 저장·조회 시 서버 `expired` → 안내 + 설정으로 이동 버튼.
- 접근성: 안내는 aria-live, 상태 배지는 텍스트 포함(색만 금지).
- 테스트: 만료 표시 계산 순수 함수 · 안내 1회성 · rotate 성공/실패 UI 상태.

### T6. 편승 문구 (`worker/src/mcp.ts` · `docs/PRIVACY.md` · `docs/GLOSSARY.md` · `README.md` · 삭제 문구)
- MCP `instructions`·도구 설명 용어를 GLOSSARY로(캡처·핀 메모·컨텍스트 팩·내 AI에 저장) — 0.4.6에서 이연된 서버 쪽 용어 통일. serverInfo version은 T7에서.
- PRIVACY: "연결 토큰은 발급 후 90일에 만료 · 새 열쇠 받기 시 저장본이 새 토큰으로 이전 · 옛 토큰은 즉시 조회 불가" + 시크릿 회전 시 영향.
- GLOSSARY: "연결 토큰 만료" · "새 열쇠 받기" 확정, 금지어 "재발급/갱신/리프레시" 정리.
- (R5-a 승인 시) 기록 삭제(내 브라우저만) vs 즉시 삭제(서버까지) 문구 구분 — 0.4.6 이월.

### T7. 마감 (`manifest.json` · `package.json` · lockfile · `worker/src/mcp.ts` serverInfo · `docs/changelog.md` · `docs/store/listing-0.4.6.md` → 0.4.7 델타 · `tests/e2e/dogfood/qa-047.mjs` · `docs/runbook-0.4.7.md`)
- 버전: 확장 4값 0.4.7 · serverInfo 0.4.7(ADR-014 — 둘 다 바뀌므로 재정합).
- QA 프로브 qa-047(실브라우저·로컬 서버): 새 열쇠 받기 → 옛 토큰 빈 목록·삭제 거부 → 새 토큰 이전 수 일치 → 만료 D-N 표시 → v1 자동 전환 고지 1회.
- 런북: 시크릿 등록(`OBJECT_KEY_SECRET`=현재 서명 비밀, `TOKEN_KID`=0) → 배포 → 스모크(rotate 실서버) → 비밀 회전 절차 → 비상 스위치 절차 → 0.4.8 v1 제거 예약.
- 스토어 문구: 프라이버시 문단 1~2줄 델타 + 업데이트 노트 0.4.7 1줄(등록 이미지 재생성은 불필요 — 설정 화면 05는 재생성, R5-b 승인 시 생성기 프레임 수정 편승).

## 확정된 결정 (ADR-022 — 요한 결재 후 approved)

- 서버 무상태 검증 유지. 회전 = 새 토큰 + D1 owner UPDATE 1회. R2 무이동.
- 자동·조용한 갱신 **없음**. 갱신은 사용자 행동 + 재붙여넣기 안내.
- "완전 revoke"의 정의 = 회전 즉시 옛 토큰의 조회·삭제 0건, exp 뒤 401(즉시 401은 B안 트리거).
- 만료 90일(R3에서 180일 선택 가능) · 만료 후 유예 30일은 rotate만.

## 비목표

- D1 발급 장부·거부 목록(B안) · 개별 토큰 즉시 401 · 자동 갱신 · 객체 키 비밀 회전(전 객체 재키잉) · v1 검증 제거(0.4.8) · 0.4.5 관문 승급·커스텀 도메인 · 스토어 제출·배포·시크릿 등록·tag(사람 게이트).

## 버전·문서 계약

- worker serverInfo 0.4.7 + 확장 4값 0.4.7(둘 다 변경, ADR-014 재정합).
- 배포 순서: **서버 먼저**(런북) → 확장 로컬 QA(qa-047) → tag `v0.4.7` → 일괄 제출(0.4.2+0.4.3+0.4.6+0.4.7). v1 유예 덕에 서버 선배포 뒤에도 0.4.6 확장은 계속 동작.
- 문서: ADR-022 approved · ADR-020 참조 정정 · changelog 0.4.7 절(토큰 형식 v2·엔드포인트·시크릿 3종·타입 변경) · PRIVACY·GLOSSARY·README · 런북 0.4.7 · 스토어 문구 델타.

## 완료 기준 (DoD)

1. `pnpm test`(확장) + worker 테스트 전부 통과(신규 포함, 먼저 실패 확인 기록) · `tsc --noEmit` · `vite build` · goal 7 게이트 · `vhk mission check` 위반 0 · BOM 0.
2. 적대 검증(critic) 웨이브마다 BLOCKER·MAJOR 0 — 체크리스트 = 영수증 부록 G(타이밍 안전 비교·정규형·fail-closed·exp 경계·kid 불일치·PREV 제거·rotate 원자성·v1 유예·조용한 실패 0·객체 키 불변).
3. 로컬 통합(dogfood): qa-047 전 항목 통과 + 기존 verify 18·qa043·qa046 회귀 0.
4. 사람: 시크릿 등록·서버 배포·실서버 스모크(런북) · tag `v0.4.7` · 일괄 제출.
