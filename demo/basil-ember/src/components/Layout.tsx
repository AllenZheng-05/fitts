import { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import { totals } from '../lib/pricing'

const links = [
  { to: '/', label: 'Home' },
  { to: '/menu', label: 'Menu' },
  { to: '/reserve', label: 'Reservations' },
  { to: '/about', label: 'About & Contact' },
]

export function Layout() {
  const { lines } = useCart()
  const count = totals(lines).count
  const [open, setOpen] = useState(false)
  return (
    <>
      <header className="header">
        <div className="wrap header-in">
          <Link className="brand" to="/" aria-label="Basil and Ember home">
            <b>Basil &amp; Ember</b><span>Wood-fired pizza</span>
          </Link>
          <button className="menu-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>Menu</button>
          <nav className={`nav${open ? ' open' : ''}`} aria-label="Primary">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.to === '/'} onClick={() => setOpen(false)}
                className={({ isActive }) => (isActive ? 'active' : undefined)}>{l.label}</NavLink>
            ))}
          </nav>
          <Link className="cart-btn" to="/cart">Cart{count > 0 && <span className="cart-count" aria-label={`${count} items in cart`}>{count}</span>}</Link>
        </div>
      </header>
      <main><Outlet /></main>
      <footer className="footer">
        <div className="wrap">
          <div className="footer-grid">
            <div>
              <h4>Basil &amp; Ember</h4>
              <p style={{ margin: 0, lineHeight: 1.6, fontSize: 14.5 }}>Wood-fired pies, small plates, and a room that feels like Sunday at your favorite neighbor&apos;s house.</p>
            </div>
            <div><h4>Visit</h4><p style={{ margin: 0, lineHeight: 1.7, fontSize: 14.5 }}>128 Fournier Street<br />Maplewood, OH 45240<br />(513) 555-0148</p></div>
            <div><h4>Hours</h4><p style={{ margin: 0, lineHeight: 1.7, fontSize: 14.5 }}>Tue–Thu · 4pm–10pm<br />Fri–Sat · 12pm–11pm<br />Sun · 12pm–9pm<br />Mon · Closed</p></div>
            <div><h4>Explore</h4><Link to="/menu">Full menu</Link><Link to="/reserve">Reserve a table</Link><Link to="/cart">Your cart</Link><Link to="/about">Our story</Link></div>
          </div>
          <p style={{ borderTop: '1px solid rgba(255,255,255,.12)', marginTop: 36, paddingTop: 18, fontSize: 13 }}>© {new Date().getFullYear()} Basil &amp; Ember. Demo site — no real orders or payments.</p>
        </div>
      </footer>
    </>
  )
}
