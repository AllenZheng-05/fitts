import { Link } from 'react-router-dom'
import { MENU } from '../data/menu'
import { MenuCard } from '../components/MenuCard'

export function Home() {
  const favorites = MENU.filter((m) => m.popular)
  return (
    <>
      <section className="hero">
        <div className="wrap hero-grid">
          <div>
            <span className="kicker" style={{ color: '#e8a17c' }}>Maplewood · Est. 2019</span>
            <h1>Pizza from the fire, <em>made for the block.</em></h1>
            <p className="lede">48-hour dough, a 900° oak-fired oven, and toppings from the farms twenty minutes away. Order ahead for pickup, or book the corner table and stay awhile.</p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Link className="btn btn-ember" to="/menu">Order pickup</Link>
              <Link className="btn" to="/reserve" style={{ background: 'transparent', color: '#fff', border: '1.5px solid rgba(255,255,255,.45)' }}>Reserve a table</Link>
            </div>
            <div className="hero-meta">
              <div><b>900°</b><span>Oak-fired oven</span></div>
              <div><b>48 hr</b><span>Slow-fermented dough</span></div>
              <div><b>15 min</b><span>Typical pickup</span></div>
            </div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="pizza-disc" />
            <div className="hero-badge"><b>Tonight at the pass</b><p>Diavola with hot honey is coming out of the oven every twelve minutes until close.</p></div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="sec-head">
            <div><span className="kicker">Most loved</span><h2>The pies people cross town for</h2><p>Start with a favorite, then make it yours — extra burrata, pickled jalapeño, hot honey, however you take it.</p></div>
            <Link className="btn btn-ghost btn-sm" to="/menu">See full menu</Link>
          </div>
          <div className="grid-3">{favorites.map((item) => <MenuCard key={item.id} item={item} />)}</div>
        </div>
      </section>

      <section className="section section-stone">
        <div className="wrap">
          <div className="sec-head"><div><span className="kicker">How pickup works</span><h2>From oven to your hands, fast</h2></div></div>
          <div className="steps">
            <div className="step"><b>1 — Pick your pies</b><p>Browse the menu, choose a size, add toppings, and check out with your name, phone, and pickup time. No payment online — pay at the counter.</p></div>
            <div className="step"><b>2 — We fire to order</b><p>Your pizzas hit the oak fire when your pickup window opens, so the crust is blistered and the center is molten when you arrive.</p></div>
            <div className="step"><b>3 — Grab &amp; go</b><p>Head to the pickup shelf by the oven, give us your name, and you&apos;re out the door. Average handoff: under two minutes.</p></div>
          </div>
          <div style={{ marginTop: 36, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link className="btn btn-dark" to="/menu">Start an order</Link>
            <Link className="btn btn-ghost" to="/about">Hours &amp; directions</Link>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap story-band">
          <div>
            <span className="kicker">Our story</span>
            <h2 style={{ fontSize: 'clamp(30px,4vw,42px)', margin: '8px 0 14px', lineHeight: 1.1 }}>A tiny room, a very hot oven, and basil from the garden out back.</h2>
            <p style={{ color: 'var(--muted)', lineHeight: 1.7, margin: '0 0 14px' }}>Basil &amp; Ember started as a backyard pizza night that outgrew the backyard. Six years later we&apos;re still a twelve-table neighborhood room — we just fire a few hundred more pies a week.</p>
            <p style={{ color: 'var(--muted)', lineHeight: 1.7, margin: '0 0 22px' }}>Come for a Margherita and a spritz on the patio, grab a Diavola to go, or book the big table for the whole crew.</p>
            <Link className="btn btn-ember" to="/about">More about us</Link>
          </div>
          <div className="panel" style={{ background: 'var(--ink)', color: '#f5efe4', border: 0 }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 22 }}>Tonight&apos;s hours</h3>
            <div className="summary-row"><span>Tuesday – Thursday</span><b>4pm – 10pm</b></div>
            <div className="summary-row"><span>Friday – Saturday</span><b>12pm – 11pm</b></div>
            <div className="summary-row"><span>Sunday</span><b>12pm – 9pm</b></div>
            <div className="summary-row"><span>Monday</span><b>Closed</b></div>
            <p style={{ color: '#b3a78e', fontSize: 14, lineHeight: 1.6, margin: '14px 0 0' }}>128 Fournier Street, Maplewood · (513) 555-0148<br />Kitchen closes 30 minutes before close.</p>
          </div>
        </div>
      </section>
    </>
  )
}
