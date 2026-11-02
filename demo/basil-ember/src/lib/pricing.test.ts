import { describe, expect, it } from 'vitest'
import { lineKey, totals, unitPrice, type CartLine } from './pricing'

describe('unitPrice', () => {
  it('applies size delta and topping prices', () => {
    expect(unitPrice(14, 'medium', [])).toBe(14)
    expect(unitPrice(14, 'large', [])).toBe(19)
    expect(unitPrice(14, 'small', ['pepperoni'])).toBe(15)
    expect(unitPrice(12, 'medium', ['burrata', 'basil'])).toBe(17)
  })

  it('never goes below zero', () => {
    expect(unitPrice(1, 'small', [])).toBe(0)
  })
})

describe('lineKey', () => {
  it('treats the same build as the same line regardless of topping order', () => {
    expect(lineKey('margherita', 'large', ['basil', 'pepperoni'])).toBe(lineKey('margherita', 'large', ['pepperoni', 'basil']))
  })

  it('separates different sizes and notes', () => {
    expect(lineKey('margherita', 'small', [])).not.toBe(lineKey('margherita', 'large', []))
    expect(lineKey('margherita', 'large', [], 'well done')).not.toBe(lineKey('margherita', 'large', []))
  })
})

describe('totals', () => {
  it('sums subtotal, 8.5% tax, total, and item count', () => {
    const lines: CartLine[] = [
      { key: 'a', itemId: 'margherita', name: 'Margherita', size: 'medium', toppings: [], qty: 2, unit: 14 },
      { key: 'b', itemId: 'lemonade', name: 'Basil Lemonade', size: 'medium', toppings: [], qty: 1, unit: 5 },
    ]
    const t = totals(lines)
    expect(t.subtotal).toBe(33)
    expect(t.tax).toBeCloseTo(2.805)
    expect(t.total).toBeCloseTo(35.805)
    expect(t.count).toBe(3)
  })

  it('handles an empty cart', () => {
    expect(totals([])).toEqual({ subtotal: 0, tax: 0, total: 0, count: 0 })
  })
})
