---
id: handoff-audit-0.4.4
date: 2026-08-17
from: 사전 감사 세션 (0.4.x predeploy audit)
to: 0.4.4 구현 세션
---

# 감사 → 0.4.4 세션 핸드오프

> 전문(35건): `docs/research/predeploy-audit-0.4.x-2026-08-17.md`. 여기는 **0.4.4에 걸리는 차분만**.
> PRD-0.4.4(approved)와 대조 완료 — 이미 스코프에 있는 건 제외했다. 스코프 밖 항목은 요한 승인 후 편입할 것(스코프 고정 원칙).

## 1. D2 게이트에 직결 — 배포 판정 로직 수정 필요

**H1. 레거시 캡처 삭제가 R2를 안 지움 (검증됨)**
- `handleDeleteCapture`(private-capture-routes.ts:264-266)는 `private-v2/` 파생 키만 삭제. 레거시 업로드의 실제 키는 평문 `id`/`${id}.json`(index.ts:214-224). owner 스탬프된 레거시 행은 목록에 뜨고, 삭제 시 **D1 행만 지워지고 R2 객체는 잔존**(R2 delete는 없는 키에 조용히 성공 → 204 반환). ADR-019 "204=모두 삭제" 계약 위반.
- **PRD-0.4.4 D2와의 연결**: D2 실측이 "잔존 0 → 일괄 배포"인데, H1 때문에 **"사용자가 삭제했지만 D1 행만 사라진 고아 객체"**는 D1 대조로는 안 보인다. D2 실측은 R2 목록 기준(대시보드/wrangler)이라 탐지는 되지만:
  - 잔존 0이면 → H1은 자연 소멸(레거시 객체 자체가 없음). 추가 조치 불요.
  - **잔존 >0 + #7 revert 경로를 타면** → 레거시 읽기 fallback이 살아있는 채 삭제 결함도 살아있음 = "지워도 안 지워지는" 상태 지속. 이 경우 삭제 핸들러에 레거시 키(`id`, `${id}.json`) 병행 삭제 1줄 추가가 필수.
  - 잔존 >0 + 일괄 배포(410) 경로면 → 접근은 막히나 객체는 lifecycle(30일)까지 물리 잔존. PRIVACY "삭제" 약속 관점에서 잔존 객체 수동 삭제 권장.

## 2. 0.4.4 편승 추천 (승인 필요 — 전부 작음)

| # | 항목 | 근거 | 조치 |
|---|---|---|---|
| H2 | 스토어 스크린샷 masthead `V0.4.0` 하드코딩 스테일 (검증됨) | generate-store-screenshots.mjs:454 | 값 갱신 + check-version-sync.mjs 5번째 정합값 편입 (ADR-014 보강 권고 이행) |
| H3 | qa-043(가리기 파괴성 유일 실브라우저 검증)이 npm script·게이트 미편입 (검증됨) | package.json scripts 부재 | `"dogfood:qa043"` 등록 + 릴리즈 게이트 명시 |
| M4 | R2 lifecycle 규칙이 `private-v2/` prefix를 덮는지 미확인 | private-object-key.ts:3 (규칙은 prefix 신설 이전 설정) | 배포 직전 `wrangler r2 bucket lifecycle list`로 확인 — D2 실측과 같은 타이밍에 1분 컷 |
| M5 | wrangler observability 미설정 — 데이터 유실 직결 warn 3종이 프로덕션에서 안 보임 | wrangler.jsonc | `"observability": {"enabled": true}` |
| L11 | deploy가 lockfile 고정 없음 | worker/package.json `"deploy"` | `npm ci && wrangler deploy` |
| M1 | `parseSharedContext` v1 무검증 + pack.ts:153 스프레드 — 0.4.4로 신규 유입은 차단되나 기존 D1 행(≤30일)과 스프레드 패턴은 잔존 | lib.ts:132 · pack.ts:153 | 스프레드 → 명시 필드 조립 (0.4.5로 미뤄도 됨) |
| L3 | v0.4.3 태그 후 벤더 아이콘 드롭다운 커밋(f73dee6)이 changelog 미기재 | git log | 0.4.4 changelog에 편입 기재 |

## 3. 0.4.4 아님 — 배치만 기록 (손대지 말 것)

- 0.4.5: 만료 D1 행 청소 cron(M3) · 에러 문구 시크릿 env명 노출(L8) · nosniff/CSP(L9) · snap_history untrusted 경계(M2)
- 0.4.6: ext race·무음 catch·transform scale·aria-live 등 (전문 M6~M8, L10~L13)
- 재심사 전(사람·문서): 스크린샷 04 교체 · 상표 면책 · changelog 0.4.3 헤딩 · README · revoke 0.4.6→0.4.7 참조 정정(ADR-020·PRD-0.4.3·changelog)

## 이상 없음 확인(재검사 불요)

가리기 bake 우회 없음 · HMAC/서명 URL/owner 격리 견고 · D1 bind 전수 · 시크릿 유출 0 · worker 테스트 1:1.
