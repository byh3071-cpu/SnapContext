/**
 * 가리기(redact) 박스를 픽셀 버퍼에 직접 구워 넣는 순수 함수 (ADR-021).
 *
 * DOM·Canvas 의존이 0 이라 node 환경(vitest)에서 Uint8ClampedArray 를 직접 만들어
 * 완전 검증할 수 있다. 호출측(annotated-image.ts)이 ctx.getImageData 로 뽑아온
 * ImageData.data 를 여기 그대로 넘기고, putImageData 로 되돌려 bake 한다.
 *
 * 모자이크·블러가 아니라 상수 색으로 픽셀을 치환하는 이유는 ADR-021 참고 —
 * 픽셀레이션·블러는 Depix/Unredacter 류 도구로 복원되지만 솔리드 채움은 원본 정보가
 * 아예 남지 않는다.
 */
export function applyRedactBoxes(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  boxes: ReadonlyArray<{ x: number; y: number; w: number; h: number }>,
  color: readonly [number, number, number]
): void {
  const [r, g, b] = color

  for (const box of boxes) {
    if (box.w <= 0 || box.h <= 0) continue

    // 경계 밖으로 나가는 박스는 이미지 범위로 클램프한다.
    const x0 = Math.max(0, Math.floor(box.x))
    const y0 = Math.max(0, Math.floor(box.y))
    const x1 = Math.min(width, Math.ceil(box.x + box.w))
    const y1 = Math.min(height, Math.ceil(box.y + box.h))

    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const idx = (y * width + x) * 4
        data[idx] = r
        data[idx + 1] = g
        data[idx + 2] = b
        data[idx + 3] = 255
      }
    }
  }
}
