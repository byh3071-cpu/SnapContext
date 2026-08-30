# T4a — 용어 사전 문서 신설 + 컨텍스트 팩 명세 갱신

> 스펙 SoT: `docs/PRD-0.4.6.md` §T4 · 결정 D1. 계획: `goals/6-046-ux-polish-plan.md`. 문서만 — 코드 수정 없음.

## 목표

제품 용어를 한 뜻 한 단어로 고정하는 **SoT 문서 `docs/GLOSSARY.md`** 를 만들고, `docs/CONTEXT-PACK-SPEC.md`에 핀의 `kind` 필드를 기재한다. 전수 청소(다른 문서·UI 문자열)는 W3의 T4b가 한다 — 여기서는 두 파일만.

## 허용 파일

| 파일 | 할 일 |
|---|---|
| `docs/GLOSSARY.md` (신규) | 아래 구조 |
| `docs/CONTEXT-PACK-SPEC.md` | ① `### pins` 표에 `kind` 행 추가: `'bug' \| 'ref'`, optional, 없으면 `ref`, 0.4.6 도입 · ② 이 파일 안의 "캡쳐"(6곳)를 "캡처"로 · ③ 문서 상단 frontmatter가 있으면 `date`만 오늘로 |

## GLOSSARY.md 구조 (이 순서대로)

1. frontmatter: `id: glossary` · `date: 2026-08-29` · `tags: [terminology, ux, v0.4.6]` · `status: sot`
2. 한 줄 목적: "한 뜻엔 한 단어. UI 문자열·README·docs가 이 표를 따른다. 코드 식별자(annotation·upload 등)는 바꾸지 않는다."
3. 확정 용어 표(PRD-0.4.6 D1 그대로):

| 개념 | 확정 용어 | 금지(혼용 중) |
|---|---|---|
| 화면을 찍은 것 | 캡처 | 캡쳐·스냅·스크린샷 |
| 핀+메모 | 핀 메모 | 주석·어노테이션(코드 내부 식별자는 유지) |
| 화살표·형광펜·가리기·자유선 | 그리기 도구 | 주석 도구·annotation |
| AI에게 줄 묶음 | 컨텍스트 팩 | Context Pack·프롬프트 팩 |
| 서버 저장 행위 | 내 AI에 저장 | 업로드·공유 |

4. 핀 의도 라벨(결정 D2): "버그 / 참고" — 툴팁 "예상과 다르게 동작해요". "메모"는 핀 메모와 충돌하므로 라벨로 쓰지 않는다.
5. 적용 범위: 확장 UI 문자열 · README · docs 전체. **worker/MCP instructions 문구는 0.4.7에 편승**(0.4.6은 ext-only).
6. 예외 규칙: 코드 식별자·CSS 클래스·API 필드명(`annotations`, `upload` 등)·과거 세션 로그의 직접 인용문은 유지. 새로 쓰는 문장은 예외 없음.
7. 검사 명령(문서 안에 그대로): `grep -rnE "캡쳐|스냅샷|스크린샷|업로드됨|프롬프트 팩|Context Pack" src prompts docs README.md` → 목표 0건(W3에서 게이트 편입).
8. 출처 3개(PRD-0.4.6 D1·D2 표의 링크 그대로): 국립국어원 외래어 표기법 · Marker.io Issue Types · Jared Spool 설정 변경 연구.

## 금지

- `src/**`·`prompts/**`·`worker/**`·README·changelog·다른 docs 수정 금지(T4b 담당).
- 표의 용어·금지어를 임의로 바꾸거나 추가하지 않는다(결정 D1 고정). 문장 톤: 반말 두괄식, 표 우선.
- master 커밋·머지·push 금지. `git add -A` 금지.

## 완료 조건

- 두 파일 변경만(`git status --short`로 증명). `pnpm test`·`pnpm build`는 문서 변경이라 필수 아님 — 대신 검사 명령을 `docs/CONTEXT-PACK-SPEC.md`에 한정해 돌려 "캡쳐" 0건 증명.
- 브랜치 `046-t4a-glossary`에 커밋. 메시지 예: `docs(0.4.6): T4a 용어 사전 GLOSSARY.md 신설 + 컨텍스트 팩 명세 kind 필드`.
- 보고 파일 `docs/tickets/0.4.6/T4a.report.md`(아래 형식)를 같은 브랜치에 커밋 + Orca 상태 메일 1통(지시문에 준 명령).

## 보고 형식

```text
[결과] 성공|실패|NOOP — 한 줄
[변경] 경로: 무엇을 (파일당 1줄)
[검증] 실행 명령 + 원문 수치
[테스트] 해당 없음(문서) — 대신 grep 결과 원문
[스코프 밖 발견] 손대지 않은 것 (없으면 "없음")
[가정·미해결]
[다음] 지휘자 결정이 필요한 것 1개 이하
```
