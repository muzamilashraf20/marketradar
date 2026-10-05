import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useCleanMode } from '../../hooks/useCleanMode'
import { LogOut, Activity, X, ChevronDown } from 'lucide-react'
import { FOCUS_RING } from '../ui/styles'
import { NAV_GROUPS, ADMIN_GROUP, sectionOf } from './navConfig'

/* The dashboard's six areas — Today, Bias, Events, Markets, Account, Journal —
   as groups (navConfig.js). A one-page area is a plain link; the others fold.
   The area holding the current page is highlighted and always open, whatever
   the reader folded, so the page you are on is never hidden.

   No locks and no upgrade banner: an account without Pro never gets here. It is
   sent to /subscribe before any dashboard page mounts (RequirePro), and the only
   pages it may open — Settings and Billing — render this sidebar unchanged. */
const FOLD_KEY = 'bf_nav_folded'

function readFolded() {
  try { return new Set(JSON.parse(localStorage.getItem(FOLD_KEY) || '[]')) } catch { return new Set() }
}

export default function Sidebar({ onClose }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  // isAdmin comes from AuthContext, which asks /api/admin/whoami once per signed-in user.
  const { user, isPro, planLoaded, logout, isAdmin } = useAuth()
  const cleanMode = useCleanMode()
  const [folded, setFolded] = useState(readFolded)

  const groups = isAdmin ? [...NAV_GROUPS, ADMIN_GROUP] : NAV_GROUPS
  const activeSection = sectionOf(pathname)

  const toggle = id => {
    setFolded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      try { localStorage.setItem(FOLD_KEY, JSON.stringify([...next])) } catch { /* storage blocked */ }
      return next
    })
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const email = user?.email || ''
  const initial = email.charAt(0).toUpperCase() || 'U'
  const planLabel = !planLoaded ? '···' : isPro ? 'Pro' : 'No active plan'

  return (
    <div className="w-[240px] h-full bg-bf-deep border-r border-white/10 flex flex-col">

      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/10 flex items-center justify-between">
        <Link to="/today" onClick={onClose} className={`flex items-center gap-2.5 rounded-md ${FOCUS_RING}`}>
          <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-emerald-500 flex items-center justify-center shrink-0">
            <Activity size={16} className="text-black" strokeWidth={3} aria-hidden="true" />
          </span>
          <span className="text-sm font-black tracking-tight text-bf-text leading-none">
            Bias<span className="text-cyan-400">Forge</span>
          </span>
        </Link>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close menu"
          className={`md:hidden text-bf-muted hover:text-bf-text transition-colors rounded ${FOCUS_RING}`}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      {/* Areas */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Dashboard">
        {groups.map(g => {
          const Icon = g.icon
          const sectionActive = activeSection === g.id

          // A one-page area: the header is the link.
          if (g.items.length === 1) {
            const item = g.items[0]
            const current = pathname === item.path
            return (
              <Link
                key={g.id}
                to={item.path}
                onClick={onClose}
                aria-current={current ? 'page' : undefined}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium border-l-2 transition-colors ${FOCUS_RING} ${
                  current
                    ? 'bg-bf-accent/10 border-bf-accent text-bf-text'
                    : 'border-transparent text-bf-text-2 hover:text-bf-text hover:bg-white/5'
                }`}
              >
                <Icon size={16} className={current ? 'text-bf-accent' : 'text-bf-muted'} aria-hidden="true" />
                {g.label}
              </Link>
            )
          }

          const open = sectionActive || !folded.has(g.id)
          const listId = `bf-nav-${g.id}`
          return (
            <div key={g.id}>
              <button
                type="button"
                onClick={() => toggle(g.id)}
                aria-expanded={open}
                aria-controls={listId}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium border-l-2 transition-colors ${FOCUS_RING} ${
                  sectionActive
                    ? 'border-bf-accent text-bf-text'
                    : 'border-transparent text-bf-text-2 hover:text-bf-text hover:bg-white/5'
                }`}
              >
                <Icon size={16} className={sectionActive ? 'text-bf-accent' : 'text-bf-muted'} aria-hidden="true" />
                <span className="flex-1 text-left">{g.label}</span>
                <ChevronDown
                  size={14}
                  aria-hidden="true"
                  className={`text-bf-muted transition-transform motion-reduce:transition-none ${open ? '' : '-rotate-90'}`}
                />
              </button>

              {open && (
                <ul id={listId} className="mt-0.5 mb-1 ml-[22px] border-l border-white/10 pl-2 space-y-0.5">
                  {g.items.map(item => {
                    const current = pathname === item.path
                    return (
                      <li key={item.path}>
                        <Link
                          to={item.path}
                          onClick={onClose}
                          aria-current={current ? 'page' : undefined}
                          className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[13px] transition-colors ${FOCUS_RING} ${
                            current
                              ? 'bg-bf-accent/10 text-bf-accent-soft font-medium'
                              : 'text-bf-text-2 hover:text-bf-text hover:bg-white/5'
                          }`}
                        >
                          <span className="flex-1 truncate">{item.label}</span>
                          {item.hint && (
                            <span className="text-[9.5px] uppercase tracking-wider text-bf-muted">{item.hint}</span>
                          )}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )
        })}
      </nav>

      <div className="mx-3 border-t border-white/10" />

      <div className="px-3 py-4 space-y-1">
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/5 border border-white/10">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-400 to-emerald-500 flex items-center justify-center text-black text-xs font-bold shrink-0" aria-hidden="true">
            {initial}
          </div>
          <div className="flex-1 min-w-0">
            {!cleanMode && <p className="text-xs text-bf-text font-medium truncate">{email}</p>}
            <p className={`text-[10px] ${planLoaded && isPro ? 'text-bf-accent' : 'text-bf-muted'}`}>{planLabel}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-bf-text-2 hover:text-red-400 hover:bg-red-500/5 transition-colors group ${FOCUS_RING}`}
        >
          <LogOut size={16} className="text-bf-muted group-hover:text-red-400" aria-hidden="true" />
          Sign Out
        </button>
      </div>
    </div>
  )
}
