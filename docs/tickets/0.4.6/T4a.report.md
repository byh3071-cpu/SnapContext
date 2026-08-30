[결과] 성공 — T4a 용어 사전 SoT 신설 및 CONTEXT-PACK-SPEC pins.kind 명세 반영 완료
[변경] docs/GLOSSARY.md: PRD D1/D2 기반 확정 용어·핀 라벨·검사 명령·출처 3건 SoT 문서 신설
[변경] docs/CONTEXT-PACK-SPEC.md: pins 표에 kind('bug'|'ref', optional, 기본 ref) 추가, "캡쳐" 6건→"캡처" 통일
[검증] rg "캡쳐" docs/CONTEXT-PACK-SPEC.md → 0건 (변경 전 6건)
[검증] rg "캡쳐|스냅샷|스크린샷|업로드됨|프롬프트 팩|Context Pack" docs/CONTEXT-PACK-SPEC.md → "캡쳐" 0건; 잔여 4건은 제목 "Context Pack"(1)·예시 본문 "스크린샷"(2)·"Context Pack은"(1) — T4a 범위 밖(캡쳐만 대상)
[테스트] 해당 없음(문서) — test-first: 변경 전 CONTEXT-PACK-SPEC.md "캡쳐" 6건 확인 후 0건 달성
[스코프 밖 발견] docs 전역 "캡쳐" 잔존 다수(T4b 담당), CONTEXT-PACK-SPEC 예시의 "스크린샷"/"Context Pack" 문자열, src/prompts/README 미수정
[가정·미해결] CONTEXT-PACK-SPEC 상단 frontmatter 없음 → date 갱신 항목 해당 없음
[다음] T4b에서 docs·UI 전수 청소 및 grep 게이트 0건 편입
