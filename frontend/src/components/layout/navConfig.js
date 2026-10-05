import {
  Sun, TrendingUp, CalendarDays, PieChart, ShieldCheck, NotebookPen, Megaphone,
} from 'lucide-react'

/* The dashboard's information architecture: six areas, in the order a trader
   uses them — the same grouping the landing page's "Inside the dashboard"
   section promises (landing/v2/Features.jsx).

   Paths stay flat (/bias, /calendar, /prop-firm …). The sections exist only
   here, in the sidebar grouping and the active-section highlight, so no URL a
   subscriber has bookmarked or an alert links to had to change. Old paths that
   did change are redirected in App.jsx. */
export const NAV_GROUPS = [
  {
    id: 'today', label: 'Today', icon: Sun,
    items: [{ label: 'Today', path: '/today', desc: 'The headline bias, events ahead and what moved' }],
  },
  {
    id: 'bias', label: 'Bias', icon: TrendingUp,
    items: [
      { label: 'AI Bias', path: '/bias', desc: 'Direction, conviction and invalidation per pair' },
      { label: 'Bias History', path: '/bias/history', desc: 'Every closed call and why it closed' },
      { label: 'Currency Strength', path: '/strength', desc: 'Viewer: not an engine input', hint: 'Viewer' },
    ],
  },
  {
    id: 'events', label: 'Events', icon: CalendarDays,
    items: [
      { label: 'Economic Calendar', path: '/calendar', desc: 'High-impact releases and what they mean' },
      { label: 'Live News', path: '/news', desc: 'Headlines scored for macro impact' },
      { label: 'Event Playbooks', path: '/playbooks', desc: 'FOMC, NFP, CPI, ECB and BOE days' },
      { label: 'Earnings', path: '/earnings', desc: 'Reports large enough to move risk' },
    ],
  },
  {
    id: 'markets', label: 'Markets', icon: PieChart,
    items: [
      { label: 'COT Report', path: '/cot', desc: 'Weekly CFTC positioning' },
      { label: 'MarketMovers Radar', path: '/market-movers', desc: 'Policy and political events' },
    ],
  },
  {
    id: 'account', label: 'Account', icon: ShieldCheck,
    items: [
      { label: 'Prop Firm Mode', path: '/prop-firm', desc: 'Drawdown against your firm’s limits' },
      { label: 'Settings', path: '/settings', desc: 'Profile and email alerts' },
      { label: 'Billing', path: '/billing', desc: 'Plan, receipts and cancellation' },
    ],
  },
  {
    id: 'journal', label: 'Journal', icon: NotebookPen,
    items: [{ label: 'Trade Journal', path: '/journal', desc: 'Your trades, P&L and analytics' }],
  },
]

// Shown to the admin only, outside the six areas.
export const ADMIN_GROUP = {
  id: 'admin', label: 'Admin', icon: Megaphone,
  items: [{ label: 'Content Studio', path: '/studio', desc: 'Social drafts' }],
}

// path → section id, for the active-section highlight.
const SECTION_OF = Object.fromEntries(
  [...NAV_GROUPS, ADMIN_GROUP].flatMap(g => g.items.map(i => [i.path, g.id])),
)
export const sectionOf = pathname => SECTION_OF[pathname] || null

// Every page, flat — the Topbar's Ctrl+K search reads this.
export const NAV_PAGES = NAV_GROUPS.flatMap(g => g.items.map(i => ({ ...i, group: g.label, icon: g.icon })))
