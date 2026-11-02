import { useState, type FormEvent } from 'react'

const HOURS: [string, string][] = [
  ['Monday', 'Closed'],
  ['Tuesday', '4:00 PM – 10:00 PM'],
  ['Wednesday', '4:00 PM – 10:00 PM'],
  ['Thursday', '4:00 PM – 10:00 PM'],
  ['Friday', '12:00 PM – 11:00 PM'],
  ['Saturday', '12:00 PM – 11:00 PM'],
  ['Sunday', '12:00 PM – 9:00 PM'],
]

export function AboutPage() {
  const [sent, setSent] = useState(false)
  const todayIdx = (new Date().getDay() + 6) % 7 // Monday = 0

  const submit = (e: FormEvent) => { e.preventDefault(); setSent(true) }

  return (
    <>
      <section className="section" style={{ paddingTop: 48, paddingBottom: 40 }}>
        <div className="wrap">
          <span className="kicker">About &amp; contact</span>
          <h1 style={{ fontSize: 'clamp(36px,5vw,56px)', margin: '8px 0 12px', lineHeight: 1.05 }}>A neighborhood room with a 900° heart</h1>
          <p style={{ color: 'var(--muted)', fontSize: 17, lineHeight: 1.7, maxWidth: '68ch', margin: 0 }}>
            Basil &amp; Ember opened in 2019 when two line cooks, a borrowed wood oven, and a backyard basil patch turned into a twelve-table restaurant on Fournier Street. The menu is short on purpose: dough we ferment for two days, sauce from one farm&apos;s San Marzanos, and whatever the garden gives us that week.
          </p>
        </div>
      </section>

      <section className="section section-stone" style={{ paddingTop: 48, paddingBottom: 48 }}>
        <div className="wrap two-col">
          <div className="panel">
            <h2 style={{ margin: '0 0 14px', fontSize: 24 }}>Hours</h2>
            {HOURS.map(([day, hours], i) => (
              <div key={day} className="summary-row" style={i === todayIdx ? { fontWeight: 800, color: 'var(--ember-dark)' } : undefined}>
                <span>{day}{i === todayIdx ? ' · today' : ''}</span><span>{hours}</span>
              </div>
            ))}
            <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6, margin: '14px 0 0' }}>Kitchen closes 30 minutes before close. Pickup orders accepted until close.</p>
          </div>
          <div className="panel">
            <h2 style={{ margin: '0 0 14px', fontSize: 24 }}>Find us</h2>
            <p style={{ lineHeight: 1.75, margin: '0 0 14px' }}>
              <b>Basil &amp; Ember</b><br />128 Fournier Street<br />Maplewood, OH 45240
            </p>
            <p style={{ lineHeight: 1.75, margin: '0 0 14px' }}>
              Phone: <a href="tel:+15135550148" style={{ fontWeight: 700 }}>(513) 555-0148</a><br />
              Email: <a href="mailto:hello@basilandember.example" style={{ fontWeight: 700 }}>hello@basilandember.example</a>
            </p>
            <p style={{ color: 'var(--muted)', lineHeight: 1.65, margin: 0, fontSize: 14.5 }}>Street parking on Fournier, plus the Maplewood garage one block north (free after 6pm). Bike rack by the patio gate. The 24 bus stops at Fournier &amp; Elm.</p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap two-col">
          <div>
            <h2 style={{ fontSize: 30, margin: '0 0 12px' }}>How we work</h2>
            <div className="steps" style={{ gridTemplateColumns: '1fr' }}>
              <div className="step"><b>Dough, two days ahead</b><p>Every batch ferments 48 hours before it meets the oven. It&apos;s why the crust blisters instead of burning.</p></div>
              <div className="step"><b>Oak, not gas</b><p>Our oven burns Ohio white oak at around 900°. A pizza cooks in about 90 seconds and picks up a whisper of smoke.</p></div>
              <div className="step"><b>The garden out back</b><p>Basil, oregano, and chili peppers come from the beds behind the patio, May through October. The rest comes from farms within 30 miles.</p></div>
            </div>
          </div>

          <form className="panel" onSubmit={submit}>
            <h2 style={{ margin: '0 0 6px', fontSize: 24 }}>Say hello</h2>
            <p style={{ color: 'var(--muted)', margin: '0 0 18px', fontSize: 14.5, lineHeight: 1.6 }}>Catering, big parties, allergies, or just pizza opinions — send a note.</p>
            {sent ? (
              <div className="notice">Thanks — your note is in (well, it would be: this demo form doesn&apos;t send email). For anything urgent, call (513) 555-0148.</div>
            ) : (
              <>
                <div className="field"><label htmlFor="ct-name">Your name</label><input id="ct-name" required placeholder="Sam Rivera" /></div>
                <div className="field"><label htmlFor="ct-email">Email</label><input id="ct-email" type="email" required placeholder="sam@example.com" /></div>
                <div className="field"><label htmlFor="ct-msg">Message</label><textarea id="ct-msg" required rows={4} placeholder="Tell us what's on your mind…" /></div>
                <button className="btn btn-ember" type="submit" style={{ width: '100%' }}>Send message</button>
              </>
            )}
          </form>
        </div>
      </section>
    </>
  )
}
