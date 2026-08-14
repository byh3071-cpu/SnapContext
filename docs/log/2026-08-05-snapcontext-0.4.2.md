---
date: 2026-08-05
tags: [v0.4.2, privacy, mcp, implementation]
---

# SnapContext 0.4.2 구현 로그

## 완료

- rollback-safe private R2 key와 `POST/GET/DELETE /captures`, 서명 `/pi` 구현
- MCP owner 집행, generic `NOT_FOUND`, neutral mode, untrusted data 경계 구현
- 확장의 익명 fallback·공개 링크 복사 제거, `SharedContextV2`와 401 1회 재발급 구현
- 주 화면 Claude Code·Cursor·Codex 연결 안내와 저장 목록·즉시 삭제 구현
- 개인정보처리방침·PRD·스토어 준비 문구를 0.4.2 계약으로 정렬

## 검증

- 확장 단위 테스트 66개, TypeScript 검사, production build
- Worker 단위 테스트 240개와 D1 테스트 6개
- 기존 UI E2E 55개와 0.4.2 private save E2E 17개
- PowerShell MCP 등록 스크립트 구문 검사와 버전 동기화 검사

## 사람 승인 대기

- Cloudflare preview binding·invocation log 확인
- 세 실제 MCP 클라이언트 이미지 smoke test
- 배포, 설정 변경, 스토어 제출, tag, merge
- 채택률 확인 뒤 레거시 write 차단과 route 제거

## 릴리즈 리뷰 (2026-08-05)

판정은 **로컬 구현 조건부 통과 / 릴리즈 차단**이다. 정적 리뷰와 자동 검증에서 critical/high 결함은 발견되지 않았지만, 실제 AI 클라이언트와 격리된 원격 환경의 동작은 자동 테스트가 대신 증명하지 못한다.

### 확인됨

- private `/captures` 저장·조회·삭제, owner gate, generic `NOT_FOUND`, 서명 `/pi`와 `private, no-store` 계약을 코드·테스트·문서에서 교차 확인했다.
- 확장 프로그램의 신규 저장 흐름이 legacy `/upload`·`/s`와 익명 fallback을 사용하지 않는 것을 확인했다.
- extension unit 66/66, Worker unit 240/240, D1 6/6, tsc, Vite build, 전체 E2E 72/72가 통과했다.
- E2E는 사람 직접 전달, 동의 취소, private 저장, history/analyze, URL 제거, 삭제 후 접근 차단을 포함한다.

### 미검증·릴리즈 차단

- 현재 private-save E2E는 Worker를 mock하므로 Claude Code·Cursor·Codex의 실제 서명 이미지 fetch를 증명하지 않는다.
- localhost는 AI 제공자 측 image fetch가 필요한 클라이언트의 최종 호환성 증거가 될 수 없다. production과 분리된 HTTPS staging이 필요하다.
- `scripts/e2e-smoke.ps1`는 production과 legacy 익명 `/upload`를 사용하므로 현 상태로 실행하지 않는다.
- Cursor 환경변수 상속, Cloudflare 실제 binding, invocation log의 query 기록 여부는 운영 환경에서 확인해야 한다.

### 다음 조치

- 먼저 production과 완전히 분리된 원클릭 local dogfood harness를 만들어 매일 Codex 기준 10분 검증을 가능하게 한다.
- 이후 사람 승인으로 별도 HTTPS staging을 구성하고 세 클라이언트에서 pixel-only random marker smoke를 수행한다.
- 위 검증이 끝나기 전에는 배포·secret/config 변경·스토어 제출·tag·merge를 실행하지 않는다.
