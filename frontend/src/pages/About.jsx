import { useEffect } from 'react'
import '../styles/landing.css'
import Nav from '../components/landing/v2/Nav'
import Footer from '../components/landing/v2/Footer'

/* The About section on the landing page in full. Company voice throughout:
   no personal name, no personal handle, no performance claims. */
const BLOCKS = [
  {
    h: 'What BiasForge is',
    p: [
      `BiasForge is an independent macro research tool for forex traders. We read the same
       inputs a macro desk reads — the economic calendar, the newsflow, institutional
       positioning, rate differentials and cross-asset flows — and turn them into one
       directional read per pair, with the level where that read stops being valid.`,
      `No entries to copy. No performance claims. Just the direction and the line under it.`,
    ],
  },
  {
    h: 'What we mean by a bias',
    p: [
      `A bias is a direction plus a reason plus a boundary. The direction is which way the
       macro evidence leans on a pair. The reason is written out in plain English, so you can
       read the argument and disagree with it. The boundary is the invalidation level: the
       price at which the reasoning no longer holds and the bias is closed rather than
       defended.`,
      `That last part is the whole point. A read without a boundary is an opinion you can hold
       forever.`,
    ],
  },
  {
    h: 'What we read',
    p: [
      `Five inputs, continuously: live price action, the economic calendar, impact-scored
       newsflow, COT positioning from the weekly CFTC release, and cross-asset flows including
       rate differentials. Currency strength is published as a viewer but deliberately kept out
       of the scoring, because it lags.`,
    ],
  },
  {
    h: 'Who it is for',
    p: [
      `Forex traders who want the macro context behind a move rather than someone else's entry.
       It is built with prop firm and funded traders in mind — Prop Firm Mode tracks daily and
       total drawdown against your firm's limits on the same screen as your bias, because a
       funded account is lost on a rule as often as on a direction.`,
    ],
  },
  {
    h: 'What we will not do',
    p: [
      `We do not publish win rates, user counts or performance statistics we cannot source. We
       do not sell entries, stops or targets. We do not claim to predict markets. Every bias
       that closes is recorded, including the ones that were wrong, and when there is enough of
       that record to be worth reading we will publish it as it is.`,
      `BiasForge is an educational macro research tool. It is not financial advice. Every
       decision on your account is yours.`,
    ],
  },
]

export default function AboutPage() {
  useEffect(() => {
    document.documentElement.classList.add('bf-js')
    return () => document.documentElement.classList.remove('bf-js')
  }, [])

  // Client-rendered route, so nothing sets the head for it. Without this it
  // inherits the landing page's title and description verbatim, which is a
  // duplicate-title signal on the one page whose whole job is to say something
  // different. Restored on unmount so an in-app navigation back to / does not
  // leave the About title behind.
  useEffect(() => {
    const prevTitle = document.title
    const meta = document.querySelector('meta[name="description"]')
    const prevDesc = meta?.getAttribute('content')

    document.title = 'About BiasForge | Macro Research for Forex Traders'
    meta?.setAttribute(
      'content',
      'BiasForge is an independent macro research tool for forex, prop firm and funded traders — one directional read per pair, with the invalidation level where it stops being valid.'
    )

    return () => {
      document.title = prevTitle
      if (prevDesc != null) meta?.setAttribute('content', prevDesc)
    }
  }, [])

  return (
    <div className="bf-landing min-h-screen overflow-x-hidden">
      <Nav />
      <main className="px-5 sm:px-8 pt-32 pb-24">
        <div className="mx-auto max-w-3xl">
          <p className="bf-eyebrow">About BiasForge</p>
          <h1 className="bf-h1 mt-5">Built for traders who want a reason, not a signal.</h1>

          {BLOCKS.map(block => (
            <section key={block.h} className="mt-14">
              <h2 className="text-[19px] font-medium text-slate-100 tracking-tight">{block.h}</h2>
              {block.p.map(text => (
                <p key={text.slice(0, 32)} className="bf-body mt-4">{text}</p>
              ))}
            </section>
          ))}

          <p className="mt-16">
            <a
              href="/"
              className="bf-pill bf-lift bf-hairline inline-block px-5 py-2.5 text-[14px] text-slate-200 hover:border-slate-600"
            >
              Back to the macro compass
            </a>
          </p>
        </div>
      </main>
      <Footer />
    </div>
  )
}
