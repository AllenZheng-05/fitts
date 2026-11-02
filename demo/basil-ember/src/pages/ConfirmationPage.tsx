import { Link } from 'react-router-dom'
import { fmt } from '../lib/pricing'
import type { OrderDraft } from './CheckoutPage'

function loadOrder(): OrderDraft | null {
  try {
    const raw = sessionStorage.getItem('basil-ember-order')
    return raw ? (JSON.parse(raw) as OrderDraft) : null
  } catch { return null }
}

export function ConfirmationPage() {
  const order = loadOrder()

  if (!order) {
    return (
      <section className="section"><div className="wrap"><div className="empty">
        <h1 style={{ margin: '0 0 8px', fontSize: 32 }}>No recent order found</h1>
        <p style={{ color: 'var(--muted)', margin: '0 0 20px' }}>If you just placed an order, it may have been in a different tab. Otherwise, start a fresh one.</p>
        <Link className="btn btn-ember" to="/menu">Order pickup</Link>
      </div></div></section>
    )
  }

  return (
    <section className="section" style={{ paddingTop: 48 }}>
      <div className="wrap" style={{ maxWidth: 760 }}>
        <div className="success-mark" aria-hidden="true">✓</div>
        <h1 style={{ fontSize: 'clamp(34px,5vw,48px)', margin: '0 0 8px' }}>Order confirmed, {order.name.split(' ')[0]}.</h1>
        <p style={{ color: 'var(--muted)', fontSize: 17, lineHeight: 1.65, margin: '0 0 28px' }}>
          Order <b style={{ color: 'var(--ink)' }}>{order.orderNo}</b> is in. Pickup: <b style={{ color: 'var(--ink)' }}>{order.pickupTime}</b> at 128 Fournier Street.
          We&apos;ll call <b style={{ color: 'var(--ink)' }}>{order.phone}</b> only if something comes up. Pay at the counter — card or cash.
        </p>
        <div className="panel">
          <h2 style={{ margin: '0 0 10px', fontSize: 21 }}>Order {order.orderNo}</h2>
          {order.lines.map((l, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '9px 0', borderBottom: '1px solid var(--line)' }}>
              <div><b>{l.qty} × {l.name}</b>{l.detail && <div style={{ color: 'var(--muted)', fontSize: 13.5 }}>{l.detail}</div>}</div>
              <b>{fmt(l.amount)}</b>
            </div>
          ))}
          <div className="summary-row" style={{ marginTop: 12 }}><span>Subtotal</span><span>{fmt(order.subtotal)}</span></div>
          <div className="summary-row"><span>Tax (8.5%)</span><span>{fmt(order.tax)}</span></div>
          <div className="summary-row total"><span>Due at pickup</span><span>{fmt(order.total)}</span></div>
        </div>
        <div className="notice" style={{ margin: '20px 0' }}>Running late? Call us at <b>(513) 555-0148</b> and we&apos;ll hold your pies warm. This is a demo — nothing was charged and no real order was sent to a kitchen.</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link className="btn btn-dark" to="/menu">Order more</Link>
          <Link className="btn btn-ghost" to="/reserve">Reserve a table for next time</Link>
        </div>
      </div>
    </section>
  )
}
