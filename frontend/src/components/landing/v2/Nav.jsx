import { useEffect, useState } from 'react'
import { Activity, Menu, X } from 'lucide-react'

const LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'FAQ', href: '#faq' },
  // Full page load, not a router link — /blog is prerendered static HTML.
  { label: 'Blog', href: '/blog', external: true },
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
        scrolled ? 'bg-[#030712]/90 backdrop-blur-md bf-hairline-b' : 'bg-transparent'
      }`}
    >
      <nav className="mx-auto max-w-6xl h-full px-5 sm:px-8 flex items-center justify-between" aria-label="Main">
        <a href="/" className="flex items-center gap-2 shrink-0">
          <span className="w-8 h-8 rounded-[9px] bg-gradient-to-br from-cyan-400 to-emerald-500 flex items-center justify-center">
            <Activity size={17} className="text-black" strokeWidth={3} aria-hidden="true" />
          </span>
          <span className="text-[17px] font-semibold tracking-tight text-slate-50">
            Bias<span className="text-cyan-400">Forge</span>
          </span>
        </a>

        <div className="hidden md:flex items-center gap-8 absolute left-1/2 -translate-x-1/2">
          {LINKS.map(l => (
            <a key={l.label} href={l.href} className="bf-navlink text-[14px] text-slate-400 hover:text-slate-100 transition-colors">
              {l.label}
            </a>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-2">
          <a href="/login" className="px-3 py-2 text-[14px] text-slate-400 hover:text-slate-100 transition-colors">
            Sign in
          </a>
          <a
            href="/login"
            className="bf-pill bf-lift bf-hairline px-4 py-2 text-[14px] text-slate-100 hover:border-slate-600 hover:bg-white/[0.03]"
          >
            Open app
          </a>
        </div>

        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="md:hidden text-slate-300 p-1"
          aria-expanded={open}
          aria-label={open ? 'Close menu' : 'Open menu'}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </nav>

      {open && (
        <div className="md:hidden bg-[#030712] bf-hairline-b px-5 pb-6 pt-2 flex flex-col gap-1">
          {LINKS.map(l => (
            <a
              key={l.label}
              href={l.href}
              onClick={() => setOpen(false)}
              className="py-2.5 text-[15px] text-slate-300"
            >
              {l.label}
            </a>
          ))}
          <a href="/login" className="py-2.5 text-[15px] text-slate-300">Sign in</a>
          <a
            href="/login"
            className="bf-pill mt-2 px-4 py-2.5 text-[15px] text-center bg-cyan-500 text-[#030712] font-medium"
          >
            Open app
          </a>
        </div>
      )}
    </header>
  )
}
