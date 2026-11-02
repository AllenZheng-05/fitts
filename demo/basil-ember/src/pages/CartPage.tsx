import { Link } from 'react-router-dom'
import { SIZES, TOPPINGS } from '../data/menu'
import { fmt, totals } from '../lib/pricing'
import { useCart } from '../context/CartContext'

const sizeLabel = (id: string) => SIZES.find((s) => s.id === id)?.label ?? id
const toppingLabel = (id: string) => TOPPINGS.find((t) => t.id === id)?.label ?? id

export function CartPage() {
  const { lines, setQty, remove, clear } = useCart()
  const t = totals(lines)

  if (lines.length === 0) {
    return (
      <section className="section"><div className="wrap"><div className="empty">
        <h1 style={{ margin: '0 0 8px', fontSize: 34 }}>Your cart is empty</h1>
        <p style={{ color: 'var(--muted)', margin: '0 0 20px' }}>The oven is warm and waiting. Pick a pie to get started.</p>
        <Link className="btn btn-ember" to="/menu">Browse the menu</Link>
      </div></div></section>
    )
  }

  return (
    <section className="section" style={{ paddingTop: 48 }}>
      <div className="wrap">
        <h1 style={{ fontSize: 'clamp(34px,5vw,50px)', margin: '0 0 6px' }}>Your cart</h1>
        <p style={{ color: 'var(--muted)', margin: '0 0 28px' }}>Pickup at 128 Fournier Street. Pay at the counter when you arrive.</p>
        <div className="two-col">
          <div className="panel" style={{ paddingTop: 8, paddingBottom: 8 }}>
            {lines.map((l) => (
              <div className="line-row" key={l.key}>
                <div style={{ flex: 1 }}>
                  <b style={{ fontFamily: '"Fraunces", serif', fontSize: 18 }}>{l.name}</b>
                  <div style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.6, marginTop: 3 }}>
                    {sizeLabel(l.size)}{l.toppings.length > 0 && <> · {l.toppings.map(toppingLabel).join(', ')}</>}
                    {l.note && <><br />“{l.note}”</>}
                  </div>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginTop: 10 }}>
                    <span className="qty">
                      <button onClick={() => setQty(l.key, l.qty - 1)} aria-label={`Decrease ${l.name}`}>−</button>
                      <b>{l.qty}</b>
                      <button onClick={() => setQty(l.key, l.qty + 1)} aria-label={`Increase ${l.name}`}>+</button>
                    </span>
                    <button onClick={() => remove(l.key)} style={{ background: 'none', border: 0, color: 'var(--ember)', fontWeight: 700, fontSize: 14 }}>Remove</button>
                  </div>
                </div>
                <b>{fmt(l.unit * l.qty)}</b>
              </div>
            ))}
            <button onClick={clear} style={{ background: 'none', border: 0, color: 'var(--muted)', fontWeight: 600, fontSize: 14, padding: '14px 0 8px' }}>Clear cart</button>
          </div>

          <div className="panel">
            <h2 style={{ margin: '0 0 12px', fontSize: 22 }}>Order summary</h2>
            <div className="summary-row"><span>Subtotal</span><span>{fmt(t.subtotal)}</span></div>
            <div className="summary-row"><span>Tax (8.5%)</span><span>{fmt(t.tax)}</span></div>
            <div className="summary-row total"><span>Total due at pickup</span><span>{fmt(t.total)}</span></div>
            <Link className="btn btn-ember" to="/checkout" style={{ width: '100%', marginTop: 16 }}>Continue to pickup details</Link>
            <Link to="/menu" style={{ display: 'block', textAlign: 'center', marginTop: 12, fontWeight: 700, fontSize: 14 }}>Add more from the menu</Link>
          </div>
        </div>
      </div>
    </section>
  )
}
