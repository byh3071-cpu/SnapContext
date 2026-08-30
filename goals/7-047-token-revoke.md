---
vhk_format: 1
type: goal
id: 7
title: 0.4.7 — 연결 토큰 무효화 완성형 (만료·비밀 세대·새 열쇠 받기 = 저장본 이전)
status: NOT_STARTED
priority: P1
version: v0.4.7
---

# Mission

> **구현 계획 영수증(승인 대기, 2026-08-30):** `goals/7-047-token-revoke-plan.md` — 웨이브·투입 AI·결재 항목(R1~R6). 승인 전 구현 금지.

연결 토큰에 만료(90일)와 비밀 세대번호를 넣고, "새 열쇠 받기"를 누르면 내 저장본이 새 열쇠로 옮겨져 옛 열쇠는 즉시 아무것도 못 읽게 한다. 서버는 장부 없이 검증(무상태 유지). **worker + ext** 둘 다 변경. 스펙 SoT: `docs/PRD-0.4.7.md` · 결정: `docs/adr/022-token-v2-exp-kid-rotate.md`.

## 착수 조건

- 0.4.6 랜딩(tag v0.4.6 ✅ 2026-08-30). **0.4.5와 독립**(2026-08-30 요한 "B로" — 로드맵 트랙 F 순서 정정). 요한 결재 R1~R6.

## Done when

- [ ] T1 서버 열쇠 v2 — exp·kid·PREV·v1 유예, 실패 이유 구분 (worker token/auth/env)
- [ ] T2 서버 회전 — `POST /token/rotate` + owner UPDATE 원자성 + rate-limit + 유예 규칙
- [ ] T3 객체 키 비밀 분리 — `OBJECT_KEY_SECRET`, 서명 비밀 회전에 R2 경로 불변
- [ ] T4 확장 열쇠 클라이언트 — expiresAt 파싱·rotate·v1 자동 전환 1회+고지
- [ ] T5 설정 화면·안내 — 만료 D-N·새 열쇠 받기(저장본 유지)·재붙여넣기 안내·D-14/D-3/만료 안내 1회성
- [ ] T6 편승 문구 — MCP 용어·PRIVACY·GLOSSARY·README (+R5-a 삭제 문구 구분)
- [ ] T7 마감 — 버전 4값+serverInfo 0.4.7 · changelog · 스토어 델타 · qa-047 · 런북 0.4.7
- [ ] DoD: 확장+worker 테스트 green(신규 포함) + tsc + build + mission check 0 + goal 7 게이트 + BOM 0 + critic 웨이브 3회 BLOCKER·MAJOR 0
- [ ] 사람: 시크릿 등록(OBJECT_KEY_SECRET=현재 서명 비밀·TOKEN_KID=0) → worker 배포 → 실서버 스모크 → tag `v0.4.7` → 일괄 제출
