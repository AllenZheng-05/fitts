import { SIZES, TOPPINGS, type Category, type SizeId, type ToppingId } from '../data/menu'

export const TAX_RATE = 0.085

export function sizeDelta(size: SizeId): number {
  return SIZES.find((s) => s.id === size)?.delta ?? 0
}

export function unitPrice(base: number, category: Category, size: SizeId, toppings: ToppingId[]): number {
  if (category !== 'Pizzas') return base
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
}

export function lineKey(itemId: string, size: SizeId, toppings: ToppingId[]): string {
  return `${itemId}|${size}|${[...toppings].sort().join(',')}`
}

export function totals(lines: CartLine[]) {
  const subtotal = lines.reduce((s, l) => s + l.unit * l.qty, 0)
  const tax = subtotal * TAX_RATE
  return { subtotal, tax, total: subtotal + tax, count: lines.reduce((s, l) => s + l.qty, 0) }
}

export const fmt = (n: number) => `$${n.toFixed(2)}`

export function describeLine(line: CartLine): string {
  const parts: string[] = []
  const size = SIZES.find((s) => s.id === line.size)
  if (size && size.delta !== 0) parts.push(size.label)
  for (const t of line.toppings) {
    const topping = TOPPINGS.find((x) => x.id === t)
    if (topping) parts.push(`+ ${topping.label}`)
  }
  return parts.join(' · ')
}
