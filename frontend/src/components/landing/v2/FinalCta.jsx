import { GUMROAD_URL } from './Plan'

/* Section 11 */
export default function FinalCta() {
  return (
    <section className="px-5 sm:px-8 py-24 sm:py-32">
      <div className="mx-auto max-w-5xl">
        <h2 className="bf-h2 max-w-[20ch]">Trade with a direction, or trade without one.</h2>

        <p className="bf-body mt-6 max-w-[40rem]">
          Direction and invalidation for every major pair, on one screen.
        </p>

        {/* One CTA. The free Telegram offer is gone from the page; the channel
            survives in the footer as a contact route, not as an offer. */}
        <div className="mt-10">
          <a
            href={GUMROAD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="bf-pill bf-lift inline-block px-6 py-3 text-[15px] font-medium bg-cyan-500 text-[#030712] hover:bg-cyan-400"
          >
            Get access
          </a>
        </div>
      </div>
    </section>
  )
}
