import { SIZES, TOPPINGS, type SizeId, type ToppingId } from '../data/menu'

export function sizeDelta(size: SizeId): number {
  return SIZES.find((s) => s.id === size)?.delta ?? 0
}

export function unitPrice(base: number, size: SizeId, toppings: ToppingId[]): number {
  const extras = toppings.reduce((sum, t) => sum + (TOPPINGS.find((x) => x.id === t)?.price ?? 0), 0)
  return Math.max(0, base + sizeDelta(size) + extras)
}

export interface CartLine {
  key: string
  itemId: string
  name: string
  size: SizeId
  toppings: ToppingId[]
  qty: number
  unit: number
  note?: string
}

export function lineKey(itemId: string, size: SizeId, toppings: ToppingId[], note = ''): string {
  return `${itemId}|${size}|${[...toppings].sort().join(',')}|${note.trim()}`
}

export function totals(lines: CartLine[]) {
  const subtotal = lines.reduce((s, l) => s + l.unit * l.qty, 0)
  const tax = subtotal * 0.085
  return { subtotal, tax, total: subtotal + tax, count: lines.reduce((s, l) => s + l.qty, 0) }
}

export const fmt = (n: number) => `$${n.toFixed(2)}`
