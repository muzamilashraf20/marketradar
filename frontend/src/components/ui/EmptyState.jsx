import { Inbox } from 'lucide-react'
import Card from './Card'

/* The shape a panel takes when it has nothing to show — no data yet, a failed
   load, a filter with no matches. It always says what happened in a sentence,
   so an empty panel reads as a state rather than as a broken box.

   `tone` picks the card tone from styles.js: `empty` for "nothing here",
   `error` for "could not load". `size="sm"` is a single inline row for tight
   slots (a ticker, a table cell); the default is the centred block. It renders
   no data of its own, and must never be given sample numbers to fill the space. */
export default function EmptyState({
  title,
  message,
  icon = Inbox,
  tone = 'empty',
  size = 'md',
  action,
  className = '',
}) {
  const Icon = icon

  if (size === 'sm') {
    return (
      <Card tone={tone} padding="none" className={`flex items-center gap-2 px-3 py-2 ${className}`}>
        <Icon size={14} className="shrink-0 text-bf-muted" aria-hidden="true" />
        <p className="min-w-0 truncate text-2xs text-bf-text-2">
          {title && <span className="font-semibold text-bf-text">{title} </span>}
          {message}
        </p>
      </Card>
    )
  }

  return (
    <Card tone={tone} padding="lg" className={`text-center ${className}`}>
      <Icon size={20} className="mx-auto text-bf-muted" aria-hidden="true" />
      {title && <p className="mt-3 text-sm font-semibold text-bf-text">{title}</p>}
      {message && <p className="mx-auto mt-1.5 max-w-md text-2xs leading-relaxed text-bf-text-2">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </Card>
  )
}
