---
id: research-token-threat-model
date: 2026-08-17
tags: [security, token, threat-model, research, v0.4.x]
---

# sc_ 연결 토큰 위협모델 — 코드 실태 × 업계 정론 (2026-08-17)

> 발단: 요한 지시 "토큰 보안·안정성·해킹 위험 조사, 0.4.4~0.4.5 계획에 반영하거나 0.4.6 이후 편성".
> 방법: 코드 전수 정찰(파일:라인 근거) + 웹 정론 조사(출처 병기) 병렬 → 본 문서에서 종합.

## 한 줄 결론

**모델 자체는 정상 설계**(ntfy·healthchecks.io 계열의 capability 토큰 전례)이고 검증·전송·로그는 이미 정론 수준. 진짜 갭은 하나 — **토큰에 만료(exp)와 시크릿 버전(kid)이 없어 유출 시 revoke가 불가능**하다는 것. 이것이 0.4.6의 핵심이 되어야 한다.

## 실태 × 정론 대조표

| 영역 | 현재 코드 실태 | 업계 정론 | 판정 |
|---|---|---|---|
| 검증 | HMAC-SHA256 + `timingSafeEqualBytes`(worker/src/token.ts:132) + base64url 정규형 검증(PAT-002) | 상수시간 비교 필수, Workers 비표준 `timingSafeEqual` 공식 제공 | ✅ 정론 일치 |
| 엔트로피 | 랜덤부 16B=128bit CSPRNG(token.ts:113) | OWASP 최소 64bit·권장 128bit | ✅ 정론 일치 |
| 전송 | Authorization 헤더만, URL에 토큰 안 실림(upload.ts:100) | 장수 토큰은 헤더 — 정확히 그 관행 | ✅ |
| 노출면 | console/토스트/로그에 원문 0건, UI는 maskToken, e2e 로그도 평문 없음 | — | ✅ (wrangler tail·Logpush 활성 시만 주의) |
| 서명 URL(/pi) | 쿼리 서명 + TTL 300초(image-url.ts:8) | 짧은 TTL 쿼리 서명은 AWS presigned URL급 표준 패턴. 완화=짧은 TTL·HTTPS·referer 배제 | ✅ 정론 범위 |
| 로컬 저장 | chrome.storage.local 평문, sync 금지(token.ts:6) | 디스크 평문은 Chrome 위협모델 밖(물리·malware는 브라우저가 안 지킴). 자체 암호화는 키 저장 회귀로 실효 낮음 — **저장소 방어보다 토큰 가치 절하(권한 좁게·만료 짧게)가 정론** | ⚠️ 수용 가능 — exp 도입이 실질 완화 |
| 발급 | Origin(chrome-extension://) 검증 + per-isolate IP 분당 10회(token-rate-limit.ts:5) | Turnstile은 **MV3 원격코드 금지로 확장 내 불가**(스토어 리젝 사례). Workers RL 바인딩은 per-colo·permissive — 전역 방어는 **WAF Rate Limiting Rules**가 정석 | ⚠️ 0.4.5에서 승급 (아래) |
| **만료·revoke** | **토큰에 exp 없음 = 시크릿 교체 전까지 영구 유효. 서버측 revoke 0. 재발급 lite는 자발적 교체만**(ADR-020 Tier 1) | exp 클레임은 사실상 필수. 계정 없는 도구의 정론: ①짧은 exp+재발급(제일 쌈) ③kid 시크릿 로테이션(사고 시 일괄 무효화) ②denylist(무상태 포기 — 최후) | 🔴 **최대 갭 — 0.4.6 핵심** |

## 파생 권고 — 버전 편성

### 0.4.4 (변경 없음)
ADR-015 2차 배포 그대로. 토큰과 무관.

### 0.4.5 (스코프 구체화 근거 확보)
- 기존 계획 "CF native rate-limit 승급"의 구현 정론 확정: **Workers RL 바인딩이 아니라 zone 레벨 WAF Rate Limiting Rules**(바인딩은 공식문서상 per-colo·permissive·"정밀 계정용 아님").
- 통제 본질은 `/token`보다 **`/upload`**(발급 자체는 무상태라 비용 0, R2 플러딩이 진짜 비용) — 규칙 우선순위를 upload에.
- WAF rule 설정은 대시보드 작업 = 사람 게이트.

### 0.4.6 (스코프 재검토 제안 — 착수 시 ADR로 확정)
원계획 "D1 owners 발급 대장 + denylist"보다 정론에 부합하고 싼 경로가 있다:

| 안 | 내용 | 비용 | 판단 재료 |
|---|---|---|---|
| **A안(권고): 토큰 v2 = exp + kid** | 토큰 페이로드에 만료·시크릿버전 삽입, 만료 임박 시 확장이 자동 재발급(계정 없음 → refresh=익명 재발급이라 UX 비용 ~0). kid로 무중단 시크릿 로테이션 = 사고 시 일괄 무효화 비상 스위치 | 토큰 포맷 v2 전환(유저 ~0 지금이 최저비용), worker 검증부 수정 | 무상태 유지. 유출 노출창이 "영구"→"만료창"으로 |
| B안(원계획): D1 denylist | 즉시 개별 revoke | 무상태(ADR-011) 포기, 매 검증에 D1 read | 개별 revoke가 정말 필요해질 때(다중 사용자 시대) 승급 |

- A안이어도 ADR-020 Tier 2(denylist)는 "그때 가서" 항목으로 유지 — 삭제 아님.
- 저비용 동반 수정(0.4.6 또는 아무 patch): 에러 응답의 `TOKEN_SIGNING_SECRET unset` 문구 추상화(index.ts:131-134), PRIVACY·온보딩에 "토큰은 비밀번호처럼 취급" 고지 문구 확인.

## 하지 않기로 한 것 (근거 있는 기각)

- **chrome.storage 자체 암호화** — 키를 같은 곳에 저장하는 순환. Chromium DevRel 공식 견해도 동일. 기각.
- **storage.session 이전** — 영속 토큰과 부적합(재시작마다 소멸). 익명 재발급이 0원이 되는 토큰 v2 이후엔 재검토 여지.
- **확장 내 Turnstile** — MV3 원격코드 금지로 스토어 리젝 사례 존재. 기각.
- **/pi 서명을 헤더로 이전** — `<img src>` 소비처가 헤더를 못 붙임. 쿼리+짧은 TTL이 이 용도의 표준. 기각.

## 출처 (핵심만 — 전체는 조사 원문)

- Workers timingSafeEqual: https://developers.cloudflare.com/workers/runtime-apis/web-crypto/
- Workers RL 바인딩 한계: https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
- OWASP 세션 토큰 엔트로피: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- W3C Capability URLs: https://www.w3.org/TR/capability-urls/
- AWS presigned URL best practices: https://docs.aws.amazon.com/pdfs/prescriptive-guidance/latest/presigned-url-best-practices/presigned-url-best-practices.pdf
- Chrome storage / MV3 원격코드: https://developer.chrome.com/docs/extensions/reference/api/storage , https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code
- 유사 사례: https://docs.ntfy.sh/config/ , https://healthchecks.io/docs/http_api/
