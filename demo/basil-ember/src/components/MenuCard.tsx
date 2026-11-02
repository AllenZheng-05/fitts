import { Link } from 'react-router-dom'
import type { MenuItem } from '../data/menu'
import { fmt } from '../lib/pricing'

export function MenuCard({ item }: { item: MenuItem }) {
  return (
    <Link className="card" to={`/menu/${item.id}`} aria-label={`View ${item.name}`}>
      <div className="card-art" style={{ background: `linear-gradient(135deg, hsl(${item.hue} 62% 52%), hsl(${item.hue + 24} 58% 34%))` }}>
        {item.popular && <span className="pop-tag">Neighborhood favorite</span>}
      </div>
      <div className="card-body">
        <h3>{item.name}</h3>
        <p>{item.description}</p>
        {item.dietary.length > 0 && (
          <div className="tags">{item.dietary.map((d) => <span key={d} className={`tag${d === 'spicy' ? ' tag-spicy' : ''}`}>{d}</span>)}</div>
        )}
        <div className="card-foot"><span className="price">{fmt(item.price)}</span><span style={{ fontWeight: 700, fontSize: 14 }}>Customize →</span></div>
      </div>
    </Link>
  )
}
