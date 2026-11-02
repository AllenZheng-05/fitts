import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

const TIMES = ['5:00 PM', '5:30 PM', '6:00 PM', '6:30 PM', '7:00 PM', '7:30 PM', '8:00 PM', '8:30 PM', '9:00 PM']

export function ReservePage() {
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({ name: '', phone: '', date: today, time: '7:00 PM', party: '2', occasion: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [done, setDone] = useState<string | null>(null)

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (form.name.trim().length < 2) next.name = 'Please add a name for the reservation.'
    if (form.phone.replace(/\D/g, '').length < 7) next.phone = 'Please add a phone number.'
    if (!form.date) next.date = 'Pick a date.'
    setErrors(next)
    if (Object.keys(next).length > 0) return
    setDone(`Table for ${form.party} · ${new Date(`${form.date}T12:00:00`).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })} at ${form.time}`)
  }

  if (done) {
    return (
      <section className="section" style={{ paddingTop: 48 }}><div className="wrap" style={{ maxWidth: 680 }}>
        <div className="success-mark" aria-hidden="true">✓</div>
        <h1 style={{ fontSize: 'clamp(32px,5vw,46px)', margin: '0 0 10px' }}>You&apos;re booked, {form.name.split(' ')[0]}.</h1>
        <p style={{ color: 'var(--muted)', fontSize: 17, lineHeight: 1.65 }}>{done}. We&apos;ll text <b style={{ color: 'var(--ink)' }}>{form.phone}</b> a reminder the day of. Running late? Call (513) 555-0148 — we hold tables for 15 minutes.</p>
        <div className="notice" style={{ margin: '20px 0' }}>Demo only — this reservation wasn&apos;t sent anywhere. In the real restaurant, you&apos;d get a confirmation text within a few minutes.</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={() => setDone(null)}>Make another reservation</button>
          <Link className="btn btn-dark" to="/menu">Browse the menu</Link>
        </div>
      </div></section>
    )
  }

  return (
    <section className="section" style={{ paddingTop: 48 }}>
      <div className="wrap">
        <div className="two-col">
          <div>
            <span className="kicker">Reservations</span>
            <h1 style={{ fontSize: 'clamp(34px,5vw,52px)', margin: '8px 0 12px', lineHeight: 1.05 }}>Save your seat by the fire</h1>
            <p style={{ color: 'var(--muted)', lineHeight: 1.7, margin: '0 0 18px', maxWidth: '56ch' }}>Twelve tables, one very hot oven. Parties of 2–8 can book below; for 9 or more, call us at (513) 555-0148 and we&apos;ll push tables together.</p>
            <div className="steps" style={{ gridTemplateColumns: '1fr' }}>
              <div className="step"><b>The corner booth</b><p>Best seat in the house for four — ask for it in the occasion notes and we&apos;ll try.</p></div>
              <div className="step"><b>Patio season</b><p>May through October, the garden patio seats 20 more. Basil for the pizzas grows right out there.</p></div>
              <div className="step"><b>Big nights</b><p>Friday and Saturday book out by Thursday most weeks. Weeknights are happily walk-in friendly.</p></div>
            </div>
          </div>

          <form className="panel" onSubmit={submit} noValidate>
            <h2 style={{ margin: '0 0 18px', fontSize: 22 }}>Book a table</h2>
            <div className="field"><label htmlFor="rv-name">Name</label><input id="rv-name" autoComplete="name" value={form.name} onChange={set('name')} placeholder="e.g. Sam Rivera" />{errors.name && <span className="err">{errors.name}</span>}</div>
            <div className="field"><label htmlFor="rv-phone">Phone</label><input id="rv-phone" type="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} placeholder="(513) 555-0100" />{errors.phone && <span className="err">{errors.phone}</span>}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div className="field"><label htmlFor="rv-date">Date</label><input id="rv-date" type="date" min={today} value={form.date} onChange={set('date')} />{errors.date && <span className="err">{errors.date}</span>}</div>
              <div className="field"><label htmlFor="rv-time">Time</label><select id="rv-time" value={form.time} onChange={set('time')}>{TIMES.map((t) => <option key={t}>{t}</option>)}</select></div>
            </div>
            <div className="field"><label htmlFor="rv-party">Party size</label><select id="rv-party" value={form.party} onChange={set('party')}>{[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n} {n === 1 ? 'guest' : 'guests'}</option>)}</select></div>
            <div className="field"><label htmlFor="rv-occ">Occasion or notes (optional)</label><input id="rv-occ" value={form.occasion} onChange={set('occasion')} placeholder="Birthday, corner booth, high chair…" /></div>
            <button className="btn btn-ember" type="submit" style={{ width: '100%' }}>Request this table</button>
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: '12px 0 0', lineHeight: 1.55 }}>Demo form — nothing is booked for real. No account, no card required, ever.</p>
          </form>
        </div>
      </div>
    </section>
  )
}
