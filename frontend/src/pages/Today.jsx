import DashboardLayout from '../components/layout/DashboardLayout'
import { useLiveData, useNow } from '../lib/useLiveData'
import {
  loadTodayBias, loadCompass, loadUpcomingHighImpact, loadTopNews, loadClosedCalls,
} from '../components/today/todayData'
import {
  HeadlineCard, CompassCard, EventsCard, NewsCard, PropFirmCard, SessionsStrip, ClosedCallsCard, MoversCard,
} from '../components/today/TodayCards'

/* Today — the page a subscriber opens every morning.

   Top to bottom (and in this order on a phone): the headline bias, the compass
   of seven majors and gold, the next high-impact events, the top scored news,
   prop firm drawdown, the sessions now, the latest closed calls, and the most
   active MarketMover. On a wide screen the headline and the sessions strip run
   full width and the rest pair up in two columns.

   Every card loads on its own (useLiveData) with its own skeleton and its own
   "Couldn't load · Retry", so one failing endpoint never blanks the page. No
   endpoint here is new; the MarketMovers card reads the news card's data.

   Refresh: bias, compass and news every 5 minutes, the calendar and the record
   every 15, and only while the tab is visible (usePolling). Countdowns tick
   every 30 seconds. */
const MIN = 60 * 1000

export default function Today() {
  const now = useNow(30 * 1000)
  const bias = useLiveData(loadTodayBias, 5 * MIN)
  const compass = useLiveData(loadCompass, 5 * MIN)
  const events = useLiveData(loadUpcomingHighImpact, 15 * MIN)
  const news = useLiveData(loadTopNews, 5 * MIN)
  const calls = useLiveData(loadClosedCalls, 15 * MIN)

  const dateLabel = new Date(now).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })
  const headlinePair = bias.data?.has ? bias.data.pair : null

  return (
    <DashboardLayout title="Today" subtitle={dateLabel}>
      <div className="grid gap-4 lg:grid-cols-2">
        <HeadlineCard q={bias} now={now} className="lg:col-span-2" />
        <CompassCard q={compass} />
        <EventsCard q={events} now={now} pair={headlinePair} />
        <NewsCard q={news} />
        <PropFirmCard />
        <SessionsStrip now={now} className="lg:col-span-2" />
        <ClosedCallsCard q={calls} />
        <MoversCard q={news} />
      </div>
    </DashboardLayout>
  )
}
