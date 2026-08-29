---
id: PAT-005
패턴명: 상수 문구 검증을 런타임 성공 경로에서 throw하면 성공이 실패로 뒤집힌다
카테고리: state
증상: "안내 문구는 1줄·80자 이하"를 `assertOneLine(msg)`로 강제했는데, 이 검사가 저장 **성공** 토스트를 만드는 시점(`buildSuccessMessage(days)`)에 실행된다. 나중에 문구가 81자가 되면 throw → 호출부 `catch`가 잡아 `onSaveResult({status:'failed'})` → **실제로 성공한 저장이 실패 배지로 표시**되고 재시도 유도. 단위 테스트는 현재 문구(66자)만 통과시켜 초록.
원인: 불변 상수(문구)에 대한 검증을 모듈 로드/테스트 시점이 아니라 사용자 동작의 성공 경로 안에 두었고, 그 경로가 포괄 `try/catch`로 감싸져 있어 검증 실패가 도메인 실패로 오역됨.
해결: |
  1. 상수 문구 검증은 테스트에서(경계값 포함: 80자 통과·81자 throw·줄바꿈 throw) — 런타임 성공 경로에서는 throw하지 않는다.
  2. 동적 문구(보관 일수 등 인자 포함)는 허용 인자 전수(allowlist)로 길이를 테스트에서 미리 계산한다(예: [1,7,30]일 → 65·65·66자).
  3. 런타임에 검증을 남겨야 하면 실패를 "문구 오류"로 분리 보고(별도 에러 타입)하고 성공 결과를 유지한다 — 도메인 결과와 표시 결과를 섞지 않는다.
적용조건: 성공/실패 상태를 사용자에게 배지·토스트로 보여주는 코드에서 문구·서식 검증을 같은 경로에 넣을 때. `try { …성공처리… } catch { 실패처리 }` 안에 부수 검증이 있을 때 항상.
출처프로젝트: SnapContext 0.4.6 (T6 저장 배지 + T3 안내 문구, critic W2-fix MINOR)
태그: [state, assert, error-handling, ux, toast]
발견일: 2026-08-30
출처DevLog: docs/dogfood/2026-08-29-orchestration-ledger.md DF-50 · tests/one-line.test.ts
---

# PAT-005 — 상수 문구 검증을 런타임 성공 경로에서 throw하면 성공이 실패로 뒤집힌다

## 재현

```ts
// share-expiry.ts
export function buildPrivateSaveSuccessMessage(days) {
  const msg = `내 AI에 저장됨(${formatExpiryDays(days)} 후 삭제) — …`
  assertOneLine(msg)   // 81자 이상이면 throw
  return msg
}
// ImageActions.ts
try {
  await save(...)                       // 성공
  deps.onSaveResult({ status: 'saved', ... })
  deps.showToast(buildPrivateSaveSuccessMessage(days))   // ← 여기서 throw
} catch (e) {
  deps.onSaveResult({ status: 'failed', message: ... }) // 성공이 실패로
}
```

## 최소 그물

```ts
it('80자 초과는 throw', () => expect(() => assertOneLine('a'.repeat(81))).toThrow())
it('허용 일수 전수 길이 ≤ 80', () => EXPIRY_DAYS_ALLOWLIST.forEach(d => expect(() => assertOneLine(buildPrivateSaveSuccessMessage(d))).not.toThrow()))
```

## 체크리스트

- [ ] `try` 블록 안에 도메인 동작과 무관한 검증(문구·서식·로그)이 있는가 → 밖으로 빼거나 테스트로 옮긴다
- [ ] 성공 결과 보고(`onSaveResult saved`)가 부수 작업(toast) **앞**에서 확정되는가
- [ ] 동적 문구의 인자 allowlist 전수를 테스트가 도는가
