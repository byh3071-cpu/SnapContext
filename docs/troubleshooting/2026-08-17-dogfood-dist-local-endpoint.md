# dogfood 후 확장 토큰 발급 실패 — dist에 로컬 endpoint 잔존

- 발견일: 2026-08-17 (0.4.4 배포 스모크 2 진행 중)

## 재현

1. `pnpm dogfood:up` 실행 — up.mjs 가 `VITE_UPLOAD_ENDPOINT=http://127.0.0.1:8787` 을 주입해 `vite build` 를 돌리고 **dist/ 를 로컬용으로 덮어쓴다** (scripts/dogfood/up.mjs:302).
2. dogfood 세션 종료(로컬 워커 다운). dist/ 는 로컬용 그대로 남는다.
3. 브라우저의 unpacked 확장(dist/ 로드)에서 캡처 저장 → 토큰 발급 시도.
4. 확장 UI: **"새 토큰을 발급하지 못했습니다. 네트워크 연결을 확인한 뒤 다시 시도해 주세요."**

## 원인

`VITE_UPLOAD_ENDPOINT` 는 빌드타임 상수라(src/utils/token.ts:195) dist 번들에 URL 이 박힌다.
dogfood 빌드 후 번들의 유일한 서버 주소가 `http://127.0.0.1:8787` — 로컬 워커가 꺼진 뒤엔
`fetch(/token)` 이 네트워크 단계에서 실패한다. 프로덕션 장애처럼 보이지만 서버는 정상.

## 해결

```powershell
pnpm build   # .env 의 프로덕션 endpoint 로 재빌드
# 검증: 번들에 프로덕션 URL 만 남았는지
# grep -rohE "https?://[A-Za-z0-9.:-]+" dist/assets/*.js | grep -E "workers|127" | sort -u
```

이후 chrome://extensions 에서 SnapContext 새로고침(↻) → 재시도.

## 예방

- dogfood 세션을 끝낼 때 `pnpm build` 로 dist 를 프로덕션으로 되돌리는 습관 (down 절차에 재빌드 단계 추가 후보 — 0.4.5 백로그).
- 확장에서 "네트워크" 에러가 나면 서버보다 **dist 가 어느 endpoint 로 빌드됐는지** 먼저 grep.
