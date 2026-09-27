import { SECTION_TITLE_SIZE } from './styles'

/* Eyebrow, title, optional description, optional action on the right.

   `as` sets the heading level so each page keeps a clean h1 → h2 → h3
   outline; the size is chosen separately, because visual weight and document
   level are different decisions. Pass `id` to label a surrounding <section>
   with aria-labelledby.

   Stacks on phones, sits side by side from sm up. */
export default function SectionHeader({
  eyebrow,
  title,
  description,
  action,
  as = 'h2',
  size = 'md',
  id,
  className = '',
}) {
  const Heading = as

  return (
    <div className={`flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between ${className}`}>
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-3xs font-semibold uppercase tracking-[0.16em] text-bf-accent">{eyebrow}</p>
        )}
        <Heading
          id={id}
          className={`font-semibold tracking-tight text-bf-text ${eyebrow ? 'mt-2' : ''} ${SECTION_TITLE_SIZE[size] || SECTION_TITLE_SIZE.md}`}
        >
          {title}
        </Heading>
        {description && (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-bf-text-2">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
