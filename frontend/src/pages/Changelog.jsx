import { Zap } from 'lucide-react'
import SimplePageLayout from '../components/common/SimplePageLayout'

const releases = [
  {
    version: 'v1.0.0',
    date: 'May 2026',
    tag: 'Latest',
    tagColor: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
    changes: [
      'Launched BiasForge publicly',
      'Added Trump Tracker with real-time political impact analysis',
      'Economic Calendar with high/medium/low impact filters',
      'COT Report viewer with smart money positioning',
      'Sessions tracker with live market hours',
      'News Feed with sentiment tagging',
      'Pricing page with Basic & PRO plans via Gumroad',
    ],
  },
  {
    version: 'v0.9.0',
    date: 'April 2026',
    tag: 'Beta',
    tagColor: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
    changes: [
      'Complete dashboard UI overhaul with dark theme',
      'Added Bias Matrix page for currency strength analysis',
      'Integrated Supabase authentication (login & register)',
      'Gumroad checkout integration for paid plans',
      'Responsive sidebar navigation with collapsible support',
    ],
  },
  {
    version: 'v0.8.0',
    date: 'March 2026',
    tag: 'Alpha',
    tagColor: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    changes: [
      'Initial project setup with React + Vite + Tailwind',
      'Landing page with 14 sections completed',
      'Basic routing structure established',
      'TwelveData API integration for live prices',
      'Railway backend deployment configured',
    ],
  },
]

export default function Changelog() {
  return (
    <SimplePageLayout
      title="Changelog"
      subtitle="Track every update, improvement, and new feature added to BiasForge."
    >
      <div className="space-y-10">

        {releases.map((release) => (
          <div key={release.version} className="relative pl-6 border-l border-white/10">

            {/* Dot */}
            <div className="absolute -left-[5px] top-1 w-2.5 h-2.5 rounded-full bg-cyan-500" />

            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-lg font-bold text-white">{release.version}</h2>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${release.tagColor}`}>
                {release.tag}
              </span>
              <span className="text-slate-500 text-sm">{release.date}</span>
            </div>

            {/* Changes */}
            <div className="space-y-2">
              {release.changes.map((change) => (
                <div key={change} className="flex items-start gap-3">
                  <Zap className="w-3.5 h-3.5 text-cyan-400 mt-0.5 shrink-0" />
                  <span className="text-slate-400 text-sm leading-relaxed">{change}</span>
                </div>
              ))}
            </div>

          </div>
        ))}

        {/* Bottom Note */}
        <div className="p-4 rounded-xl border border-white/10 bg-white/5 text-slate-500 text-sm text-center">
          More updates coming soon — follow us on Discord for live announcements.
        </div>

      </div>
    </SimplePageLayout>
  )
}