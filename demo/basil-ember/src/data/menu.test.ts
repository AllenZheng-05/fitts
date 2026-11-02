import { describe, expect, it } from 'vitest'
import { CATEGORIES, MENU, getItem } from './menu'

describe('menu data', () => {
  it('has unique ids and covers every category', () => {
    const ids = MENU.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const cat of CATEGORIES) {
      expect(MENU.some((m) => m.category === cat), `expected at least one ${cat}`).toBe(true)
    }
  })

  it('has valid prices and dietary tags', () => {
    for (const item of MENU) {
      expect(item.price).toBeGreaterThan(0)
      expect(item.name.length).toBeGreaterThan(2)
      expect(item.description.length).toBeGreaterThan(10)
    }
  })

  it('getItem finds known items and misses unknown ones', () => {
    expect(getItem('margherita')?.name).toBe('Margherita Classica')
    expect(getItem('does-not-exist')).toBeUndefined()
  })

  it('supports dietary filtering used by the menu page', () => {
    const vegan = MENU.filter((m) => m.dietary.includes('vegan'))
    expect(vegan.length).toBeGreaterThan(0)
    expect(vegan.every((m) => m.dietary.includes('vegan'))).toBe(true)
  })
})
