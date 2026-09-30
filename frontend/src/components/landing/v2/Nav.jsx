import { useEffect, useState } from 'react'
import { Activity, Menu, X } from 'lucide-react'
import Button from '../../ui/Button'
import { FOCUS_RING } from '../../ui/styles'
import { PRICING_HREF, toPricing } from './toPricing'

/* Root-relative anchors ("/#…"), so they also work from /about, which reuses
   this nav. "How it works" and "The record" move to /methodology and /record
   when those pages exist (Phases 8 and 6). */
const LINKS = [
  { label: 'How it works', href: '/#framework' },
  { label: 'The record', href: '/#record' },
  { label: 'Pricing', href: '/#pricing' },
  { label: 'FAQ', href: '/#faq' },
  // Full page load, not a router link — /blog is prerendered static HTML.
  { label: 'Blog', href: '/blog' },
]

export default function Nav() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 h-16 transition-colors duration-300 ${
        scrolled || open ? 'bg-bf-bg/90 backdrop-blur-md bf-hairline-b' : 'bg-transparent'
      }`}
    >
      <nav className="mx-auto max-w-6xl h-full px-5 sm:px-8 flex items-center justify-between" aria-label="Main">
        <a href="/" className={`flex items-center gap-2 shrink-0 rounded-md ${FOCUS_RING}`}>
          <span className="w-8 h-8 rounded-[9px] bg-gradient-to-br from-cyan-400 to-emerald-500 flex items-center justify-center">
            <Activity size={17} className="text-black" strokeWidth={3} aria-hidden="true" />
          </span>
          <span className="text-[17px] font-semibold tracking-tight text-bf-text">
            Bias<span className="text-cyan-400">Forge</span>
          </span>
        </a>

        <div className="hidden min-[960px]:flex items-center gap-7 absolute left-1/2 -translate-x-1/2">
          {LINKS.map(l => (
            <a key={l.label} href={l.href} className={`bf-navlink text-[14px] text-bf-text-2 hover:text-bf-text transition-colors rounded ${FOCUS_RING}`}>
              {l.label}
            </a>
          ))}
        </div>

        <div className="hidden min-[960px]:flex items-center gap-2">
          <a href="/login" className={`px-3 py-2 text-[14px] text-bf-text-2 hover:text-bf-text transition-colors rounded ${FOCUS_RING}`}>
            Sign in
          </a>
          <Button href={PRICING_HREF} onClick={toPricing} size="sm">Get BiasForge Pro</Button>
        </div>

        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className={`min-[960px]:hidden text-slate-300 p-2 -mr-2 rounded ${FOCUS_RING}`}
          aria-expanded={open}
          aria-controls="bf-mobile-menu"
          aria-label={open ? 'Close menu' : 'Open menu'}
        >
          {open ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
        </button>
      </nav>

      {open && (
        <div id="bf-mobile-menu" className="min-[960px]:hidden bg-bf-bg bf-hairline-b px-5 pb-6 pt-2 flex flex-col gap-1">
          {LINKS.map(l => (
            <a
              key={l.label}
              href={l.href}
              onClick={() => setOpen(false)}
              className="py-3 text-[15px] text-slate-300"
            >
              {l.label}
            </a>
          ))}
          <a href="/login" className="py-3 text-[15px] text-slate-300">Sign in</a>
          <Button
            href={PRICING_HREF}
            onClick={e => { setOpen(false); toPricing(e) }}
            size="lg"
            fullWidth
            className="mt-2"
          >
            Get BiasForge Pro
          </Button>
        </div>
      )}
    </header>
  )
}
