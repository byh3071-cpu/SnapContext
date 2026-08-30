# 연결 토큰 무효화(revoke) 설계 리서치 — 2026-08-30

> 목적: 0.4.7 설계 결정(ADR-022) 재료. 조사 = Claude sonnet(웹), 코드 정찰 = Claude haiku(explorer), 종합 = Fable 지휘자. 출처는 URL, 추측은 [추론].
> 결론은 `docs/adr/022-token-v2-exp-kid-rotate.md`에 있다. 이 문서는 근거 보관용.

## 1. 무상태 토큰의 만료(exp)·키 식별(kid) 정론

결론: JWT/PASETO/Fernet 모두 exp·kid를 표준 필드로 다룬다. 키 회전은 "신키 추가 → 신키로 서명 전환 → 구키는 최소 exp만큼 유예 수용 → 구키 폐기" 4단계. 절대 만료가 기본, 슬라이딩은 UX 보조.

| 주장 | 출처 | 신뢰도 |
|---|---|---|
| exp 이후 토큰은 반드시 거부 | https://www.rfc-editor.org/rfc/rfc7519.html | 높음(1차) |
| kid 회전 4단계, 유예 ≥ access TTL | https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_Cheat_Sheet.html | 높음 |
| PASETO exp 클레임·kid footer | https://github.com/paseto-standard/paseto-spec/blob/master/docs/02-Implementation-Guide/04-Claims.md | 높음 |
| Fernet MultiFernet 다중키 동시 검증(회전) | https://cryptography.io/en/latest/fernet/ | 중간 |
| 절대 만료 필수 + 슬라이딩 병행 권장 | https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html | 높음 |
| 장기 API 키 권장 수명 90일(고위험 30일), 무만료는 명시적 opt-in | https://apikeys.guide/docs/security/expiration-policies | 중간(벤더 가이드) |

## 2. 익명 자동 재발급(refresh) 사례

결론: OAuth2 리프레시 정론은 "rotation + reuse detection". 실제 제품(GitHub PAT·Cloudflare 서비스 토큰·Sentry DSN)은 "만료 있음/설정형 + 회전 가능 + 개별 revoke 가능(장부 보유)"이 공통.

| 주장 | 출처 | 신뢰도 |
|---|---|---|
| 리프레시 재사용 감지 시 토큰 패밀리 전체 무효화 | https://cheatsheetseries.owasp.org/cheatsheets/OAuth2_Cheat_Sheet.html | 높음 |
| GitHub PAT: 만료 권장·1년 미사용/공개 유출 시 자동 폐기·개별 revoke | https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/token-expiration-and-revocation | 높음(1차) |
| Cloudflare 서비스 토큰: duration 만료, rotate 시 유예(1시간~30일), delete로 완전 폐기 | https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/ | 높음(1차) |
| Sentry DSN: 만료 없음, 유출 시 rotate 권장 | https://docs.sentry.io/concepts/key-terms/dsn-explainer/ | 높음(1차) |
| ntfy/healthchecks: 키 구분까지만 확인, 만료 정책 불명 | https://healthchecks.io/docs/apiv1/ | 낮음 |

## 3. 무상태 개별 revoke의 한계

결론: "완전 무상태 개별 revoke"는 불가 — 거부 목록 등 최소 상태 필요(OWASP 공식). 세대 카운터는 상태를 "사용자당 정수 1개"로 줄이지만 결국 kid 회전과 같은 "그룹 일괄" 메커니즘. Cloudflare KV는 최종적 일관성(전파 최대 60초+)이라 즉시 revoke에 부적합, D1은 강한 일관성이나 지연 큼.

| 주장 | 출처 | 신뢰도 |
|---|---|---|
| JWT는 태생적으로 revoke 불가 → denylist 필요, 쓰면 무상태 깨짐 | OWASP JWT Cheat Sheet(위) | 높음 |
| KV eventual consistency, 전파 최대 60초+ | https://developers.cloudflare.com/kv/concepts/how-kv-works/ | 높음(1차) |
| D1 강한 일관성, 단순 SELECT 15~30ms | https://eastondev.com/blog/en/posts/dev/20260422-cloudflare-workers-kv-guide/ | 중간(비공식 벤치) |

## 4. 불변 uid vs 회전 가능 비밀 분리

정론은 "토큰 = 불변 subject + 회전 가능한 서명 비밀". 단 이는 **장부 기반 revoke가 있는 세계**의 관행 — SnapContext처럼 무상태에서 uid를 고정하면 회전해도 옛 토큰이 같은 uid로 계속 읽어 revoke가 사라진다(ADR-022 대안 표). 현행 "owner = SHA-256(토큰)"이 오히려 무상태 revoke 장치다.

| 주장 | 출처 | 신뢰도 |
|---|---|---|
| sub은 불변 식별자, 이메일 등 금지 | https://mojoauth.com/blog/explore-jwt-subject-sub-claim | 중간(2차) |
| RFC 7519 sub = unique identifier(불변성은 관행) | https://www.rfc-editor.org/rfc/rfc7519.html | 높음 |

## 5. Cloudflare Workers 구현 관점

| 주장 | 출처 | 신뢰도 |
|---|---|---|
| `wrangler secret put`/versions secret, 버전별 롤백 | https://developers.cloudflare.com/workers/configuration/secrets/ | 높음(1차) |
| HMAC verify 상수시간, 수동 비교는 timingSafeEqual | https://developers.cloudflare.com/workers/examples/protect-against-timing-attacks | 높음(1차) |
| exp 판정 시계 `Date.now()` 신뢰 근거 — 공식 명시 미확인 | — | [추론: 엣지 서버 NTP 동기화 전제] |

## 6. Chrome 확장(MV3) 관점

| 주장 | 출처 | 신뢰도 |
|---|---|---|
| chrome.alarms 최소 주기 30초(Chrome 120+), 리스너는 SW 최상위 | https://developer.chrome.com/docs/extensions/reference/api/alarms | 높음(1차) |
| storage.local 비암호화, 기밀 저장 금지 취지 | (1차 URL 미확보) | 중간 |
| MV3 원격 코드 금지는 "실행"만 대상 — 토큰 fetch는 무관 | https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code | 높음(1차) |

→ 0.4.7 결정: alarms·백그라운드 갱신을 쓰지 않는다(자동 갱신 기각, ADR-022 §3). 만료 검사는 사이드패널 열 때.

## 7. 스토어 심사 관점

| 주장 | 출처 | 신뢰도 |
|---|---|---|
| 데이터 카테고리 공개 의무, 목적 외 사용·판매 금지 | https://developer.chrome.com/docs/webstore/program-policies/privacy | 높음(1차) |
| Limited Use: 수집 데이터는 단일 목적 범위 | https://developer.chrome.com/docs/webstore/program-policies/limited-use | 높음(1차) |
| "만료 추가" 자체가 별도 정책 트리거라는 근거 없음 | — | [추론] |

## 8. 코드 정찰 요약 (haiku explorer, 2026-08-30)

| 사실 | 근거 |
|---|---|
| 토큰 `sc_<base64url(rand16)>.<base64url(HMAC-SHA256 앞 16B)>`, 정규형 강제, timing-safe 비교 | `worker/src/token.ts:7-18, 61-63, 101-113, 132` |
| owner = SHA-256(토큰 전문), 무상태(D1 read 0) | `worker/src/token.ts:135-142`, `auth.ts:119` |
| `POST /token`: Origin `chrome-extension://` 필수, 분당 10회/IP(per-isolate), 비밀 미설정 500 | `worker/src/index.ts:112-130`, `token-rate-limit.ts:5-6` |
| D1 `captures.owner TEXT` + `(owner, created_at DESC)` 인덱스, owners 테이블 없음 | `worker/migrations/0002_captures_owner.sql` |
| MCP 인증 우선순위 admin → sc_ → 500 → 401, admin은 `sc_` 접두 금지 | `worker/src/auth.ts:91-132` |
| **R2 객체 키 = HMAC(TOKEN_SIGNING_SECRET, "obj.v2:"+id)** — owner 미포함, 서명 비밀에 종속 | `worker/src/private-object-key.ts:12-24` |
| 확장: storage.local, lazy 발급, in-flight 가드 2종, `regenerateUserToken`(Tier 1), 형식 검사 `sc_`+점 | `src/utils/token.ts:6-84, 159-165` |
| 토큰 사용처: `POST/GET/DELETE /captures`, `/mcp` | `src/utils/upload.ts:100,160,183`, `worker/src/mcp.ts:71-75` |
| 검증 수: 확장 token 41 / worker token 계열 ~35 | `tests/token.test.ts`, `worker/test/token*.test.ts` |
| 버전: manifest 0.4.6 · serverInfo 0.4.4 | `manifest.json:4`, `worker/src/mcp.ts:47` |

## 9. 판정 (요약 — 상세는 ADR-022)

- 정론은 "즉시 개별 revoke = 상태 필요"를 말하지만, 사용자 ~0·무계정·단일 운영자·캡처 TTL ≤30일에서는 장부 상시 조회가 과투자.
- **A+안 채택 권고**: 만료(90일)+kid + "회전 = 새 토큰 + `captures.owner` 이전(D1 1회)" + 객체 키 비밀 분리(`OBJECT_KEY_SECRET`). 자동 갱신 기각(AI 도구 정적 설정).
- B안 승급 트리거: 다중 사용자 · 개별 즉시 revoke 요구 실제 발생 · 고위험 데이터 결합.
