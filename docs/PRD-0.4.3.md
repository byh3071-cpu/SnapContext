---
id: prd-0.4.3
date: 2026-08-16
status: approved
tags: [annotation, redaction, token, extension, v0.4.3]
---

# SnapContext 0.4.3 — 업로드 전에 가리고, 더 풍부하게 표시한다

## 한 줄 목표

비밀은 업로드 전에 픽셀째 파괴하고(가리기), 의도는 화살표·형광펜·자유선으로 더 정확히 전달하며, 토큰은 버튼 하나로 재발급한다. **ext-only** — worker 무변경.

> 세대 계획 SoT: `~/.claude/plans/0-3-0-prd-zippy-finch.md` §5(B redaction)·§4(A revoke tiered). 로드맵 트랙 E 마지막 버전.

## 왜 지금

- 0.4.2가 "내 토큰의 AI만 내 캡처"를 만들었지만, **캡처 안에 찍힌 비밀**(토큰·이메일·잔액)은 여전히 그대로 업로드된다. 가리기는 이 마지막 구멍을 업로드 전에 원천 차단한다.
- 핀+메모만으로는 "이 흐름 따라가라"·"이 줄 강조" 같은 의도 표현이 약하다 — 화살표·형광펜·자유선이 채운다.
- 토큰 유출 시 대응 수단이 0이다 — 재발급(lite)이 최소 대응선.

## 스코프

### B — 주석 도구 4종 (캔버스 bake)

`renderAnnotatedPngBlob`(src/utils/annotated-image.ts)의 캔버스 파이프라인 확장 + 사이드패널 주석 툴바 UI.

| 도구 | 동작 | 성격 |
|---|---|---|
| 가리기 | 드래그 사각 영역을 **불투명 솔리드 박스**로 덮어 픽셀 파괴 | **파괴적** — 내보내기·업로드본에서 복원 불가 |
| 화살표 | 시작→끝 드래그로 화살표 | 표현 |
| 형광펜 | 반투명 굵은 스트로크 | 표현 |
| 자유선 | 펜 드로잉 | 표현 |

**불변 규칙 (ADR-021 파괴적 redaction):**
- 가리기는 **솔리드 박스만** — 모자이크·가우시안 블러 제공 금지. 근거([웹/외부] 2022~): 픽셀레이션 텍스트는 Depix·Unredacter로 복원됨(Bishop Fox 권고: "black bars only — no pixelation, no blurring"), 블러도 AI 복원 연구 다수. 솔리드 채움은 픽셀값이 상수로 대체돼 복원 자체가 불성립.
- CSS/오버레이 금지 — 픽셀을 캔버스에서 실제로 파괴해 bake. 오버레이면 비밀이 worker/AI로 샌다.
- bake 산출물은 `canvas.toBlob` **신규 PNG 인코딩** — 원본 바이트가 파일에 잔존하는 aCropalypse 류 함정 원천 배제(편집 메타·레이어 보존 포맷 금지).
- 내보내는 모든 경로(다운로드·클립보드 복사·`내 AI에 저장` 업로드)가 **동일한 bake 파이프라인**을 지난다. 우회 경로 0.

### A — 토큰 재발급 lite (client-only)

- 설정 영역에 `토큰 재발급` 버튼 → `POST /token`으로 새 `sc_` 발급·로컬 교체 (src/utils/token.ts + 설정 UI).
- 정직 고지 문구: "이전 토큰은 기존 캡처가 만료(최대 30일)될 때까지 유효".
- worker 무변경. 완전 revoke는 0.4.7 — ADR-020 이연 → ADR-022 A+로 대체(2026-08-30 정정).

## 확정된 결정 (2026-08-16 요한 A·A·A + 조사 검증)

| # | 결정 | 근거 |
|---|---|---|
| D1 | 가림 = **솔리드 박스** (조사로 상향 — 원안 모자이크 폐기) | 픽셀레이션은 Depix·Unredacter로 텍스트 복원됨, 블러는 AI 복원 연구 다수. 업계 정론 = 불투명 단색 박스만. 구현도 `fillRect`로 가장 단순 |
| D2 | 편집 중 벡터 유지 → **내보내기 시점 bake** | 실수 복구(undo) 가능, 파괴 보장은 내보내기 경로 단일화로 충족. 스크린샷 도구 표준 모델. bake는 신규 PNG 인코딩(aCropalypse 방지) |
| D3 | 로컬 히스토리 원본 **유지** | 위협모델은 "서버/AI로 새는 것" — 로컬은 사용자 소유. 원본 폐기는 불편만 추가 |

**조사 출처**: [Bishop Fox — Never Use Text Pixelation](https://bishopfox.com/blog/unredacter-tool-never-pixelation) · [Positive Security — video depixelation](https://positive.security/blog/video-depixelation) · [Hacker News — Unredacter](https://thehackernews.com/2022/02/this-new-tool-can-retrieve-pixelated.html)

## 비목표

- 완전 revoke(→ 0.4.7, ADR-022) · owner 재매핑 (TTL 자가치유)
- `/s` 제거·서명 `/i` 강제(→ 0.4.4) · worker 변경 일체
- 스토어 재심사 제출 — **0.4.5 완료 후 1회 일괄** (요한 결정 2026-08-16, 구 "재심사 #2" 폐기)
- 텍스트 박스·도형 라이브러리·색상 팔레트 확장 (0.5+ 후보)
- 주석·가리기의 히스토리 저장·복원 — 세션-로컬(0.5+ 후보)

## 버전·문서 계약

- ADR-014 2트랙: ext 4값(package.json·manifest 등)만 0.4.3, worker serverInfo는 0.4.2 유지.
- ADR 채번 주의: 세대 계획의 "ADR-018~019"는 스테일(이미 사용됨) → **ADR-020(revoke tiered·이연), ADR-021(파괴적 redaction)**.

## 완료 기준 (DoD)

1. `pnpm test` green — 신규: bake 후 가림 영역 픽셀이 전부 지정 단색(원본 정보 0), 내보내기 3경로 동일 파이프라인, 산출 PNG에 원본 바이트 잔존 없음, 재발급 시 토큰 교체.
2. `tsc --noEmit` + `vite build` 통과, `vhk mission check` 위반 0.
3. critic 적대검증(M 티어링): redaction 파괴성 — bake 산출물에서 원본 유추 불가·우회 경로 부재.
4. 수동 QA: 4도구 렌더·undo·재발급 후 신규 캡처가 새 토큰으로 조회됨.
5. tag `v0.4.3` (사람). 스토어 제출 없음.
