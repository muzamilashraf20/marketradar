import { Loader2 } from 'lucide-react'
import { BUTTON_BASE, BUTTON_VARIANT, BUTTON_SIZE, BUTTON_DISABLED, FOCUS_RING } from './styles'

const SPINNER = { sm: 13, md: 15, lg: 16 }

/* One button for every CTA.

   Renders an <a> when given `href`, a <button> otherwise, so a link is still a
   link to a crawler and to a screen reader. `external` opens in a new tab.

   Disabled and loading both block interaction. A disabled link drops its href,
   which takes it out of the tab order and stops it being followed — an <a>
   with no href is not a link. Loading keeps the label on screen so the button
   does not change width, and marks itself busy. */
export default function Button({
  variant = 'primary',
  size = 'md',
  href,
  external = false,
  type = 'button',
  disabled = false,
  loading = false,
  iconLeft,
  iconRight,
  fullWidth = false,
  className = '',
  children,
  ...rest
}) {
  const inactive = disabled || loading
  const classes = [
    BUTTON_BASE,
    BUTTON_VARIANT[variant] || BUTTON_VARIANT.primary,
    BUTTON_SIZE[size] || BUTTON_SIZE.md,
    FOCUS_RING,
    fullWidth ? 'w-full' : '',
    inactive ? BUTTON_DISABLED : '',
    className,
  ].filter(Boolean).join(' ')

  const content = (
    <>
      {loading
        ? <Loader2 size={SPINNER[size] || SPINNER.md} className="motion-safe:animate-spin" aria-hidden="true" />
        : iconLeft}
      <span>{children}</span>
      {!loading && iconRight}
    </>
  )

  if (href) {
    return (
      <a
        href={inactive ? undefined : href}
        aria-disabled={inactive || undefined}
        aria-busy={loading || undefined}
        target={external && !inactive ? '_blank' : undefined}
        rel={external && !inactive ? 'noopener noreferrer' : undefined}
        className={classes}
        {...rest}
      >
        {content}
      </a>
    )
  }

  return (
    <button
      type={type}
      disabled={inactive}
      aria-busy={loading || undefined}
      className={classes}
      {...rest}
    >
      {content}
    </button>
  )
}
