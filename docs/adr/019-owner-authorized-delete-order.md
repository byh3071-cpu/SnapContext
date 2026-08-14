---
id: ADR-019
date: 2026-08-05
status: accepted
tags: [deletion, privacy, d1, r2, failure-recovery, v0.4.2]
---

# ADR-019: owner 승인 즉시 삭제와 R2 우선 삭제 순서

## 상태

승인 — 2026-08-05 사용자 명시 승인.

## 결정 질문

D1과 R2 사이에 transaction이 없을 때 owner를 잃지 않고 즉시 삭제를 재시도 가능하게 만드는 순서는 무엇인가?

## 범위와 비범위

- 범위: private v2 수동 삭제 권한, R2·D1 순서, 부분 실패 status와 재시도
- 비범위: 보관 만료 lifecycle, 로컬 history 자동 삭제, queue·tombstone 인프라

## 맥락

사용자는 서버에 저장한 private 캡처를 즉시 삭제할 수 있어야 한다. 하나의 캡처는 D1 인덱스와 R2 이미지·JSON에 걸쳐 있지만 D1과 R2를 묶는 분산 transaction은 없다. 삭제 순서와 부분 실패를 정의하지 않으면 UI는 성공을 표시했는데 이미지가 남거나, 재시도로 복구할 권한 근거가 먼저 사라질 수 있다.

## 결정

1. `DELETE /captures/{id}`는 valid `sc_` bearer user만 호출할 수 있다. D1에서 owner를 확인하고 미존재·교차 owner는 같은 HTTP 404를 반환한다.
2. admin token에는 REST 삭제 권한을 주지 않는다.
3. 삭제 순서는 다음과 같다.
   1. D1 row로 owner 승인
   2. 파생 R2 image와 JSON 삭제
   3. D1 row 삭제
4. R2 삭제가 실패하면 HTTP 502를 반환하고 D1 row를 유지한다. 사용자는 같은 요청을 안전하게 재시도할 수 있다.
5. R2 삭제 뒤 D1 삭제가 실패하면 HTTP 500을 반환한다. D1 row가 남으므로 재시도 시 owner를 다시 승인하고, 이미 없는 R2 객체 삭제를 성공으로 취급한 뒤 D1 row를 제거한다.
6. 모든 단계가 끝난 뒤에만 HTTP 204를 반환한다. 부분 실패를 성공으로 위장하지 않는다.
7. 서버 삭제는 로컬 확장 history를 자동 삭제하지 않는다. UI에서 “서버 저장본 삭제”와 “이 기기의 기록 삭제”를 분리해 표시한다.
8. 보관 기간 만료 정리는 별도 lifecycle이며 사용자 요청 삭제의 성공 조건을 대체하지 않는다.

## 대안

- D1 먼저 삭제: 목록에서는 즉시 사라지지만 R2 실패 시 owner 승인 근거가 없어져 orphan 복구가 어려워 기각한다.
- R2와 D1을 `Promise.all`로 삭제: 빠르지만 부분 실패의 순서와 재시도 의미를 통제할 수 없어 기각한다.
- R2 삭제 실패를 best-effort로 숨기기: 사용자에게 거짓 성공을 보여 개인정보 기대를 깨므로 기각한다.
- tombstone/queue 기반 비동기 삭제: 복구력은 높지만 새 스키마나 인프라가 필요해 0.4.2 범위를 넘는다.

## 결과

- 성공 응답은 R2와 D1 삭제가 모두 끝났다는 뜻이다.
- D1 삭제 실패 동안 history에 빈 항목이 잠시 보일 수 있으나 재시도로 수렴한다.
- 삭제 endpoint는 idempotent한 내부 삭제를 사용하지만, 이미 D1 row가 없는 요청의 외부 결과는 404다.
- 부분 실패 관측은 URL·token·owner·capture ID를 포함하지 않는 안전한 event name과 status만 기록한다.

## 관련 ADR

- [ADR-016](016-owner-errors-admin-policy.md): owner·admin 권한과 외부 오류
- [ADR-018](018-rollback-safe-private-object-key.md): 삭제할 파생 R2 key
