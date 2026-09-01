import LiveCompass from './LiveCompass'
import EventTicker from './EventTicker'
import { useCompassData } from './useCompassData'

export default function Hero() {
  const compass = useCompassData()

  return (
    <section className="relative px-5 sm:px-8 pt-28 pb-16 sm:pt-32 sm:pb-24 overflow-hidden">
      {/* Ambient wash — hero only, nothing behind any other section. */}
      <div className="bf-ambient" aria-hidden="true" />

      {/* Two columns from lg up: copy left, live panel right, both above the
          fold. Stacks to one column below that, copy first. */}
      <div className="relative z-10 mx-auto max-w-6xl grid lg:grid-cols-[1.05fr_0.95fr] gap-12 lg:gap-12 items-center">
        {/* ── Left: the words Google reads ── */}
        <div className="bf-hero-copy">
          {/* Animation 1 — hero entrance: rise + fade, staggered ~80ms. */}
          <p className="bf-eyebrow bf-rise" style={{ '--d': '0ms' }}>
            Macro bias for forex traders
          </p>

          <h1 className="bf-h1 mt-5 bf-rise" style={{ '--d': '80ms' }}>
            <span className="block">Your macro read on every pair.</span>
            {/* The page's one accent cyan (#06b6d4), same token as the eyebrow and the
                primary CTA. cyan-400 read as a second, brighter cyan. */}
            <span className="block text-[#06b6d4]">Direction, and where it breaks.</span>
          </h1>

          <p className="bf-body mt-6 max-w-[38rem] bf-rise" style={{ '--d': '160ms' }}>
            BiasForge reads the economic calendar, live news, COT positioning and cross-asset
            flows across the major forex pairs, and answers the two questions that decide the
            trade: which way, and where am I wrong.
          </p>

          {/* The H1 no longer carries these terms, so the audience is named
              here instead — immediately under the subhead, where it reads as
              qualification rather than as a keyword line. */}
          <p className="mt-4 text-[14px] bf-t3 max-w-[38rem] bf-rise" style={{ '--d': '200ms' }}>
            Built for prop firm and funded traders, with drawdown rules on the same screen.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3 bf-rise" style={{ '--d': '240ms' }}>
            <a
              href="/login"
              className="bf-pill bf-lift px-6 py-3 text-[15px] font-medium bg-cyan-500 text-[#030712] hover:bg-cyan-400"
            >
              See today&rsquo;s bias
            </a>
            <a
              href="#features"
              className="bf-pill bf-lift bf-hairline px-6 py-3 text-[15px] text-slate-200 hover:border-slate-600 hover:bg-white/[0.03]"
            >
              How it works
            </a>
          </div>

          <p className="mt-6 text-[13.5px] bf-t3 bf-rise" style={{ '--d': '320ms' }}>
            Built by a trader.
          </p>
        </div>

        {/* ── Right: the proof. Real bias data, not a mock-up. ── */}
        {/* min-w-0: a grid item defaults to min-width:auto, so the card row's
            intrinsic width (3 x 248px) forced this track to ~790px on a 375px
            screen. The page clips overflow, so cards 2 and 3 were simply
            unreachable. Allowing the track to shrink lets the scroller work. */}
        <div className="bf-rise lg:pt-2 min-w-0" style={{ '--d': '400ms' }}>
          <LiveCompass {...compass} />
          <div className="mt-4">
            <EventTicker />
          </div>
        </div>
      </div>
    </section>
  )
}
