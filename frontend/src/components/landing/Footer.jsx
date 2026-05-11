import { Activity, Mail, MessageCircle } from 'lucide-react'

const productLinks = [
  { label: 'Features', href: '#features' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'FAQ', href: '#faq' },
]

const companyLinks = [
  { label: 'Blog', href: '#' },
  { label: 'Contact', href: '#' },
  { label: 'Changelog', href: '#' },
]

const legalLinks = [
  { label: 'Terms', href: '#' },
  { label: 'Privacy', href: '#' },
  { label: 'Refund Policy', href: '#' },
]

const socials = [
  { icon: <span className="text-sm font-bold">𝕏</span>, href: '#', label: 'Twitter' },
  { icon: <MessageCircle size={16} />, href: '#', label: 'Discord' },
  { icon: <Mail size={16} />, href: '#', label: 'Email' },
]

export default function Footer() {
  return (
    <footer className="bg-[#030712] border-t border-white/10 py-14 px-6">
      <div className="max-w-6xl mx-auto">

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-10 mb-12">

          <div className="lg:col-span-2 flex flex-col gap-4">
            <a href="/landing" className="flex items-center gap-2 w-fit">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-cyan-600 flex items-center justify-center">
                <Activity size={16} className="text-black" strokeWidth={2.5} />
              </div>
              <span className="text-lg font-black tracking-tight text-slate-100">
                Bias<span className="text-cyan-400">Forge</span>
                <span className="text-slate-500 text-sm font-medium">.ai</span>
              </span>
            </a>
            <p className="text-sm text-slate-400 max-w-xs leading-relaxed">
              AI macro clarity for funded traders.
            </p>
            <p className="text-xs text-slate-600 max-w-xs leading-relaxed">
              Not financial advice. Trading involves risk.
            </p>
            <div className="flex gap-3 mt-2">
              {socials.map(s => (
                <a key={s.label} href={s.href} aria-label={s.label}
                  className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-cyan-400 hover:border-cyan-500/30 transition-all duration-200">
                  {s.icon}
                </a>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <p className="text-xs uppercase tracking-widest text-slate-500 font-semibold mb-1">Product</p>
            {productLinks.map(link => (
              <a key={link.label} href={link.href}
                className="text-sm text-slate-400 hover:text-cyan-400 transition-colors duration-200 w-fit">
                {link.label}
              </a>
            ))}
          </div>

          <div className="flex flex-col gap-3">
            <p className="text-xs uppercase tracking-widest text-slate-500 font-semibold mb-1">Company</p>
            {companyLinks.map(link => (
              <a key={link.label} href={link.href}
                className="text-sm text-slate-400 hover:text-cyan-400 transition-colors duration-200 w-fit">
                {link.label}
              </a>
            ))}
          </div>

          <div className="flex flex-col gap-3">
            <p className="text-xs uppercase tracking-widest text-slate-500 font-semibold mb-1">Legal</p>
            {legalLinks.map(link => (
              <a key={link.label} href={link.href}
                className="text-sm text-slate-400 hover:text-cyan-400 transition-colors duration-200 w-fit">
                {link.label}
              </a>
            ))}
          </div>

        </div>

        <div className="border-t border-white/5 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-slate-600">
            © 2026 BiasForge.ai. All rights reserved.
          </p>
          <p className="text-xs text-slate-600">
            Made for funded traders.
          </p>
        </div>

      </div>
    </footer>
  )
}