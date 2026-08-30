---
id: prompt-template-bug-report
date: 2026-08-29
tags: [prompt, template]
---

# 🐛 버그 리포트
- URL: {{source.url}}
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
핀 메모의 문제 원인과 수정안을 제안해주세요
{{#if context.userNote}}
## 추가 메모
{{context.userNote}}
{{/if}}
{{#if debug}}
## 환경
- 뷰포트: {{source.viewport.width}}×{{source.viewport.height}} · UA: {{source.userAgent}} · 캡처 방식: {{source.captureType}}
{{/if}}
[첨부: 캡처 이미지]
