import { describe, expect, it } from 'vitest'

import {
  generateContextPack,
  type GenerateContextPackInput
} from '../src/context-pack/generator'
import { buildTemplatePrompt } from '../src/context-pack/prompt-builder'
import { renderTemplate } from '../src/context-pack/template-engine'

const baseInput = (): GenerateContextPackInput => ({
  imageBase64: 'data:image/png;base64,AAAA',
  captureType: 'visible',
  pins: [],
  sourceUrl: 'https://example.com/page',
  sourceTitle: 'Example',
  viewport: { width: 1280, height: 720 },
  userAgent: 'Chrome Test',
  imageWidth: 240,
  imageHeight: 120
})

describe('context pack', () => {
  it('generateContextPack is lightweight (no image, no legacy prompt)', () => {
    const pack = generateContextPack(baseInput())
    const raw = JSON.stringify(pack)

    expect(raw.length).toBeLessThan(2048)
    expect(raw).not.toContain('AAAA')
    expect(raw).not.toContain('imageBase64')
    expect(pack.version).toBe('0.2')
    expect(pack.capture.viewport).toBe('1280x720')
    expect(pack.capture.imageSize).toBe('240x120')
    expect(pack.source.url).toContain('example.com')
    expect(pack.mode).toBe('context')
    expect(pack.debugLogs).toEqual([])
    expect(pack.prompt).toBeUndefined()
  })
})

describe('renderTemplate nested blocks', () => {
  it('renders {{#each}} inside {{#if}} inside {{#if}}', () => {
    const md = renderTemplate(
      '{{#if pins}}\n## 핀 메모\n{{#if lite}}{{#each pins}}- {{memo}}{{/each}}{{/if}}\n{{#if debug}}DEBUG{{/if}}\n{{/if}}\n',
      { pins: [{ memo: 'hello' }], lite: true, debug: false }
    )
    expect(md).toContain('## 핀 메모')
    expect(md).toContain('- hello')
    expect(md).not.toContain('DEBUG')
    expect(md).not.toContain('{{')
  })
})

describe('buildTemplatePrompt', () => {
  it('includes UA, viewport, and pin coords when bug template has a bug pin', () => {
    const pack = generateContextPack({
      ...baseInput(),
      pins: [{ id: 1, x: 10.25, y: 20.5, memo: 'button is broken', kind: 'bug' }]
    })
    const md = buildTemplatePrompt(pack, 'bug', { userAgent: 'Test UA' })

    expect(md).toContain('# 🐛 버그 리포트')
    expect(md).toContain('https://example.com/page')
    expect(md).toContain('1280×720')
    expect(md).toContain('Test UA')
    expect(md).toContain('button is broken')
    expect(md).toContain('10.3%')
    expect(md).toContain('20.5%')
    expect(md).toContain('캡처 방식')
    expect(md).toContain('## 환경')
    expect(md).toContain('[버그]')
    expect(md).not.toContain('## 추가 메모')
  })

  it('omits UA, viewport, and coords when bug template has only ref pins', () => {
    const pack = generateContextPack({
      ...baseInput(),
      pins: [{ id: 1, x: 10.25, y: 20.5, memo: 'look here' }]
    })
    const md = buildTemplatePrompt(pack, 'bug', { userAgent: 'Test UA' })

    expect(md).toContain('## 핀 메모')
    expect(md).toContain('look here')
    expect(md).not.toContain('Test UA')
    expect(md).not.toContain('1280×720')
    expect(md).not.toContain('10.3%')
    expect(md).not.toContain('20.5%')
    expect(md).not.toContain('## 환경')
    expect(md).not.toContain('캡처 방식')
    expect(md).not.toContain('[버그]')
  })

  it('omits UA and viewport on refactor/reference even with a bug pin', () => {
    const pack = generateContextPack({
      ...baseInput(),
      pins: [{ id: 1, x: 10.25, y: 20.5, memo: 'improve this', kind: 'bug' }]
    })
    for (const template of ['refactor', 'reference'] as const) {
      const md = buildTemplatePrompt(pack, template, { userAgent: 'Test UA' })
      expect(md, `template=${template}`).toContain('improve this')
      expect(md, `template=${template}`).not.toContain('Test UA')
      expect(md, `template=${template}`).not.toContain('1280×720')
      expect(md, `template=${template}`).not.toContain('## 환경')
    }
  })

  it('places the pin memo section before the request section', () => {
    const pack = generateContextPack({
      ...baseInput(),
      pins: [{ id: 1, x: 10, y: 20, memo: 'click target', kind: 'bug' }]
    })
    const md = buildTemplatePrompt(pack, 'bug', { userAgent: 'Test UA' })
    const pinIdx = md.indexOf('## 핀 메모')
    const reqIdx = md.indexOf('## 요청')
    expect(pinIdx).toBeGreaterThan(-1)
    expect(reqIdx).toBeGreaterThan(-1)
    expect(pinIdx).toBeLessThan(reqIdx)
  })

  it('has no 4-item numbered instructions and no forbidden glossary terms', () => {
    const pack = generateContextPack({
      ...baseInput(),
      pins: [{ id: 1, x: 10, y: 20, memo: 'note', kind: 'bug' }]
    })
    for (const template of ['bug', 'refactor', 'reference'] as const) {
      const md = buildTemplatePrompt(pack, template, { userAgent: 'Test UA' })
      expect(md, `template=${template}`).not.toMatch(/\n1\. /)
      expect(md, `template=${template}`).not.toMatch(/\n2\. /)
      expect(md, `template=${template}`).not.toMatch(/\n3\. /)
      expect(md, `template=${template}`).not.toMatch(/\n4\. /)
      expect(md, `template=${template}`).not.toContain('핀 주석')
      expect(md, `template=${template}`).not.toContain('캡쳐')
      expect(md, `template=${template}`).not.toContain('스크린샷')
    }
  })

  it('emits the userNote section only when userNote is set', () => {
    const pack = generateContextPack(baseInput())

    const without = buildTemplatePrompt(pack, 'refactor')
    expect(without).toContain('# 🔧 리팩토링 요청')
    expect(without).not.toContain('## 추가 메모')

    const withNote = buildTemplatePrompt(pack, 'refactor', {
      userNote: '성능 개선 부탁'
    })
    expect(withNote).toContain('## 추가 메모')
    expect(withNote).toContain('성능 개선 부탁')
  })

  it('renders the reference template with title and falls back when no pins', () => {
    const pack = generateContextPack(baseInput())
    const md = buildTemplatePrompt(pack, 'reference')

    expect(md).toContain('# 📐 레퍼런스 참고 구현')
    expect(md).toContain('Example')
    expect(md).not.toMatch(/^- \*\*핀 \d/m)
    expect(md).not.toContain('## 핀 메모')
  })

  it('omits the pin section header for all 3 templates when no pins', () => {
    const pack = generateContextPack(baseInput())
    for (const template of ['bug', 'refactor', 'reference'] as const) {
      const md = buildTemplatePrompt(pack, template)
      expect(md, `template=${template}`).not.toContain('## 핀 메모')
    }
  })

  it('shows the pin section header when pins are present', () => {
    const pack = generateContextPack({
      ...baseInput(),
      pins: [{ id: 1, x: 10, y: 20, memo: 'click target' }]
    })
    const md = buildTemplatePrompt(pack, 'bug')
    expect(md).toContain('## 핀 메모')
    expect(md).toContain('click target')
  })

  it('substitutes "(메모 없음)" for blank pin memos', () => {
    const pack = generateContextPack({
      ...baseInput(),
      pins: [{ id: 1, x: 0, y: 0, memo: '' }]
    })
    const md = buildTemplatePrompt(pack, 'bug')

    expect(md).toContain('(메모 없음)')
  })
})
