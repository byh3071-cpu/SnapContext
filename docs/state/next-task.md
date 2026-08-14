# Next Task

_Auto-updated 2026-05-30T11:40:03.293Z via `vhk goal next`._

```
TASK: Goal 0 — Phase 0 — 경쟁사 리서치 + 스토어 설명문
  status: IN_PROGRESS
  priority: P0
  file: goals\0-store-copy-research.md
```

## 2026-08-05 — SnapContext 0.4.2 검증 마감

```text
TASK: 0.4.2 원클릭 local dogfood harness 구축 및 Codex 10분 smoke
  status: READY
  priority: P0
  scope: package scripts, local-only test harness, 전용 fixture/profile, tests/docs
  forbidden: deploy, production binding/data, secret/config 변경, store 제출, tag/merge
  evidence:
    - 보안·정확성 코드 리뷰: 조건부 통과, critical/high 발견 없음
    - extension unit 66/66, Worker unit 240/240, D1 6/6
    - tsc + vite build 통과, 전체 E2E 72/72
  DoD:
    - 한 명령으로 격리된 local Worker/D1과 localhost endpoint 확장 build 실행
    - pixel-only marker golden path를 저장→조회→분석→삭제까지 검증
    - 동의 취소·Worker 중단·invalid token·삭제 후 접근의 실패 경로 검증
    - production binding·URL 사용 0건과 결과 로그 확인
  human_gate_after: 분리된 HTTPS staging 생성 및 Claude Code·Cursor·Codex 실클라이언트 smoke
```
