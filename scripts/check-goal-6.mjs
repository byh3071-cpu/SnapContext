#!/usr/bin/env node
// scripts/check-goal-6.mjs — 자동 생성 (vhk goal sync).
// 기본 게이트 = typecheck + (lint) + test + build. goal 고유 검증은 아래 구역에 추가.
// sync 재실행해도 기존 파일은 덮어쓰지 않습니다 (idempotent).
//
// Env: VHK_GATES_SKIP_DEEP=1  → test + build 스킵 (빠른 typecheck-only 패스)

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SHIM = new Set(['pnpm', 'npm', 'npx', 'yarn'])
// cmd.exe /c 래핑 경로는 따옴표+&|<>^% 조합 인자로 인용 경계를 탈출당할 수 있다(CVE-2024-27980
// 과 같은 근본원인 클래스, src/lib/exec.ts 실증) — 위험 문자 있으면 거부(fail-closed).
const CMD_SHELL_METACHARS = /[&|<>^%"\r\n]/
function run(cmd, args) {
  let bin = cmd, argv = args
  if (process.platform === 'win32' && SHIM.has(cmd)) {
    const bad = args.find((a) => CMD_SHELL_METACHARS.test(a))
    if (bad !== undefined) {
      console.log('안전하지 않은 인자 거부 — cmd.exe 특수문자 포함: ' + JSON.stringify(bad))
      return false
    }
    // Windows: .cmd shim 직접 spawn 은 Node CVE-2024-27980 으로 EINVAL → cmd.exe 래핑.
    bin = 'cmd.exe'; argv = ['/d', '/s', '/c', cmd + '.cmd', ...args]
  }
  try {
    // maxBuffer 상향: 큰 빌드/테스트 로그(>1MB)에서 성공해도 ENOBUFS 거짓실패 방지.
    execFileSync(bin, argv, { stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 })
    return true
  } catch (e) {
    const out = (e?.stdout?.toString() ?? '') + (e?.stderr?.toString() ?? '')
    if (out.trim()) console.log(out.split('\n').slice(-25).join('\n'))
    return false
  }
}

if (existsSync('.vhk/HARD_STOP')) {
  console.log('🛑 .vhk/HARD_STOP detected — refusing to run goal 6 gate.')
  process.exit(1)
}

// BOM-safe 읽기: PowerShell Set-Content -Encoding utf8 의 UTF-8 BOM 제거(없으면 throw).
const readJson = (p) => { const t = readFileSync(p, 'utf-8'); return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t) }
const pkg = existsSync('package.json') ? readJson('package.json') : {}
const scripts = pkg.scripts ?? {}
const pm = existsSync('pnpm-lock.yaml') ? 'pnpm' : existsSync('yarn.lock') ? 'yarn' : 'npm'
const skipDeep = process.env.VHK_GATES_SKIP_DEEP === '1'
let pass = true
const gate = (label, ok) => { console.log('[goal 6] ' + label + ': ' + (ok ? '✓' : '✗')); if (!ok) pass = false }
const must = (cond, label) => { console.log((cond ? '    ✓ ' : '    ✗ ') + label); if (!cond) pass = false }

// typecheck (스크립트 우선, 없으면 tsc --noEmit)
if (scripts.typecheck) gate('typecheck', run(pm, ['run', 'typecheck']))
else if (existsSync('tsconfig.json')) gate('tsc --noEmit', run(pm, pm === 'npm' ? ['exec', '--', 'tsc', '--noEmit'] : ['exec', 'tsc', '--noEmit']))
if (scripts.lint) gate('lint', run(pm, ['run', 'lint']))
if (!skipDeep) {
  if (scripts['test:run']) gate('test', run(pm, ['run', 'test:run']))
  else if (scripts.test && /vitest/.test(scripts.test)) gate('test', run(pm, ['run', 'test', '--', '--run']))
  else if (scripts.test) gate('test', run(pm, ['run', 'test']))
  if (scripts.build) gate('build', run(pm, ['run', 'build']))
}

// ─── goal 6 고유 검증 (T4b · W3-fix) ────────────────────────────
const walkFiles = (dir, pred) => {
  const out = []
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walkFiles(p, pred))
    else if (pred(p)) out.push(p)
  }
  return out
}

// 문자 단위 파서: 코드 / ' / " / ` / // / /* */. 이스케이프·템플릿 ${} 중첩 처리.
// 문자열 리터럴만 모은다(식별자·주석은 자연 제외).
const extractStringLiterals = (src) => {
  const out = []
  const n = src.length
  const parseQuoted = (start, quote) => {
    let i = start + 1
    let buf = ''
    while (i < n) {
      const c = src[i]
      if (c === '\\') {
        buf += c + (src[i + 1] ?? '')
        i += 2
        continue
      }
      if (c === quote) return [buf, i + 1]
      buf += c
      i++
    }
    return [buf, i]
  }
  const parseCode = (start, untilBrace) => {
    let i = start
    while (i < n) {
      const c = src[i]
      const next = src[i + 1]
      if (untilBrace && c === '}') return i
      if (c === '/' && next === '/') {
        i += 2
        while (i < n && src[i] !== '\n') i++
        continue
      }
      if (c === '/' && next === '*') {
        i += 2
        while (i < n - 1 && !(src[i] === '*' && src[i + 1] === '/')) i++
        i = Math.min(i + 2, n)
        continue
      }
      if (c === "'" || c === '"') {
        const [str, end] = parseQuoted(i, c)
        out.push(str)
        i = end
        continue
      }
      if (c === '`') {
        i = parseTemplate(i)
        continue
      }
      if (untilBrace && c === '{') {
        i = parseCode(i + 1, true)
        if (src[i] === '}') i++
        continue
      }
      i++
    }
    return i
  }
  const parseTemplate = (start) => {
    let i = start + 1
    let buf = ''
    while (i < n) {
      const c = src[i]
      if (c === '\\') {
        buf += c + (src[i + 1] ?? '')
        i += 2
        continue
      }
      if (c === '`') {
        out.push(buf)
        return i + 1
      }
      if (c === '$' && src[i + 1] === '{') {
        out.push(buf)
        buf = ''
        i = parseCode(i + 2, true)
        if (src[i] === '}') i++
        continue
      }
      buf += c
      i++
    }
    out.push(buf)
    return i
  }
  parseCode(0, false)
  return out
}

const SRC_UI_FORBIDDEN = /캡쳐|스냅샷|스크린샷|주석|어노테이션|업로드|공유|프롬프트 팩|Context Pack/
const DOCS_FORBIDDEN = /캡쳐|스냅샷|프롬프트 팩/
const SRC_EXT = /\.(?:ts|tsx|js)$/

const srcHits = []
for (const p of walkFiles('src', (f) => SRC_EXT.test(f))) {
  const strings = extractStringLiterals(readFileSync(p, 'utf-8'))
  if (strings.some((s) => SRC_UI_FORBIDDEN.test(s))) srcHits.push(p.replace(/\\/g, '/'))
}
must(srcHits.length === 0, `src 문자열 리터럴 금지어 0건 (현재 ${srcHits.length}건: ${srcHits.slice(0, 3).join(', ')})`)

const uiHits = []
for (const p of [...walkFiles('prompts', (f) => f.endsWith('.md')), 'README.md', 'scripts/generate-store-screenshots.mjs'].filter(existsSync)) { // 스토어 이미지 카피도 사용자 노출 문구
  const rel = p.replace(/\\/g, '/')
  const text = readFileSync(p, 'utf-8')
  // .mjs(스토어 생성기)는 코드 주석이 아니라 사용자 노출 문자열 리터럴만 본다(src 와 같은 기준)
  const hit = /\.mjs$/.test(rel) ? extractStringLiterals(text).some((t) => SRC_UI_FORBIDDEN.test(t)) : SRC_UI_FORBIDDEN.test(text)
  if (hit) uiHits.push(rel)
}
must(uiHits.length === 0, `prompts·README 금지어 0건 (현재 ${uiHits.length}건: ${uiHits.slice(0, 3).join(', ')})`)

const docsExcluded = (rel) =>
  rel === 'docs/GLOSSARY.md' ||
  rel === 'docs/PRD-0.4.6.md' ||
  rel === 'docs/로드맵.md' ||
  rel.includes('docs/dogfood/') ||
  rel.includes('docs/patterns/') || // PAT 문서는 증상으로 금지어를 인용한다(PAT-004)
  rel.includes('docs/tickets/') ||
  rel.includes('docs/store/archive/') || // 과거 스토어 문구·제출 킷은 기록(옛 기능 서술) — 현행 킷은 검사 대상
  rel.includes('docs/ui-audit/')

const docsHits = []
for (const p of walkFiles('docs', (f) => f.endsWith('.md'))) {
  const rel = p.replace(/\\/g, '/')
  if (docsExcluded(rel)) continue
  if (DOCS_FORBIDDEN.test(readFileSync(p, 'utf-8'))) docsHits.push(rel)
}
must(docsHits.length === 0, `docs 캡쳐|스냅샷|프롬프트 팩 0건 (현재 ${docsHits.length}건: ${docsHits.slice(0, 5).join(', ')})`)

must(existsSync('docs/GLOSSARY.md'), 'docs/GLOSSARY.md 존재')

const readGoalVersion = () => {
  const p = 'goals/6-046-ux-polish.md'
  if (!existsSync(p)) {
    must(false, 'goals/6-046-ux-polish.md 없음 — 버전 비교 불가')
    return null
  }
  const text = readFileSync(p, 'utf-8')
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!fm) {
    must(false, 'goals/6-046-ux-polish.md frontmatter 없음 — 버전 비교 불가')
    return null
  }
  const line = fm[1].match(/^version:\s*(\S+)/m)
  if (!line) {
    must(false, 'goals/6-046-ux-polish.md version 필드 없음 — 버전 비교 불가')
    return null
  }
  return line[1].replace(/^v/i, '')
}

const goalVer = readGoalVersion()
const manifestVer = existsSync('manifest.json') ? readJson('manifest.json').version : null
const lock = existsSync('package-lock.json') ? readJson('package-lock.json') : null
const lockTop = lock?.version ?? null
const lockPkg = lock?.packages?.['']?.version ?? null
must(
  goalVer !== null &&
    pkg.version === goalVer &&
    manifestVer === goalVer &&
    lockTop === goalVer &&
    lockPkg === goalVer,
  `버전 4값 ${goalVer ?? '(없음)'} (package=${pkg.version}, manifest=${manifestVer}, lock.top=${lockTop}, lock.packages[""]=${lockPkg})`
)

if (pass) { console.log('✅ goal 6 gate passes'); process.exit(0) }
console.log('❌ goal 6 gate failed'); process.exit(1)
