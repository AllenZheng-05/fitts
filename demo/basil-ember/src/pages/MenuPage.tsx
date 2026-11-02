import { useMemo, useState } from 'react'
import { CATEGORIES, MENU, type Category, type Dietary } from '../data/menu'
import { MenuCard } from '../components/MenuCard'

const DIETARY_FILTERS: { id: Dietary; label: string }[] = [
  { id: 'vegetarian', label: 'Vegetarian' },
  { id: 'vegan', label: 'Vegan' },
  { id: 'gluten-free', label: 'Gluten-free' },
  { id: 'spicy', label: 'Spicy' },
]

export function MenuPage() {
  const [category, setCategory] = useState<Category | 'All'>('All')
  const [dietary, setDietary] = useState<Dietary[]>([])
  const [query, setQuery] = useState('')

  const toggleDietary = (d: Dietary) =>
    setDietary((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]))

  const filtered = useMemo(() => MENU.filter((item) => {
    if (category !== 'All' && item.category !== category) return false
    if (!dietary.every((d) => item.dietary.includes(d))) return false
    const q = query.trim().toLowerCase()
    if (q && !`${item.name} ${item.description} ${item.ingredients.join(' ')}`.toLowerCase().includes(q)) return false
    return true
  }), [category, dietary, query])

  return (
    <section className="section" style={{ paddingTop: 48 }}>
      <div className="wrap">
        <span className="kicker">Menu</span>
        <h1 style={{ fontSize: 'clamp(36px,5vw,56px)', margin: '8px 0 10px' }}>Fired to order, all day</h1>
        <p style={{ color: 'var(--muted)', maxWidth: '62ch', lineHeight: 1.65, margin: '0 0 30px' }}>
          Every pizza starts on our 48-hour dough. Pick a size and toppings on the item page — prices update as you build. Gluten-free crust available on any 12″ pie, just ask in the order notes.
        </p>

        <div className="filters">
          <input className="search" type="search" placeholder="Search the menu — try “burrata” or “pesto”…" value={query}
            onChange={(e) => setQuery(e.target.value)} aria-label="Search menu" />
          <div className="chip-row" role="group" aria-label="Category">
            {(['All', ...CATEGORIES] as const).map((c) => (
              <button key={c} className={`chip${category === c ? ' on' : ''}`} onClick={() => setCategory(c)} aria-pressed={category === c}>{c}</button>
            ))}
          </div>
          <div className="chip-row" role="group" aria-label="Dietary filters">
            {DIETARY_FILTERS.map((f) => (
              <button key={f.id} className={`chip${dietary.includes(f.id) ? ' on' : ''}`} onClick={() => toggleDietary(f.id)} aria-pressed={dietary.includes(f.id)}>{f.label}</button>
            ))}
            {(category !== 'All' || dietary.length > 0 || query) && (
              <button className="chip" onClick={() => { setCategory('All'); setDietary([]); setQuery('') }}>Clear filters</button>
            )}
          </div>
        </div>

        <p style={{ color: 'var(--muted)', fontSize: 14.5 }} aria-live="polite">{filtered.length} {filtered.length === 1 ? 'dish' : 'dishes'}{category !== 'All' ? ` in ${category}` : ''}</p>

        {filtered.length === 0 ? (
          <div className="empty"><h2 style={{ margin: '0 0 8px' }}>Nothing matches that combo</h2><p style={{ color: 'var(--muted)', margin: '0 0 18px' }}>Try clearing a filter or searching for something broader.</p><button className="btn btn-dark btn-sm" onClick={() => { setCategory('All'); setDietary([]); setQuery('') }}>Show everything</button></div>
        ) : (
          <div className="grid-3">{filtered.map((item) => <MenuCard key={item.id} item={item} />)}</div>
        )}
      </div>
    </section>
  )
}
