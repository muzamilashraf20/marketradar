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
import DashboardLayout from './components/layout/DashboardLayout'

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
        <Route path="/landing" element={<LandingPage />} />
        <Route path="/" element={<Dashboard />} />
        <Route path="/bias" element={<BiasMatrix />} />
        <Route path="/sessions" element={<Sessions />} />
        <Route path="/calendar" element={<EconomicCalendar />} />
        <Route path="/cot" element={<COTReport />} />
        <Route path="/news" element={<NewsFeed />} />
        <Route path="/trump" element={<TrumpTracker />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/login" element={<Login />} />
      </Routes>
    </BrowserRouter>
  )
}