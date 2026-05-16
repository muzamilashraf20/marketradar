import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
  LayoutDashboard, TrendingUp, Newspaper, Calendar,
  ShieldCheck, BookOpen, PieChart, DollarSign, Flag,
  Settings, LogOut, Activity, X, ChevronRight, BarChart2
} from 'lucide-react'

const NAV_ITEMS = [
  { label: 'Overview',          icon: LayoutDashboard, path: '/dashboard' },
  { label: 'AI Bias',           icon: TrendingUp,      path: '/bias' },
  { label: 'Live News',         icon: Newspaper,       path: '/news' },
  { label: 'Econ Calendar',     icon: Calendar,        path: '/calendar' },
  { label: 'Currency Strength', icon: BarChart2,       path: '/strength' },
  { label: 'Prop Firm Mode',    icon: ShieldCheck,     path: '/prop-firm' },
  { label: 'Event Playbooks',   icon: BookOpen,        path: '/playbooks' },
  { label: 'COT Report',        icon: PieChart,        path: '/cot' },
  { label: 'Trump Tracker',     icon: Flag,            path: '/trump' },
]

export default function Sidebar({ onClose }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuth()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const handleNav = (path) => {
    navigate(path)
    onClose?.()
  }

  const email = user?.email || ''
  const initial = email.charAt(0).toUpperCase() || 'U'
  const plan = user?.plan || 'Pro'

  return (
    <div className="w-[240px] h-full bg-[#020617] border-r border-white/10 flex flex-col">

      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/10 flex items-center justify-between">
        <div
          className="flex items-center gap-2.5 cursor-pointer"
          onClick={() => handleNav('/dashboard')}
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-emerald-500 flex items-center justify-center shrink-0">
            <Activity size={16} className="text-black" strokeWidth={3} />
          </div>
          <div>
            <div className="text-sm font-black tracking-tight text-white leading-none">
              Bias<span className="text-cyan-400">Forge</span>
              <span className="text-slate-500 text-xs font-medium">.ai</span>
            </div>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400 border border-cyan-500/20 mt-0.5 inline-block">
              {plan}
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
          return (
            <button
              key={item.path}
              onClick={() => handleNav(item.path)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 text-left group ${
                isActive
                  ? 'bg-cyan-500/10 border-l-2 border-cyan-400 text-white pl-[10px]'
                  : 'text-slate-400 hover:text-white hover:bg-white/5 border-l-2 border-transparent'
              }`}
            >
              <Icon
                size={16}
                className={isActive ? 'text-cyan-400' : 'text-slate-500 group-hover:text-slate-300'}
              />
              <span>{item.label}</span>
              {isActive && (
                <ChevronRight size={12} className="ml-auto text-cyan-400/60" />
              )}
            </button>
          )
        })}
      </nav>

      <div className="mx-3 border-t border-white/10" />

      <div className="px-3 py-4 space-y-1">
        <button
          onClick={() => handleNav('/settings')}
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
            <p className="text-[10px] text-cyan-400">{plan} Plan</p>
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