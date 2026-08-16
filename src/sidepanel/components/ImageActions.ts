import type {
  Annotation,
  PinItem,
  SharedContext,
  SharedContextMode,
  SharedContextV2
} from '../../types'
import {
  copyAnnotatedPngToClipboard,
  downloadAnnotatedPng,
  renderAnnotatedPngBlob
} from '../../utils/annotated-image'
import {
  MCP_CLIENTS,
  buildMcpSetup,
  type McpClient
} from '../../utils/mcp-onboarding'
import { toKoreanErrorMessage } from '../../utils/messaging'
import { saveCaptureWithToken } from '../../utils/share-upload'
import {
  DEFAULT_SHARE_EXPIRY_DAYS,
  SHARE_EXPIRY_CHANGED_EVENT,
  buildPrivateSaveConsentMessage,
  buildPrivateSaveSuccessMessage,
  formatExpiryDays,
  loadShareExpiryDays,
  needsShareConsent,
  readConsentedDays
} from '../../utils/share-expiry'
import {
  ensureUserToken,
  getStoredToken,
  isValidTokenFormat,
  maskToken,
  setUserToken
} from '../../utils/token'
import {
  deletePrivateCapture,
  listPrivateCaptures,
  type ExpiryDays
} from '../../utils/upload'
import { getStorageItem, setStorageItem } from '../../storage'
import { showConfirm } from '../confirm-dialog'
import { swissIcon, type SwissIconName } from '../utils/swiss-icons'
import { mkSecHead } from '../utils/section'

const PRIVATE_CONSENT_KEY = 'snapcontext.privateUploadConsent'

export interface ImageActionsApi {
  sync: () => void
  copyPng: () => Promise<void>
}

const MODE_OPTIONS: ReadonlyArray<{
  value: SharedContextMode
  label: string
}> = [
  { value: 'context', label: '그대로 전달' },
  { value: 'bug-report', label: '문제 해결' },
  { value: 'refactor', label: '화면 개선' },
  { value: 'reference', label: '참고해서 만들기' }
]

const CLIENT_LABELS: Record<McpClient, string> = {
  'claude-code': 'Claude Code',
  cursor: 'Cursor',
  codex: 'Codex'
}

function createButton(label: string, icon: SwissIconName): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'btn btn-ghost context-pack-panel__btn'
  const iconWrap = document.createElement('span')
  iconWrap.className = 'context-pack-panel__icon'
  iconWrap.setAttribute('aria-hidden', 'true')
  iconWrap.append(swissIcon(icon))
  const text = document.createElement('span')
  text.textContent = label
  button.append(iconWrap, text)
  return button
}

function buildContextV2(
  context: SharedContext,
  intent: string,
  mode: SharedContextMode
): SharedContextV2 {
  return {
    v: 2,
    sourceUrl: context.sourceUrl,
    sourceTitle: context.sourceTitle,
    captureType: context.captureType,
    capturedAt: context.capturedAt,
    viewport: context.viewport,
    pins: context.pins,
    intent,
    mode
  }
}

export function mountImageActions(
  pngHost: HTMLElement,
  relayHost: HTMLElement,
  deps: {
    hasCapture: () => boolean
    getImage: () => string | null
    getPins: () => PinItem[]
    getAnnotations: () => Annotation[]
    getContext: () => SharedContext | null
    showToast: (message: string, kind?: 'info' | 'error') => void
  }
): ImageActionsApi {
  pngHost.classList.add('image-actions')
  const exportRow = document.createElement('div')
  exportRow.className = 'duo image-actions__row'
  const copyButton = createButton('PNG 복사', 'copy')
  const downloadButton = createButton('PNG 저장', 'download')
  exportRow.append(copyButton, downloadButton)
  const directGuide = document.createElement('p')
  directGuide.className = 'help-note image-actions__direct-guide'
  directGuide.textContent =
    'AI 채팅에 직접 보내기: 1. PNG 복사 → 2. AI 채팅에 붙여넣기 → 3. 원하는 일을 입력하세요.'
  pngHost.append(exportRow, directGuide)

  let expiryDays: ExpiryDays = DEFAULT_SHARE_EXPIRY_DAYS
  const { head, asideEl } = mkSecHead({
    num: '04',
    eyebrow: '내 AI 연결',
    title: '캡처를 내 AI로 보내기',
    titleId: 'sec-share-title',
    asideText: formatExpiryDays(expiryDays)
  })

  const connection = document.createElement('div')
  connection.className = 'publish-block ai-relay__connection'
  const connectionTitle = document.createElement('h3')
  connectionTitle.className = 'tt-title'
  connectionTitle.textContent = '1. AI 도구 연결'
  const connectionNote = document.createElement('p')
  connectionNote.className = 'help-note'
  connectionNote.textContent =
    '토큰은 공개 링크가 아니라 내 캡처를 찾는 연결 열쇠입니다. 화면에는 일부만 표시됩니다.'

  const tokenRow = document.createElement('div')
  tokenRow.className = 'help-row ai-relay__token-row'
  const tokenStatus = document.createElement('code')
  tokenStatus.className = 'ai-relay__token-status'
  tokenStatus.textContent = '아직 연결 토큰 없음'
  const tokenCopyButton = createButton('연결 토큰 복사', 'copy')
  tokenRow.append(tokenStatus, tokenCopyButton)

  const pasteRow = document.createElement('div')
  pasteRow.className = 'ai-relay__paste-row'
  const pasteInput = document.createElement('input')
  pasteInput.type = 'password'
  pasteInput.className = 'field'
  pasteInput.placeholder = '다른 기기의 sc_ 토큰 붙여넣기'
  pasteInput.autocomplete = 'off'
  pasteInput.spellcheck = false
  pasteInput.setAttribute('aria-label', '다른 기기의 연결 토큰')
  const pasteButton = createButton('기존 토큰 사용', 'check')
  pasteRow.append(pasteInput, pasteButton)

  const clientLabel = document.createElement('label')
  clientLabel.className = 'lbl'
  clientLabel.htmlFor = 'ai-relay-client'
  clientLabel.textContent = '사용할 AI 도구'
  const clientSelect = document.createElement('select')
  clientSelect.id = 'ai-relay-client'
  clientSelect.className = 'field'
  for (const client of MCP_CLIENTS) {
    const option = document.createElement('option')
    option.value = client
    option.textContent = CLIENT_LABELS[client]
    clientSelect.append(option)
  }
  const setupText = document.createElement('pre')
  setupText.className = 'ai-relay__setup'
  const setupCopyButton = createButton('연결 안내 복사', 'copy')

  const endpoint: string | undefined = import.meta.env.VITE_UPLOAD_ENDPOINT
  const renderSetup = (): void => {
    const client = MCP_CLIENTS.find((value) => value === clientSelect.value)
    if (!client || !endpoint) {
      setupText.textContent = '연결 서버가 설정되지 않았습니다.'
      setupCopyButton.disabled = true
      return
    }
    setupText.textContent = buildMcpSetup(client, endpoint)
    setupCopyButton.disabled = false
  }
  renderSetup()

  connection.append(
    connectionTitle,
    connectionNote,
    tokenRow,
    pasteRow,
    clientLabel,
    clientSelect,
    setupText,
    setupCopyButton
  )

  const saveBlock = document.createElement('div')
  saveBlock.className = 'publish-block ai-relay__save'
  const saveTitle = document.createElement('h3')
  saveTitle.className = 'tt-title'
  saveTitle.textContent = '2. 이 캡처 저장'
  const disclosure = document.createElement('p')
  disclosure.className = 'help-note'
  disclosure.textContent =
    '이미지·페이지 주소·핀 메모가 서버에 저장되고 연결한 AI 도구가 불러옵니다. 공개 링크는 만들지 않습니다.'

  const modeLabel = document.createElement('label')
  modeLabel.className = 'lbl'
  modeLabel.htmlFor = 'ai-relay-mode'
  modeLabel.textContent = 'AI가 할 일'
  const modeSelect = document.createElement('select')
  modeSelect.id = 'ai-relay-mode'
  modeSelect.className = 'field'
  for (const entry of MODE_OPTIONS) {
    const option = document.createElement('option')
    option.value = entry.value
    option.textContent = entry.label
    modeSelect.append(option)
  }

  const intentLabel = document.createElement('label')
  intentLabel.className = 'lbl'
  intentLabel.htmlFor = 'ai-relay-intent'
  intentLabel.textContent = 'AI에게 원하는 것 (선택)'
  const intentInput = document.createElement('textarea')
  intentInput.id = 'ai-relay-intent'
  intentInput.className = 'field ai-relay__intent'
  intentInput.maxLength = 2000
  intentInput.rows = 3
  intentInput.placeholder = '예: 핀 1의 버튼이 작동하지 않는 이유를 찾아줘'

  const saveButton = document.createElement('button')
  saveButton.type = 'button'
  saveButton.className = 'btn-publish'
  saveButton.append(swissIcon('share'))
  const saveButtonText = document.createElement('span')
  saveButtonText.textContent = '내 AI에 저장'
  saveButton.append(saveButtonText)

  saveBlock.append(
    saveTitle,
    disclosure,
    modeLabel,
    modeSelect,
    intentLabel,
    intentInput,
    saveButton
  )

  const manageBlock = document.createElement('div')
  manageBlock.className = 'publish-block ai-relay__manage'
  const manageTitle = document.createElement('h3')
  manageTitle.className = 'tt-title'
  manageTitle.textContent = '3. 서버에 저장된 캡처'
  const refreshButton = createButton('목록 새로고침', 'spinner')
  const savedList = document.createElement('div')
  savedList.className = 'ai-relay__saved-list'
  savedList.textContent = '연결 토큰이 있으면 내 저장 목록을 볼 수 있습니다.'
  manageBlock.append(manageTitle, refreshButton, savedList)

  relayHost.append(head, connection, saveBlock, manageBlock)

  const refreshTokenStatus = async (): Promise<void> => {
    const token = await getStoredToken()
    tokenStatus.textContent = token ? maskToken(token) : '아직 연결 토큰 없음'
  }
  void refreshTokenStatus()

  const refreshSavedCaptures = async (): Promise<void> => {
    const token = await getStoredToken()
    if (!token) {
      savedList.textContent = '연결 토큰이 있으면 내 저장 목록을 볼 수 있습니다.'
      return
    }

    refreshButton.disabled = true
    savedList.textContent = '목록을 불러오는 중…'
    try {
      const captures = await listPrivateCaptures(token)
      savedList.replaceChildren()
      if (captures.length === 0) {
        savedList.textContent = '서버에 저장된 캡처가 없습니다.'
        return
      }
      for (const capture of captures) {
        const row = document.createElement('div')
        row.className = 'ai-relay__saved-row'
        const summary = document.createElement('div')
        summary.className = 'ai-relay__saved-summary'
        const title = document.createElement('strong')
        title.textContent = capture.title || '(제목 없음)'
        const meta = document.createElement('span')
        meta.className = 'muted'
        const createdAt = new Date(capture.createdAt)
        meta.textContent = `${Number.isFinite(createdAt.getTime()) ? createdAt.toLocaleString('ko-KR') : capture.createdAt} · 핀 ${capture.pinCount}개`
        summary.append(title, meta)
        const deleteButton = createButton('즉시 삭제', 'trash')
        deleteButton.addEventListener('click', () => {
          void (async () => {
            const approved = await showConfirm(
              '서버에 저장된 이미지와 컨텍스트를 지금 삭제할까요? 이 작업은 되돌릴 수 없습니다.'
            )
            if (!approved) return
            try {
              await deletePrivateCapture(token, capture.id)
              deps.showToast('서버 저장본을 삭제했습니다.', 'info')
              await refreshSavedCaptures()
            } catch (error) {
              deps.showToast(toKoreanErrorMessage(error), 'error')
            }
          })()
        })
        row.append(summary, deleteButton)
        savedList.append(row)
      }
    } catch (error) {
      console.warn('[ai-relay] 저장 목록 조회 실패', error)
      savedList.textContent = '저장 목록을 불러오지 못했습니다.'
    } finally {
      refreshButton.disabled = false
    }
  }
  void refreshSavedCaptures()
  refreshButton.addEventListener('click', () => {
    void refreshSavedCaptures()
  })

  const copyText = async (text: string, success: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text)
      deps.showToast(success, 'info')
    } catch (error) {
      console.warn('[ai-relay] 클립보드 복사 실패', error)
      deps.showToast('복사하지 못했습니다. 직접 선택해 복사해 주세요.', 'error')
    }
  }

  tokenCopyButton.addEventListener('click', () => {
    void (async () => {
      const token = await ensureUserToken()
      if (!token) {
        deps.showToast('연결 토큰을 발급하지 못했습니다. 다시 시도해 주세요.', 'error')
        return
      }
      tokenStatus.textContent = maskToken(token)
      await copyText(token, '연결 토큰을 복사했습니다.')
    })()
  })

  pasteButton.addEventListener('click', () => {
    void (async () => {
      const token = pasteInput.value.trim()
      if (!isValidTokenFormat(token)) {
        deps.showToast('토큰 형식이 올바르지 않습니다.', 'error')
        return
      }
      if (!(await setUserToken(token))) {
        deps.showToast('토큰을 저장하지 못했습니다.', 'error')
        return
      }
      pasteInput.value = ''
      tokenStatus.textContent = maskToken(token)
      deps.showToast('기존 토큰을 연결했습니다.', 'info')
    })()
  })

  clientSelect.addEventListener('change', renderSetup)
  setupCopyButton.addEventListener('click', () => {
    void copyText(setupText.textContent ?? '', '연결 안내를 복사했습니다.')
  })

  const copyPng = async (): Promise<void> => {
    const image = deps.getImage()
    if (!image) {
      deps.showToast('먼저 화면을 캡처해 주세요.', 'error')
      return
    }
    try {
      await copyAnnotatedPngToClipboard(image, deps.getPins(), deps.getAnnotations())
      deps.showToast('이미지를 클립보드에 복사했습니다.', 'info')
    } catch (error) {
      deps.showToast(toKoreanErrorMessage(error), 'error')
    }
  }

  copyButton.addEventListener('click', () => {
    void copyPng()
  })
  downloadButton.addEventListener('click', () => {
    void (async () => {
      const image = deps.getImage()
      if (!image) {
        deps.showToast('먼저 화면을 캡처해 주세요.', 'error')
        return
      }
      try {
        await downloadAnnotatedPng(
          image,
          deps.getPins(),
          `snapcontext_${Date.now()}.png`,
          deps.getAnnotations()
        )
        deps.showToast('PNG 저장을 시작했습니다.', 'info')
      } catch (error) {
        deps.showToast(toKoreanErrorMessage(error), 'error')
      }
    })()
  })

  let saving = false
  saveButton.addEventListener('click', () => {
    void (async () => {
      if (saving) return
      const image = deps.getImage()
      const context = deps.getContext()
      const mode = MODE_OPTIONS.find((entry) => entry.value === modeSelect.value)
        ?.value
      if (!image || !context || !mode) {
        deps.showToast('먼저 화면을 캡처해 주세요.', 'error')
        return
      }

      const days = expiryDays
      try {
        const consentedDays = readConsentedDays(
          await getStorageItem<unknown>(PRIVATE_CONSENT_KEY)
        )
        if (needsShareConsent(consentedDays, days)) {
          const approved = await showConfirm(buildPrivateSaveConsentMessage(days))
          if (!approved) return
          await setStorageItem(PRIVATE_CONSENT_KEY, days)
        }

        saving = true
        saveButton.disabled = true
        saveButtonText.textContent = '저장 중…'
        const blob = await renderAnnotatedPngBlob(image, deps.getPins(), deps.getAnnotations())
        const contextV2 = buildContextV2(
          context,
          intentInput.value.trim(),
          mode
        )
        await saveCaptureWithToken(blob, contextV2, days)
        await refreshTokenStatus()
        await refreshSavedCaptures()
        deps.showToast(buildPrivateSaveSuccessMessage(days), 'info')
      } catch (error) {
        deps.showToast(toKoreanErrorMessage(error), 'error')
      } finally {
        saving = false
        saveButton.disabled = !deps.hasCapture()
        saveButtonText.textContent = '내 AI에 저장'
      }
    })()
  })

  const reloadExpiry = async (): Promise<void> => {
    expiryDays = await loadShareExpiryDays()
    asideEl.textContent = formatExpiryDays(expiryDays)
  }
  void reloadExpiry()
  window.addEventListener(SHARE_EXPIRY_CHANGED_EVENT, () => {
    void reloadExpiry()
  })

  const sync = (): void => {
    const hasCapture = deps.hasCapture()
    pngHost.hidden = !hasCapture
    relayHost.hidden = false
    copyButton.disabled = !hasCapture
    downloadButton.disabled = !hasCapture
    saveButton.disabled = !hasCapture
  }
  sync()

  return { sync, copyPng }
}
