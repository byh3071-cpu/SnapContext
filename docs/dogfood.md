# SnapContext 로컬 dogfood

이 문서는 production Worker·D1·R2를 건드리지 않고 SnapContext 0.4.2의 private 저장 흐름을 반복 검증하는 절차다. 일상 검증은 Codex 한 클라이언트로 약 10분 안에 끝내고, 릴리즈 게이트는 Claude Code·Cursor·Codex 세 클라이언트 전체에서 별도로 수행한다.

## 일상 10분 검증 — Codex

### 1. 로컬 환경 기동

저장소 루트의 전용 PowerShell 세션에서 실행한다.

```powershell
pnpm dogfood:up
```

명령이 성공하면 로컬 Worker는 `127.0.0.1:8787`, 확장 build와 전용 Chrome profile은 dogfood 전용 경로를 사용한다. 출력에 `workers.dev` 또는 다른 production URL이 보이면 이후 단계를 진행하지 말고 실패로 기록한다.

### 2. 로컬 사용자 토큰 발급

같은 PowerShell 세션에서 로컬 Worker의 기존 `POST /token` 계약을 그대로 호출한다. `Origin`은 해당 계약이 요구하는 `chrome-extension://` 형식이며, 별도 인증 우회나 고정 토큰을 만들지 않는다.

```powershell
$localTokenResponse = Invoke-RestMethod `
  -Method Post `
  -Uri 'http://127.0.0.1:8787/token' `
  -Headers @{ Origin = 'chrome-extension://snapcontext-local-dogfood' }
$env:SNAPCONTEXT_MCP_TOKEN = $localTokenResponse.token

if (-not $env:SNAPCONTEXT_MCP_TOKEN.StartsWith('sc_')) {
  throw '로컬 사용자 토큰 발급에 실패했습니다.'
}
```

이 `sc_` 토큰은 현재 로컬 Worker 전용이다. production 토큰과 혼용하거나 운영체제 영구 환경 변수로 저장하지 않는다. 현재 PowerShell 세션을 닫으면 다시 발급하고, 이후 등록 명령도 새 세션에서 다시 실행한다.

### 3. Codex에 로컬 MCP 등록

토큰을 발급한 동일한 PowerShell 세션에서 실행한다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/register-mcp.ps1 -Local
```

`-Local`은 MCP URL만 `http://127.0.0.1:8787/mcp`로 바꾼다. 기본값은 기존 production URL이며, `SNAPCONTEXT_MCP_TOKEN`의 존재 여부와 `sc_` 형식 검증은 두 경로에서 동일하다. 등록 뒤 Codex를 완전히 종료하고 이 PowerShell 세션에서 다시 시작해야 세션 전용 토큰을 상속한다. 다른 터미널이나 에디터에서 시작한 Codex는 이 값을 상속하지 않는다.

### 4. pixel-only marker 판독

1. dogfood 전용 Chrome profile에서 로컬 build를 열고 harness의 pixel-only marker fixture를 캡처한다.
2. 캡처를 `내 AI에 저장`하고, fixture의 기대 marker 값은 Codex 대화에 알려주지 않는다.
3. Codex에 방금 저장한 캡처를 확인하라고 요청한다. Codex가 `snap_history`를 호출해 최신 capture id를 찾고, 그 id로 `snap_analyze`를 호출했는지 확인한다.
4. Codex가 서명된 로컬 이미지의 픽셀만 보고 marker를 판독했는지 확인하고 기대값과 비교한다.

판독값이 틀리거나, 도구 호출 없이 DOM 텍스트·파일명·사용자 힌트에서 marker를 얻었다면 실패다. `snap_analyze` 응답의 이미지 URL이 localhost가 아니어도 즉시 실패로 기록한다.

**인코딩 스킴 안내 (2026-08-15 실측 교훈)**: AI 클라이언트는 스킴 설명 없이는 격자를 임의 해석하므로, 판독을 요청할 때 아래 스킴을 프롬프트에 그대로 포함한다. 스킴은 공개 정보이고 비밀은 marker 값뿐이라 이 안내가 검증을 훼손하지 않는다 (SoT: `tests/e2e/dogfood/fixtures/marker.mjs`).

> 이미지 속 흑백 격자는 8×8 셀이다. 바깥 테두리 한 줄은 전부 검정(위치 기준선)이고, 데이터는 내부 위쪽 4행×6열(행 우선)에 있다. 검정 셀=1, 흰 셀=0으로 24bit를 읽고, 4bit씩(MSB부터) 끊어 십진 숫자 6자리로 변환하면 marker다.

### 5. 즉시 삭제와 NOT_FOUND 확인

1. 확장의 `서버에 저장된 캡처` 목록에서 방금 확인한 항목의 `즉시 삭제`를 실행한다.
2. Codex에서 같은 capture id로 `snap_analyze`를 다시 호출한다.
3. tool result가 `isError: true`이고 메시지가 정확히 `NOT_FOUND`인지 확인한다. 빈 결과나 성공 응답은 실패다.

### 6. 결과 기록

결과는 `tests/e2e/dogfood/logs/`에 남긴다. 최소한 실행 시각, 클라이언트(`Codex`), capture id, 기대 marker, 판독 marker, `snap_history`·`snap_analyze` 호출 여부, 삭제 후 `NOT_FOUND` 여부, production 요청 0건, 전체 PASS/FAIL을 기록한다. 토큰 원문은 로그에 남기지 않는다.

## 릴리즈 게이트 — 세 클라이언트

일상 10분 검증 통과는 릴리즈 승인이 아니다. 릴리즈 전에는 분리된 승인 환경에서 Claude Code·Cursor·Codex 각각에 대해 pixel-only marker 판독, `snap_history` → `snap_analyze`, 즉시 삭제 → `NOT_FOUND`의 전체 절차를 수행해야 한다.

확장(ext) 릴리즈에는 추가로 `pnpm dogfood:qa043`(가리기 파괴성·주석 UI의 유일한 실브라우저 검증, 33체크)을 실행해 전체 OK여야 한다 — `dogfood:verify`와 동시 실행 금지(리소스 경합), 순차로.

세 클라이언트 결과가 모두 PASS이고 기존 test·tsc·build·E2E 게이트가 통과한 경우에만 릴리즈 게이트를 통과한 것으로 판정한다. staging 생성, production 배포, 시크릿 변경, store 제출, tag·merge는 이 문서의 로컬 dogfood 범위가 아니며 각각 사람 승인이 필요하다.
