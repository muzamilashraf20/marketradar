import SimplePageLayout from '../components/common/SimplePageLayout'

const steps = [
  { step: '01', title: 'Contact Support', desc: 'Email us at support@biasforge.ai within 30 days of your purchase with your account email and reason for refund.' },
  { step: '02', title: 'Review', desc: 'Our team will review your request within 2 business days and verify your eligibility based on our refund policy.' },
  { step: '03', title: 'Refund Issued', desc: 'If approved, your refund will be processed within 5–10 business days back to your original payment method.' },
]

const faqs = [
  { q: 'Can I get a refund after 30 days?', a: 'Refunds are only available within 30 days of purchase. After that period, we are unable to process refunds.' },
  { q: 'Are annual plans refundable?', a: 'Yes. Annual plans are eligible for a full refund within 30 days. After 30 days, we can offer a pro-rated credit.' },
  { q: 'What if the product did not work for me?', a: 'If you experienced technical issues we could not resolve, you are fully eligible for a refund regardless of timeframe.' },
  { q: 'How long does the refund take?', a: 'Once approved, refunds take 5–10 business days to appear depending on your bank or card provider.' },
]

export default function Refund() {
  return (
    <SimplePageLayout
      title="Refund Policy"
      subtitle="We offer a hassle-free 30-day money-back guarantee on all plans."
    >
      <div className="space-y-12">

        {/* Guarantee Badge */}
        <div className="p-6 rounded-2xl border border-cyan-500/20 bg-cyan-500/5 text-center">
          <div className="text-4xl mb-3">💰</div>
          <h2 className="text-xl font-bold text-white mb-2">30-Day Money-Back Guarantee</h2>
          <p className="text-slate-400 text-sm max-w-lg mx-auto">
            Not satisfied? Get a full refund within 30 days — no questions asked.
            We stand behind the quality of BiasForge.ai.
          </p>
        </div>

        {/* Steps */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-6">How to Request a Refund</h2>
          <div className="space-y-4">
            {steps.map((s) => (
              <div key={s.step} className="flex gap-4 p-4 rounded-xl border border-white/10 bg-white/5">
                <span className="text-cyan-400 font-bold font-mono text-lg shrink-0">{s.step}</span>
                <div>
                  <h3 className="text-white font-semibold mb-1">{s.title}</h3>
                  <p className="text-slate-400 text-sm leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* FAQ */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-6">Frequently Asked Questions</h2>
          <div className="space-y-4">
            {faqs.map((f) => (
              <div key={f.q} className="p-4 rounded-xl border border-white/10">
                <h3 className="text-white font-semibold mb-2 text-sm">{f.q}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{f.a}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 rounded-xl border border-cyan-500/20 bg-cyan-500/5 text-slate-400 text-sm">
          To request a refund, email{' '}
          <a href="mailto:support@biasforge.ai" className="text-cyan-400 hover:underline">
            support@biasforge.ai
          </a>
        </div>

      </div>
    </SimplePageLayout>
  )
}