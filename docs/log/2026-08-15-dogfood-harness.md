---
date: 2026-08-15
tags: [v0.4.2, dogfood, harness, orca, multi-vendor]
---

# SnapContext 0.4.2 원클릭 local dogfood harness (PR #24)

## 완료

- `pnpm dogfood:up` — local Worker(wrangler `--local`, 전용 `.dev.vars.dogfood`)·D1 migrate·`VITE_UPLOAD_ENDPOINT=127.0.0.1:8787` 확장 build·전용 Chrome profile을 한 명령으로 기동. wrangler는 supervisor가 소유하며 종료는 ChildProcess handle로만(숫자 PID kill 0).
- `pnpm dogfood:verify` — pixel-only marker golden path 14단계(저장→`snap_history`→`snap_analyze`→서명 `/pi` PNG 판독→삭제→`NOT_FOUND`) + 실패 probe 4종(동의취소 요청 0·Worker 중단 명시 실패·invalid token 재시도 1회·삭제 후 차단) = 18/18. 모든 Node fetch는 audited wrapper(redirect hop 포함 production allowlist). verify 로그에 git HEAD·dirty 기록.
- `scripts/register-mcp.ps1 -Local` + `docs/dogfood.md` — 일상 10분 검증(Codex 1클라이언트)과 릴리즈 게이트(3클라이언트) 구분.
- worker `/dogfood-health` — `DOGFOOD_LOCAL='1'` AND nonce 이중 게이트. production 설정엔 둘 다 없어 항상 generic 404(검증자 3회 확인).

## 실행 방식 — orca 멀티벤더 /goal

- Scout 인라인 → Plan 승인(`~/.claude/plans/giggly-splashing-finch.md`) → 워크트리 2개 fanout(구현 Cursor T1~T3·R2~R7, Codex T4) → 적대 검증 Codex(V1~V7) → 지휘자 게이트(Claude).
- **적대 루프 7라운드**: V1(blocker 2) → R2 → V2(blocker 1) → R3 → V3(blocker 1) → R4 → V4(blocker 2) → R5 → V5(blocker 1) → R6 → V6(blocker 1=증거) → R7+지휘자 clean-HEAD 실측 → **V7 blocker 0·merge 가능**.
- 발굴된 핵심 결함: ①verify 로그에 sc_ 토큰 원문 저장 ②stale PID 무차별 kill(4라운드 정밀화 끝에 숫자 PID taskkill 전면 제거·handle-only 종료로 설계 변경) ③공백 Windows 경로에서 기동 불가 ④redirect hop 미감사 ⑤검증 로그-커밋 불일치 증거 공백.

## 교훈

- destructive 작업의 소유권을 "증명"으로 지키려 하면 반례가 끝없이 나온다 — **경로 자체를 제거**(handle-only, 잔존은 fail-loud)하는 설계 전환이 4라운드를 끝냈다.
- 검증자의 "실행했다" 주장은 워크트리 git 물증·로그의 HEAD 기록으로만 신뢰(V4가 R4의 실행 주장을 반증).
- orca 함정 3건 FRAGILITY.md에 기록: `no_active_sender_terminal`(컨덕터 sender 터미널 필요)·codex inject "submit: verified" 거짓 양성(맨 엔터 1회로 해소)·codex 터미널 2번째 dispatch의 binding 잔류(worker_done 거부 → raw send + 파일 폴백).

## 사람 게이트 (남은 것)

- Codex 일상 10분 smoke 1회(docs/dogfood.md 절차).
- HTTPS staging 구성 승인 → 3클라이언트 릴리즈 smoke → 0.4.2 배포·스토어 제출·tag.

## 산출물 포인터

- PR: https://github.com/byh3071-cpu/snapcontext/pull/24 (머지 6e714ed)
- 검증 리포트 V1~V7: 세션 scratchpad 보관(`.../scratchpad/V*-REPORT.md`)
- verify 실측 로그: `tests/e2e/dogfood/logs/verify-2026-08-14T18-44-54-126Z.json` (HEAD=057f699·dirty=false·18/18·production 0)
