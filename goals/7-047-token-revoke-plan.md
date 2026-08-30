---
vhk_format: 1
type: plan
goal: 7
title: 0.4.7 구현 계획 영수증 — 연결 토큰 무효화 완성형 (Fable 지휘 · Claude 하위모델 + Cursor 모델)
status: PENDING_APPROVAL
date: 2026-08-30
conductor: Claude Fable 5 (Claude Code 세션 d53fcbfd, Orca 지휘 터미널)
execution_provider: orca-ready (manual-send 어댑터 — 0.4.6 부록 C 검증 경로)
spec: docs/PRD-0.4.7.md (draft) · docs/adr/022-token-v2-exp-kid-rotate.md (proposed)
research: docs/research/token-threat-model.md (08-17) · 코드 정찰·정론 조사 2026-08-30 (§2)
ledger: docs/dogfood/2026-08-29-orchestration-ledger.md (이어서 append, DF-69~)
---

# 0.4.7 구현 계획 영수증

> 용어 한 줄 사전 — **연결 토큰(열쇠)**: 내 캡처를 내 AI만 꺼내 보게 하는 문자열. **만료**: 열쇠가 스스로 죽는 날짜. **비밀 세대**: 서버가 열쇠에 도장 찍는 비밀의 버전 번호 — 올리면 옛 도장 열쇠 전부 무효. **새 열쇠 받기**: 새 열쇠를 받으면서 내 저장본을 새 열쇠로 옮기는 동작(옛 열쇠는 즉시 빈손). **무상태**: 서버가 열쇠 장부를 들고 있지 않음(지금 구조). **지휘자/워커/웨이브/적대 검증**: 0.4.6 영수증과 동일. 이 문서는 "검증"만 쓴다.

## 1. 목적 한 줄

새거나 잃어버린 열쇠를 **즉시 내 저장본에서 떼어내고**, 모든 열쇠에 **유효기간(90일)** 을 붙이며, 비상시 **전 열쇠 일괄 무효화 스위치**를 갖춘다 — 서버 구조(무상태)는 바꾸지 않고.

## 2. 현재 상황 (2026-08-30 실측 — 리서치 2건 요약)

| 확인한 것 | 결론 |
|---|---|
| 지금 열쇠 | 만료 없음, 개별 무효화 불가. 0.4.3 "재발급"은 새 열쇠를 줄 뿐 옛 열쇠도 계속 산다 |
| 사용자 식별 | **열쇠 자체의 지문(해시)이 곧 사용자 번호** → 열쇠를 바꾸면 옛 저장본과 연결이 끊긴다. 뒤집어 말하면, 저장본의 사용자 번호만 새 열쇠 쪽으로 고쳐 쓰면 옛 열쇠는 즉시 빈손이 된다(장부 불필요) |
| 저장 파일 경로 | 서버 저장 파일의 경로도 **같은 비밀**로 만들어진다 → 비밀 세대를 올리면 옛 파일을 못 찾는다. **경로용 비밀을 따로 분리**해야 한다(이번 설계의 숨은 필수 조건) |
| 열쇠가 사는 곳 | 확장 안 + **AI 도구 설정에 사용자가 붙여넣은 정적 문자열** → 확장이 조용히 열쇠를 바꾸면 도구 쪽이 조용히 끊긴다. 자동 갱신은 안 된다 |
| 정론(OWASP·RFC·실제 제품) | 장부 없이 "이 열쇠 하나만 지금 즉시" 죽이는 건 불가. 실전 주력은 **만료 + 비밀 회전**, 개별 즉시 무효화는 장부 있는 제품의 부가 기능. 장기 열쇠 권장 수명 90일 |

→ 권고안 **A+**: 만료·비밀 세대 도입 + "새 열쇠 받기 = 저장본 이전" + 경로용 비밀 분리. 장부(B안)는 트리거 3개와 함께 보류.

## 3. 범위·리스크

| 구분 | 내용 |
|---|---|
| 손대는 곳 | **서버**(열쇠 발급·검증·회전·경로 비밀 분리) + **확장**(열쇠 저장·설정 화면·안내) + 문서(결정문·PRD·개인정보·용어 사전·런북·스토어 문구 델타) + 버전(확장 4값·서버 1값 → 0.4.7) |
| 영향받는 사람 | 열쇠 보유자 = 요한 기기뿐(0.4.0+ 확장은 스토어 미게시). 첫 실행 때 자동으로 새 형식 열쇠로 바뀌고 "AI 도구에 다시 붙여넣기" 1회 안내 |
| 예상 규모 | 파일 약 28개(서버 코드 8·서버 검증 4·확장 코드 4·확장 검증 3·문서 9) — **L**(인증·보안 하드 트리거 + 서버·확장 동시) |
| 리스크 1 | 비밀 세대를 올리면 저장 파일 경로가 바뀌어 저장본 전부 실종 → **경로용 비밀 분리**(T3) + 배포 전 "경로용 비밀 = 현재 비밀 값" 등록을 런북·사람 게이트로 고정 + 검증에 "서명 비밀만 바꿔도 경로 불변" 고정 |
| 리스크 2 | 회전 도중 반쪽 성공(새 열쇠는 줬는데 저장본 이전 실패) → 이전이 실패하면 새 열쇠를 **응답하지 않음**(검증 케이스 고정) |
| 리스크 3 | 옛 열쇠가 만료 전까지 "빈 사용자"로 살아 있음(즉시 401 아님) → 위협 증가 없음(새 업로드는 어차피 아무 열쇠로나 가능). 로드맵 완료 기준 문구 정정(R2) |
| 리스크 4 | 90일마다 도구에 다시 붙여넣기 마찰 → 설정 화면 D-14·D-3 안내 + 원클릭 복사. R3에서 180일 선택 가능 |
| 리스크 5 | 서버 코드에 워커 투입 = 0.4.6에서 금지했던 영역 → 스코프 계약을 서버 허용으로 재설정하되 **배포·시크릿 명령은 여전히 사람** |
| 리스크 6 | Orca 회귀·워커 스코프 이탈(0.4.6 원장 반복) → 0.4.6 우회 목록(부록 H) 그대로 + 적대 검증 3중 |
| 비용 | 요한 = 결재 1회(R1~R6) · 머지 결재 3회 · 시크릿 등록 2개 · 서버 배포 1회 · 실서버 스모크 1회 · tag 1회 · 일괄 제출 1회. 나머지 전부 AI(구독 한도 안) |

## 4. 투입 AI

| 역할 | 모델 | 실행면 | 하는 일 |
|---|---|---|---|
| 지휘자 | Claude **Fable 5** (이 세션) | Orca 지휘 터미널 | 계획·티켓 스펙·워커 배분·통합·PR·보고. 결정문·PRD 작성(완료) |
| 정찰 | Claude **haiku** (explorer) | 서브에이전트, 읽기 전용 | 코드 사실 수집(완료 — 부록 A 근거) |
| 조사 | Claude **sonnet** (general) | 서브에이전트, 웹 조사 | 정론·제품 사례(완료 — §2) |
| 구현 워커 (서버·확장 표준 티켓) | Cursor **`cursor-grok-4.6-high`** | Orca 작업 폴더 + 터미널(manual-send) | T1+T3+T2(서버, 한 작업 폴더 직렬) · T4+T5(확장) · T7 마감 |
| 구현 워커 (문서·문구 티켓) | Cursor **`composer-2.5`** | 위와 동일 | T6 편승 문구 · 런북 초안 |
| 적대 검증 | Claude **opus** (critic — 0.3.0~0.4.6 반복 결함 메모리) | 서브에이전트, 읽기 전용 | 웨이브마다 diff 깨뜨리기(부록 G), 문제 0까지 |
| 소형 수정·커밋 | Claude **sonnet** (shipper) | 지휘자 프로세스 안 | 통합 브랜치 정리 |
| 다른 눈 원칙 | Cursor가 만들면 Claude가 검수 | — | 만든 벤더 ≠ 검수 벤더 |

제외: Codex·Antigravity · Claude 모델을 Orca 새 터미널로 띄우는 것(회귀 #16095).

## 5. 단계표

### Wave 0 — 정비 (지휘자 단독, 결재 전 실행 가능 — 되돌리기 쉬운 문서 정리)

| # | 담당 | 하는 일 | 완료 확인 |
|---|---|---|---|
| 0-1 | 지휘자 | 결정문(ADR-022)·PRD-0.4.7·goal 7·이 영수증 작성 | 파일 4개 |
| 0-2 | 지휘자 | 로드맵 트랙 F에서 0.4.7 착수 조건을 "0.4.5 랜딩" → "0.4.6 랜딩(0.4.5와 독립)"으로, 완료 기준 문구를 ADR-022 정의로 정정 | 로드맵 1행 |
| 0-3 | 지휘자 | 옛 결정문(ADR-020)의 "완성형 = 0.4.6" 참조를 0.4.7/ADR-022로 정정(감사 M9 미처리분) | ADR-020 2곳 |
| 0-4 | 지휘자 | 할 일 목록·상태 문서 진입점 갱신, 리서치 결과 파일 보관 | TASKS·next-task·research 파일 |

### Wave 1 — 서버 열쇠 v2 (승인 후 착수, 한 작업 폴더 직렬)

| # | 담당 | 하는 일 | 완료 확인 |
|---|---|---|---|
| 1-0 | 지휘자 | 스코프 계약을 0.4.7로 재설정(서버 허용·배포/시크릿 금지 명시) · Orca Run 생성 · 스모크 1회 | 계약 갱신 + 배선 증명 |
| 1-1 | Cursor grok | **T1 열쇠 v2** — 만료·비밀 세대를 넣은 새 형식 발급·검증, 실패 이유 구분, 옛 형식은 한 릴리즈 유예. **먼저 실패하는 검증 작성** → 구현 | 검증 9종 통과 + 기존 서버 검증 전부 통과 |
| 1-2 | Cursor grok | **T3 경로용 비밀 분리** — 저장 파일 경로·이미지 임시 주소가 새 비밀을 쓰게, 미설정이면 실패(우회 금지) | "서명 비밀만 바꿔도 경로 불변" 검증 통과 |
| 1-3 | Cursor grok | **T2 새 열쇠 받기** — 옛 열쇠 확인 → 새 열쇠 → 저장본 사용자 번호 이전(1회) → 응답. 이전 실패 시 새 열쇠 미응답. 분당 5회 제한, 만료 후 30일은 이 동작만 허용 | 검증 7종 통과 |
| 1-4 | Claude opus | 적대 검증(부록 G: 타이밍 안전·정규형·fail-closed·만료 경계·세대 불일치·이전 원자성·유예·경로 불변) | 문제 0 |
| 1-5 | 지휘자 → **요한** | 통합 검증 → PR #1 → **머지 결재 ★** | 머지 |

### Wave 2 — 확장 + 문구 (작업 폴더 2개 병렬, W1 머지 후)

| # | 담당 | 하는 일 | 완료 확인 |
|---|---|---|---|
| 2-A | Cursor grok | **T4+T5 확장** — 열쇠에서 만료일 읽기, "새 열쇠 받기(저장본 유지)" 버튼, 옛 형식 열쇠는 첫 실행에 자동 전환 + 1회 고지, 설정 화면 "만료 D-N", D-14·D-3·만료 후 안내 1회, 서버 "만료" 응답 시 설정으로 안내. 조용한 실패 0 | 검증 8종 통과 + 기존 확장 검증 전부 통과 |
| 2-B | Cursor composer | **T6 편승 문구** — 서버 쪽 AI 안내 문구 용어 통일, 개인정보 문서(만료·이전), 용어 사전(새 열쇠 받기), README, (R5-a) 삭제 문구 구분 · 런북 초안 | 금지 용어 0 · PRIVACY↔PRD 대조 |
| 2-C | Claude opus | 적대 검증(UI 배선 검증 유무·조용한 실패·stale 문구·1회성 고지 누출) | 문제 0 |
| 2-D | 지휘자 → **요한** | 통합 → PR #2 → **머지 결재 ★** | 머지 |

### Wave 3 — 마감 (직렬, W2 머지 후)

| # | 담당 | 하는 일 | 완료 확인 |
|---|---|---|---|
| 3-1 | Cursor grok | **T7** — 버전(확장 4값 + 서버) 0.4.7, changelog, 스토어 문구 델타, 실브라우저 QA 프로브 qa-047, 런북 완성(시크릿 등록·배포·회전·비상 스위치·0.4.8 옛 형식 제거 예약) | 게이트 통과 · qa-047 로컬 전 항목 |
| 3-2 | Claude opus | 검증 + 완료 기준 전체 대조 | 문제 0 |
| 3-3 | 지휘자 → **요한** | PR #3 → **머지 결재 ★** | 머지 |

### Wave 4 — 배포·마감 (사람 게이트 + 보고)

| # | 담당 | 하는 일 | 완료 확인 |
|---|---|---|---|
| 4-1 | **요한** | 런북대로 시크릿 등록(경로용 비밀 = 현재 서명 비밀 값 · 세대번호 0) → **서버 배포 ★** | 런북 체크 |
| 4-2 | 지휘자 | 실서버 스모크(새 열쇠 받기 → 옛 열쇠 빈 목록 → 새 열쇠 이전 수 일치 → 이미지 임시 주소 열림) — 사람 확인용 수치 보고 | 전 항목 PASS |
| 4-3 | **요한** | tag `v0.4.7` ★ → **일괄 제출**(킷 0.4.7 델타 반영) ★ | tag·제출 |
| 4-4 | 지휘자 | 세션 로그·Dev Log·원장 정리·보고서(0.4.6 3종 형식 재사용, 변경분만)·메모리 역전파 · goal 7 완료 처리 | 문서 3+ |

## 6. 합격 기준

1. PRD-0.4.7 완료 기준 4항 그대로(확장+서버 검증 전부 통과·타입검사+빌드·스코프 위반 0·goal 7 게이트·critic 웨이브 3회 문제 0·qa-047·사람 게이트).
2. 저장본 무손실: 배포 전후 같은 캡처가 같은 경로에서 열림(런북 스모크 항목) — 리스크 1의 실측 증거.
3. 오케스트레이션 증거: 티켓마다 완료 신호 + report.md, 워커 보고 7항 규약 + `[근거 불일치]`, 지휘자 재측정 불일치 0.
4. 다른 눈 원칙 위반 0. 원장 항목 전부 보고서에 분류.

## 7. 요한 결재 사항

| # | 질문 | 선택지 (권고 = 굵게) |
|---|---|---|
| **R1** | 이 계획 승인? | 승인 / 수정 |
| **R2** | 열쇠 방식 | **A+ — 만료·비밀 세대 + 새 열쇠 받기 = 저장본 이전(무상태 유지)**. 동시에 "완전 무효화" 정의를 "즉시 옛 열쇠 조회·삭제 0건 + 만료 뒤 401"로 정정 승인 / B — 서버 장부·거부 목록(즉시 401, 매 요청 조회, 구조 변경) |
| **R3** | 만료 기간 | **90일(정론)** / 180일(재붙여넣기 마찰 완화) |
| **R4** | 자동 갱신 | **없음 — 사용자 행동 + 안내(D-14·D-3·만료 후)** / 확장만 자동 갱신(도구 쪽 조용히 끊김 — 비권고) |
| **R5** | 편승 | a. 기록 삭제 vs 즉시 삭제 문구 구분(0.4.6 이월, 문구만) — **편승** / b. 스토어 이미지 생성기 프레임 수정(저장됨 배지 장면) — **편승**(설정 화면 이미지를 어차피 재생성) / c. 깨진 자동 검사 1종(업로드 공유) 재배선·폐기 결정 — **폐기 결정만 편승**, 재배선은 0.4.8 / d. 나머지 검사 기반 3건 — 0.4.8 |
| **R6** | PR 단위 | **웨이브당 1 PR(3개)** / 티켓당 |
| R7 | (승인 후 순차) PR 머지 3회 · 시크릿 등록 · 서버 배포 · tag · 일괄 제출 | 각 시점에 요청 |

## 8. 독푸딩 보고 약속

0.4.6과 동일 — 원장(DF-69~)에 append, 종료 시 운영 매뉴얼 피드백·작업 일지·워커 보고 규약의 **변경분만** 보고서로. 0.4.6에서 확정된 어댑터·규약은 정본 후보로 승격 여부를 별도 표기.

---

# 기술 부록 (구현 AI 전용)

## A. 티켓 → 파일·심볼 맵 (2026-08-30 explorer 실측, 라인은 참고값)

| 티켓 | 파일 | 심볼·근거 |
|---|---|---|
| T1 | `worker/src/token.ts` | `issueUserToken`(:101-113) `verifyUserToken`(:79-90,:132) `ownerFromToken`(:135-142) `timingSafeEqualBytes`(:7-18) 정규형 검사(:61-63). v2: body 21B = rand16‖exp u32BE‖kid u8, HMAC(secret[kid]) |
| T1 | `worker/src/auth.ts` | `resolveMcpAuth`(:96-132) — admin 정확일치 → sc_ HMAC → 500 fail-closed → 401. 실패 이유 enum 추가 |
| T1 | `worker/src/env.ts` · `worker/wrangler.jsonc` | `TOKEN_SIGNING_SECRET`(:6) + `TOKEN_SIGNING_SECRET_PREV`(secret, optional) + `TOKEN_KID`(vars, int) + `OBJECT_KEY_SECRET`(secret) |
| T1 | `worker/src/index.ts` | `POST /token`(:112-130) Origin 게이트(:114-115), 500 fail-closed(:118-122) — v2 발급으로 교체 |
| T2 | `worker/src/index.ts` 또는 신규 `worker/src/token-routes.ts` | `POST /token/rotate` — Bearer 검증(valid 또는 expired-grace) → issue v2 → `UPDATE captures SET owner=? WHERE owner=?` → `{token, expiresAt, movedCaptures}`. 분당 5회 카운터는 `token-rate-limit.ts` 패턴 복제(Map 분리) |
| T2 | `worker/src/history.ts` | owner 필터 SQL(:46) 재사용 — 이전 후 옛 owner 0건 검증 |
| T2 | `worker/src/private-capture-routes.ts` | `DELETE ... WHERE id=? AND owner=?`(:273) — 옛 토큰 404 검증 |
| T3 | `worker/src/private-object-key.ts` | `derivePrivateObjectKeys(captureId, secret)`(:12-24) — 호출부 4곳(`private-capture-routes.ts:168,264,304`·`pack.ts:73`)이 `OBJECT_KEY_SECRET`을 넘기게 |
| T3 | `worker/src/image-url.ts` | `/pi` 서명(:25-72) — OBJECT_KEY_SECRET 사용(TTL 5분) |
| T4 | `src/utils/token.ts` | `ensureUserToken`(:41-53) `regenerateUserToken`(:69-84 → `rotateUserToken`으로 대체) `isValidTokenFormat`(:21-27, 유지) `maskToken`(:159-165) in-flight 가드(:29-58). 저장 키 `snapcontextToken`(:6) → `{token, expiresAt}` 구조 |
| T4 | `src/utils/upload.ts` | Bearer 사용처 `POST /captures`(:100) `GET /captures`(:160) `DELETE`(:183) — `expired` 401 구분 전달 |
| T5 | `src/sidepanel/components/ShortcutsHelp.ts` | 토큰 행·재발급 버튼(:140-161) → 만료 D-N·새 열쇠 받기·이전 수·복사 포커스 |
| T5 | `src/sidepanel/toast.ts` · `ImageActions.ts` | 안내 1회성 플래그(storage.local) · 서버 expired → 설정 이동 |
| T6 | `worker/src/mcp.ts` | `SERVER_INSTRUCTIONS`(:19-48) 용어 · serverInfo(:47, 0.4.4 → 0.4.7은 T7) |
| T6 | `docs/PRIVACY.md` · `docs/GLOSSARY.md` · `README.md` | 만료·이전·새 열쇠 받기 · 삭제 문구 구분(R5-a) |
| T7 | `manifest.json`(:4) `package.json`(:3) lockfile 2곳 · `worker/src/mcp.ts:47` | 4값 + serverInfo 0.4.7 (`check-version-sync`) |
| T7 | `tests/e2e/dogfood/qa-047.mjs`(신규, qa-046 뼈대) · `docs/runbook-0.4.7.md`(신규, runbook-0.4.4 뼈대) · `docs/store/listing-0.4.6.md` → `listing-0.4.7.md`(델타) · `scripts/check-goal-7.mjs`(`vhk goal sync` 백필 후 보강) | — |
| 검증 파일 | worker: `worker/test/token.test.ts`·`token-route.test.ts`·`token-mcp-auth.test.ts`(기존 ~35) + `token-rotate.test.ts`·`object-key.test.ts`(신규) / ext: `tests/token.test.ts`(기존 41) + settings·toast 검증 | — |

## B. 작업 폴더·브랜치·PR

| 웨이브 | 브랜치 | 작업 폴더 | PR |
|---|---|---|---|
| W1 | `047-w1`(T1→T3→T2 직렬, 한 워커) | Orca worktree 1 (`--agent cursor`) | #1 → master |
| W2 | `047-w2a`(T4+T5) · `047-w2b`(T6) → 통합 `047-w2` | worktree 2개 병렬 | #2 → master |
| W3 | `047-w3`(T7) | worktree 1 | #3 → master |

스택 PR 금지(DF-60): 각 웨이브는 머지된 master에서 분기. 머지는 요한이 GitHub에서(squash 가능 — 스택이 아니므로 충돌 없음).

## C. Orca 실행 시퀀스

0.4.6 영수증 부록 C(manual-send 어댑터: `worktree create --agent cursor` 첫 탭 → `terminal send` 한 줄 지시 → 12초 뒤 제출 확인 → 완료 = status 메일 `DONE:<task>` + report.md 커밋 → 지휘자 재측정)를 그대로 쓴다. 지시문 끝 문장부호 금지, 동시 기동은 스태거, 끝난 worktree 즉시 제거.

## D. 워커 스펙 템플릿 + 보고 형식

0.4.6 부록 D + `docs/dogfood/2026-08-30-report-3-worker-report-contract.md` v2(7항 + `[근거 불일치]`). 서버 티켓 추가 규칙: **`wrangler deploy`·`wrangler secret`·프로덕션 바인딩 접근 금지**, 로컬 검증은 `worker` 테스트 + dogfood 로컬 서버(`pnpm dogfood:up`)만.

## E. 스코프 계약 (승인 직후 `vhk mission set`)

- objective: "SnapContext 0.4.7 — ADR-022 A+ (worker+ext). T1~T7. test-first. 금지: 배포·시크릿·tag·스토어 제출(사람) · D1 스키마 변경 · 자동 갱신 · 장부/거부 목록."
- scope: 0.4.6 목록 + `worker/src/**` · `worker/test/**` · `worker/wrangler.jsonc`(vars만) · `worker/migrations/**`(변경 금지지만 읽기 허용)
- forbidden: `**/*.env` · `**/.dev.vars*` · `docs/ui-audit/**` · `worker/migrations/**`(쓰기) · `.github/workflows/**`

## F. DoD 명령 (웨이브마다 통합 브랜치에서)

`pnpm test` · `pnpm --dir worker test`(또는 레포 스크립트) · `npx tsc --noEmit` · `pnpm build` · `VHK_GATES_SKIP_DEEP=1 node scripts/check-goal-7.mjs` · `vhk mission check` · BOM 검사 · W2 이후 `pnpm dogfood:up` → `dogfood:verify`·`qa043`·`qa046`·(W3) `qa047`.

## G. critic 체크리스트 (0.4.6 부록 G + 토큰 특화)

1. 바이트 비교는 타이밍 안전(`timingSafeEqualBytes`)만 · base64url 정규형 거부 유지 · 비밀 미설정 = 500(폴백 0).
2. exp 경계 3점(−1/0/+1초) · kid 불일치 401 · PREV 제거 시 kid−1 401 · v1 유예는 kid 0만.
3. rotate: 이전 UPDATE 실패 시 토큰 미응답 · 옛 토큰 조회 0·삭제 404·MCP 0건 · expired-grace는 rotate 외 전부 401 · rate-limit·Origin.
4. 객체 키: 서명 비밀 변경 후 키 불변 · OBJECT_KEY_SECRET 미설정 500.
5. 확장: v1 자동 전환 1회성 · 실패 시 기존 토큰 보존 · 안내 1회성 플래그 · UI 배선 검증 존재(뮤턴트 생존 0) · aria-live · 조용한 실패 0.
6. 문서: PRIVACY↔PRD↔ADR 수치 일치(90일·30일 유예·5분) · 금지 용어 0 · changelog 타입 변경 기재 · 런북에 "OBJECT_KEY_SECRET = 현재 서명 비밀" 명시.

## H. 우회 목록

0.4.6 부록 H 그대로(Orca `--deps` 미사용 · worktree create → terminal 2단계 · Claude는 서브에이전트만 · dispatch 대신 manual-send · Bash 도구 백슬래시는 Write 도구(DF-66)).
