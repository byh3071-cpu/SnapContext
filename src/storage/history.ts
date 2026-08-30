import type { CaptureType, ContextPack } from '../types'
import { applySaveResult, type SaveResult, type SaveStatus } from './save-status'

export const CAPTURE_HISTORY_STORAGE_KEY = 'captureHistory'
export const MAX_CAPTURE_HISTORY_ITEMS = 20
export const MAX_STORED_IMAGE_DATA_BYTES = 900_000
export const MAX_CAPTURE_HISTORY_STORAGE_BYTES = 4_000_000
export const THUMBNAIL_WIDTH = 200

export type CaptureHistoryItem = {
  id: string
  timestamp: string
  url: string
  title: string
  captureType: CaptureType
  thumbnail: string
  imageBase64?: string
  pinsCount: number
  /**
   * 저장 시점에 주석(가리기·화살표·형광펜·자유선)이 하나라도 있었는지 — 주석 자체는
   * 저장하지 않는다(PRD-0.4.3 비목표: 세션-로컬). 히스토리 복원 시 "주석은 복원되지
   * 않는다" 고지를 항상 띄우는 대신, 실제로 주석이 있었던 캡처에만 조건부로 띄우기
   * 위한 최소 신호(pinsCount 와 같은 패턴).
   */
  hasAnnotations: boolean
  contextPack?: ContextPack
  saveStatus?: SaveStatus
  savedCaptureId?: string
  saveError?: string
}

export type SaveCaptureInput = Omit<CaptureHistoryItem, 'thumbnail'> & {
  thumbnail?: string
  imageBase64?: string
}

export type UpdateCaptureAnnotationsInput = {
  pinsCount: number
  hasAnnotations: boolean
  contextPack: ContextPack
}

type ChromeStorageShape = {
  storage?: {
    local?: {
      get: (key: string) => Promise<Record<string, unknown>>
      set: (items: Record<string, unknown>) => Promise<void>
      remove: (key: string) => Promise<void>
    }
  }
}

function hasChromeStorage(): boolean {
  const runtimeChrome = (globalThis as typeof globalThis & { chrome?: ChromeStorageShape })
    .chrome
  return Boolean(runtimeChrome?.storage?.local)
}

async function readItems(): Promise<CaptureHistoryItem[]> {
  if (!hasChromeStorage()) return []
  const result = await chrome.storage.local.get(CAPTURE_HISTORY_STORAGE_KEY)
  const value = result[CAPTURE_HISTORY_STORAGE_KEY]
  return Array.isArray(value) ? (value as CaptureHistoryItem[]) : []
}

async function writeItems(items: CaptureHistoryItem[]): Promise<void> {
  if (!hasChromeStorage()) return
  await chrome.storage.local.set({ [CAPTURE_HISTORY_STORAGE_KEY]: items })
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('snapcontext:history-updated'))
  }
}

function byNewestFirst(a: CaptureHistoryItem, b: CaptureHistoryItem): number {
  return Date.parse(b.timestamp) - Date.parse(a.timestamp)
}

function utf8ByteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length
}

function enforceStorageBudget(
  items: CaptureHistoryItem[]
): CaptureHistoryItem[] {
  let next = items.slice(0, MAX_CAPTURE_HISTORY_ITEMS)

  while (
    utf8ByteLength({ [CAPTURE_HISTORY_STORAGE_KEY]: next }) >
    MAX_CAPTURE_HISTORY_STORAGE_BYTES
  ) {
    const imageIndex = next
      .map((item, index) => ({ item, index }))
      .reverse()
      .find(({ item }) => Boolean(item.imageBase64))?.index

    if (imageIndex !== undefined) {
      next = next.map((item, index) =>
        index === imageIndex ? { ...item, imageBase64: undefined } : item
      )
      continue
    }

    if (next.length <= 1) break
    next = next.slice(0, -1)
  }

  return next
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Unable to load capture thumbnail'))
    image.src = dataUrl
  })
}

async function resizeThumbnail(dataUrl: string): Promise<string> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return ''

  const image = await loadImage(dataUrl)
  const sourceWidth = image.naturalWidth || image.width
  const sourceHeight = image.naturalHeight || image.height
  if (!sourceWidth || !sourceHeight) return ''

  const width = Math.min(THUMBNAIL_WIDTH, sourceWidth)
  const height = Math.max(1, Math.round((sourceHeight / sourceWidth) * width))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  ctx.drawImage(image, 0, 0, width, height)
  return canvas.toDataURL('image/jpeg', 0.72)
}

export async function saveCapture(input: SaveCaptureInput): Promise<void> {
  if (!hasChromeStorage()) return

  const thumbnail =
    input.thumbnail ?? (input.imageBase64 ? await resizeThumbnail(input.imageBase64) : '')
  const imageBase64 =
    input.imageBase64 &&
    utf8ByteLength(input.imageBase64) <= MAX_STORED_IMAGE_DATA_BYTES
      ? input.imageBase64
      : undefined

  const item: CaptureHistoryItem = {
    id: input.id,
    timestamp: input.timestamp,
    url: input.url,
    title: input.title,
    captureType: input.captureType,
    thumbnail,
    imageBase64,
    pinsCount: input.pinsCount,
    hasAnnotations: input.hasAnnotations,
    contextPack: input.contextPack
  }

  const existing = await readItems()
  const next = enforceStorageBudget(
    [item, ...existing.filter((entry) => entry.id !== item.id)].sort(
      byNewestFirst
    )
  )

  await writeItems(next)
}

export async function updateCaptureAnnotations(
  id: string,
  input: UpdateCaptureAnnotationsInput
): Promise<void> {
  if (!hasChromeStorage()) return

  const existing = await readItems()
  const next = enforceStorageBudget(
    existing
      .map((item) =>
        item.id === id
          ? {
              ...item,
              pinsCount: input.pinsCount,
              hasAnnotations: input.hasAnnotations,
              contextPack: input.contextPack
            }
          : item
      )
      .sort(byNewestFirst)
  )

  await writeItems(next)
}

export async function updateSaveStatus(
  id: string,
  r: SaveResult
): Promise<void> {
  if (!hasChromeStorage()) return

  const existing = await readItems()
  const next = enforceStorageBudget(
    existing
      .map((item) => (item.id === id ? applySaveResult(item, r) : item))
      .sort(byNewestFirst)
  )

  await writeItems(next)
}

export async function getHistory(): Promise<CaptureHistoryItem[]> {
  return (await readItems()).sort(byNewestFirst)
}

export async function deleteCapture(id: string): Promise<void> {
  const next = (await readItems()).filter((item) => item.id !== id)
  await writeItems(next)
}

export async function clearHistory(): Promise<void> {
  if (!hasChromeStorage()) return
  await chrome.storage.local.remove(CAPTURE_HISTORY_STORAGE_KEY)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('snapcontext:history-updated'))
  }
}
