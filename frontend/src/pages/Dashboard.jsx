import DashboardLayout from '../components/layout/DashboardLayout'
import MetricCard from '../components/ui/MetricCard'
import BiasTable from '../components/dashboard/BiasTable'

export default function Dashboard() {
  return (
    <DashboardLayout title="Market Overview" subtitle="Real-time bias & session analysis">

      {/* Metric Cards Row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, minmax(0,1fr))',
        gap: '12px',
        marginBottom: '1.5rem',
      }}>
        <MetricCard
          label="Active Setups"
          value="12"
          change="+3 today"
          changeType="up"
        />
        <MetricCard
          label="DXY Index"
          value="104.32"
          change="-0.18%"
          changeType="down"
        />
        <MetricCard
          label="Bullish Pairs"
          value="4"
          change="of 7 pairs"
          changeType="neutral"
        />
        <MetricCard
          label="Risk Sentiment"
          value="OFF"
          change="Risk-off mode"
          changeType="down"
        />
      </div>

      {/* Main Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '1rem',
      }}>
        <BiasTable />

        {/* Session Placeholder */}
        <div className="card" style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '300px',
        }}>
          <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>◷</div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Session Indicator
            </div>
            <div style={{ fontSize: '11px', marginTop: '6px' }}>
              Drop your existing component here
            </div>
          </div>
        </div>
      </div>

    </DashboardLayout>
  )
}