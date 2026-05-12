import { BrowserRouter, Routes, Route } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import Dashboard from './pages/Dashboard'
import NewsFeed from './pages/NewsFeed'
import TrumpTracker from './pages/TrumpTracker'
import BiasMatrix from './pages/BiasMatrix'
import EconomicCalendar from './pages/EconomicCalendar'
import Sessions from './pages/Sessions'
import COTReport from './pages/COTReport'
import Pricing from './pages/Pricing'
import Login from './pages/Login'
import Terms from './pages/Terms'
import Privacy from './pages/Privacy'
import Refund from './pages/Refund'
import Contact from './pages/Contact'
import Blog from './pages/Blog'
import Changelog from './pages/Changelog'
import DashboardLayout from './components/layout/DashboardLayout'
import ProtectedRoute from './components/common/ProtectedRoute'

function ComingSoon({ title }) {
  return (
    <DashboardLayout title={title} subtitle="Coming Soon">
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '60vh', flexDirection: 'column', gap: '12px'
      }}>
        <div style={{ fontSize: '48px' }}>🚧</div>
        <div style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)' }}>{title}</div>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>This feature is coming soon</div>
      </div>
    </DashboardLayout>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public Routes */}
        <Route path="/landing" element={<LandingPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/refund" element={<Refund />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/blog" element={<Blog />} />
        <Route path="/changelog" element={<Changelog />} />
        <Route path="/pricing" element={<Pricing />} />

        {/* Protected Routes */}
        <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/sessions" element={<ProtectedRoute><Sessions /></ProtectedRoute>} />
        <Route path="/calendar" element={<ProtectedRoute><EconomicCalendar /></ProtectedRoute>} />
        <Route path="/cot" element={<ProtectedRoute><COTReport /></ProtectedRoute>} />
        <Route path="/news" element={<ProtectedRoute><NewsFeed /></ProtectedRoute>} />
        <Route path="/trump" element={<ProtectedRoute><TrumpTracker /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  )
}