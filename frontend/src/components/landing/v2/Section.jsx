import { useReveal } from './useReveal'
import SectionHeader from '../../ui/SectionHeader'

/* The section rhythm, applied without exception:
     small cyan uppercase eyebrow → large headline → one sentence → one visual.
   Every section on the page renders through this, so the spacing is identical
   down the whole page and the restraint holds.

   The heading itself is the design system's SectionHeader, so the landing page
   and the app share one heading style. `action` sits to its right from sm up. */
export function Section({ id, eyebrow, headline, action, children, className = '', wide = false }) {
  // Everything marked data-reveal inside here rises and fades as the section
  // scrolls in, ~80ms apart, in document order: eyebrow, headline, body, visual.
  const ref = useReveal()

  return (
    <section ref={ref} id={id} className={`px-5 sm:px-8 py-16 ${className}`}>
      {/* py-16 puts 128px between every pair of sections, the floor of the
          allowed range. Content caps at 1024px, or 1088px on the wider sections — both inside
          the 900–1100px measure. Nothing bleeds past it except the hero. */}
      <div className={`mx-auto ${wide ? 'max-w-[68rem]' : 'max-w-5xl'}`}>
        <div data-reveal>
          <SectionHeader
            eyebrow={eyebrow}
            title={<span className="block max-w-[22ch]">{headline}</span>}
            action={action}
            size="lg"
          />
        </div>
        {children}
      </div>
    </section>
  )
}

/* One sentence. Never two paragraphs — the empty space is doing the work. */
export function Lede({ children, className = '' }) {
  return <p className={`bf-body mt-6 max-w-[46rem] ${className}`} data-reveal>{children}</p>
}

/* An in-copy link to the macro journal. Underlined on hover only, so the body
   copy still reads as prose rather than as a link dump. */
export function Ref({ href, children }) {
  return (
    <a
      href={href}
      className="text-slate-300 underline decoration-slate-700 underline-offset-[3px] hover:text-cyan-400 hover:decoration-cyan-500/60 transition-colors"
    >
      {children}
    </a>
  )
}



