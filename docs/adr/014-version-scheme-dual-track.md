---
id: ADR-014
date: 2026-07-25
tags: [versioning, release, worker, extension, deploy, v0.4.1]
---

# ADR-014: 2-트랙 버전 스킴 — 확장/worker 배포면별 독립 bump

## 상태

승인 (0.4.1 에서 구현 — `docs/log/2026-07-25-v041-upload-ratelimit.md`)

## 맥락

SnapContext 는 배포 경로가 다른 **두 배포물(deployable)** 로 이뤄진다.

| 배포물 | 배포 방법 | 리드타임 |
|--------|-----------|----------|
| 확장(`src/**`·`manifest.json`) | 스토어 zip 업로드 → 심사 | 수일~수주 |
| worker(`worker/**`) | `wrangler deploy` | 즉시 |

그런데 버전 정본이 확장측에만 걸려 있다. `scripts/check-version-sync.mjs` 는 4값(`package.json`·`manifest.json`·`package-lock.json` 2곳)만 정합 검사하고, worker 의 사용자 노출 버전인 `worker/src/mcp.ts` 의 `serverInfo.version`(MCP 클라이언트가 `initialize` 응답에서 보는 값)은 게이트 밖이다. 스크린샷 masthead `V0.X.Y`(`scripts/generate-store-screenshots.mjs`)도 무검사다(0.4.0 에서 손으로 고친 이력 = `ae26ad1`).

0.4.1 은 **worker 만** 바꾸는 보안 패치(`/upload` rate-limit)다. 여기서 문제가 드러난다 — 단일 통합 버전을 강제하면 worker-only 변경이 확장 manifest 를 bump 하게 되고, 그러면 **코드가 하나도 안 바뀐 확장을 스토어에 재심사 제출**해야 한다. 무의미한 심사 사이클이다.

## 결정

**단일 제품 SemVer `0.MINOR.PATCH` 라인을 유지하되, 각 배포면은 자기 코드가 바뀔 때만 자기 버전 파일을 bump 한다. 둘 다 바뀌는 릴리즈에서 두 값이 자연 정합한다.**

1. **확장 릴리즈**(`src/**`·`manifest.json` 변경) → 4값 게이트 + masthead `V0.X.Y` + (MCP 표면이 바뀌었으면)`mcp.ts` serverInfo 를 bump. 스토어 재심사 대상.
2. **worker 릴리즈**(`worker/**` 만 변경) → `mcp.ts` serverInfo **만** bump. `wrangler deploy`, 스토어 무관.
3. **divergence 는 정상이다.** worker-only 패치(0.4.1)에서 serverInfo=`0.4.1`, 확장 manifest=`0.4.0` 으로 갈라진다. 서로 다른 배포면의 버전이므로 어긋난 게 아니다. 확장+worker 동시 릴리즈(다음 MINOR)에서 두 값을 같은 번호로 맞춰 재정합한다.
4. **`worker/package.json`(현재 0.1.0)은 제품 라인 밖.** 사용자 미노출 인프라 메타라 건드리지 않는다. worker 제품 버전의 정본은 `mcp.ts` serverInfo 하나로 확정한다(두 값이 갈리는 모호성 제거).
5. **버전 정본 단언은 테스트가 지킨다.** serverInfo 는 `worker/test/mcp-integration.test.ts` 가 값을 고정 단언한다 — bump 시 이 단언도 같은 커밋에서 갱신(누락 = red).

## 결과

- worker-only 보안 패치가 스토어 재심사 없이 나간다. C(`/upload` rate-limit)가 이 스킴의 첫 실증이다.
- MCP 클라이언트는 `serverInfo.version` 으로 실제 배포된 worker 세대를 본다 — 확장 manifest 와 다를 수 있고, 그게 맞다.
- changelog 는 버전 헤딩 아래에 어느 배포면이 움직였는지 명시한다("worker-only" 등).

### 보강 권고 (후속)

- `check-version-sync.mjs` 에 masthead `V0.X.Y`(스크린샷 생성기)를 확장 번들 5번째 정합값으로 추가한다. 현재 무검사라 손수정 회귀 구멍이다.
- worker predeploy 훅에서 `mcp.ts` serverInfo 를 별도 소프트 체크(배포 전 bump 누락 방지).

## 대안 검토

- **단일 통합 버전(모든 파일 lockstep)** — 기각. worker-only 변경이 확장 재심사를 강제한다(바로 이 ADR 이 막는 것).
- **완전 이원 버전(worker 는 0.1.x 독자 라인 유지)** — 기각. `mcp.ts`(0.4.0)와 `worker/package.json`(0.1.0)이 이미 갈려 "worker 버전이 뭐냐"가 모호하다. 마케팅·changelog 도 두 라인을 추적해야 해 혼란. 제품 라인 하나로 통일하되 bump 대상만 배포면별로 나눈다.
