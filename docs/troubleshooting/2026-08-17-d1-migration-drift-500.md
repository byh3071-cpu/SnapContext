# 캡처 저장 500 — 프로덕션 D1 마이그레이션 드리프트 (0002 미적용)

- 발견일: 2026-08-17 (0.4.4 배포 스모크 2)

## 재현

1. 0.4.4 배포 직후 확장에서 캡처 → 내 AI에 저장.
2. 확장 UI: **"캡처 저장 실패 (500)"**.

## 원인

신규 저장 경로(ingest.ts)는 `INSERT INTO captures (..., owner)` 로 owner 컬럼에 쓰는데,
그 컬럼을 만드는 `0002_captures_owner.sql` 이 **프로덕션 D1에 미적용**이었다
(`wrangler d1 migrations list --remote` 로 실측). 없는 컬럼 INSERT → 500.

두 겹의 사각지대가 겹쳤다:

1. **런북 결함** — runbook-0.4.4 §1~2 에 "D1 마이그레이션 적용" 단계가 없었다. 적대검증도 놓침.
2. **로컬 재현 불가(원리적)** — vitest.d1.config.mts 는 매 실행마다 migrations/ 전체를 새 DB에
   적용한다(test-d1/apply-migrations.ts). 로컬은 항상 최신 스키마라 프로덕션 드리프트가 안 보인다.

## 해결

```powershell
# worker/ 에서 (프로덕션 스키마 변경 = 사람 게이트)
npx wrangler d1 migrations apply snapcontext-captures --remote
```

적용 후 저장 정상(201), snap_history·snap_analyze·서명 이미지 URL(200) 확인.

## 예방

- **배포 런북 고정 단계로 추가**: 배포 전 `wrangler d1 migrations list --remote` 가 빈 목록인지
  확인 → 미적용 있으면 배포보다 먼저 apply. (additive 마이그레이션 전제 — 파괴적이면 별도 계획)
- 교훈: "로컬 테스트 green"은 스키마 **내용**의 증명이지 프로덕션 **적용 여부**의 증명이 아니다.
  둘은 다른 축이고, 후자는 배포 절차만이 잡는다.
