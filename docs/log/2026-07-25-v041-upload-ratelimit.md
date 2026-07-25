---
id: log-2026-07-25-v041-upload-ratelimit
date: 2026-07-25
tags: [log, v0.4.1, worker, security, versioning]
---

# 2026-07-25 — 0.4.1 `/upload` rate-limit + 2-트랙 버전 스킴

브랜치: `feat/0.4.1-upload-ratelimit` (0.4.0 tip `feat/0.4.0-extension-token` 위 스택 — 0.4.0 미머지라 rebase 예정)
선행: 없음 (worker-only, 배포 게이트만)
세대 계획 SoT: `~/.claude/plans/0-3-0-prd-zippy-finch.md` (Private-by-Design 0.4.1~0.4.3 프로그램)

## 이 릴리즈가 있는 이유

Private-by-Design 프로그램(0.4.1~0.4.3)의 첫 마일스톤. 정찰에서 `/upload` 가 mutating 엔드포인트 중 유일하게 per-IP rate-limit 이 없음을 확인(413/415/401 만 존재, 429 부재) → R2/D1 플러딩에 노출. worker-only 라 스토어 무관하게 즉시 배포 가능 → 2-트랙 버전 스킴(ADR-014)의 첫 실증도 겸함.

## 한 일

| 순서 | 산출물 | 검증 |
|------|--------|------|
| 1 | `docs/adr/014-version-scheme-dual-track.md` — 배포면별 독립 bump | — |
| 2 | `worker/test/upload-rate-limit.test.ts` (red) — 20/분 초과 429·독립 IP·별 Map | red 확인 |
| 3 | `worker/src/upload-rate-limit.ts`(token-rate-limit.ts 복제·별 Map·20/분) + `index.ts` /upload 최상단 429 게이트 | green |
| 4 | `worker/src/mcp.ts:49` serverInfo 0.4.0→0.4.1 + `mcp-integration.test.ts` 단언 원자적 갱신 | green |
| 5 | changelog 0.4.1 절 · 로드맵 트랙 E · 본 로그 | — |
| R | `docs/research/mcp-image-block-compat.md` — C1 base64 기각·C2 서명URL 채택(0.4.2 착수 게이트) | 사람 리뷰 |

## 결과

- worker 테스트: node 191 + test-d1 6 = **197 passed**(0.4.0 기준선 192 + rate-limit 5[라우트 3·윈도경계 2]). `tsc --noEmit` 통과.
- critic 적대검증 통과(BLOCKER 0·높음 0). LOW 3건 반영: 공유 `test/setup.ts`(리미터 리셋 시한폭탄 차단)·윈도경계 단위테스트·주석 per-isolate 정정.
- 확장 4값 게이트 무변경(0.4.0 유지) — worker-only 실증. `mcp.ts` serverInfo 만 0.4.1.

## 교훈

- **버전 정본이 배포면과 안 맞으면 무의미한 재심사가 강제된다.** worker-only 보안 패치를 단일 통합 버전으로 묶으면 안 바뀐 확장을 스토어에 다시 올려야 함 → 배포면별 독립 bump(ADR-014)로 분리. 정본 divergence 는 버그가 아니라 정상 상태.
- rate-limit 복제 vs 팩토리: token-rate-limit.ts 를 리팩터링(팩토리화)하면 DRY 하지만 통과 중인 보안 파일을 건드림 → 스코프 고정 원칙상 복제 선택(별 Map 이 핵심 요구, 30줄 파일). critic 이 중복 지적 시 재검토.

## 남은 것 (사람 게이트)

- `wrangler deploy`(worker 0.4.1). 스토어·시크릿·마이그레이션 없음.
- 0.4.0 머지 시 이 브랜치 rebase.
