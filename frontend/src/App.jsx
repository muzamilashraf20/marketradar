import Earnings from './pages/EarningsCalendar'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'

import LandingV2 from './pages/LandingV2'
import AboutPage from './pages/About'
import Login from './pages/Login'
import ResetPassword from './pages/ResetPassword'
import Dashboard from './pages/Dashboard'
import NewsFeed from './pages/NewsFeed'
import MarketMoversRadar from './pages/MarketMoversRadar'
import BiasMatrix from './pages/BiasMatrix'
import BiasHistory from './pages/BiasHistory'
import EconomicCalendar from './pages/EconomicCalendar'
import COTReport from './pages/COTReport'
import Terms from './pages/Terms'
import Privacy from './pages/Privacy'
import Refund from './pages/Refund'
import Contact from './pages/Contact'
import Changelog from './pages/Changelog'
import PropFirm from './pages/PropFirm'
import Playbooks from './pages/Playbooks'
import SettingsPage from './pages/Settings'
import Billing from './pages/Billing'
import Subscribe from './pages/Subscribe'
import CurrencyStrength from './pages/CurrencyStrength'
import TradeJournal from './pages/TradeJournal'
import ContentStudio from './pages/ContentStudio'
import NotFound from './pages/NotFound'
import RequirePro from './components/common/RequirePro'
import { LegacyRedirect, DashboardRedirect, PricingRedirect } from './components/common/Redirects'

function RootRedirect() {
  const { user, loading } = useAuth()
  // Rendered in place, not redirected: / is the canonical URL and the one
  // page that ships prerendered. Bouncing it to /landing would throw that
  // HTML away and hand Google a redirect on its entry point. The landing is
  // also what shows while auth resolves, so there is no spinner flash over
  // markup the browser has already painted.
  return user && !loading ? <Navigate to="/today" replace /> : <LandingV2 />
}

const pro = page => <RequirePro>{page}</RequirePro>
const unpaid = page => <RequirePro allowUnpaid>{page}</RequirePro>

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootRedirect />} />

        {/* Public Routes */}
        <Route path="/landing" element={<LandingV2 />} />
        {/* The previous landing page is retired. Its files are kept (listed for
            the cleanup review); the path redirects so old links still land. */}
        <Route path="/landing-old" element={<Navigate to="/" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/refund" element={<Refund />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/changelog" element={<Changelog />} />

        {/* The app. No free tier: every page is Pro (RequirePro), except the few an
            unpaid account needs — the checkout screen, Settings and Billing. Paths
            are flat; the six areas (Today, Bias, Events, Markets, Account, Journal)
            exist in the sidebar grouping only — see components/layout/navConfig.js. */}
        <Route path="/today" element={pro(<Dashboard />)} />

        <Route path="/bias" element={pro(<BiasMatrix />)} />
        <Route path="/bias/history" element={pro(<BiasHistory />)} />
        <Route path="/strength" element={pro(<CurrencyStrength />)} />

        <Route path="/calendar" element={pro(<EconomicCalendar />)} />
        <Route path="/news" element={pro(<NewsFeed />)} />
        <Route path="/playbooks" element={pro(<Playbooks />)} />
        <Route path="/earnings" element={pro(<Earnings />)} />

        <Route path="/cot" element={pro(<COTReport />)} />
        <Route path="/market-movers" element={pro(<MarketMoversRadar />)} />

        <Route path="/prop-firm" element={pro(<PropFirm />)} />
        <Route path="/settings" element={unpaid(<SettingsPage />)} />
        <Route path="/billing" element={unpaid(<Billing />)} />

        <Route path="/journal" element={pro(<TradeJournal />)} />

        <Route path="/subscribe" element={unpaid(<Subscribe />)} />
        {/* Admin only — the page itself checks whoami and sends anyone else away */}
        <Route path="/studio" element={pro(<ContentStudio />)} />

        {/* Old paths, kept for good: bookmarks, Telegram and email alerts, Google
            sign-in's return URL and the crypto checkout's return URLs use them.
            Query string and hash are carried over. */}
        <Route path="/dashboard" element={<DashboardRedirect />} />
        <Route path="/sessions" element={<LegacyRedirect to="/today" />} />
        <Route path="/market-dashboard" element={<LegacyRedirect to="/today" />} />
        <Route path="/trump" element={<LegacyRedirect to="/market-movers" />} />
        <Route path="/pricing" element={<PricingRedirect />} />

        {/* 404 */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  )
}
