---
paths: ["docs/**", "prompts/**", "README.md", "goals/**"]
---

# 문서·프롬프트·goal 작업 규칙

- 한 뜻 한 단어: 캡처(캡쳐·스냅·스크린샷 ✗) · 핀 메모(주석·어노테이션 ✗, 코드 식별자는 유지) · 그리기 도구(주석 도구 ✗) · 컨텍스트 팩(Context Pack·프롬프트 팩 ✗) · 내 AI에 저장(업로드·공유 ✗). SoT = `docs/GLOSSARY.md`(0.4.6 T4에서 생성, 그 전엔 `docs/PRD-0.4.6.md` D1 표).
- 기록 위치: ADR=`docs/adr/NNN-*.md`(YAML id/date/tags) · 세션 로그=`docs/log/YYYY-MM-DD-작업명.md` · 트러블슈팅=`docs/troubleshooting/` · 스키마/타입 변경=`docs/changelog.md` · 배운 것=`docs/til.md` · 범용 패턴=`docs/patterns/PAT-NNN-*.md`(기존 최대 003).
- 계획서·보고서는 사장 보고 형식(전역 규칙): 목적 → 범위·리스크 → 투입 AI → 단계표 → 합격 기준 → 결재 사항. 파일 경로·명령·식별자는 "기술 부록"으로 분리. 개발 은어 금지, 한 문서 한 어휘.
- `docs/state/*`는 과거 스냅샷이다 — 현재값(브랜치·dirty·PR·Orca 상태)은 git·vhk·orca로 재측정한 뒤 쓴다.
- 정책값(보관 기간·경로 상태 등)을 바꾸면 같은 스코프의 사용자 노출 문서(`docs/PRIVACY.md`·스토어 카피·README)를 같은 커밋에서 현행화한다(적대검증 반복 지적: stale 문자열).
- ADR을 이연·수정할 때는 "결정" 절과 "결과" 절을 함께 고쳐 한 문서 안 시점 상충을 없앤다.
