import { EXPIRY_DAYS_ALLOWLIST, isExpiryDays } from '../../utils/upload'
import {
  formatExpiryDays,
  loadShareExpiryDays,
  saveShareExpiryDays
} from '../../utils/share-expiry'
import { maskToken, regenerateUserToken } from '../../utils/token'
import { swissIcon } from '../utils/swiss-icons'

interface ShortcutEntry {
  readonly label: string
  readonly value: string
  readonly isKey: boolean
}

const SHORTCUTS: readonly ShortcutEntry[] = [
  { label: '화면 캡처', value: 'Alt+Shift+V', isKey: true },
  { label: '요소 캡처', value: 'Alt+Shift+E', isKey: true },
  { label: '문서 캡처', value: 'Alt+Shift+M', isKey: true },
  { label: '전체 캡처', value: 'Alt+Shift+G', isKey: true },
  { label: 'PNG 복사', value: '버튼에서 실행', isKey: false },
  { label: 'PNG 저장', value: '버튼에서 실행', isKey: false }
]

export type ShortcutsHelpDeps = {
  /** 토큰 재발급 성공 직후 호출 — ImageActions 의 토큰 상태 표시(§04)가 stale 로 남지
   * 않도록 App 이 이 콜백에서 갱신을 배선한다(컴포넌트 간 직접 참조 대신 콜백 주입 —
   * packRef.api 등 기존 관례와 동일). */
  onTokenRegenerated?: () => void
}

/** 자주 쓰는 AI 연결은 본문에 두고, 설정에는 단축키와 보관 기간만 둔다. */
export function mountShortcutsHelp(
  masthead: HTMLElement,
  trigger: HTMLButtonElement,
  deps: ShortcutsHelpDeps = {}
): void {
  const panel = document.createElement('div')
  panel.className = 'help-panel shortcuts-help'
  panel.id = 'help-panel'
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-label', '설정: 단축키와 보관 기간')
  panel.hidden = true

  const headRow = document.createElement('div')
  headRow.className = 'help-head'
  const title = document.createElement('span')
  title.className = 'help-title'
  title.textContent = '설정'
  const closeButton = document.createElement('button')
  closeButton.type = 'button'
  closeButton.className = 'help-close'
  closeButton.setAttribute('aria-label', '닫기')
  closeButton.append(swissIcon('x', 'ic-sm'))
  headRow.append(title, closeButton)

  const shortcutLabel = document.createElement('div')
  shortcutLabel.className = 'set-group-label'
  shortcutLabel.textContent = '단축키'
  const list = document.createElement('dl')
  list.className = 'help-list shortcuts-help__list'
  for (const shortcut of SHORTCUTS) {
    const row = document.createElement('div')
    row.className = 'help-row'
    const term = document.createElement('dt')
    term.textContent = shortcut.label
    const value = document.createElement('dd')
    if (shortcut.isKey) {
      const key = document.createElement('kbd')
      key.textContent = shortcut.value
      value.append(key)
    } else {
      value.className = 'muted'
      value.textContent = shortcut.value
    }
    row.append(term, value)
    list.append(row)
  }

  const shortcutNote = document.createElement('p')
  shortcutNote.className = 'help-note'
  shortcutNote.textContent =
    '다른 확장 프로그램과 단축키가 겹치면 브라우저의 확장 프로그램 단축키 설정에서 바꿔 주세요.'

  const retentionLabel = document.createElement('div')
  retentionLabel.className = 'set-group-label shortcuts-help__share-label'
  retentionLabel.textContent = '내 AI 저장'
  const retentionRow = document.createElement('div')
  retentionRow.className = 'help-row shortcuts-help__expiry-row'
  const label = document.createElement('label')
  label.className = 'lbl'
  label.htmlFor = 'share-expiry-days'
  label.textContent = '보관 기간'
  const select = document.createElement('select')
  select.id = 'share-expiry-days'
  select.className = 'shortcuts-help__expiry-select'
  for (const days of EXPIRY_DAYS_ALLOWLIST) {
    const option = document.createElement('option')
    option.value = String(days)
    option.textContent = formatExpiryDays(days)
    select.append(option)
  }
  retentionRow.append(label, select)
  const retentionNote = document.createElement('p')
  retentionNote.className = 'help-note shortcuts-help__expiry-note'
  retentionNote.textContent =
    '앞으로 내 AI에 저장할 캡처에 적용됩니다. 이미 저장한 캡처의 삭제일은 바뀌지 않습니다.'

  void (async () => {
    select.value = String(await loadShareExpiryDays())
  })()
  select.addEventListener('change', () => {
    void (async () => {
      const days = Number(select.value)
      if (!isExpiryDays(days)) {
        retentionNote.textContent = '보관 기간을 다시 선택해 주세요.'
        return
      }
      try {
        await saveShareExpiryDays(days)
        retentionNote.textContent = `${formatExpiryDays(days)} 보관으로 저장했습니다.`
      } catch (error) {
        console.warn('[settings] 보관 기간 저장 실패', error)
        retentionNote.textContent = '보관 기간을 저장하지 못했습니다.'
      }
    })()
  })

  // 연결 토큰 — ADR-020 Tier 1(재발급 lite). 완전 revoke(denylist)는 0.4.6 이연.
  const tokenLabel = document.createElement('div')
  tokenLabel.className = 'set-group-label shortcuts-help__token-label'
  tokenLabel.textContent = '연결 토큰'
  const tokenRow = document.createElement('div')
  tokenRow.className = 'help-row shortcuts-help__token-row'
  const tokenRegenButton = document.createElement('button')
  tokenRegenButton.type = 'button'
  tokenRegenButton.className = 'btn btn-ghost'
  tokenRegenButton.append(swissIcon('spinner', 'ic-sm'))
  const tokenRegenButtonText = document.createElement('span')
  tokenRegenButtonText.textContent = '토큰 재발급'
  tokenRegenButton.append(tokenRegenButtonText)
  tokenRow.append(tokenRegenButton)
  const tokenNote = document.createElement('p')
  tokenNote.className = 'help-note shortcuts-help__token-note'
  tokenNote.textContent =
    '이전 토큰은 기존 캡처가 만료될 때까지(최대 30일) 유효합니다.'
  const tokenStatus = document.createElement('p')
  tokenStatus.className = 'help-note shortcuts-help__token-status'
  tokenStatus.setAttribute('role', 'status')

  tokenRegenButton.addEventListener('click', () => {
    void (async () => {
      tokenRegenButton.disabled = true
      tokenStatus.textContent = '재발급하는 중…'
      try {
        const token = await regenerateUserToken()
        tokenStatus.textContent = `재발급 완료: ${maskToken(token)}`
        deps.onTokenRegenerated?.()
      } catch (error) {
        console.warn('[settings] 토큰 재발급 실패', error)
        tokenStatus.textContent = '토큰 재발급에 실패했습니다. 다시 시도해 주세요.'
      } finally {
        tokenRegenButton.disabled = false
      }
    })()
  })

  panel.append(
    headRow,
    shortcutLabel,
    list,
    shortcutNote,
    retentionLabel,
    retentionRow,
    retentionNote,
    tokenLabel,
    tokenRow,
    tokenNote,
    tokenStatus
  )
  masthead.append(panel)

  const setOpen = (open: boolean): void => {
    panel.hidden = !open
    trigger.setAttribute('aria-expanded', open ? 'true' : 'false')
  }
  trigger.addEventListener('click', (event) => {
    event.stopPropagation()
    setOpen(panel.hidden)
  })
  closeButton.addEventListener('click', () => {
    setOpen(false)
    trigger.focus()
  })
  document.addEventListener('click', (event) => {
    const target = event.target
    if (
      !panel.hidden &&
      target instanceof Node &&
      !panel.contains(target) &&
      !trigger.contains(target)
    ) {
      setOpen(false)
    }
  })
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) {
      setOpen(false)
      trigger.focus()
    }
  })
}
