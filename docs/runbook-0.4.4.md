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
