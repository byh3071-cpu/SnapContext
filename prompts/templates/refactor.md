---
id: prompt-template-refactor
date: 2026-08-29
tags: [prompt, template]
---

# 🔧 리팩토링 요청
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
핀 메모 부분의 개선안을 코드로 제안해주세요
{{#if context.userNote}}
## 추가 메모
{{context.userNote}}
{{/if}}
[첨부: 캡처 이미지]
