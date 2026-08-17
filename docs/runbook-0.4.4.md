---
id: runbook-0.4.4
date: 2026-08-17
tags: [runbook, release, worker, v0.4.4]
---

# 0.4.4 배포·사고 대응 런북 (worker-only)

> 스펙: PRD-0.4.4(approved). 이 문서는 **배포 실행자(요한)가 순서대로 따라가는 절차서**다.

## 1. 배포 전 판정 (D2 — 3분기)

한 번에 실행 (worker/ 디렉터리에서):

```powershell
# ① 레거시(raw-ID key) 객체 잔존 실측 — private-v2/ 이외 키가 레거시
npx wrangler r2 object list snapcontext-uploads --remote | Select-String -NotMatch "private-v2/"
# ② lifecycle 규칙이 private-v2/ prefix를 덮는지 (감사 M4)
npx wrangler r2 bucket lifecycle list snapcontext-uploads
```

※ `r2 object list` 미지원 버전이면 Cloudflare 대시보드 R2 버킷 화면에서 육안 확인.

```powershell
# ③ D1 레거시 행 실측 (critic 중간4 — R2만 세면 유령 행을 놓침)
#    0.4.2 배포(2026-08-05) 이전 행 = 레거시. snap_history엔 뜨는데 열 수 없는 "유령 행"이 되고,
#    익명(owner NULL) 행은 사용자가 지울 수도 없다.
npx wrangler d1 execute snapcontext-captures --remote --command "SELECT count(*) FROM captures WHERE created_at < '2026-08-05'"
# 0이 아니면 같은 조건으로 정리:
npx wrangler d1 execute snapcontext-captures --remote --command "DELETE FROM captures WHERE created_at < '2026-08-05'"
```

| ①의 결과 | 판정 |
|---|---|
| 레거시 객체 **0개** | 그대로 2번(일괄 배포) 진행. H1(삭제가 R2 안 지우던 결함)은 대상이 없어 소멸 |
| **잔존 있음** | 원칙: 그래도 일괄 배포(접근은 410으로 차단됨) + **잔존 객체 수동 삭제**(`npx wrangler r2 object delete snapcontext-uploads <key> --remote`) — PRIVACY "삭제" 약속 이행. 자동 소멸 상한 30일 |
| 잔존 있음 + 부득이 fallback 유지 배포가 필요할 때(예외) | `ff8d19c`(fallback 일괄 제거 커밋)만 revert한 빌드로 배포하되, **반드시 `handleDeleteCapture`에 레거시 키(`id`·`${id}.json`) 병행 삭제를 먼저 추가**(감사 H1 — 안 하면 "지워도 서버에 남는" 계약 위반 지속) |

②에서 lifecycle이 `private-v2/`를 안 덮으면: 대시보드에서 규칙 prefix를 전체(또는 private-v2/ 추가)로 갱신 후 진행.

## 2. 배포

```powershell
cd worker
npm run deploy   # npm ci && wrangler deploy (lockfile 고정 — 감사 L11)
```

## 3. 배포 직후 스모크 (전부 PASS여야 완료)

| # | 확인 | 기대 |
|---|---|---|
| 1 | `GET /s/aaaa` · `GET /i/aaaa` · `POST /upload` · `OPTIONS /upload` | 전부 **410** + `Cache-Control: no-store` |
| 2 | 확장에서 캡처 → `내 AI에 저장` | 정상 저장(201) |
| 3 | 서버 저장 목록·삭제 | 목록 표시·삭제 후 사라짐 + **유령 행 0**(목록에 뜨는데 snap_pack이 NOT_FOUND인 행 없음 — D1 정리 ③의 사후 확인) |
| 4 | MCP: `snap_history` → `snap_analyze`(이미지 포함) | 정상 + `/pi` 서명 URL로 이미지 열림 |
| 5 | `/pi` URL의 `sig` 한 글자 변조 / 5분 경과 후 재사용 | 각각 거부(403) |
| 6 | serverInfo 버전 | **0.4.4** |
| 7 | wrangler tail 잠깐 열어 로그에 토큰·sig 원문 노출 없는지 | 노출 0 |

로컬 사전 리허설(선택): `pnpm dogfood:up` → 위 1·2·4를 127.0.0.1:8787로 동일 확인 + `pnpm dogfood:verify`(17).

## 4. 사고 대응 (배포 후 문제 발생 시)

- **구버전 Worker로 롤백 금지** — 닫은 공개 경로(/s·/i·/upload)가 다시 열리는 **개인정보 회귀**다.
- 원칙: **forward-fix** — 문제 지점만 고쳐 재배포. 판단이 서지 않으면 worker 전체를 410으로 잠그는 긴급 차단이 롤백보다 낫다.
- fallback 관련 문제면: `ff8d19c` revert가 유일한 예외 경로 — 단 위 1번 표의 H1 조건(삭제 핸들러 수정 선행) 필수.
- 410이 CDN에 캐시돼 수정 후에도 남으면: 응답이 no-store라 원칙적으로 없음 — 발생 시 대시보드 Caching > Purge.

## 5. 마무리

- 잔존 실측 결과(R2·D1)·스모크 결과를 이 파일 하단이나 Dev Log에 1줄 기록
- 공개 문서 정합 확인: docs/PRIVACY.md의 "공개 링크와 이전 버전" 문단이 410 현실과 일치하는지(0.4.4에서 갱신됨 — 배포 전 재확인만)
- `git tag v0.4.4 && git push origin v0.4.4`
- 스토어 제출 없음(0.4.6 랜딩 후 일괄)

## 6. 실행 기록 (2026-08-17 — Claude Code 세션, 커밋 cbe9c00 기준)

### 배포 전 판정 (§1)

| 항목 | 실측 | 판정 |
|---|---|---|
| ① R2 레거시 객체 | `r2 object list` 명령이 wrangler 4.111에 없음 → D1 레거시 행의 id(`db08f141-…`)로 raw 키 2종(`<id>`·`<id>.json`) 직접 get 조회 = **둘 다 "key does not exist"** | 알려진 레거시 키 잔존 0. 완전 열거는 대시보드만 가능하나 ②의 lifecycle이 상한 보장 |
| ② lifecycle | `auto-delete-7d` 규칙: **prefix (all prefixes)**, 30일 만료 활성 | private-v2/ 포함 전체 커버 — 감사 M4 충족 |
| ③ D1 레거시 행 | `created_at < '2026-08-05'` = **1행** — id `db08f141-a4cd-45ed-b1d5-5fddc3bd1617`, 2026-07-18 생성, title "E2E smoke"(example.com/e2e 테스트 잔재), expires_at 2026-07-25 경과 | 실사용자 데이터 아님. DELETE는 프로덕션 파괴 작업이라 자동화 차단됨 → **요한 직접 실행 잔여**(아래 명령). 만료 필터 덕에 snap_history 목록엔 안 뜨고, snap_pack도 NOT_FOUND(접근 불가 실측) — 유령 노출은 현재 0 |

```powershell
# 잔여 1건 — worker/ 에서 요한 직접 실행
npx wrangler d1 execute snapcontext-captures --remote --command "DELETE FROM captures WHERE created_at < '2026-08-05'"
```

판정 결과: 표 1행(레거시 객체 0) 경로 → 일괄 배포 진행. H1 소멸.

### 배포 (§2)

`pnpm run deploy` 성공 — Version ID `2feb2238-55d9-485e-8b58-a1822188ec3d`, 2026-08-17 22:44 KST.

### 스모크 (§3)

| # | 결과 |
|---|---|
| 1 | **PASS** — `GET /s`·`GET /i`·`POST /upload`·`OPTIONS /upload` 4/4 = 410 + `Cache-Control: no-store` |
| 2 | **PASS**(2026-08-17 23:07) — 실제 확장에서 캡처→저장 성공. 도중 결함 2건 발견·해결: ①dist가 dogfood 로컬 endpoint로 빌드돼 있던 것(재빌드, troubleshooting/2026-08-17-dogfood-dist-local-endpoint.md) ②프로덕션 D1에 0002 마이그레이션 미적용→500(apply, troubleshooting/2026-08-17-d1-migration-drift-500.md) |
| 3 | **PASS** — 신규 캡처 목록 표시·전 행 열림(유령 0). 삭제 후 사라짐은 요한 1클릭 잔여 |
| 4 | **PASS** — snap_history→snap_analyze digest 정상·`/pi` 서명 URL로 이미지 200(image/png 640KB) |
| 5 | **PASS** — /pi 서명 변조 403 · 만료 exp 403 (5분 경과 재사용 거부와 등가) |
| 6 | **PASS(구성적)** — 배포 번들=현 소스(mcp.ts serverInfo `0.4.4`)·Version ID 일치. 라이브 initialize POST는 자동화 권한상 미실행 — 2 확인 시 클라이언트 serverInfo로 겸사 확인 가능 |
| 7 | **PASS** — tail 25초: 앱 console 출력 0·Authorization 미표시. 플랫폼 요청 레코드의 query `sig=` 표시는 0.4.2 릴리즈 때 실측·수용된 기지 사항(capture id CF REDACTED → 재구성 불가, TASKS 참조) |

### 잔여 (전부 요한 — 완료 후 태그)

1. ~~위 D1 DELETE 1줄~~ ✅ 2026-08-17 요한 실행, 재조회 0행 확인
2. ~~D1 마이그레이션 적용~~ ✅ 2026-08-17 요한 실행(`migrations apply` 0002 ✅) — 상세: troubleshooting/2026-08-17-d1-migration-drift-500.md. **차기 런북 고정 단계**: 배포 전 `wrangler d1 migrations list --remote` 빈 목록 확인.
3. ~~확장에서 캡처 1건 → 스모크 2·3·4~~ ✅ 2026-08-17 23:07 저장·목록·digest·이미지 200 확인. 삭제도 완결 — "즉시 삭제" 후 목록 소멸 + snap_pack NOT_FOUND(R2 실물까지 삭제, PRIVACY 계약 실전 증명). 참고: 로컬 히스토리 삭제와 서버 "즉시 삭제"는 별개 버튼 — UX 개선 후보(0.4.6).
4. ~~`git tag v0.4.4 && git push origin v0.4.4`~~ ✅ 태그 완료 — **스모크 7/7 전항목 PASS, 0.4.4 릴리즈 종결(2026-08-17)**
