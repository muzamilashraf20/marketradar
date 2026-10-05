import DashboardLayout from '../components/layout/DashboardLayout'
import Card from '../components/ui/Card'

/* Bias History: the closed-call record — pair, direction, status, close reason,
   conviction on the 40–92 scale with its grade, opened and closed times. No win
   rate and no "correct / wrong": the engine records why a call closed, not
   whether it was right.

   Phase 4A placeholder so the Bias section's link has somewhere to go. The page
   itself is built in 4D. */
export default function BiasHistory() {
  return (
    <DashboardLayout title="Bias History" subtitle="Every closed call and why it closed">
      <Card padding="lg" className="max-w-xl">
        <h2 className="text-sm font-semibold text-bf-text">The closed-call record is on its way</h2>
        <p className="mt-2 text-sm leading-relaxed text-bf-text-2">
          Every bias the engine closes will be listed here with its pair, direction, close reason,
          conviction and the times it opened and closed.
        </p>
      </Card>
    </DashboardLayout>
  )
}
