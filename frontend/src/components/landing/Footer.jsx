import { Activity, Mail } from 'lucide-react'

const productLinks = [
  { label: 'Features', href: '#features' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'FAQ', href: '#faq' },
]

const companyLinks = [
  { label: 'Blog', href: '/blog' },
  { label: 'Contact', href: '/contact' },
  { label: 'Changelog', href: '/changelog' },
]

const legalLinks = [
  { label: 'Terms', href: '/terms' },
  { label: 'Privacy', href: '/privacy' },
  { label: 'Refund Policy', href: '/refund' },
]

// Proper inline SVG for X (Twitter) — no unicode glyph
const XIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className="w-4 h-4"
    aria-hidden="true"
  >
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.747l7.73-8.835L1.254 2.25H8.08l4.258 5.63 5.906-5.63Zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
)

const socials = [
  { icon: <XIcon />, href: 'https://x.com/MuzamilAshraf_1', label: 'Twitter / X', external: true },
  { icon: <Mail size={16} />, href: 'mailto:support@biasforge.co', label: 'Email' },
]

export default function Footer() {
  return (
    <footer className="bg-[#030712] border-t border-white/10 py-14 px-6">
      <div className="max-w-6xl mx-auto">

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-10 mb-12">

          <div className="lg:col-span-2 flex flex-col gap-4">
            <a href="/landing" className="flex items-center gap-2 w-fit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 rounded-lg">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-cyan-600 flex items-center justify-center">
                <Activity size={16} className="text-black" strokeWidth={2.5} />
              </div>
              <span className="text-lg font-black tracking-tight text-slate-100">
                Bias<span className="text-cyan-400">Forge</span>
              </span>
            </a>
            <p className="text-sm text-slate-400 max-w-xs leading-relaxed">
              AI macro clarity for serious traders.
            </p>
            <p className="text-xs text-slate-600 max-w-xs leading-relaxed">
              Not financial advice. Trading involves risk.
            </p>
            <div className="flex gap-3 mt-2">
              {socials.map(s => (
                <a
                  key={s.label}
                  href={s.href}
                  aria-label={s.label}
                  {...(s.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-cyan-400 hover:border-cyan-500/30 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
                >
                  {s.icon}
                </a>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <p className="text-xs uppercase tracking-widest text-slate-500 font-semibold mb-1">Product</p>
            {productLinks.map(link => (
              <a
                key={link.label}
                href={link.href}
                className="text-sm text-slate-400 hover:text-cyan-400 transition-colors duration-200 w-fit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 rounded"
              >
                {link.label}
              </a>
            ))}
          </div>

          <div className="flex flex-col gap-3">
            <p className="text-xs uppercase tracking-widest text-slate-500 font-semibold mb-1">Company</p>
            {companyLinks.map(link => (
              <a
                key={link.label}
                href={link.href}
                className="text-sm text-slate-400 hover:text-cyan-400 transition-colors duration-200 w-fit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 rounded"
              >
                {link.label}
              </a>
            ))}
          </div>

          <div className="flex flex-col gap-3">
            <p className="text-xs uppercase tracking-widest text-slate-500 font-semibold mb-1">Legal</p>
            {legalLinks.map(link => (
              <a
                key={link.label}
                href={link.href}
                className="text-sm text-slate-400 hover:text-cyan-400 transition-colors duration-200 w-fit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 rounded"
              >
                {link.label}
              </a>
            ))}
          </div>

        </div>

        <div className="border-t border-white/5 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-slate-600">
            © 2026 BiasForge. All rights reserved.
          </p>
          <p className="text-xs text-slate-600">
            Made for serious traders.
          </p>
        </div>

      </div>
    </footer>
  )
}
