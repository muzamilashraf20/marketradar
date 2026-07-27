import SimplePageLayout from '../components/common/SimplePageLayout'

const sections = [
  {
    title: '1. Acceptance of Terms',
    content:
      'By accessing or using BiasForge, you agree to be bound by these Terms of Service. If you do not agree, please do not use our platform.',
  },
  {
    title: '2. Use of Service',
    content:
      'BiasForge provides financial market analysis tools for informational purposes only. You agree not to misuse the platform, attempt unauthorized access, or use it for unlawful purposes.',
  },
  {
    title: '3. No Financial Advice',
    content:
      'All content on BiasForge is for informational and educational purposes only. Nothing on this platform constitutes financial, investment, or trading advice. Always do your own research.',
  },
  {
    title: '4. Subscription & Billing',
    content:
      'Paid plans are billed monthly or annually. You may cancel at any time. Refunds are handled per our Refund Policy. We reserve the right to change pricing with 30 days notice.',
  },
  {
    title: '5. Intellectual Property',
    content:
      'All content, branding, and technology on BiasForge is owned by BiasForge and protected by applicable intellectual property laws. You may not copy or redistribute our content.',
  },
  {
    title: '6. Termination',
    content:
      'We reserve the right to suspend or terminate your account if you violate these terms. You may also delete your account at any time by contacting support.',
  },
  {
    title: '7. Limitation of Liability',
    content:
      'BiasForge is not liable for any trading losses, damages, or decisions made based on information from our platform. Use at your own risk.',
  },
  {
    title: '8. Changes to Terms',
    content:
      'We may update these terms from time to time. Continued use of the platform after changes constitutes acceptance of the new terms.',
  },
]

export default function Terms() {
  return (
    <SimplePageLayout
      title="Terms of Service"
      subtitle="Last updated: May 2026 — Please read these terms carefully before using BiasForge"
    >
      <div className="space-y-8">
        {sections.map((s) => (
          <div key={s.title}>
            <h2 className="text-lg font-semibold text-white mb-2">{s.title}</h2>
            <p className="text-slate-400 leading-relaxed">{s.content}</p>
          </div>
        ))}

        <div className="mt-12 p-4 rounded-xl border border-cyan-500/20 bg-cyan-500/5 text-slate-400 text-sm">
          Questions about our terms? Contact us at{' '}
          <a href="mailto:support@biasforge.co" className="text-cyan-400 hover:underline">
            support@biasforge.co
          </a>
        </div>
      </div>
    </SimplePageLayout>
  )
}