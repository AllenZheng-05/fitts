import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { SIZES, TOPPINGS } from '../data/menu'
import { fmt, totals } from '../lib/pricing'
import { useCart } from '../context/CartContext'

const sizeLabel = (id: string) => SIZES.find((s) => s.id === id)?.label ?? id
const toppingLabel = (id: string) => TOPPINGS.find((t) => t.id === id)?.label ?? id

function pickupSlots(): string[] {
  const slots = ['As soon as possible (~15 min)']
  const now = new Date()
  now.setMinutes(now.getMinutes() + 30)
  now.setMinutes(Math.ceil(now.getMinutes() / 15) * 15, 0, 0)
  for (let i = 0; i < 8; i++) {
    slots.push(now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))
    now.setMinutes(now.getMinutes() + 15)
  }
  return slots
}

export interface OrderDraft {
  name: string
  phone: string
  pickupTime: string
  lines: { name: string; detail: string; qty: number; amount: number }[]
  subtotal: number
  tax: number
  total: number
  orderNo: string
}

export function CheckoutPage() {
  const { lines, clear } = useCart()
  const navigate = useNavigate()
  const t = totals(lines)
  const slots = useMemo(pickupSlots, [])
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [pickupTime, setPickupTime] = useState(slots[0])
  const [errors, setErrors] = useState<Record<string, string>>({})

  if (lines.length === 0) {
    return (
      <section className="section"><div className="wrap"><div className="empty">
        <h1 style={{ margin: '0 0 8px', fontSize: 32 }}>Nothing to check out yet</h1>
        <p style={{ color: 'var(--muted)', margin: '0 0 20px' }}>Add something delicious first, then come back here.</p>
        <Link className="btn btn-ember" to="/menu">Browse the menu</Link>
      </div></div></section>
    )
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (name.trim().length < 2) next.name = 'Please add the name for the order.'
    if (phone.replace(/\D/g, '').length < 7) next.phone = 'Please add a phone number we can reach at pickup.'
    if (!pickupTime) next.pickupTime = 'Choose a pickup time.'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    const order: OrderDraft = {
      name: name.trim(),
      phone: phone.trim(),
      pickupTime,
      lines: lines.map((l) => ({
        name: l.name,
        detail: [sizeLabel(l.size), ...l.toppings.map(toppingLabel), l.note].filter(Boolean).join(' · '),
        qty: l.qty,
        amount: l.unit * l.qty,
      })),
      subtotal: t.subtotal,
      tax: t.tax,
      total: t.total,
      orderNo: `BE-${Math.floor(1000 + Math.random() * 9000)}`,
    }
    sessionStorage.setItem('basil-ember-order', JSON.stringify(order))
    clear()
    navigate('/confirmation')
  }

  return (
    <section className="section" style={{ paddingTop: 48 }}>
      <div className="wrap">
        <h1 style={{ fontSize: 'clamp(34px,5vw,50px)', margin: '0 0 6px' }}>Pickup details</h1>
        <p style={{ color: 'var(--muted)', margin: '0 0 28px' }}>No payment online — you&apos;ll pay at the counter. We&apos;ll have everything hot and boxed.</p>
        <form onSubmit={submit} noValidate>
          <div className="two-col">
            <div className="panel">
              <h2 style={{ margin: '0 0 18px', fontSize: 22 }}>Who&apos;s picking up?</h2>
              <div className="field">
                <label htmlFor="co-name">Name for the order</label>
                <input id="co-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sam Rivera" />
                {errors.name && <span className="err">{errors.name}</span>}
              </div>
              <div className="field">
                <label htmlFor="co-phone">Phone</label>
                <input id="co-phone" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(513) 555-0100" />
                {errors.phone && <span className="err">{errors.phone}</span>}
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>We&apos;ll only use this if we need to reach you about your order.</span>
              </div>
              <div className="field">
                <label htmlFor="co-time">Pickup time</label>
                <select id="co-time" value={pickupTime} onChange={(e) => setPickupTime(e.target.value)}>
                  {slots.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                {errors.pickupTime && <span className="err">{errors.pickupTime}</span>}
              </div>
              <div className="notice">Pickup at the shelf by the oven — <b>128 Fournier Street, Maplewood</b>. Give us the name on the order and you&apos;re on your way.</div>
            </div>

            <div className="panel">
              <h2 style={{ margin: '0 0 12px', fontSize: 22 }}>Review your order</h2>
              {lines.map((l) => (
                <div key={l.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '9px 0', borderBottom: '1px solid var(--line)' }}>
                  <div><b>{l.qty} × {l.name}</b><div style={{ color: 'var(--muted)', fontSize: 13.5 }}>{sizeLabel(l.size)}{l.toppings.length > 0 && ` · ${l.toppings.map(toppingLabel).join(', ')}`}{l.note && ` · “${l.note}”`}</div></div>
                  <b>{fmt(l.unit * l.qty)}</b>
                </div>
              ))}
              <div className="summary-row" style={{ marginTop: 12 }}><span>Subtotal</span><span>{fmt(t.subtotal)}</span></div>
              <div className="summary-row"><span>Tax (8.5%)</span><span>{fmt(t.tax)}</span></div>
              <div className="summary-row total"><span>Due at pickup</span><span>{fmt(t.total)}</span></div>
              <button className="btn btn-ember" type="submit" style={{ width: '100%', marginTop: 16 }}>Place pickup order</button>
              <Link to="/cart" style={{ display: 'block', textAlign: 'center', marginTop: 12, fontWeight: 700, fontSize: 14 }}>Back to cart</Link>
            </div>
          </div>
        </form>
      </div>
    </section>
  )
}
