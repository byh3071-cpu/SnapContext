import type { ContextPack, PinItem } from '../types'

export type PinKind = NonNullable<PinItem['kind']>

export function pinKind(pin: PinItem): PinKind {
  return pin.kind === 'bug' ? 'bug' : 'ref'
}

export function hasBugPin(pins: ReadonlyArray<PinItem>): boolean {
  return pins.some((p) => pinKind(p) === 'bug')
}

export function toggleKind(k: PinKind): PinKind {
  return k === 'bug' ? 'ref' : 'bug'
}

export function restorePinsFromPack(pack: ContextPack): PinItem[] {
  return pack.annotations.map((a) => ({
    id: a.id,
    x: a.position.x,
    y: a.position.y,
    memo: a.memo ?? '',
    kind: a.kind
  }))
}
