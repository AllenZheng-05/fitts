import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getItem, SIZES, TOPPINGS, type SizeId, type ToppingId } from '../data/menu'
import { fmt, unitPrice } from '../lib/pricing'
import { useCart } from '../context/CartContext'

export function ItemPage() {
  const { id } = useParams()
  const item = id ? getItem(id) : undefined
  const { add } = useCart()
  const navigate = useNavigate()
  const isPizza = item?.category === 'Pizzas'
  const [size, setSize] = useState<SizeId>('medium')
  const [toppings, setToppings] = useState<ToppingId[]>([])
  const [qty, setQty] = useState(1)
  const [note, setNote] = useState('')
  const [added, setAdded] = useState(false)

  const unit = useMemo(() => (item ? unitPrice(item.price, isPizza ? size : 'medium', toppings) : 0), [item, size, toppings, isPizza])

  if (!item) {
    return (
      <section className="section"><div className="wrap"><div className="empty">
        <h1 style={{ margin: '0 0 8px' }}>That dish isn&apos;t on the menu</h1>
        <p style={{ color: 'var(--muted)' }}>It may have been a special. Browse the full menu instead.</p>
        <Link className="btn btn-dark" to="/menu">Back to menu</Link>
      </div></div></section>
    )
  }

  const toggle = (t: ToppingId) => setToppings((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))

  const addToCart = () => {
    add({ itemId: item.id, name: item.name, size: isPizza ? size : 'medium', toppings, qty, unit, note: note.trim() || undefined })
    setAdded(true)
  }

  return (
    <section className="section" style={{ paddingTop: 40 }}>
      <div className="wrap">
        <Link to="/menu" style={{ fontWeight: 700, fontSize: 14 }}>← Back to menu</Link>
        <div className="two-col" style={{ marginTop: 20 }}>
          <div>
            <div style={{ height: 300, borderRadius: 14, background: `linear-gradient(135deg, hsl(${item.hue} 62% 52%), hsl(${item.hue + 24} 58% 32%))`, position: 'relative', overflow: 'hidden' }}>
              {item.popular && <span className="pop-tag" style={{ top: 16, left: 16 }}>Neighborhood favorite</span>}
              <span className="serif" style={{ position: 'absolute', bottom: 14, left: 20, color: 'rgba(255,255,255,.92)', fontSize: 15, fontStyle: 'italic' }}>{item.category}</span>
            </div>
            <h1 style={{ fontSize: 'clamp(34px,4.5vw,50px)', margin: '22px 0 10px', lineHeight: 1.05 }}>{item.name}</h1>
            <p style={{ color: 'var(--muted)', fontSize: 17, lineHeight: 1.7, margin: '0 0 16px', maxWidth: '58ch' }}>{item.description}</p>
            {item.dietary.length > 0 && <div className="tags" style={{ marginBottom: 16 }}>{item.dietary.map((d) => <span key={d} className={`tag${d === 'spicy' ? ' tag-spicy' : ''}`}>{d}</span>)}</div>}
            <h3 style={{ margin: '0 0 8px' }}>What&apos;s in it</h3>
            <p style={{ color: 'var(--muted)', margin: 0, lineHeight: 1.7 }}>{item.ingredients.join(' · ')}</p>
          </div>

          <div className="panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <h2 style={{ margin: 0, fontSize: 22 }}>Build yours</h2><span className="price">{fmt(unit)}</span>
            </div>

            {isPizza && (
              <fieldset style={{ border: 0, padding: 0, margin: '20px 0 4px' }}>
                <legend style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Size</legend>
                <div className="radio-row">
                  {SIZES.map((s) => (
                    <label key={s.id} className="radio-pill">
                      <input type="radio" name="size" checked={size === s.id} onChange={() => setSize(s.id)} />
                      <span>{s.label}{s.delta !== 0 ? ` (${s.delta > 0 ? '+' : ''}${fmt(s.delta)})` : ''}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            <fieldset style={{ border: 0, padding: 0, margin: '16px 0 4px' }}>
              <legend style={{ fontWeight: 700, fontSize: 14 }}>Add toppings</legend>
              {TOPPINGS.map((t) => (
                <div className="check-row" key={t.id}>
                  <label><input type="checkbox" checked={toppings.includes(t.id)} onChange={() => toggle(t.id)} /> {t.label}</label>
                  <span style={{ fontWeight: 600 }}>+{fmt(t.price)}</span>
                </div>
              ))}
            </fieldset>

            <div className="field" style={{ marginTop: 18 }}>
              <label htmlFor="note">Notes for the kitchen (optional)</label>
              <textarea id="note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Gluten-free crust, light cheese, well done…" />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '6px 0 18px' }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>Quantity</span>
              <span className="qty">
                <button onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Decrease quantity">−</button>
                <b aria-live="polite">{qty}</b>
                <button onClick={() => setQty((q) => Math.min(12, q + 1))} aria-label="Increase quantity">+</button>
              </span>
            </div>

            {added ? (
              <div>
                <div className="notice" style={{ marginBottom: 12 }}>Added to your cart — {qty} × {item.name}.</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button className="btn btn-dark" onClick={() => navigate('/cart')}>View cart &amp; checkout</button>
                  <Link className="btn btn-ghost" to="/menu">Keep browsing</Link>
                </div>
              </div>
            ) : (
              <button className="btn btn-ember" style={{ width: '100%' }} onClick={addToCart}>Add to cart · {fmt(unit * qty)}</button>
            )}
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: '12px 0 0', lineHeight: 1.55 }}>Pickup only. Pay at the counter — card or cash. No online payment on this demo site.</p>
          </div>
        </div>
      </div>
    </section>
  )
}
