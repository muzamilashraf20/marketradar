import { CARD_BASE, CARD_TONE, CARD_PADDING, CARD_INTERACTIVE } from './styles'

/* The one panel shape. Tone says what the card holds (a headline bias, an
   invalidation, an error, stale data), padding and radius stay constant, so
   every screen reads as the same product.

   `as` sets the element — pass "article" for a bias, "section" for a panel
   with a heading — so the markup carries meaning, not just divs. */
export default function Card({
  as = 'div',
  tone = 'default',
  padding = 'md',
  interactive = false,
  className = '',
  children,
  ...rest
}) {
  const Tag = as
  const classes = [
    CARD_BASE,
    CARD_TONE[tone] || CARD_TONE.default,
    CARD_PADDING[padding] ?? CARD_PADDING.md,
    interactive ? CARD_INTERACTIVE : '',
    className,
  ].filter(Boolean).join(' ')

  return (
    <Tag className={classes} {...rest}>
      {children}
    </Tag>
  )
}
