import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import OnboardingTour from '../common/OnboardingTour'
import { useAuth } from '../../context/AuthContext'
import { AlertTriangle, ArrowRight } from 'lucide-react'

export default function DashboardLayout({ title, subtitle, children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const navigate = useNavigate()
  const { trialExpired, isActualPro } = useAuth()

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      if (e.altKey) {
        switch (e.key.toLowerCase()) {
          case 'b': e.preventDefault(); navigate('/bias'); break
          case 'n': e.preventDefault(); navigate('/news'); break
          case 'c': e.preventDefault(); navigate('/calendar'); break
          case 'j': e.preventDefault(); navigate('/journal'); break
          case 'p': e.preventDefault(); navigate('/prop-firm'); break
          case 'd': e.preventDefault(); navigate('/'); break
          case 's': e.preventDefault(); navigate('/strength'); break
          default: break
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [navigate])

  // Full lock wall when trial expired
  const pathname = window.location.pathname
  const showLockWall = trialExpired && !isActualPro && pathname !== '/settings'

  return (
    <div className="min-h-screen bg-[#030712] text-white flex">

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed top-0 left-0 h-full z-30 transition-transform duration-300
        md:translate-x-0 md:static md:block
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </aside>

      {/* Main area */}
      <div className="flex-1 min-w-0 flex flex-col min-h-screen md:ml-0">

        {/* Topbar */}
        <Topbar
          title={title}
          subtitle={subtitle}
          onMenuClick={() => setSidebarOpen(true)}
        />

        {/* Page content OR lock wall */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          {showLockWall ? (
            <div className="max-w-lg mx-auto text-center py-16">
              <div className="w-20 h-20 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-6">
                <AlertTriangle size={36} className="text-red-400" />
              </div>

              <h1 className="text-3xl font-black text-white mb-3">
                Subscribe to Unlock BiasForge
              </h1>
              <p className="text-slate-400 text-sm mb-8 max-w-md mx-auto leading-relaxed">
                BiasForge is a paid subscription. Upgrade to Pro to unlock AI Bias,
                Prop Firm Mode, News Scoring, Currency Strength, and all premium tools.
              </p>

              <button
                onClick={() => window.open('https://biasforge.gumroad.com/l/ntjpje', '_blank')}
                className="px-8 py-4 bg-gradient-to-r from-cyan-500 to-emerald-500 text-black text-sm font-bold rounded-xl hover:opacity-90 transition-all flex items-center gap-2 mx-auto shadow-lg shadow-cyan-500/20"
              >
                Upgrade to Pro — $40/mo
                <ArrowRight size={16} />
              </button>

              <p className="text-[11px] text-slate-600 mt-4">
                Cancel anytime · Secure payment via Gumroad
              </p>

              <button
                onClick={() => {
                  // go to landing
                  navigate('/landing')
                }}
                className="mt-6 text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                ← Back to homepage
              </button>
            </div>
          ) : (
            <div className="max-w-7xl mx-auto">
              {children}
            </div>
          )}
        </main>

      </div>

      {/* Onboarding tour for first-time users */}
      {!showLockWall && <OnboardingTour />}
    </div>
  )
}