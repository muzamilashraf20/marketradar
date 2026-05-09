import Sidebar from './Sidebar'
import Topbar from './Topbar'

export default function DashboardLayout({ children, title, subtitle }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-base)' }}>
      <Sidebar />
      <main style={{ marginLeft: '220px', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Topbar title={title} subtitle={subtitle} />
        <div style={{ padding: '1.5rem', flex: 1 }}>
          {children}
        </div>
      </main>
    </div>
  )
}