import Tooltip from './Tooltip'
import {
  CHIP_BASE, CHIP_SIZE, CONVICTION_MIN, CONVICTION_MAX, GRADE_LINES,
  CONVICTION_NOTE, CONVICTION_SCALE_NOTE, gradeStyle,
} from './styles'

const SPAN = CONVICTION_MAX - CONVICTION_MIN
const toPct = v => Math.max(0, Math.min(1, (v - CONVICTION_MIN) / SPAN))

const VALUE_SIZE = {
  sm: 'text-sm',
  md: 'text-lg',
  lg: 'text-3xl',
}
const TRACK_SIZE = {
  sm: 'h-1',
  md: 'h-1.5',
  lg: 'h-2',
}

/* Conviction, drawn on the engine's own scale.

   The bar spans 40–92 because that is the range the engine clamps to. Drawing
   it out of 100 would put a score of 92 visibly short of "full" and imply a
   scale the engine does not use — and a number out of 100 is exactly what gets
   misread as a probability. The four ticks are the real grade lines.

   `grade` is passed in rather than derived from `value`: the engine folds entry
   timing into the grade, so the same score can grade differently.

   A null value (a flat pair, or one not yet scored) renders an empty track and
   says so. It never renders as a zero. */
export default function ConvictionMeter({
  value,
  grade,
  size = 'md',
  label = 'Conviction',
  scale = false,
  explain = true,
  className = '',
}) {
  const scored = typeof value === 'number' && Number.isFinite(value)
  const gs = gradeStyle(grade)
  const pct = scored ? toPct(value) : 0

  // Read as a score on a stated scale. "78 of 92" invites hearing a fraction,
  // and a fraction is one step from a probability — the reading the tooltip
  // exists to rule out.
  const spoken = scored
    ? `${label} ${value}${grade ? `, grade ${grade}` : ''}, on a ${CONVICTION_MIN} to ${CONVICTION_MAX} scale`
    : `${label} not scored`

  return (
    <div className={className}>
      <div className="flex items-end justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-3xs font-semibold uppercase tracking-wider text-bf-muted">
          {label}
          {explain && (
            <Tooltip
              label="What conviction means"
              align="start"
              content={<><span className="block">{CONVICTION_NOTE}</span><span className="block mt-1.5 text-bf-muted">{CONVICTION_SCALE_NOTE}</span></>}
            />
          )}
        </span>

        <span className="inline-flex items-center gap-2">
          {scored ? (
            <span className={`font-bold leading-none text-bf-text tabular-nums ${VALUE_SIZE[size] || VALUE_SIZE.md}`}>
              {value}
            </span>
          ) : (
            <span className="text-2xs font-medium text-bf-muted">Not scored</span>
          )}
          {scored && grade && (
            <span className={`${CHIP_BASE} ${CHIP_SIZE.sm} ${gs.chip}`}>
              <span className="sr-only">Grade </span>{grade}
            </span>
          )}
        </span>
      </div>

      <div
        role="meter"
        aria-label={label}
        aria-valuemin={CONVICTION_MIN}
        aria-valuemax={CONVICTION_MAX}
        aria-valuenow={scored ? value : undefined}
        aria-valuetext={spoken}
        className={`relative mt-2 w-full overflow-hidden rounded-full bg-white/[0.06] ${TRACK_SIZE[size] || TRACK_SIZE.md}`}
      >
        {/* Scaled, not resized: transform is the only property that moves.
            `bf-meter-fill` is a hook for page-level motion (the landing page
            fills it from the bottom of the scale on scroll); it adds no style
            of its own, so the meter renders at its value everywhere else. */}
        <span
          className={`bf-meter-fill absolute inset-0 origin-left rounded-full motion-safe:transition-transform motion-safe:duration-700 motion-safe:ease-bf ${gs.bar}`}
          style={{ transform: `scaleX(${pct})` }}
          aria-hidden="true"
        />
        {GRADE_LINES.map(g => (
          <span
            key={g}
            className="absolute inset-y-0 w-px bg-bf-bg/80"
            style={{ left: `${toPct(g) * 100}%` }}
            aria-hidden="true"
          />
        ))}
      </div>

      {scale && (
        <div className="mt-1 flex justify-between text-3xs tabular-nums text-bf-muted" aria-hidden="true">
          <span>{CONVICTION_MIN}</span>
          <span>{CONVICTION_MAX}</span>
        </div>
      )}
    </div>
  )
}
