import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Menu, Search, Bell, Settings, LogOut, User, ChevronDown } from 'lucide-react'

function getSession() {
  const hour = new Date().getUTCHours()
  if (hour >= 0  && hour < 7)  return { name: 'Tokyo',    color: 'text-purple-400',  dot: 'bg-purple-400' }
  if (hour >= 7  && hour < 13) return { name: 'London',   color: 'text-blue-400',    dot: 'bg-blue-400' }
  if (hour >= 13 && hour < 22) return { name: 'New York',  color: 'text-amber-400',   dot: 'bg-amber-400' }
  return { name: 'Sydney', color: 'text-slate-400', dot: 'bg-slate-400' }
}

export default function Topbar({ title, subtitle, onMenuClick }) {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const [time, setTime] = useState('')
  const [session, setSession] = useState(getSession())
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef(null)

  useEffect(() => {
    const update = () => {
      const now = new Date()
      setTime(now.toUTCString().slice(17, 25))
      setSession(getSession())
    }
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const email = user?.email || ''
  const initial = email.charAt(0).toUpperCase() || 'U'

  return (
    <header className="sticky top-0 z-10 h-14 bg-[#020617]/90 backdrop-blur-md border-b border-white/10 flex items-center justify-between px-4 md:px-6 shrink-0">

      {/* Left — Hamburger + Title */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="md:hidden text-slate-400 hover:text-white transition-colors p-1"
        >
          <Menu size={20} />
        </button>
        <div>
          {title && (
            <h1 className="text-sm font-bold text-white leading-none">{title}</h1>
          )}
          {subtitle && (
            <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>

      {/* Center — Session indicator */}
      <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
        <span className={`w-1.5 h-1.5 rounded-full ${session.dot} animate-pulse`} />
        <span className={`text-xs font-semibold ${session.color}`}>
          {session.name} Session
        </span>
        <span className="text-slate-600 text-xs">·</span>
        <span className="text-slate-400 text-xs font-mono">{time} UTC</span>
      </div>

      {/* Right — Actions */}
      <div className="flex items-center gap-1 md:gap-2">

        {/* Search */}
        <button className="p-2 text-slate-500 hover:text-white hover:bg-white/5 rounded-lg transition-all">
          <Search size={16} />
        </button>

        {/* Notifications */}
        <button className="p-2 text-slate-500 hover:text-white hover:bg-white/5 rounded-lg transition-all relative">
          <Bell size={16} />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-cyan-400" />
        </button>

        {/* User Avatar + Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-lg hover:bg-white/5 transition-all"
          >
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-400 to-emerald-500 flex items-center justify-center text-black text-xs font-bold">
              {initial}
            </div>
            <span className="hidden md:block text-xs text-slate-300 max-w-[120px] truncate">
              {email}
            </span>
            <ChevronDown
              size={14}
              className={`text-slate-500 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {/* Dropdown */}
          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-48 bg-[#0a1628] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50">

              {/* User info */}
              <div className="px-4 py-3 border-b border-white/10">
                <p className="text-xs text-white font-semibold truncate">{email}</p>
                <p className="text-[10px] text-cyan-400 mt-0.5">Pro Plan</p>
              </div>

              {/* Menu items */}
              <div className="py-1">
                <button
                  onClick={() => { navigate('/profile'); setDropdownOpen(false) }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-400 hover:text-white hover:bg-white/5 transition-all"
                >
                  <User size={14} />
                  Profile
                </button>
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
  )
}