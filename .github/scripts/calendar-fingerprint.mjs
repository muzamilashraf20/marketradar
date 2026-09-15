/* Writes frontend/content/.calendar-state.json — a fingerprint of what
   /this-week-in-forex would show if it were rebuilt right now.

   The weekly page builds its event block from /api/calendar at BUILD time, so
   it is only as fresh as the last deploy. It sat on a six-day-old calendar once
   already because the rebuild depended on a Railway env var nobody set. This
   runs in a scheduled GitHub Action instead: if the fingerprint moved, the
   workflow commits it, the commit deploys, and the build reads the live feed.

   The fingerprint deliberately mirrors the page, not the feed. It carries the ET
   date (so the window label and "Updated" stamp move daily), the mode, and the
   high-impact releases the page would list. A release passing, a forecast being
   revised, or the new week publishing all change it. Nothing else does, so
   quiet runs commit nothing.

   Kept in step with buildAutoEvents() in frontend/scripts/generate-blog.mjs:
   High impact only, 10-day forward window, falling back to the past 7 days when
   the forward window is empty. */

import fs from 'node:fs';

const API = 'https://marketradar-production.up.railway.app/api/calendar';
const OUT = 'frontend/content/.calendar-state.json';
const DAY_MS = 86400000;
const WINDOW_DAYS = 10;

async function fetchCalendar() {
  let last;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(API, { signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      if (!Array.isArray(j)) throw new Error('calendar is not an array');
      return j;
    } catch (e) {
      last = e;
      await new Promise(res => setTimeout(res, 5000 * (i + 1)));
    }
  }
  throw last;
}

const cal = await fetchCalendar().catch(e => {
  // Fail the job rather than skip quietly. A red run is the signal that was
  // missing the last time this page went stale.
  console.error(`calendar fetch failed after retries: ${e.message}`);
  process.exit(1);
});

const now = Date.now();
const high = cal.filter(e => e?.title && e?.date && e.impact === 'High');
const at = (e) => new Date(e.date).getTime();

let mode = 'upcoming';
let rows = high.filter(e => at(e) > now && at(e) <= now + WINDOW_DAYS * DAY_MS);
if (!rows.length) {
  mode = 'recap';
  rows = high.filter(e => at(e) <= now && at(e) > now - 7 * DAY_MS);
}

const releases = rows
  .sort((a, b) => at(a) - at(b))
  .map(e => `${e.date}|${e.country}|${e.title}|${e.forecast ?? ''}|${e.previous ?? ''}`);

const day = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

const state = {
  day,
  mode,
  summary: mode === 'upcoming'
    ? `${releases.length} high-impact release row(s) ahead`
    : `recap of ${releases.length} row(s), next week not yet published`,
  releases,
};

fs.writeFileSync(OUT, JSON.stringify(state, null, 2) + '\n');
console.log(`${day} · ${mode} · ${releases.length} row(s)`);
