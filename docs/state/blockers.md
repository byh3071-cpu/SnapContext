# Blockers

_Append-only. 해결 항목은 ~~취소선~~으로 표기._

## 2026-08-05 — SnapContext 0.4.2 릴리즈 리뷰

- [OPEN] production과 격리된 HTTPS staging Worker/R2/D1 환경이 아직 없다. 생성·binding·secret 변경은 사람 승인이 필요하다.
- [OPEN] Claude Code·Cursor·Codex가 5분 서명 PNG의 pixel-only marker를 실제로 읽고, 403 후 새 URL을 받는지는 아직 검증되지 않았다.
- [OPEN] `scripts/e2e-smoke.ps1`가 legacy `/upload`를 사용하는데 **0.4.4부터 이 경로는 영구 410**이라 스크립트는 실행 즉시 실패한다(2026-08-17 갱신 — 이전 사유: production 오염 위험). private API(`/captures`) 기반 재작성 또는 폐기 결정 필요. 로컬 검증은 `pnpm dogfood:verify`가 대체 중.
- [OPEN] Cursor desktop의 환경변수 상속과 현재 Cloudflare invocation log/query 기록 설정은 실제 환경에서 확인해야 한다.
- [GATE] 위 항목과 개인정보·스토어 문구 최종 대조 전까지 production 배포·스토어 제출·tag·merge를 진행하지 않는다.
