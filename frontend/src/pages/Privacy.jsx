import SimplePageLayout from '../components/common/SimplePageLayout'

const sections = [
  {
    title: '1. Information We Collect',
    content:
      'We collect information you provide directly: name, email address, and payment information when you register or subscribe. We also collect usage data such as pages visited, features used, and session duration.',
  },
  {
    title: '2. How We Use Your Information',
    content:
      'We use your information to provide and improve our services, process payments, send important account notifications, and respond to support requests. We do not sell your personal data to third parties.',
  },
  {
    title: '3. Data Storage & Security',
    content:
      'Your data is stored securely using Supabase with industry-standard encryption. Payment processing is handled by Gumroad — we never store your full card details on our servers.',
  },
  {
    title: '4. Cookies',
    content:
      'We use essential cookies to keep you logged in and remember your preferences. We do not use tracking or advertising cookies. You can disable cookies in your browser settings.',
  },
  {
    title: '5. Third-Party Services',
    content:
      'We use trusted third-party services including Supabase (auth & database), Gumroad (payments), and TwelveData (market data). Each has their own privacy policy.',
  },
  {
    title: '6. Your Rights',
    content:
      'You have the right to access, correct, or delete your personal data at any time. To make a request, contact us at privacy@biasforge.co. We will respond within 30 days.',
  },
  {
    title: '7. Data Retention',
    content:
      'We retain your data for as long as your account is active. If you delete your account, your personal data is removed within 30 days, except where required by law.',
  },
  {
    title: '8. Changes to This Policy',
    content:
      'We may update this Privacy Policy periodically. We will notify you via email of any significant changes. Continued use of BiasForge constitutes acceptance.',
  },
]

export default function Privacy() {
  return (
    <SimplePageLayout
      title="Privacy Policy"
      subtitle="Last updated: May 2026 — Your privacy matters to us. Here is how we handle your data."
    >
      <div className="space-y-8">
        {sections.map((s) => (
          <div key={s.title}>
            <h2 className="text-lg font-semibold text-white mb-2">{s.title}</h2>
            <p className="text-slate-400 leading-relaxed">{s.content}</p>
          </div>
        ))}

        <div className="mt-12 p-4 rounded-xl border border-cyan-500/20 bg-cyan-500/5 text-slate-400 text-sm">
          Privacy concerns? Contact us at{' '}
          <a href="mailto:privacy@biasforge.co" className="text-cyan-400 hover:underline">
            privacy@biasforge.co
          </a>
        </div>
      </div>
    </SimplePageLayout>
  )
}