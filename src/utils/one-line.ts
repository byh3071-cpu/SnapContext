export function assertOneLine(text: string): void {
  if (text.includes('\n') || text.includes('\r')) {
    throw new Error('안내 문구는 한 줄이어야 합니다.')
  }
  if (text.length > 80) {
    throw new Error('안내 문구는 80자를 넘을 수 없습니다.')
  }
}
