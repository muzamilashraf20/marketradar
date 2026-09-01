import Earnings from './pages/EarningsCalendar'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'

import LandingPage from './pages/LandingPage'
import LandingV2 from './pages/LandingV2'
import AboutPage from './pages/About'
import Login from './pages/Login'
import ResetPassword from './pages/ResetPassword'
import Dashboard from './pages/Dashboard'
import NewsFeed from './pages/NewsFeed'
import MarketMoversRadar from './pages/MarketMoversRadar'
import BiasMatrix from './pages/BiasMatrix'
import EconomicCalendar from './pages/EconomicCalendar'
import Sessions from './pages/Sessions'
import COTReport from './pages/COTReport'
import Pricing from './pages/Pricing'
import Terms from './pages/Terms'
import Privacy from './pages/Privacy'
import Refund from './pages/Refund'
import Contact from './pages/Contact'
import Changelog from './pages/Changelog'
import PropFirm from './pages/PropFirm'
import Playbooks from './pages/Playbooks'
import SettingsPage from './pages/Settings'
import CurrencyStrength from './pages/CurrencyStrength'
import TradeJournal from './pages/TradeJournal'
import NotFound from './pages/NotFound'
import ProtectedRoute from './components/common/ProtectedRoute'
import ProGate from './components/common/ProGate'

function RootRedirect() {
  const { user, loading } = useAuth()
  // Rendered in place, not redirected: / is the canonical URL and the one
  // page that ships prerendered. Bouncing it to /landing would throw that
  // HTML away and hand Google a redirect on its entry point. The landing is
  // also what shows while auth resolves, so there is no spinner flash over
  // markup the browser has already painted.
  return user && !loading ? <Navigate to="/dashboard" replace /> : <LandingV2 />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootRedirect />} />

        {/* Public Routes */}
        <Route path="/landing" element={<LandingV2 />} />
        {/* The previous landing page, kept reachable for side-by-side review. */}
        <Route path="/landing-old" element={<LandingPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/refund" element={<Refund />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/changelog" element={<Changelog />} />

        {/* Protected Routes — FREE users can access */}
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/bias" element={<ProtectedRoute><BiasMatrix /></ProtectedRoute>} />
        <Route path="/sessions" element={<ProtectedRoute><Sessions /></ProtectedRoute>} />
        <Route path="/calendar" element={<ProtectedRoute><EconomicCalendar /></ProtectedRoute>} />
        <Route path="/news" element={<ProtectedRoute><NewsFeed /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />

        {/* Protected Routes — PRO only */}
        <Route path="/strength" element={<ProtectedRoute><ProGate title="Currency Strength" subtitle="Real-time currency strength meter"><CurrencyStrength /></ProGate></ProtectedRoute>} />
        <Route path="/prop-firm" element={<ProtectedRoute><ProGate title="Prop Firm Mode" subtitle="Drawdown tracker & risk calculator"><PropFirm /></ProGate></ProtectedRoute>} />
        <Route path="/playbooks" element={<ProtectedRoute><ProGate title="Event Playbooks" subtitle="FOMC, NFP, CPI, ECB, BOE templates"><Playbooks /></ProGate></ProtectedRoute>} />
        <Route path="/cot" element={<ProtectedRoute><ProGate title="COT Report" subtitle="Institutional positioning data"><COTReport /></ProGate></ProtectedRoute>} />
        <Route path="/earnings" element={<ProtectedRoute><ProGate title="Earnings Calendar" subtitle="Upcoming earnings reports"><Earnings /></ProGate></ProtectedRoute>} />
        <Route path="/market-movers" element={<ProtectedRoute><ProGate title="MarketMovers Radar" subtitle="Track market-moving events"><MarketMoversRadar /></ProGate></ProtectedRoute>} />
        <Route path="/trump" element={<ProtectedRoute><ProGate title="MarketMovers Radar" subtitle="Track market-moving events"><MarketMoversRadar /></ProGate></ProtectedRoute>} />
        <Route path="/journal" element={<ProtectedRoute><ProGate title="Trade Journal" subtitle="Log trades & track P&L"><TradeJournal /></ProGate></ProtectedRoute>} />

        {/* 404 */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  )
}