import { Activity } from 'lucide-react'

const TELEGRAM_URL = 'https://t.me/biasforgeofficial'

const COLUMNS = [
  {
    title: 'Product',
    links: [
      { label: 'Features', href: '#features' },
      { label: 'Pricing', href: '#pricing' },
      { label: 'Prop Firm Mode', href: '#features' },
      { label: 'Open app', href: '/login' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About BiasForge', href: '/about' },
      { label: 'Macro journal', href: '/blog' },
      { label: 'What is market bias?', href: '/blog/what-is-market-bias' },
      { label: 'Prop firm risk management', href: '/blog/prop-firm-risk-management' },
      { label: 'Changelog', href: '/changelog' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Terms', href: '/terms' },
      { label: 'Privacy', href: '/privacy' },
      { label: 'Refunds', href: '/refund' },
    ],
  },
  {
    title: 'Contact',
    links: [
      { label: 'Contact', href: '/contact' },
      { label: 'Telegram', href: TELEGRAM_URL, external: true },
      { label: '@BiasForgeai', href: 'https://x.com/BiasForgeai', external: true },
    ],
  },
]

/* Section 12 — the disclaimer is visible and in full, never behind a toggle. */
export default function Footer() {
  return (
    <footer className="px-5 sm:px-8 pt-16 pb-14 bf-hairline-t">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-x-8 gap-y-10">
          <div className="col-span-2 lg:col-span-1">
            <a href="/" className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-400 to-emerald-500 flex items-center justify-center">
                <Activity size={15} className="text-black" strokeWidth={3} aria-hidden="true" />
              </span>
              <span className="text-[15px] font-semibold tracking-tight text-slate-50">
                Bias<span className="text-cyan-400">Forge</span>
              </span>
            </a>
            <p className="mt-4 text-[13px] leading-relaxed bf-t3 max-w-[16rem]">
              Macro bias and invalidation levels for forex, prop firm and funded traders.
            </p>
          </div>

          {COLUMNS.map(col => (
            <nav key={col.title} aria-label={col.title}>
              <h2 className="text-[12px] font-semibold uppercase tracking-wider text-slate-300">{col.title}</h2>
              <ul className="mt-4 space-y-2.5">
                {col.links.map(l => (
                  <li key={l.label}>
                    <a
                      href={l.href}
                      {...(l.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                      className="text-[13.5px] bf-t3 hover:text-slate-200 transition-colors"
                    >
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <p className="mt-14 pt-8 bf-hairline-t text-[12.5px] leading-[1.75] bf-t3 max-w-[52rem]">
          BiasForge is an educational macro research tool. It is not financial advice, and it does
          not predict markets. Trading carries risk, and you are responsible for every decision on
          your account.
        </p>

        <p className="mt-8 text-[12.5px] bf-t3">
          © {new Date().getFullYear()} BiasForge.
        </p>
      </div>
    </footer>
  )
}
