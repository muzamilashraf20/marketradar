import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import OnboardingTour from '../common/OnboardingTour'
import WelcomeToast from '../common/WelcomeToast'
import { useAuth } from '../../context/AuthContext'

/* The app shell: sidebar, topbar and the page. It no longer decides access —
   there is no lock wall here. RequirePro (App.jsx) settles that before a page
   mounts, so whatever renders inside this shell is a page the account may see. */
export default function DashboardLayout({ title, subtitle, children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const navigate = useNavigate()
  const { isPro } = useAuth()

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
          case 'd': e.preventDefault(); navigate('/today'); break
          case 's': e.preventDefault(); navigate('/strength'); break
          default: break
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [navigate])

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

        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>

      </div>

      {/* Onboarding tour for first-time subscribers. Not for an unpaid account on
          Settings or Billing: every page it points at would send them to checkout. */}
      {isPro && <OnboardingTour />}

      {/* "Welcome to Pro" after a payment the subscribe screen was waiting for. */}
      <WelcomeToast />
    </div>
  )
}