---
id: glossary
date: 2026-08-29
tags: [terminology, ux, v0.4.6]
status: sot
---

# 용어 사전 (Glossary)

한 뜻엔 한 단어. UI 문자열·README·docs가 이 표를 따른다. 코드 식별자(annotation·upload 등)는 바꾸지 않는다.

## 확정 용어

| 개념 | 확정 용어 | 금지(혼용 중) |
|---|---|---|
| 화면을 찍은 것 | 캡처 | 캡쳐·스냅·스크린샷 |
| 핀+메모 | 핀 메모 | 주석·어노테이션(코드 내부 식별자는 유지) |
| 화살표·형광펜·가리기·자유선 | 그리기 도구 | 주석 도구·annotation |
| AI에게 줄 묶음 | 컨텍스트 팩 | Context Pack·프롬프트 팩 |
| 서버 저장 행위 | 내 AI에 저장 | 업로드·공유 |

## 핀 의도 라벨

| 라벨 | 용도 | 툴팁 |
|---|---|---|
| 버그 | 예상과 다르게 동작하는 이슈 | 예상과 다르게 동작해요 |
| 참고 | 맥락·개선 참고용 | — |

→ "메모"는 핀 메모와 충돌하므로 라벨로 쓰지 않는다.

## 적용 범위

- 확장 UI 문자열 · README · docs 전체
- **worker/MCP instructions 문구는 0.4.7에 편승**(0.4.6은 ext-only)

## 예외 규칙

코드 식별자·CSS 클래스·API 필드명(`annotations`, `upload` 등)·과거 세션 로그의 직접 인용문은 유지한다. 새로 쓰는 문장은 예외 없음.

## 검사 명령

```bash
grep -rnE "캡쳐|스냅샷|스크린샷|업로드됨|프롬프트 팩|Context Pack" src prompts docs README.md
```

→ 목표 0건(W3에서 게이트 편입).

## 출처

- [국립국어원 외래어 표기법](https://www.korean.go.kr/front/page/pageView.do?page_id=P000104&mn_id=97)
- [Marker.io Issue Types](https://help.marker.io/en/articles/10680532-issue-types)
- [Jared Spool — Do users change their settings?](https://archive.uie.com/brainsparks/2011/09/14/do-users-change-their-settings/)
