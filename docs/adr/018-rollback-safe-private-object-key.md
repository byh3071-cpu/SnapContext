---
id: ADR-018
date: 2026-08-05
status: accepted
tags: [security, r2, rollback, key-derivation, v0.4.2]
---

# ADR-018: rollback-safe private 경로와 HMAC 파생 R2 키

## 상태

승인 — 2026-08-05 사용자 명시 승인.

## 결정 질문

이전 Worker가 같은 production R2 bucket을 계속 볼 수 있는 상황에서 신규 private 캡처의 외부 ID가 레거시 공개 객체 key가 되지 않게 하려면 어떻게 저장할 것인가?

## 범위와 비범위

- 범위: 외부 ID와 R2 key 분리, key 파생·비노출, secret 회전 제약
- 비범위: 신규 bucket·secret·D1 migration, 저장 데이터 암호화

## 맥락

같은 R2 bucket에 `private-v2/{id}`처럼 예측 가능한 prefix만 추가하면 안전하지 않다. 현재 레거시 `/i/{id}` 구현은 path 나머지를 R2 key로 사용하므로, 이전 Worker로 rollback한 뒤 실제 key를 알면 `/i/private-v2/{id}`로 읽을 수 있다.

별도 bucket은 가장 명확한 격리지만 새 binding·리소스·배포 관리가 필요하다. 0.4.2는 신규 secret과 D1 migration 없이 현재 인프라 안에서 rollback 시 공개 ID로 private 객체를 찾지 못하게 해야 한다.

## 결정

1. 외부 capture ID는 UUID로 유지하되 R2 실제 key로 사용하지 않는다.
2. 실제 base key는 다음처럼 계산한다.

   ```text
   digest = HMAC-SHA256(TOKEN_SIGNING_SECRET, "obj.v2:" + captureId)
   baseKey = "private-v2/" + base64url(digest 전체 32바이트)
   imageKey = baseKey
   jsonKey = baseKey + ".json"
   ```

3. 파생 key는 API, MCP result, D1, custom log에 기록하거나 반환하지 않는다. D1은 외부 UUID만 저장한다.
4. 0.4.2 확장은 신규 `/captures`와 `/pi`만 사용한다. 이전 Worker에는 이 route가 없으므로 rollback 중 신규 private 저장은 명시적으로 실패한다.
5. 신규 secret, 신규 R2 bucket, 신규 D1 migration은 추가하지 않는다.
6. `TOKEN_SIGNING_SECRET` 회전은 파생 객체 조회와 user owner를 동시에 끊는다. 별도 migration 계획과 사람 승인 없이는 회전하지 않는다.
7. 내부 key가 유출되면 이전 `/i/{id}`가 그 key를 받아 객체를 읽을 수 있다는 잔여 위험을 인정한다. key 비노출, URL·query 비로그, 엄격한 API 응답 allowlist로 완화한다.

## 대안

- `private-v2/{id}` 직접 key: 구현은 간단하지만 이전 공개 `/i`가 key를 그대로 읽을 수 있어 기각한다.
- 별도 private R2 bucket: 격리가 가장 강하고 secret rotation 영향이 작다. 새 인프라 운영을 감수할 필요가 생기거나 파생 key 비노출을 보장하지 못하면 우선 재검토한다.
- R2 key를 임의 난수로 만들고 D1에 매핑 저장: secret rotation에는 강하지만 새 DB 컬럼·migration과 매핑 조회가 필요해 기각한다.
- 데이터를 암호화해 같은 bucket에 저장: rollback 노출 방어는 강하지만 키 관리·회전·스트리밍 비용이 0.4.2 범위를 넘어서 기각한다.

## 결과

- 외부 capture ID만 아는 이전 Worker는 private R2 key를 계산할 수 없어 공개 `/i/{id}`로 신규 객체를 찾지 못한다.
- 현재 secret을 가진 새 Worker만 외부 ID를 R2 key로 매핑한다.
- secret 회전 비용이 커지므로 운영 문서와 배포 게이트가 필수다.
- 이 설계는 내부 key 비노출 가정에 의존한다. 로그·오류·테스트 fixture에서 실제 key가 새면 별도 bucket보다 약하다.

## 근거

- Worker rollback은 R2·D1 데이터 상태를 되돌리지 않으므로 코드 rollback 뒤에도 신규 객체가 남는다([Cloudflare Rollbacks](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/), 2026-08-05 확인).

## 관련 ADR

- [ADR-011](011-per-user-hmac-token.md): 재사용하는 HMAC secret
- [ADR-015](015-private-capture-access-rollout.md): 신규 private route와 rollback 정책
- [ADR-017](017-signed-private-image-url.md): 외부 이미지 URL 서명
