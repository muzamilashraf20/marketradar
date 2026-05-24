import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
  Menu, Search, Bell, Settings, LogOut, User, ChevronDown, X,
  BarChart3, Newspaper, Calendar, Shield, BookOpen, FileText,
  TrendingUp, Zap, Globe, Clock, AlertTriangle, Info, CheckCircle
} from 'lucide-react'

/* ───────── Session helper ─────────
   Forex market hours (UTC):
   - Closes: Friday 22:00 UTC
   - Opens:  Sunday 22:00 UTC (Sydney session)
   Sessions during weekdays:
   - Sydney:   22:00 - 07:00 UTC
   - Tokyo:    00:00 - 09:00 UTC
   - London:   07:00 - 16:00 UTC
   - New York: 13:00 - 22:00 UTC
*/
function getSession() {
  const now = new Date()
  const day = now.getUTCDay()   // 0 = Sunday, 6 = Saturday
  const hour = now.getUTCHours()

  // Saturday all day → market closed
  if (day === 6) {
    return { name: 'Market Closed', color: 'text-slate-500', dot: 'bg-slate-500', closed: true }
  }

  // Friday after 22:00 UTC → market closed
  if (day === 5 && hour >= 22) {
    return { name: 'Market Closed', color: 'text-slate-500', dot: 'bg-slate-500', closed: true }
  }

  // Sunday before 22:00 UTC → market closed (Sydney opens at 22:00 UTC Sunday)
  if (day === 0 && hour < 22) {
    return { name: 'Market Closed', color: 'text-slate-500', dot: 'bg-slate-500', closed: true }
  }

  // Market is open — determine active session
  if (hour >= 0 && hour < 7) return { name: 'Tokyo', color: 'text-purple-400', dot: 'bg-purple-400', closed: false }
  if (hour >= 7 && hour < 13) return { name: 'London', color: 'text-blue-400', dot: 'bg-blue-400', closed: false }
  if (hour >= 13 && hour < 22) return { name: 'New York', color: 'text-amber-400', dot: 'bg-amber-400', closed: false }
  return { name: 'Sydney', color: 'text-emerald-400', dot: 'bg-emerald-400', closed: false }
}

/* ───────── Searchable pages list ───────── */
const PAGES = [
  { name: 'Dashboard', path: '/', icon: BarChart3, desc: 'Overview & stats' },
  { name: 'AI Bias Engine', path: '/bias', icon: Zap, desc: 'AI-powered trade bias' },
  { name: 'News Feed', path: '/news', icon: Newspaper, desc: 'Live macro news' },
  { name: 'Economic Calendar', path: '/calendar', icon: Calendar, desc: 'Upcoming events' },
  { name: 'Prop Firm Mode', path: '/prop-firm', icon: Shield, desc: 'Risk management' },
  { name: 'Event Playbooks', path: '/playbooks', icon: BookOpen, desc: 'FOMC, NFP, CPI guides' },
  { name: 'COT Report', path: '/cot', icon: FileText, desc: 'Commitment of Traders' },
  { name: 'Earnings Calendar', path: '/earnings', icon: TrendingUp, desc: 'Earnings releases' },
  { name: 'Trump Tracker', path: '/trump', icon: Globe, desc: 'Policy impact tracker' },
  { name: 'Market Dashboard', path: '/market-dashboard', icon: BarChart3, desc: 'Market overview' },
  { name: 'Settings', path: '/settings', icon: Settings, desc: 'Account settings' },
]

/* ───────── Static notifications ───────── */
function generateNotifications() {
  const now = Date.now()
  return [
    {
      id: 1, type: 'alert',
      title: 'High Impact Event Soon',
      message: 'FOMC Rate Decision in 2 hours — check your playbook',
      time: now - 5 * 60 * 1000, read: false,
    },
    {
      id: 2, type: 'news',
      title: 'Breaking: USD Volatility Spike',
      message: 'DXY moved +0.8% after Treasury auction — news feed updated',
      time: now - 22 * 60 * 1000, read: false,
    },
    {
      id: 3, type: 'system',
      title: 'Prop Firm Risk Check',
      message: 'Your daily drawdown is at 1.8% — approaching caution zone',
      time: now - 45 * 60 * 1000, read: false,
    },
    {
      id: 4, type: 'info',
      title: 'New Playbook Available',
      message: 'BOE Interest Rate playbook has been added to Event Playbooks',
      time: now - 3 * 60 * 60 * 1000, read: true,
    },
    {
      id: 5, type: 'news',
      title: 'CPI Data Released',
      message: 'US CPI came in at 3.2% vs 3.1% expected — check bias matrix',
      time: now - 5 * 60 * 60 * 1000, read: true,
    },
  ]
}

function timeAgo(ts) {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

const NOTIF_ICON = {
  alert:  { icon: AlertTriangle, color: 'text-amber-400',   bg: 'bg-amber-400/10' },
  news:   { icon: Newspaper,     color: 'text-cyan-400',    bg: 'bg-cyan-400/10' },
  system: { icon: Shield,        color: 'text-red-400',     bg: 'bg-red-400/10' },
  info:   { icon: Info,          color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
}

/* ═══════════════════════════════════════════ */
export default function Topbar({ title, subtitle, onMenuClick }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, isPro, logout } = useAuth()
  const [time, setTime] = useState('')
  const [session, setSession] = useState(getSession())
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef(null)

  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef(null)

  const [notifOpen, setNotifOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const notifRef = useRef(null)

  /* Clock */
  useEffect(() => {
    const update = () => {
      setTime(new Date().toUTCString().slice(17, 25))
      setSession(getSession())
    }
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [])

  /* Outside click */
  useEffect(() => {
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setDropdownOpen(false)
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  /* Keyboard shortcuts */
  useEffect(() => {
    const handleKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
      if (e.key === 'Escape') {
        setSearchOpen(false)
        setSearchQuery('')
        setNotifOpen(false)
        setDropdownOpen(false)
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [])

  /* Auto-focus search */
  useEffect(() => {
    if (searchOpen && searchInputRef.current) searchInputRef.current.focus()
  }, [searchOpen])

  /* Search results */
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return PAGES
    const q = searchQuery.toLowerCase()
    return PAGES.filter(p => p.name.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q))
  }, [searchQuery])

  const handleSearchNavigate = (path) => {
    navigate(path)
    setSearchOpen(false)
    setSearchQuery('')
  }

  /* Notifications */
  const unreadCount = notifications.filter(n => !n.read).length
  const markAllRead = () => setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  const markOneRead = (id) => setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
  const clearAll = () => { setNotifications([]); setNotifOpen(false) }

  const handleLogout = () => { logout(); navigate('/login') }

  const email = user?.email || ''
  const initial = email.charAt(0).toUpperCase() || 'U'

  return (
    <>
      <header className="sticky top-0 z-10 h-14 bg-[#020617]/90 backdrop-blur-md border-b border-white/10 flex items-center justify-between px-4 md:px-6 shrink-0">

        {/* Left — Hamburger + Title */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onMenuClick}
            className="md:hidden text-slate-400 hover:text-white transition-colors p-1 shrink-0"
          >
            <Menu size={20} />
          </button>
          <div className="min-w-0">
            {title && <h1 className="text-sm font-bold text-white leading-none truncate">{title}</h1>}
            {subtitle && <p className="text-xs text-slate-500 mt-0.5 hidden sm:block truncate">{subtitle}</p>}
          </div>
        </div>

        {/* Center — Session indicator (md+) */}
        <div className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full border shrink-0 ${
          session.closed
            ? 'bg-slate-500/5 border-slate-500/20'
            : 'bg-white/5 border-white/10'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${session.dot} ${session.closed ? '' : 'animate-pulse'}`} />
          <span className={`text-xs font-semibold ${session.color}`}>
            {session.closed ? session.name : `${session.name} Session`}
          </span>
          <span className="text-slate-600 text-xs">·</span>
          <span className="text-slate-400 text-xs font-mono">{time} UTC</span>
        </div>

        {/* Right — Actions */}
        <div className="flex items-center gap-1 shrink-0">

          {/* Search */}
          <button
            onClick={() => setSearchOpen(true)}
            className="p-2 text-slate-500 hover:text-white hover:bg-white/5 rounded-lg transition-all"
            title="Search (Ctrl+K)"
          >
            <Search size={16} />
          </button>

          {/* Notifications */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => { setNotifOpen(!notifOpen); setDropdownOpen(false) }}
              className="p-2 text-slate-500 hover:text-white hover:bg-white/5 rounded-lg transition-all relative"
            >
              <Bell size={16} />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 min-w-[14px] h-[14px] rounded-full bg-cyan-400 text-black text-[9px] font-bold flex items-center justify-center px-0.5">
                  {unreadCount}
                </span>
              )}
            </button>

            {/* ── Notification Panel ── */}
            {notifOpen && (
              <div className="absolute right-0 top-full mt-2 z-50
                w-[calc(100vw-2rem)] sm:w-96
                max-w-sm sm:max-w-none
                bg-[#0a1628] border border-white/10 rounded-xl shadow-2xl overflow-hidden">

                {/* Header */}
                <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white">Notifications</h3>
                    {unreadCount > 0 && (
                      <span className="text-[10px] font-bold bg-cyan-400/20 text-cyan-400 px-1.5 py-0.5 rounded-full">
                        {unreadCount} new
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {unreadCount > 0 && (
                      <button onClick={markAllRead} className="text-[11px] text-slate-500 hover:text-cyan-400 transition-colors">
                        Mark all read
                      </button>
                    )}
                    {notifications.length > 0 && (
                      <button onClick={clearAll} className="text-[11px] text-slate-500 hover:text-red-400 transition-colors">
                        Clear all
                      </button>
                    )}
                  </div>
                </div>

                {/* List */}
                <div className="max-h-72 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="px-4 py-8 text-center">
                      <CheckCircle size={24} className="mx-auto text-slate-600 mb-2" />
                      <p className="text-xs text-slate-500">All caught up!</p>
                    </div>
                  ) : (
                    notifications.map(notif => {
                      const meta = NOTIF_ICON[notif.type] || NOTIF_ICON.info
                      const Icon = meta.icon
                      return (
                        <button
                          key={notif.id}
                          onClick={() => markOneRead(notif.id)}
                          className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-white/5 transition-all border-b border-white/5 last:border-0 ${!notif.read ? 'bg-cyan-400/[0.03]' : ''}`}
                        >
                          <div className={`mt-0.5 w-8 h-8 rounded-lg ${meta.bg} flex items-center justify-center shrink-0`}>
                            <Icon size={14} className={meta.color} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className={`text-xs font-semibold truncate ${!notif.read ? 'text-white' : 'text-slate-400'}`}>
                                {notif.title}
                              </p>
                              {!notif.read && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />}
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{notif.message}</p>
                            <p className="text-[10px] text-slate-600 mt-1 flex items-center gap-1">
                              <Clock size={10} />{timeAgo(notif.time)}
                            </p>
                          </div>
                        </button>
                      )
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => { setDropdownOpen(!dropdownOpen); setNotifOpen(false) }}
              className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-lg hover:bg-white/5 transition-all"
            >
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-400 to-emerald-500 flex items-center justify-center text-black text-xs font-bold shrink-0">
                {initial}
              </div>
              <span className="hidden md:block text-xs text-slate-300 max-w-[100px] truncate">
                {email}
              </span>
              <ChevronDown size={14} className={`text-slate-500 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-[#0a1628] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50">
                <div className="px-4 py-3 border-b border-white/10">
                  <p className="text-xs text-white font-semibold truncate">{email}</p>
                  <p className={`text-[10px] mt-0.5 ${isPro ? 'text-cyan-400' : 'text-amber-400'}`}>{isPro ? 'Pro' : 'Free'} Plan</p>
                </div>
                <div className="py-1">
                  <button
                    onClick={() => { navigate('/settings'); setDropdownOpen(false) }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-400 hover:text-white hover:bg-white/5 transition-all"
                  >
                    <Settings size={14} />
                    Settings
                  </button>
                </div>
                <div className="border-t border-white/10 py-1">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-400 hover:text-red-400 hover:bg-red-500/5 transition-all"
                  >
                    <LogOut size={14} />
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ═══════ Search Overlay ═══════ */}
      {searchOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => { setSearchOpen(false); setSearchQuery('') }}
          />
          <div className="relative w-full max-w-lg bg-[#0a1628] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">

            {/* Input */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
              <Search size={18} className="text-slate-500 shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search pages..."
                className="flex-1 bg-transparent text-sm text-white placeholder-slate-600 outline-none"
                onKeyDown={e => {
                  if (e.key === 'Enter' && searchResults.length > 0) handleSearchNavigate(searchResults[0].path)
                }}
              />
              <button
                onClick={() => { setSearchOpen(false); setSearchQuery('') }}
                className="text-slate-500 hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Results */}
            <div className="max-h-[55vh] overflow-y-auto py-2">
              {searchResults.length === 0 ? (
                <div className="px-4 py-6 text-center">
                  <p className="text-xs text-slate-500">No pages found for "{searchQuery}"</p>
                </div>
              ) : (
                searchResults.map(page => {
                  const Icon = page.icon
                  const isActive = location.pathname === page.path
                  return (
                    <button
                      key={page.path}
                      onClick={() => handleSearchNavigate(page.path)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/5 transition-all ${isActive ? 'bg-cyan-400/5 border-l-2 border-cyan-400' : ''}`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isActive ? 'bg-cyan-400/10 text-cyan-400' : 'bg-white/5 text-slate-500'}`}>
                        <Icon size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${isActive ? 'text-cyan-400' : 'text-white'}`}>{page.name}</p>
                        <p className="text-[11px] text-slate-500 truncate">{page.desc}</p>
                      </div>
                      {isActive && (
                        <span className="text-[10px] text-cyan-400/60 bg-cyan-400/10 px-2 py-0.5 rounded-full shrink-0">
                          current
                        </span>
                      )}
                    </button>
                  )
                })
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-2 border-t border-white/10 flex items-center gap-4">
              <span className="text-[10px] text-slate-600 flex items-center gap-1">
                <kbd className="bg-white/5 border border-white/10 rounded px-1 py-0.5 text-[9px]">↵</kbd> open
              </span>
              <span className="text-[10px] text-slate-600 flex items-center gap-1">
                <kbd className="bg-white/5 border border-white/10 rounded px-1 py-0.5 text-[9px]">esc</kbd> close
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}