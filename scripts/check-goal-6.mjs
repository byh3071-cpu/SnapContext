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

// ─── goal 6 고유 검증 (T4b) ─────────────────────────────────────
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
const stripTsComments = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => {
      const i = line.indexOf('//')
      return i >= 0 ? line.slice(0, i) : line
    })
    .join('\n')
const SRC_STRING_FORBIDDEN = /'[^']*(?:주석|어노테이션|업로드|공유|스냅샷|스크린샷)[^']*'/
const UI_README_FORBIDDEN = /캡쳐|스냅샷|스크린샷|주석|Context Pack|프롬프트 팩/
const DOCS_TYPO = /캡쳐/

const srcHits = []
for (const p of walkFiles('src', (f) => f.endsWith('.ts'))) {
  const body = stripTsComments(readFileSync(p, 'utf-8'))
  if (SRC_STRING_FORBIDDEN.test(body)) srcHits.push(p)
}
must(srcHits.length === 0, `src 문자열 리터럴 금지어 0건 (현재 ${srcHits.length}건: ${srcHits.slice(0, 3).join(', ')})`)

const uiHits = []
for (const p of [...walkFiles('prompts', (f) => f.endsWith('.md')), 'README.md'].filter(existsSync)) {
  if (UI_README_FORBIDDEN.test(readFileSync(p, 'utf-8'))) uiHits.push(p)
}
must(uiHits.length === 0, `prompts·README 금지어 0건 (현재 ${uiHits.length}건: ${uiHits.slice(0, 3).join(', ')})`)

const docsTypoHits = []
for (const p of walkFiles('docs', (f) => f.endsWith('.md'))) {
  const rel = p.replace(/\\/g, '/')
  if (rel.includes('docs/dogfood/') || rel.includes('docs/tickets/') || rel === 'docs/GLOSSARY.md') continue
  if (DOCS_TYPO.test(readFileSync(p, 'utf-8'))) docsTypoHits.push(rel)
}
must(docsTypoHits.length === 0, `docs 캡쳐 0건 (현재 ${docsTypoHits.length}건: ${docsTypoHits.slice(0, 3).join(', ')})`)

must(existsSync('docs/GLOSSARY.md'), 'docs/GLOSSARY.md 존재')

const manifestVer = existsSync('manifest.json') ? readJson('manifest.json').version : null
must(manifestVer === pkg.version && pkg.version === '0.4.6', `버전 4값 0.4.6 (package=${pkg.version}, manifest=${manifestVer})`)

if (pass) { console.log('✅ goal 6 gate passes'); process.exit(0) }
console.log('❌ goal 6 gate failed'); process.exit(1)
