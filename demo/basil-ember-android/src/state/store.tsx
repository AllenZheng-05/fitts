import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { getItem, type SizeId, type ToppingId } from '../data/menu'
import { deleteOrder } from '../lib/api'
import { ASAP } from '../lib/pickup'
import { lineKey, totals, unitPrice, type CartLine } from '../lib/pricing'

export type OrderStatus = 'received' | 'oven' | 'ready'

export interface Order {
  id: string
  orderNo: string
  name: string
  phone: string
  pickup: string
  pickupTime?: string
  status: OrderStatus
  lines: CartLine[]
  subtotal: number
  tax: number
  total: number
}

export interface CheckoutInput {
  name: string
  phone: string
  pickup: string
}

interface Store {
  lines: CartLine[]
  count: number
  addItem: (itemId: string, size: SizeId, toppings: ToppingId[], qty: number) => void
  setQty: (key: string, qty: number) => void
  removeLine: (key: string) => void
  orders: Order[]
  getOrder: (id: string) => Order | undefined
  placeOrder: (input: CheckoutInput) => Order
  cancelOrder: (id: string) => Promise<void>
  favorites: string[]
  toggleFavorite: (itemId: string) => void
}

const StoreContext = createContext<Store | null>(null)

const OVEN_AFTER_MS = 8000
const READY_AFTER_MS = 24000

export function StoreProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [favorites, setFavorites] = useState<string[]>([])
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>[]>>(new Map())
  const seq = useRef(1040)

  useEffect(() => {
    const map = timers.current
    return () => map.forEach((list) => list.forEach(clearTimeout))
  }, [])

  const addItem = useCallback((itemId: string, size: SizeId, toppings: ToppingId[], qty: number) => {
    const item = getItem(itemId)
    if (!item) return
    const key = lineKey(itemId, size, toppings)
    const unit = unitPrice(item.price, item.category, size, toppings)
    setLines((prev) => {
      const found = prev.find((l) => l.key === key)
      if (found) return prev.map((l) => (l.key === key ? { ...l, qty: l.qty + qty } : l))
      return [...prev, { key, itemId, name: item.name, size, toppings, qty, unit }]
    })
  }, [])

  const setQty = useCallback((key: string, qty: number) => {
    setLines((prev) => (qty <= 0 ? prev.filter((l) => l.key !== key) : prev.map((l) => (l.key === key ? { ...l, qty } : l))))
  }, [])

  const removeLine = useCallback((key: string) => setLines((prev) => prev.filter((l) => l.key !== key)), [])

  const advance = useCallback((id: string, status: OrderStatus) => {
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)))
  }, [])

  const placeOrder = useCallback(
    (input: CheckoutInput): Order => {
      const t = totals(lines)
      seq.current += 1
      const id = `o${seq.current}`
      const order: Order = {
        id,
        orderNo: `BE-${seq.current}`,
        name: input.name.trim(),
        phone: input.phone.trim(),
        pickup: input.pickup,
        pickupTime: input.pickup === ASAP ? undefined : input.pickup,
        status: 'received',
        lines,
        subtotal: t.subtotal,
        tax: t.tax,
        total: t.total,
      }
      setOrders((prev) => [order, ...prev])
      setLines([])
      timers.current.set(id, [
        setTimeout(() => advance(id, 'oven'), OVEN_AFTER_MS),
        setTimeout(() => advance(id, 'ready'), READY_AFTER_MS),
      ])
      return order
    },
    [lines, advance],
  )

  const cancelOrder = useCallback(async (id: string) => {
    await deleteOrder(id)
    timers.current.get(id)?.forEach(clearTimeout)
    timers.current.delete(id)
    setOrders((prev) => prev.filter((o) => o.id !== id))
  }, [])

  const toggleFavorite = useCallback((itemId: string) => {
    setFavorites((prev) => (prev.includes(itemId) ? prev.filter((x) => x !== itemId) : [...prev, itemId]))
  }, [])

  const value = useMemo<Store>(
    () => ({
      lines,
      count: totals(lines).count,
      addItem,
      setQty,
      removeLine,
      orders,
      getOrder: (id) => orders.find((o) => o.id === id),
      placeOrder,
      cancelOrder,
      favorites,
      toggleFavorite,
    }),
    [lines, orders, favorites, addItem, setQty, removeLine, placeOrder, cancelOrder, toggleFavorite],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): Store {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside StoreProvider')
  return ctx
}
