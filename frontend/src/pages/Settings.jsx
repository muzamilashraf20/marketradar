import DashboardLayout from '../components/layout/DashboardLayout'
import { Settings, User, Bell, Shield, CreditCard, LogOut } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'

const SECTIONS = [
  {
    label: 'Profile',
    icon: User,
    fields: [
      { name: 'Full Name', placeholder: 'Your name', type: 'text' },
      { name: 'Email', placeholder: 'your@email.com', type: 'email' },
    ],
  },
  {
    label: 'Notifications',
    icon: Bell,
    fields: [
      { name: 'Email Alerts', placeholder: null, type: 'toggle', defaultOn: true },
      { name: 'Bias Change Alerts', placeholder: null, type: 'toggle', defaultOn: true },
      { name: 'Event Reminders', placeholder: null, type: 'toggle', defaultOn: false },
    ],
  },
  {
    label: 'Security',
    icon: Shield,
    fields: [
      { name: 'Current Password', placeholder: '••••••••', type: 'password' },
      { name: 'New Password', placeholder: '••••••••', type: 'password' },
    ],
  },
]

function ToggleSwitch({ defaultOn }) {
  return (
    <label className="relative inline-flex items-center cursor-pointer">
      <input type="checkbox" defaultChecked={defaultOn} className="sr-only peer" />
      <div className="w-10 h-5 bg-white/10 peer-checked:bg-cyan-500 rounded-full transition-colors duration-200 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-5" />
    </label>
  )
}

export default function SettingsPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const email = user?.email || ''
  const plan = user?.plan || 'Pro'

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-8">

        {/* Header */}
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
              <Settings size={18} className="text-cyan-400" />
            </div>
            <h1 className="text-xl font-bold text-white">Settings</h1>
          </div>
          <p className="text-slate-400 text-sm ml-12">
            Manage your account, preferences, and notifications.
          </p>
        </div>

        {/* Account Badge */}
        <div className="flex items-center gap-4 px-5 py-4 rounded-xl border border-white/10 bg-white/5">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-400 to-emerald-500 flex items-center justify-center text-black font-bold text-sm shrink-0">
            {email.charAt(0).toUpperCase() || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-sm truncate">{email}</p>
            <p className="text-cyan-400 text-xs">{plan} Plan</p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full border border-cyan-500/20 bg-cyan-500/10 text-cyan-400">
            Active
          </span>
        </div>

        {/* Setting Sections */}
        {SECTIONS.map((section) => {
          const Icon = section.icon
          return (
            <div key={section.label} className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
              <div className="flex items-center gap-2.5 px-5 py-4 border-b border-white/10">
                <Icon size={15} className="text-cyan-400" />
                <h2 className="text-sm font-semibold text-white">{section.label}</h2>
              </div>
              <div className="px-5 py-4 space-y-4">
                {section.fields.map((field) => (
                  <div key={field.name} className="flex items-center justify-between gap-4">
                    <label className="text-sm text-slate-400 shrink-0">{field.name}</label>
                    {field.type === 'toggle' ? (
                      <ToggleSwitch defaultOn={field.defaultOn} />
                    ) : (
                      <input
                        type={field.type}
                        placeholder={field.placeholder}
                        className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 w-56 transition-colors"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        })}

        {/* Billing */}
        <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
          <div className="flex items-center gap-2.5 px-5 py-4 border-b border-white/10">
            <CreditCard size={15} className="text-cyan-400" />
            <h2 className="text-sm font-semibold text-white">Billing</h2>
          </div>
          <div className="px-5 py-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-white font-medium">{plan} Plan</p>
              <p className="text-xs text-slate-500 mt-0.5">Manage your subscription and billing details</p>
            </div>
            <button className="text-xs font-semibold px-3 py-2 rounded-lg border border-white/10 text-slate-300 hover:text-white hover:border-white/20 transition-colors">
              Manage
            </button>
          </div>
        </div>

        {/* Save + Logout */}
        <div className="flex items-center justify-between pb-8">
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-red-400 transition-colors"
          >
            <LogOut size={15} />
            Sign Out
          </button>
          <button className="px-5 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-sm transition-colors">
            Save Changes
          </button>
        </div>

      </div>
    </DashboardLayout>
  )
}