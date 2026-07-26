---
id: prd-0.4.2
date: 2026-07-26
tags: [prd, privacy, worker, mcp, image-delivery, onboarding, v0.4.2]
---

# SnapContext 0.4.2 PRD — Private-by-Design (owner-gate · 서명 이미지 · 온보딩 승격)

> 이 문서는 **무엇을/왜**. 실행 순서는 Phase·티켓 표. 설계는 세대 플랜(`~/.claude/plans/0-3-0-prd-zippy-finch.md`) + 아키텍처 Plan 에이전트 조사로 이미 확정 — 세대 플랜 대비 변경 2건: ①1차 배포=owner-gate만(서명 /i 2차 이동 — /s 뷰어(`lib.ts:212`)의 무서명 /i 임베드 회귀 해소) ②착수 게이트 재배치(plan-audit 승인=코딩 착수, 0.4.0 심사통과=재심사#1 제출 전 조건, 0.4.1 배포=1차 배포에 흡수 — 2026-07-27 감사 설문 승인). 나머지는 스펙 정리. **이 PRD는 plan-audit 승인이 착수 게이트다.**

## 한 줄 정의

**내 토큰의 AI만 내 캡처를 본다.** "못 맞추는 링크(id=capability)" 모델 → 아이덴티티-프라이빗 전환: `snap_pack`/`snap_analyze` owner 집행 + `/i` 이미지 인증전달(서명 URL) + 공개 `/s` 뷰어 폐기 + 온보딩 발견성 승격.

## 배경 (0.4.0/0.4.1 완료 상태)

- 0.4.0: per-user HMAC 토큰 + owner(SHA-256(토큰)) 스탬프 + MCP 자발사용 + 만료 1/7/30일. 미출시(심사 대기).
- 0.4.1: `/upload` rate-limit + 2트랙 버전 스킴(ADR-014). worker-only, 미배포.
- **문제 (0.4.0이 남긴 프라이버시 구멍)**:
  - ① **`snap_pack`/`snap_analyze`가 owner 무검사** (`mcp.ts:102·147`, 주석 `mcp.ts:74`) — 아무 유효 토큰이나 id만 알면 남 캡처를 통째로 읽는다. owner 격리는 `snap_history`(목록)에만 적용 — ADR-012 **결정#3**이 owner 필터를 조회 전용으로 좁혀 pack/analyze를 사실상 무검사로 남겼다.
  - ② **`/i`·`/s`가 무인증** (`index.ts:236`·`268`) — id가 곧 열쇠. `/i`는 사람 공유용이 아니라 **AI가 이미지를 fetch 하는 통로**(`pack.ts:79`가 다이제스트에 `/i/{id}` 공개 URL 삽입)라, 삭제가 아니라 인증전달로 대체해야 한다. 게다가 `/s` 뷰어(`lib.ts:212`)가 **서명 없는** `/i`를 임베드하므로 `/i` 서명강제와 `/s` 유지는 같은 배포에 못 둔다(→결정#6 2단계).
  - ③ **온보딩 발견성 0** — 토큰·연결명령 UI가 기어 드롭다운 셋째 그룹(`ShortcutsHelp.ts:129`)에 묻혀 기함 기능(MCP 연동)의 입구 간판이 없다.

## 목표

- **owner 집행**: `snap_pack`/`snap_analyze`를 owner 스코프로 — user 토큰은 자기 캡처만, 교차 owner는 존재조차 안 드러냄(404).
- **비공개 이미지 전달**: 공개 `/i` URL → **HMAC 서명 단수명 URL**(owner만 mint). 공개 `/s` 뷰어 폐기.
- **온보딩 승격**: MCP 연동 UI를 사이드패널 메인 표면으로 끌어올려 발견성 확보.
- **정직한 post-share**: "공개 공유" → "내 AI에 저장"(링크 복사 없음, 익명 저장 차단).

## 비목표 (0.4.2에서 명시적 배제)

- **상태ful revoke / D1 denylist** — 0.4.3(A regenerate-lite). 무상태 독트린(ADR-011) 보존, 이연.
- **인라인 base64 이미지블록** — 클라이언트 호환 깨짐(스파이크 `docs/research/mcp-image-block-compat.md`). 미래 opt-in 플래그(`imageEncoding`)로만, default 아님.
- **계정 로그인 / OAuth / storage.sync** — owner=pseudonymous SHA-256(토큰) 유지.
- **주석 도구(블러·화살표·형광펜·자유선)** — 0.4.3(B).
- **owner 재매핑** — 재발급 시 옛 캡처는 TTL(≤30일) 자연소멸, 재스탬프 안 함.
- **D1 마이그레이션** — owner 컬럼은 0002로 이미 존재.

## 확정 결정 (전부 스펙에 반영)

| # | 항목 | 결정 |
|---|------|------|
| 1 | owner 집행 (pack/analyze) | user 스코프는 `captureOwner === auth.owner` 요구, 불일치·익명(owner NULL)은 **`NOT_FOUND`(404)** — 403 아님(UUID 존재 오라클 차단). admin 스코프는 검사 skip(운영 예비, `snap_history` admin과 대칭). **ADR-012 결정#3(owner 필터=조회 전용) supersede** — 조회 전용을 pack/analyze 집행으로 확장. snapAnalyze는 getSnapPack 재사용(`analyze.ts:130`) → owner 집행은 getSnapPack 한 곳이면 두 툴 커버 |
| 2 | owner 조회 = 왕복 0 | 업로드가 R2 `customMetadata`에 `owner`를 심고(`{expiresAt}`→`{expiresAt, owner}`), `getSnapPack`이 **이미 부르는** `bucket.head(id)`(`pack.ts:39`)에서 그 값을 읽는다 → 핫패스 D1 조회 없음. **레거시 tiered read**: R2 meta에 owner 없으면(0.4.2 이전 객체) D1 `SELECT owner WHERE id=?` 1회 fallback(≤30일 TTL 후 dead code) |
| 3 | 비공개 이미지 전달 = C2 서명 URL | `/i/{id}?exp=<unixSec>&sig=<b64url>`. 서명재료 `i.v1:${id}:${exp}`(접두로 토큰 MAC(항상 16B 랜덤)과 네임스페이스 분리 → 같은 `TOKEN_SIGNING_SECRET` 재사용 안전). MAC=`HMAC-SHA256(secret, 재료)` 앞16B b64url. TTL 300s. **신규 `worker/src/image-url.ts`** = `token.ts` sign/verify 프리미티브 재사용 — `importHmacKey`·`hmacSha256First16`(인자명 `rand`지만 임의 메시지 바이트, `i.v1:...`를 `TextEncoder`로 인코드해 전달)·`base64UrlEncode`·`base64UrlDecode`·`timingSafeEqualBytes`. **이 5개는 현재 미export → token.ts에서 export 승격 필요(구현 무변경, T2.1 스코프)** |
| 4 | 서명 mint 지점 = owner 통과 후 | `getSnapPack`(includeImage)·`snapAnalyze`가 **결정#1 owner 검사 통과 후에만** 서명 URL 생성 → owner만 자기 캡처 URL을 얻는다. fetch 자체는 익명(AI가 `/i`에 토큰 안 보냄), 집행은 mint 시점에 |
| 5 | `/i` 검증 | R2 접근 **전**: exp/sig 부재·불일치(timing-safe)·만료 → **403**(R2 미접근이라 존재 누출 0). 통과 후 기존 R2 존재·만료검사 → 410/200. Cache-Control `public,max-age`(`index.ts:260-261`) → **`private, no-store`**(공유캐시 잔존 차단). **배포 단계: /i 서명강제는 2차 배포**(결정#6) — 1차에 강제하면 `/s` 뷰어(`lib.ts:212`)가 임베드한 무서명 `/i`가 403나 라이브 확장 스크린샷이 깨진다 |
| 6 | `/s` 폐기 + url 제거 = **2차 배포 일괄** | **1차 배포 = owner-gate(결정#1·2)만** — `/i` 무서명 유지·`/s` 유지·응답 `{id,url}` 유지 → 라이브 0.4.0 확장 완전 호환(모든 breaking을 뒤로 민다). **2차 배포(신확장 스토어 롤아웃 후) = `/i` 서명강제(결정#5) + `/s`·`buildViewerHtml`/`buildExpiredHtml` 제거 + 응답 `{id,url}`→`{id}` 동시.** url 즉시 제거 금지: `upload.ts:105`가 url 없으면 throw → 라이브 확장 업로드 자체 파손(`ImageActions.ts:231` 링크 복사 이전에). 신확장은 `{id}` 소비(url 무의존)라 1·2차 워커 둘 다 호환 |
| 7 | post-share UX 재정의 | "공유" 아님 → **"내 AI에 저장"**. 성공=토스트 `저장됨 · N일 후 삭제 · 내 AI 도구에서 조회`(링크 복사 없음). 동의문=`서버 업로드 · 내 토큰 설정 AI에서만 조회 · N일 후 삭제`. **익명 저장 차단**(토큰 없으면 아무도 못 읽음 → fail-fast 에러) — 0.4.0의 "익명이어도 업로드" 계약 뒤집음 |
| 8 | D0 온보딩 승격 | MCP 연동(토큰 표시·복사·붙여넣기·연결명령)을 기어 드롭다운 셋째 그룹(`ShortcutsHelp.ts:129`)에서 **사이드패널 메인 표면**으로 승격. 첫 저장 후 "이제 AI로 불러오세요" 신호 신설. 기어 aria(`설정/도움말: 단축키`, `App.ts:52`)에 MCP 반영 |
| 9 | 버전 | 확장+worker 동시 릴리즈 → 4값 게이트 + masthead `V0.4.2` + `mcp.ts` serverInfo **셋 다 0.4.2**(자연 정합). **스토어 재심사 #1** |

## 아키텍처

```
┌─────────────────────────┐  ①POST /token (변경 없음)                      ┌────────────────────────────┐
│  SnapContext 확장 (MV3)  │ ─────────────────────────────────────────────▶│  Cloudflare Worker          │
│  post-share=저장(비공개)  │  ②POST /upload → R2 customMetadata {owner}      │  ┌──────────────────────┐  │
│  D0 온보딩=메인 표면      │      (익명=토큰없음 → 저장 차단)                 │  │ /upload · /i(서명필수)│  │
└─────────────────────────┘                                                │  │ /s = 폐기(2단계)      │  │
                                                                           │  ├──────────────────────┤  │
┌─────────────────────────┐  ③/mcp: snap_history·pack·analyze              │  │ /mcp                  │  │
│  AI 에이전트 (내 토큰)    │ ◀────────────────────────────────────────────▶│  │ pack/analyze=owner집행│  │
│  Claude·Cursor·Codex     │  ④서명 /i?exp=&sig= fetch (owner가 mint)        │  │ + 서명 URL mint       │  │
└─────────────────────────┘                                                │  └──────────┬───────────┘  │
                                                                           R2 customMetadata {expiresAt, owner}
```

- owner 검사·서명 mint는 무상태(HMAC 재계산 + R2 meta). 서버 발급 대장 없음(ADR-011 유지).
- 서명 URL은 owner 인증된 MCP 응답 안에서만 mint되고 300s 만료 → presigned-URL 시맨틱.

## 데이터 모델

### R2 (마이그레이션 없음, 쓰기 필드만 추가)

| 키 | 0.4.2 변경 |
|----|-----------|
| `{id}` (PNG) | customMetadata `{expiresAt}` → `{expiresAt, owner}`. 익명은 owner 생략 |
| `{id}.json` | 동일하게 owner 추가(pack이 head로 owner 읽음) |

- **제약(ADR-013 상속)**: R2 쓰기는 Workers 바인딩 경유만 — S3 API는 customMetadata 키를 소문자화해 owner 유실.

### D1 `captures` (변경 없음)

- `owner` 컬럼·인덱스는 0002로 존재. 0.4.2는 **읽기만** 추가(레거시 fallback `SELECT owner WHERE id=?`, PK 인덱스).

### 서명 URL (저장 안 함, 계산)

```
/i/{id}?exp=<unixSec>&sig=<base64url(HMAC-SHA256(TOKEN_SIGNING_SECRET, `i.v1:${id}:${exp}`) 앞16B)>
TTL 300s · owner 통과 후에만 mint · /i가 R2 접근 전 검증(실패 403)
```

## 구현 표면 매핑 (기능ID ↔ 표면 ↔ 진입점)

| ID | 기능 | 구현 표면 | 진입점 |
|----|------|-----------|--------|
| F001 | owner 집행(pack/analyze, R2메타 fast-path+D1 fallback, 교차→404) | `pack.ts`·`analyze.ts`·`mcp.ts`(auth 전달) | MCP `snap_pack`·`snap_analyze` |
| F002 | upload owner → R2 customMetadata | `index.ts` /upload | `POST /upload` |
| F003 | 서명 URL mint(owner 통과 후) **(2차 배포 — F004와 동시)** | `worker/src/image-url.ts`(신규) + `pack.ts`·`analyze.ts` | pack/analyze 응답 |
| F004 | `/i` 서명 검증 + Cache-Control private **(2차 배포)** | `index.ts:236·260` /i 핸들러 | `GET /i/{id}?exp=&sig=` |
| F005 | `/s` 폐기 + 응답 `{id,url}`→`{id}` **(2차 배포 일괄)** | `index.ts:268` /s·/upload 응답 | `GET /s`(제거·2차) |
| F006 | 확장 `{id}` 소비 | `upload.ts`·`share-upload.ts` | 저장 업로드 |
| F007 | post-share 비공개 UX + 익명 저장 차단 | `ImageActions.ts`·`share-expiry.ts` | 사이드패널 §04 |
| F008 | D0 온보딩 메인 승격 | `App.ts`·`ShortcutsHelp.ts` | 사이드패널 메인 |

정합성 self-check: 모든 F00x 표면·진입점 연결됨. `snap_history`는 0.4.0 owner 필터 유지. 서명 mint(F003)는 owner 검사(F001) 통과에 종속 = 고아 없음.

## Phase·티켓

| Phase | 티켓 | DoD |
|-------|------|-----|
| **P1** worker owner-scope | T1.1 pack/analyze owner 격리(test-first, 교차→404) / T1.2 upload owner→R2 customMetadata / T1.3 레거시 D1 fallback | 교차 owner 0·fast-path가 D1 skip·admin 전체 테스트 그린 |
| **P2** worker private delivery | T2.1 `image-url.ts` 서명(sign/verify·만료·도메인분리 test-first) / T2.2 `/i` 검증+Cache-Control private / T2.3 pack/analyze 서명 URL mint | 서명만료 403 vs 데이터만료 410·무서명 403 그린 |
| **P3** ext post-share + D0 (한 표면) | T3.1 `{id}` 소비+익명 저장 차단(test-first) / T3.2 post-share 비공개 UX·문구 / T3.3 D0 메인 승격 | vitest·e2e(클립보드에 `/s/` 0·메인 온보딩 노출)·tsc·vite build |
| **P4** 문서·버전·스토어 | T4.1 ADR 015·016·017 / T4.2 PRIVACY 재작성+changelog / T4.3 버전 0.4.2 정렬(4값+masthead+mcp.ts) / T4.4 스토어킷 0.4.2(공개→비공개 카피) | check-version-sync·수동 QA |
| **P5** `/s` 최종 제거 | T5.1 `/s` 핸들러·뷰어 제거 (신확장 롤아웃 후 **2차 배포**) | vitest(`/s`→404)·수동 롤아웃 확인 |

**ADR (신규)**: 015 비공개 우선 캡처 접근 모델(ADR-012 결정#3 supersede — 조회전용→pack/analyze 집행 + 배포 2단계 롤아웃 계약) / 016 owner 집행 메커니즘(R2 fast-path+D1 fallback·404) / 017 C2 서명 URL 이미지 전달(base64 인라인 기각·HMAC 키 이중용도 도메인분리 근거).

**운영(사람 게이트) — 배포 2단계**: **worker 1차 배포(P1 후 = owner-gate만, 라이브 확장 호환)** → **스토어 재심사 #1**(0.4.0 심사 종료 후, 신확장=P3 제출) → 신확장 롤아웃 대기 → **worker 2차 배포(P2 서명 /i + P5 /s제거 + url제거 동시)**. PRIVACY 공개는 2차와 함께(프라이버시 전환은 2차 완료 시 확정) / tag `v0.4.2` / Phase별 머지. **신규 시크릿·D1 마이그레이션 없음.** **착수 게이트(2026-07-27 재배치)**: 코딩 착수=plan-audit 승인만 · 0.4.0 심사통과=재심사#1 제출 전 조건 · 0.4.1 배포=1차 배포가 겸함(0.4.1 코드는 master 포함 — PR #23).

**핸드오프**: Phase 완료마다 `docs/log/` 세션 로그. goal 실행 시 `.vhk/mission.json` 스코프 0.4.2로 재설정.

## DoD (완료 판정)

1. worker vitest(unit + test-d1) 그린.
2. 확장 tsc strict + vite build + vitest + e2e 그린.
3. **격리**: 두 owner 교차 `snap_pack`/`snap_analyze` → 404 테스트 존재.
4. **서명**: 만료 서명 403 vs 데이터 만료 410 구분 + 무서명 403 테스트.
5. **fast-path**: R2 meta에 owner 있으면 D1 미조회 테스트.
6. **post-share**: 저장 후 클립보드에 공개 링크 0 + 익명(토큰 없음) 저장 차단 테스트.
7. PRIVACY·스토어 문구 정합(공개 공유 → 비공개 전수 갱신).

## 리스크

| 리스크 | 영향 | 대응 |
|--------|------|------|
| 클라 이미지 URL fetch 호환(Codex 샌드박스·Antigravity UNVERIFIED) | AI가 서명 URL 못 가져옴 | C2는 status-quo fetch 경로 유지(저위험). 클라별 스모크 1회. base64 opt-in 예비 |
| **배포 2단계 타이밍**(H) | 1차에 /i 서명강제·url제거·/s제거 중 하나라도 하면 라이브 확장 깨짐(스크린샷 403·업로드 throw) | 1차=owner-gate만, 모든 breaking을 2차로. 신확장 롤아웃 확인 후 2차(ADR-015 계약) |
| **2단계 창 노출**(M) | 1차~2차 창 동안 /s 유지 + /i 무서명이라 캡처 컨텍스트(URL·제목·핀, `lib.ts:167-178`)·이미지가 id-capability로 계속 노출 | 프라이버시 전환은 **2차 완료 시 확정**(1차는 목록·pack/analyze owner-gate까지). id=UUIDv4 추측불가라 '이미 배포된 id 보유자'로 한정. 신확장 롤아웃 가속으로 창 최소화 |
| 서명 TTL vs fetch 지연 | 너무 짧으면 403, 길면 노출 창 | 300s default·tunable + 403 body가 "툴 재호출" 지시 |
| 캐시 잔존 | 기존 `public,max-age` 사본이 공유캐시에 잔존 | `/i`→`private,no-store`. 기존 캐시는 자기 max-age로 소멸 |
| 스토어 재심사(프라이버시 posture 변경) | 심사 지연 | PRIVACY 재작성 + Chrome/Whale privacy-practices 갱신. 0.4.0 심사 종료 후 제출 |
| 익명 저장 차단 = 동작 변경 | 토큰 발급 실패 유저가 저장 불가 | fail-fast 에러(재시도 안내). 비공개 모델선 익명 저장이 무가치(아무도 못 읽음) |
