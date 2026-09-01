import { useReveal } from './useReveal'

/* The section rhythm, applied without exception:
     small cyan uppercase eyebrow → large headline → one sentence → one visual.
   Every section on the page renders through this, so the spacing is identical
   down the whole page and the restraint holds. */
export function Section({ id, eyebrow, headline, children, className = '', wide = false }) {
  // Everything marked data-reveal inside here rises and fades as the section
  // scrolls in, ~80ms apart, in document order: eyebrow, headline, body, visual.
  const ref = useReveal()

  return (
    <section ref={ref} id={id} className={`px-5 sm:px-8 py-20 sm:py-28 ${className}`}>
      <div className={`mx-auto ${wide ? 'max-w-6xl' : 'max-w-5xl'}`}>
        <p className="bf-eyebrow" data-reveal>{eyebrow}</p>
        <h2 className="bf-h2 mt-5 max-w-[22ch]" data-reveal>{headline}</h2>
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

/* Product screenshot. Explicit width/height on every one of these — the browser
   reserves the exact box before the file arrives, which is what keeps
   cumulative layout shift at zero on a page that is mostly images below the fold. */
export function Shot({ src, alt, width, height, className = '', priority = false, reveal = true }) {
  return (
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      // Off when an ancestor is the reveal target instead — an image that
      // animates independently of its own annotations pulls them apart.
      {...(reveal ? { 'data-reveal': '' } : {})}
      className={`w-full h-auto rounded-xl bf-hairline shadow-[0_18px_50px_-20px_rgba(0,0,0,0.9)] ${className}`}
    />
  )
}
