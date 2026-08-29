import type { CaptureHistoryItem } from './history'

export type SaveStatus = 'saved' | 'failed'

export type SaveResult =
  | { status: 'saved'; id: string; expiresAt: string }
  | { status: 'failed'; message: string }

export function applySaveResult(
  item: CaptureHistoryItem,
  r: SaveResult
): CaptureHistoryItem {
  if (r.status === 'saved') {
    const next: CaptureHistoryItem = {
      ...item,
      saveStatus: 'saved',
      savedCaptureId: r.id
    }
    delete next.saveError
    return next
  }

  return {
    ...item,
    saveStatus: 'failed',
    saveError: r.message
  }
}

export function saveBadgeLabel(
  item: CaptureHistoryItem
): '저장됨' | '실패' | null {
  if (item.saveStatus === 'saved') return '저장됨'
  if (item.saveStatus === 'failed') return '실패'
  return null
}
