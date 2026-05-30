import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
  LayoutDashboard, TrendingUp, Newspaper, Calendar,
  ShieldCheck, BookOpen, PieChart, DollarSign, Flag,
  Settings, LogOut, Activity, X, ChevronRight, BarChart2,
  Lock
} from 'lucide-react'

const NAV_ITEMS = [
  { label: 'Overview',          icon: LayoutDashboard, path: '/dashboard',  pro: false },
  { label: 'AI Bias',           icon: TrendingUp,      path: '/bias',       pro: false },
  { label: 'Live News',         icon: Newspaper,       path: '/news',       pro: false },
  { label: 'Econ Calendar',     icon: Calendar,        path: '/calendar',   pro: false },
  { label: 'Currency Strength', icon: BarChart2,       path: '/strength',   pro: true },
  { label: 'Prop Firm Mode',    icon: ShieldCheck,     path: '/prop-firm',  pro: true },
  { label: 'Event Playbooks',   icon: BookOpen,        path: '/playbooks',  pro: true },
  { label: 'COT Report',        icon: PieChart,        path: '/cot',        pro: true },
  { label: 'Earnings',          icon: Calendar,        path: '/earnings',   pro: true },
  { label: 'MarketMovers Radar',icon: Flag,            path: '/trump',      pro: true },
  { label: 'Trade Journal',     icon: BookOpen,        path: '/journal',    pro: true },
]

export default function Sidebar({ onClose }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, isPro, logout } = useAuth()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const handleNav = (path, isProFeature) => {
    // Always navigate — the page itself will show upgrade wall if needed
    navigate(path)
    onClose?.()
  }

  const email = user?.email || ''
  const initial = email.charAt(0).toUpperCase() || 'U'
  const planLabel = isPro ? 'Pro' : 'Free'

  return (
    <div className="w-[240px] h-full bg-[#020617] border-r border-white/10 flex flex-col">

      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/10 flex items-center justify-between">
        <div
          className="flex items-center gap-2.5 cursor-pointer"
          onClick={() => handleNav('/dashboard', false)}
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-emerald-500 flex items-center justify-center shrink-0">
            <Activity size={16} className="text-black" strokeWidth={3} />
          </div>
          <div>
            <div className="text-sm font-black tracking-tight text-white leading-none">
              Bias<span className="text-cyan-400">Forge</span>
            </div>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full mt-0.5 inline-block ${
              isPro 
                ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/20'
                : 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
            }`}>
              {planLabel}
            </span>
          </div>
        </div>

        <button
          onClick={onClose}
          className="md:hidden text-slate-500 hover:text-white transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const isActive = location.pathname === item.path
          const isLocked = item.pro && !isPro

          return (
            <button
              key={item.path}
              onClick={() => handleNav(item.path, item.pro)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 text-left group ${
                isActive
                  ? 'bg-cyan-500/10 border-l-2 border-cyan-400 text-white pl-[10px]'
                  : isLocked
                  ? 'text-slate-500 hover:text-slate-400 hover:bg-white/[0.02] border-l-2 border-transparent'
                  : 'text-slate-400 hover:text-white hover:bg-white/5 border-l-2 border-transparent'
              }`}
            >
              <Icon
                size={16}
                className={
                  isActive ? 'text-cyan-400' 
                  : isLocked ? 'text-slate-600' 
                  : 'text-slate-500 group-hover:text-slate-300'
                }
              />
              <span className={isLocked ? 'text-slate-500' : ''}>{item.label}</span>
              {isLocked && (
                <Lock size={10} className="ml-auto text-amber-500/60" />
              )}
              {isActive && !isLocked && (
                <ChevronRight size={12} className="ml-auto text-cyan-400/60" />
              )}
            </button>
          )
        })}
      </nav>

      {/* Upgrade banner for free users */}
      {!isPro && (
        <div className="mx-3 mb-3">
          <button
            onClick={() => navigate('/pricing')}
            className="w-full px-3 py-3 rounded-xl bg-gradient-to-r from-cyan-500/10 to-emerald-500/10 border border-cyan-500/20 text-center hover:border-cyan-500/40 transition-all"
          >
            <p className="text-[11px] font-bold text-cyan-400">Upgrade to Pro</p>
            <p className="text-[9px] text-slate-500 mt-0.5">Unlock all features</p>
          </button>
        </div>
      )}

      <div className="mx-3 border-t border-white/10" />

      <div className="px-3 py-4 space-y-1">
        <button
          onClick={() => handleNav('/settings', false)}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-all duration-150"
        >
          <Settings size={16} className="text-slate-500" />
          Settings
        </button>

        <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 mt-2">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-400 to-emerald-500 flex items-center justify-center text-black text-xs font-bold shrink-0">
            {initial}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-white font-medium truncate">{email}</p>
            <p className={`text-[10px] ${isPro ? 'text-cyan-400' : 'text-amber-400'}`}>{planLabel} Plan</p>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-red-400 hover:bg-red-500/5 transition-all duration-150 group"
        >
          <LogOut size={16} className="text-slate-500 group-hover:text-red-400" />
          Sign Out
        </button>
      </div>
    </div>
  )
}