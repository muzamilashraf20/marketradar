import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'

import LandingPage from './pages/LandingPage'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import NewsFeed from './pages/NewsFeed'
import TrumpTracker from './pages/TrumpTracker'
import BiasMatrix from './pages/BiasMatrix'
import EconomicCalendar from './pages/EconomicCalendar'
import Sessions from './pages/Sessions'
import COTReport from './pages/COTReport'
import Pricing from './pages/Pricing'
import Terms from './pages/Terms'
import Privacy from './pages/Privacy'
import Refund from './pages/Refund'
import Contact from './pages/Contact'
import Blog from './pages/Blog'
import Changelog from './pages/Changelog'
import PropFirm from './pages/PropFirm'
import Playbooks from './pages/Playbooks'
import SettingsPage from './pages/Settings'
import CurrencyStrength from './pages/CurrencyStrength'
import ProtectedRoute from './components/common/ProtectedRoute'

function RootRedirect() {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="min-h-screen bg-[#030712] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
    </div>
  )
  return user ? <Navigate to="/dashboard" replace /> : <Navigate to="/landing" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootRedirect />} />

        {/* Public Routes */}
        <Route path="/landing" element={<LandingPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/refund" element={<Refund />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/blog" element={<Blog />} />
        <Route path="/changelog" element={<Changelog />} />

        {/* Protected Routes */}
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/bias" element={<ProtectedRoute><BiasMatrix /></ProtectedRoute>} />
        <Route path="/sessions" element={<ProtectedRoute><Sessions /></ProtectedRoute>} />
        <Route path="/calendar" element={<ProtectedRoute><EconomicCalendar /></ProtectedRoute>} />
        <Route path="/cot" element={<ProtectedRoute><COTReport /></ProtectedRoute>} />
        <Route path="/news" element={<ProtectedRoute><NewsFeed /></ProtectedRoute>} />
        <Route path="/trump" element={<ProtectedRoute><TrumpTracker /></ProtectedRoute>} />
        <Route path="/prop-firm" element={<ProtectedRoute><PropFirm /></ProtectedRoute>} />
        <Route path="/playbooks" element={<ProtectedRoute><Playbooks /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
        <Route path="/strength" element={<ProtectedRoute><CurrencyStrength /></ProtectedRoute>} />

        <Route path="*" element={<Navigate to="/landing" replace />} />
      </Routes>
    </BrowserRouter>
  )
}