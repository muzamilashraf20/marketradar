import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../components/layout/DashboardLayout'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'

/* Billing: plan, receipts and cancellation, split out of Settings.

   Phase 4A placeholder so the Account section's link has somewhere to go. The
   real page — the same /api/billing/* calls Settings makes today — replaces
   this in 4B; until then the billing panel still lives in Settings. */
export default function Billing() {
  const navigate = useNavigate()
  return (
    <DashboardLayout title="Billing" subtitle="Plan, receipts and cancellation">
      <Card padding="lg" className="max-w-xl">
        <h2 className="text-sm font-semibold text-bf-text">Billing is moving here</h2>
        <p className="mt-2 text-sm leading-relaxed text-bf-text-2">
          For now your plan, receipts and cancellation request are in Settings, under Billing.
        </p>
        <Button className="mt-5" variant="secondary" onClick={() => navigate('/settings')}>
          Open Settings
        </Button>
      </Card>
    </DashboardLayout>
  )
}
