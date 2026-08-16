---
id: research-vendor-logo-policy
date: 2026-08-17
tags: [brand, trademark, store-policy, research, ui]
---

# AI 벤더 로고 UI 사용 정책 조사 — 드롭다운 아이콘 도입 판단 재료 (2026-08-17)

> 발단: "사용할 AI 도구" 드롭다운(Claude Code·Cursor·Codex)에 벤더 아이콘 표시 검토. 용도는 순수 식별(제휴·보증 암시 없음), 확장 자체 아이콘·스토어 리스팅에는 미사용.

## 결론 한 줄

**OpenAI = 조건부 허용 · Cursor = 정책 공백(사실상 OK) · Anthropic만 문면상 사전 서면 승인 필수.** 스토어(Chrome·웨일)는 포괄 IP 조항뿐, 순수 UI 식별용 리젝 공개 사례 없음.

## 벤더별 판정

| 벤더 | 정책 | UI 식별 사용 | 조건·리스크 |
|---|---|---|---|
| Anthropic (Claude) | Trademark Guidelines 有 | **원칙 불허** — 사전 승인 자료에서만 허용, 지명적 사용 예외 조항 없음 | 승인 요청 = marketing@anthropic.com. 셀프서브 배지 프로그램 없음 |
| Cursor (Anysphere) | cursor.com/brand — 자산 ZIP 배포 + 네이밍 규칙만 | **명시 정책 없음** | [추론] 자산 공개 배포로 식별 사용 상정으로 보이나 명문 라이선스 없음. 문제 시 통지→교체 수준 |
| OpenAI (Codex) | Brand Guidelines(제3자 대상) 有 | **조건부 허용** — 가이드 준수가 곧 비독점·철회가능 허가 | 원형 유지·자사 마크보다 작게·보증 암시 금지. Codex 전용 조항 없음(일반 Marks 규정) |

## 스토어 판정

- Chrome·웨일 둘 다 "상표 등 IP 침해 금지" 포괄 조항만 — UI 내부 식별 사용을 콕 집은 기준 없음. 확인된 리젝 사례는 전부 이름·아이콘·리스팅 **사칭**형.
- [추론] 스토어 스크린샷에 드롭다운(로고)이 찍히면 리스팅 자산에 타사 로고가 들어가는 셈 — 방어용으로 설명란에 "각사 상표이며 본 확장은 각사와 무관" 한 줄 권장(요구 조항은 아님).

## 선례

- lobe-icons(`@lobehub/icons`, MIT): AI 로고 1,100종+ 배포, Claude·OpenAI·Cursor 전부 포함, 모델 셀렉터 실사용 광범위. 단 MIT는 저작권 라이선스일 뿐 **상표권을 부여하지 않음** — 관행=허가 아님, 벤더 묵인 상태.

## 실행 옵션 (요한 결정)

- **A. 혼합(권고)**: Codex·Cursor = 공식 로고(각 가이드 준수) + Claude = 자체 제작 아이콘 → 문면 100% 준수, 승인 대기 없음
- **B. 승인 메일**: Anthropic에 승인 요청 후 3종 공식 로고 → 제일 깔끔하나 회신 대기·불확실
- **C. 관행 추종**: 3종 공식 로고(lobe-icons 관행) → 실리스크 낮으나 Anthropic 문면 위반 상태 감수

## 출처

- https://www.anthropic.com/legal/trademark-guidelines
- https://support.claude.com/en/articles/13145338-anthropic-software-directory-terms
- https://cursor.com/brand · https://cursor.com/marketplace-publisher-terms
- https://openai.com/brand
- https://developer.chrome.com/docs/webstore/program-policies/impersonation-and-intellectual-property
- https://whale.dev/review_guides/
- https://github.com/lobehub/lobe-icons
