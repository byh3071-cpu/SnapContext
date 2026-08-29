export const COPY_NEXT_ACTION =
  'AI 대화창에 붙여넣고 이미지를 함께 첨부하세요.'

export function assertOneLine(msg: string): void {
  if (msg.includes('\n') || msg.includes('\r') || msg.length > 80) {
    throw new Error('안내 문구는 줄바꿈 없이 80자 이하여야 한다.')
  }
}

assertOneLine(COPY_NEXT_ACTION)
