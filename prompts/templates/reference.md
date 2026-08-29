---
id: prompt-template-reference
date: 2026-08-29
tags: [prompt, template]
---

# 📐 레퍼런스 참고 구현
- URL: {{source.url}}
- 페이지: {{source.title}}
{{#if pins}}
## 핀 메모
{{#if lite}}
{{#each pins}}
- **핀 {{id}}**{{tag}}: {{memo}}
{{/each}}
{{/if}}
{{#if debug}}
{{#each pins}}
- **핀 {{id}}**{{tag}} ({{x}}%, {{y}}%): {{memo}}
{{/each}}
{{/if}}
{{/if}}
## 요청
핀 메모 부분의 구조를 분석하고 우리 프로젝트에 맞게 구현해주세요
{{#if context.userNote}}
## 추가 메모
{{context.userNote}}
{{/if}}
{{#if debug}}
## 환경
- 뷰포트: {{source.viewport.width}}×{{source.viewport.height}} · UA: {{source.userAgent}} · 캡처 방식: {{source.captureType}}
{{/if}}
[첨부: 캡처 이미지]
