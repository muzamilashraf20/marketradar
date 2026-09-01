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

/* A product surface, not a picture of one.

   Every app capture is a full-page screenshot: the interface column occupies
   x 29.7%-79.7% and the rest is sidebar and empty gutter. Rendered whole they
   read as pasted screenshots — half dead space in a box. So each one declares
   the crop rectangle of its actual interface, in percent of the source.

   The crop is done in CSS rather than by rewriting the files: the frame sets an
   aspect-ratio (so the box is reserved before the image loads and CLS stays at
   zero) and the image is oversized and offset inside it. Re-cropping is then a
   number change, and the original captures stay intact on disk.

   `bleed` widens the frame past the text column so the interface runs wider than
   the prose, which is what makes it read as software rather than as an
   illustration. The width is capped against the viewport, so it can never cause
   a horizontal scrollbar. */
export function Screenshot({ src, alt, srcW, srcH, crop, bleed = false, className = '' }) {
  const { x = 0, y = 0, w = 100, h = 100 } = crop || {}
  // Aspect of the cropped region, in source pixels.
  const aspect = ((w / 100) * srcW) / ((h / 100) * srcH)

  return (
    <div
      /* Centred with a margin, NOT left-1/2 + -translate-x-1/2: this element is
         also the reveal target, and the entrance sets transform: translateY(20px),
         which replaces the centring transform outright. Every bled frame then sat
         half a viewport to the right until the observer fired — invisible only
         because the page clips overflow-x. Margins and transforms do not collide. */
      className={`${bleed ? 'w-[min(100vw-2.5rem,80rem)] ml-[calc(50%-min(50vw-1.25rem,40rem))]' : ''} ${className}`}
      data-reveal
    >
      <div className="bf-screen relative overflow-hidden" style={{ aspectRatio: aspect }}>
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="absolute max-w-none"
          style={{
            width: `${(100 / w) * 100}%`,
            left: `${-(x / w) * 100}%`,
            top: `${-(y / h) * 100}%`,
          }}
        />
      </div>
    </div>
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
