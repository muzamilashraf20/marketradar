import { Plus } from 'lucide-react'
import SectionHeader from '../../ui/SectionHeader'
import { FAQ } from './faqData'

/* FAQ — inline on this page, never a separate route.

   Built on <details>/<summary> rather than React state: it opens, closes and
   takes keyboard focus with JavaScript disabled, and every answer is present in
   the markup whether or not it is open — which is what the crawler reads. */
export default function Faq() {
  return (
    <section id="faq" className="px-5 sm:px-8 py-16">
      <div className="mx-auto max-w-5xl">
        <SectionHeader eyebrow="Questions" title="What traders ask before signing up." size="lg" />

        <div className="mt-12 bf-hairline-t">
          {/* The first three are answered beside the pricing card. Repeating them
              here would put the same copy on the page twice. */}
          {FAQ.slice(3).map(({ q, a }) => (
            <details key={q} className="group bf-hairline-b">
              <summary className="flex items-start justify-between gap-6 py-5 cursor-pointer list-none rounded-sm [&::-webkit-details-marker]:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bf-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-bf-bg">
                <h3 className="text-[15.5px] font-medium text-bf-text leading-snug">{q}</h3>
                <Plus
                  size={16}
                  strokeWidth={2}
                  className="mt-0.5 shrink-0 text-bf-muted motion-safe:transition-transform motion-safe:duration-200 group-open:rotate-45"
                  aria-hidden="true"
                />
              </summary>
              <p className="pb-6 pr-10 text-[14.5px] leading-[1.75] text-bf-text-2">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
