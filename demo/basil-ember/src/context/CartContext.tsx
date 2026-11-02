import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { lineKey, type CartLine } from '../lib/pricing'
import type { SizeId, ToppingId } from '../data/menu'

interface AddInput { itemId: string; name: string; size: SizeId; toppings: ToppingId[]; qty: number; unit: number; note?: string }
interface CartCtx {
  lines: CartLine[]
  add: (input: AddInput) => void
  setQty: (key: string, qty: number) => void
  remove: (key: string) => void
  clear: () => void
}

const Ctx = createContext<CartCtx | null>(null)
const STORAGE_KEY = 'basil-ember-cart'

function load(): CartLine[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as CartLine[]) : []
  } catch { return [] }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(load)

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(lines)) } catch { /* storage unavailable */ }
  }, [lines])

  const add = useCallback((input: AddInput) => {
    const key = lineKey(input.itemId, input.size, input.toppings, input.note)
    setLines((prev) => {
      const existing = prev.find((l) => l.key === key)
      if (existing) return prev.map((l) => (l.key === key ? { ...l, qty: l.qty + input.qty } : l))
      return [...prev, { key, ...input }]
    })
  }, [])

  const setQty = useCallback((key: string, qty: number) => {
    setLines((prev) => (qty <= 0 ? prev.filter((l) => l.key !== key) : prev.map((l) => (l.key === key ? { ...l, qty } : l))))
  }, [])

  const remove = useCallback((key: string) => setLines((prev) => prev.filter((l) => l.key !== key)), [])
  const clear = useCallback(() => setLines([]), [])

  const value = useMemo(() => ({ lines, add, setQty, remove, clear }), [lines, add, setQty, remove, clear])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useCart() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useCart must be used within CartProvider')
  return ctx
}
