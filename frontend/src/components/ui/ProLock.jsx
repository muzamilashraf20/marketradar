import { Lock } from 'lucide-react'
import Card from './Card'
import Button from './Button'

/* The locked state of a Pro-only panel. Presentation only.

   It fetches nothing, reads no plan and hides nothing. Real gating is on the
   server: a Pro endpoint that answers a free user must leave the gated fields
   out of the response, and the page then renders this in their place.
   Rendering real data underneath this and blurring it would put that data in
   the DOM for anyone to read, which is why there is no slot for it.

   `children` is for extra copy that is fine to show — what Pro includes, say.

   The CTA goes to /pricing by default, which offers both card (Gumroad) and
   crypto checkout; pass `href` to send it somewhere else. */
export default function ProLock({
  title = 'Pro feature',
  message = 'Available on BiasForge Pro.',
  ctaLabel = 'Upgrade to Pro',
  href = '/pricing',
  external = false,
  size = 'md',
  headingAs = 'h3',
  className = '',
  children,
}) {
  const compact = size === 'sm'
  const Heading = headingAs

  return (
    <Card
      as="section"
      tone="subtle"
      padding={compact ? 'sm' : 'lg'}
      className={`text-center ${className}`}
    >
      <div
        className={`mx-auto flex items-center justify-center rounded-full border border-bf-accent/25 bg-bf-accent/10 text-bf-accent-soft ${compact ? 'h-8 w-8' : 'h-11 w-11'}`}
        aria-hidden="true"
      >
        <Lock size={compact ? 14 : 18} />
      </div>
      <Heading className={`mt-3 font-semibold text-bf-text ${compact ? 'text-sm' : 'text-base'}`}>{title}</Heading>
      <p className={`mx-auto mt-1 max-w-sm leading-relaxed text-bf-text-2 ${compact ? 'text-2xs' : 'text-sm'}`}>{message}</p>
      {children && <div className="mt-3 text-left">{children}</div>}
      <div className={compact ? 'mt-3' : 'mt-5'}>
        <Button href={href} external={external} size={compact ? 'sm' : 'md'}>
          {ctaLabel}
        </Button>
      </div>
    </Card>
  )
}
