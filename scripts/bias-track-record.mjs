#!/usr/bin/env node
// BiasForge — v2 bias track record report.
//
// Standalone, read-only. Not wired into the server or any cron: run it by hand when you want to
// know what the engine's history actually says.
//
//   node scripts/bias-track-record.mjs [lookbackDays=90]
//
// Reads SUPABASE_URL + SUPABASE_SERVICE_KEY (or SUPABASE_KEY) from the environment.
//
// WHAT IT MEASURES: bias_history_v2 is a transition log, not a trade log — one row per open / flip /
// close. So an "episode" (one bias, start to finish) is reconstructed by pairing each directional row
// with the NEXT row for the same pair. The headline number is the INVALIDATION RATE: how often a bias
// died on its own stated invalidation level (closed_reason === "level_break") rather than ending some
// gentler way. That is a risk-discipline stat, NOT a win rate and NOT a P&L figure — do not present it
// as one.

// This script sits at the repo root but @supabase/supabase-js is installed under backend/, which
// Node's resolver never reaches from scripts/. Try the bare specifier first (works if it is ever
// hoisted to the root) and fall back to the backend install.
let createClient;
try {
  ({ createClient } = await import("@supabase/supabase-js"));
} catch {
  ({ createClient } = await import(
    new URL("../backend/node_modules/@supabase/supabase-js/dist/index.mjs", import.meta.url)
  ));
}

// --------------------------------------------------------------------------- env
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  const missing = [
    !SUPABASE_URL && "SUPABASE_URL",
    !SUPABASE_KEY && "SUPABASE_SERVICE_KEY (or SUPABASE_KEY)",
  ].filter(Boolean).join(" and ");
  console.error(`Error: missing ${missing} in the environment.`);
  console.error("Set them before running, e.g.  SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/bias-track-record.mjs 90");
  process.exit(1);
}

const LOOKBACK_DAYS = Number.parseInt(process.argv[2] ?? "90", 10);
if (!Number.isFinite(LOOKBACK_DAYS) || LOOKBACK_DAYS <= 0) {
  console.error(`Error: lookback must be a positive number of days, got "${process.argv[2]}".`);
  process.exit(1);
}

// --------------------------------------------------------------------------- helpers
const pct = (n, d) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "—");

function median(nums) {
  const xs = nums.filter((n) => typeof n === "number" && Number.isFinite(n)).sort((a, b) => a - b);
  if (!xs.length) return null;
  const mid = xs.length >> 1;
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}
const medianText = (nums) => {
  const m = median(nums);
  return m == null ? "n/a" : `${m.toFixed(1)}h`;
};
// Pips, not hours. Realized pips are signed, so keep the leading + on wins — a bare "8.4" next to
// a "-8.4" is too easy to misread. MFE/MAE are printed as-is; their sign is whatever the engine stored.
const medianPips = (nums, signed = false) => {
  const m = median(nums);
  if (m == null) return "n/a";
  return signed && m > 0 ? `+${m.toFixed(1)}` : m.toFixed(1);
};
const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);
const rule = (ch = "─", n = 78) => ch.repeat(n);

function section(title) {
  console.log("");
  console.log(title);
  console.log(rule());
}

// --------------------------------------------------------------------------- fetch
// Everything below runs inside main() so the early exits can just `return` after setting
// process.exitCode. Calling process.exit() while supabase-js still has an open fetch handle
// aborts the process on Windows instead of exiting cleanly.
async function main() {
const since = new Date(Date.now() - LOOKBACK_DAYS * 86400000).toISOString();
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

const { data: rows, error } = await supabase
  .from("bias_history_v2")
  .select("*")
  .gte("created_at", since)
  .order("pair", { ascending: true })
  .order("created_at", { ascending: true });

if (error) {
  console.error(`Error: query on bias_history_v2 failed: ${error.message}${error.code ? ` (${error.code})` : ""}`);
  process.exitCode = 1;
  return;
}

if (!rows || rows.length === 0) {
  console.log(`No bias_history_v2 rows in the last ${LOOKBACK_DAYS} days (since ${since.slice(0, 10)}).`);
  console.log("Nothing to report — there is no track record yet.");
  process.exitCode = 0;
  return;
}

// --------------------------------------------------------------------------- episodes
// bias_history_v2 holds TWO kinds of row. saveState() writes a STATE TRANSITION row on every
// open/flip/close. runEngine() additionally writes a PERFORMANCE row when a bias ends, marked by a
// non-null ended_by. A performance row carries the PRE-close direction (BUY/SELL), so leaving it in
// the pairing walk would break the reconstruction twice over: it would read as a freshly opened bias
// with no successor (a phantom "still open" episode after every CLOSE and FLIP) and it would stand in
// as the successor of the real transition before it. Episodes come from transition rows ONLY;
// performance rows are reported separately in section 7.
const transitions = rows.filter((r) => r.ended_by == null);
const outcomeRows = rows.filter((r) => r.ended_by != null);

// Group by pair, then walk each pair's rows in time order. Every BUY/SELL row opens a bias; the NEXT
// row for that pair is what ended it. The last row of a pair has no successor, so that bias is still
// running and is excluded from every finished-bias statistic below.
const byPair = new Map();
for (const r of transitions) {
  if (!byPair.has(r.pair)) byPair.set(r.pair, []);
  byPair.get(r.pair).push(r);
}

const episodes = [];
for (const [pair, list] of byPair) {
  for (let i = 0; i < list.length; i++) {
    const open = list[i];
    if (open.direction !== "BUY" && open.direction !== "SELL") continue;   // FLAT rows are endings, not openings
    const next = list[i + 1] ?? null;

    if (!next) {
      episodes.push({ pair, open, open_still: true });
      continue;
    }

    // How did it end? A FLAT / closed successor is a plain close; the opposite direction is a flip;
    // anything else (same direction re-stated) is a refresh of a bias that never really ended.
    let ending;
    if (next.direction === "FLAT" || next.status === "closed") ending = "close";
    else if ((next.direction === "BUY" || next.direction === "SELL") && next.direction !== open.direction) ending = "flip";
    else ending = "refresh";

    const heldMs = new Date(next.created_at).getTime() - new Date(open.created_at).getTime();

    episodes.push({
      pair,
      open,
      end: next,
      ending,
      open_still: false,
      held_hours: Number.isFinite(heldMs) ? heldMs / 3600000 : null,
      // The reason lives on the row that ENDED the bias, not the one that opened it.
      closed_reason: next.closed_reason ?? null,
      invalidated: next.closed_reason === "level_break",
      grade: open.grade ?? null,
      timing: open.entry_timing ?? null,
      regime: open.regime ?? null,
    });
  }
}

const finished = episodes.filter((e) => !e.open_still);
const stillOpen = episodes.filter((e) => e.open_still);

// A reusable slice summary: n, invalidated count + %, median hold.
function summarize(list) {
  const n = list.length;
  const inval = list.filter((e) => e.invalidated).length;
  return {
    n,
    inval,
    survived: n - inval,
    invalPct: pct(inval, n),
    survivedPct: pct(n - inval, n),
    hold: medianText(list.map((e) => e.held_hours)),
  };
}

// --------------------------------------------------------------------------- 1. header
console.log(rule("═"));
console.log("BiasForge — v2 BIAS TRACK RECORD");
console.log(rule("═"));
console.log(`Lookback       : ${LOOKBACK_DAYS} days (since ${since.slice(0, 10)})`);
console.log(`Generated      : ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`);
console.log(`History rows   : ${rows.length}`);
console.log(`Biases opened  : ${episodes.length}`);
console.log(`  finished     : ${finished.length}`);
console.log(`  still open   : ${stillOpen.length}`);

// --------------------------------------------------------------------------- 2. how they ended
section("1. HOW BIASES ENDED");
if (!finished.length) {
  console.log("No finished biases in this window.");
} else {
  const all = summarize(finished);
  console.log(`Hit their invalidation (level_break) : ${padL(all.inval, 4)}  (${all.invalPct})`);
  console.log(`Ended some other way                 : ${padL(all.survived, 4)}  (${all.survivedPct})`);
  console.log(`Median hold time                     : ${all.hold}`);
  console.log("");
  const byEnding = ["close", "flip", "refresh"].map((k) => [k, finished.filter((e) => e.ending === k).length]);
  console.log("Ending type: " + byEnding.map(([k, n]) => `${k}=${n} (${pct(n, finished.length)})`).join("   "));
}

// --------------------------------------------------------------------------- 3. close reasons
section("2. CLOSE REASONS");
if (!finished.length) {
  console.log("No finished biases in this window.");
} else {
  const counts = new Map();
  for (const e of finished) {
    const k = e.closed_reason ?? "(none recorded)";
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const w = Math.max(...sorted.map(([k]) => k.length), 14);
  for (const [reason, n] of sorted) {
    console.log(`  ${pad(reason, w)}  ${padL(n, 4)}  ${padL(pct(n, finished.length), 7)}`);
  }
}

// --------------------------------------------------------------------------- 4. by grade
section("3. BY GRADE (grade assigned at entry)");
if (!finished.length) {
  console.log("No finished biases in this window.");
} else {
  console.log(`  ${pad("grade", 12)}${padL("n", 5)}${padL("invalidated", 14)}${padL("survived", 14)}${padL("med hold", 11)}`);
  for (const g of ["A", "A-", "B", "C", "D"]) {
    const s = summarize(finished.filter((e) => e.grade === g));
    console.log(`  ${pad(g, 12)}${padL(s.n, 5)}${padL(`${s.inval} (${s.invalPct})`, 14)}${padL(`${s.survived} (${s.survivedPct})`, 14)}${padL(s.hold, 11)}`);
  }
  const bPlus = summarize(finished.filter((e) => ["A", "A-", "B"].includes(e.grade)));
  console.log(`  ${rule("-", 54)}`);
  console.log(`  ${pad("B and above", 12)}${padL(bPlus.n, 5)}${padL(`${bPlus.inval} (${bPlus.invalPct})`, 14)}${padL(`${bPlus.survived} (${bPlus.survivedPct})`, 14)}${padL(bPlus.hold, 11)}`);

  const ungraded = finished.filter((e) => !["A", "A-", "B", "C", "D"].includes(e.grade)).length;
  if (ungraded) console.log(`  (${ungraded} finished biases carried no grade and are excluded from the rows above)`);
}

// --------------------------------------------------------------------------- 5. by entry timing
section("4. BY ENTRY TIMING (how extended the move already was)");
if (!finished.length) {
  console.log("No finished biases in this window.");
} else {
  console.log(`  ${pad("timing", 12)}${padL("n", 5)}${padL("invalidated", 16)}${padL("med hold", 11)}`);
  for (const t of ["FRESH", "EXTENDED", "LATE"]) {
    const s = summarize(finished.filter((e) => e.timing === t));
    console.log(`  ${pad(t, 12)}${padL(s.n, 5)}${padL(`${s.inval} (${s.invalPct})`, 16)}${padL(s.hold, 11)}`);
  }
}

// --------------------------------------------------------------------------- 6. by pair
section("5. BY PAIR");
if (!finished.length) {
  console.log("No finished biases in this window.");
} else {
  const pairs = [...new Set(finished.map((e) => e.pair))].sort();
  console.log(`  ${pad("pair", 10)}${padL("n", 5)}${padL("invalidated", 16)}${padL("med hold", 11)}`);
  for (const p of pairs) {
    const s = summarize(finished.filter((e) => e.pair === p));
    console.log(`  ${pad(p, 10)}${padL(s.n, 5)}${padL(`${s.inval} (${s.invalPct})`, 16)}${padL(s.hold, 11)}`);
  }
}

// --------------------------------------------------------------------------- 7. by regime
section("6. BY REGIME");
if (!finished.length) {
  console.log("No finished biases in this window.");
} else {
  console.log(`  ${pad("regime", 14)}${padL("n", 5)}${padL("invalidated", 16)}${padL("med hold", 11)}`);
  for (const r of ["event-heavy", "quiet"]) {
    const s = summarize(finished.filter((e) => e.regime === r));
    console.log(`  ${pad(r, 14)}${padL(s.n, 5)}${padL(`${s.inval} (${s.invalPct})`, 16)}${padL(s.hold, 11)}`);
  }
  const other = finished.filter((e) => !["event-heavy", "quiet"].includes(e.regime)).length;
  if (other) console.log(`  (${other} finished biases had no regime recorded)`);
}

// --------------------------------------------------------------------------- 7. realized pips
// A DIFFERENT measurement from everything above. Sections 1-6 count how biases ENDED (risk
// discipline). This one reports what they actually MADE, in pips, straight off the persisted
// outcome rows — no reconstruction, no pairing, one row per bias that ended.
section("7. REALIZED P&L IN PIPS  — actual outcome rows, NOT the invalidation rate above");
if (!outcomeRows.length) {
  console.log("No outcome rows (ended_by set) in this window — the engine has not persisted any yet.");
  console.log("Until it has, there is no P&L measurement here at all: sections 1-6 do not contain one.");
} else {
  const realized = outcomeRows.map((r) => r.realized_pips).filter((n) => typeof n === "number" && Number.isFinite(n));
  const wins   = realized.filter((n) => n > 0).length;
  const losses = realized.filter((n) => n < 0).length;
  const flats  = realized.filter((n) => n === 0).length;

  console.log("These are pips actually captured between entry and exit. Do NOT combine this with the");
  console.log("invalidation rate above in one sentence — they measure different things.");
  console.log("");
  console.log(`  Outcome rows recorded : ${outcomeRows.length}`);
  console.log(`  With realized pips    : ${realized.length}`);
  console.log(`  Median realized       : ${medianPips(realized, true)} pips`);
  console.log(`  Positive              : ${padL(wins, 4)}  (${pct(wins, realized.length)})`);
  console.log(`  Negative              : ${padL(losses, 4)}  (${pct(losses, realized.length)})`);
  if (flats) console.log(`  Flat (exactly 0)      : ${padL(flats, 4)}  (${pct(flats, realized.length)})`);
  console.log(`  Median MFE            : ${medianPips(outcomeRows.map((r) => r.mfe))} pips`);
  console.log(`  Median MAE            : ${medianPips(outcomeRows.map((r) => r.mae))} pips`);

  console.log("");
  console.log("  By grade (grade at entry):");
  console.log(`  ${pad("grade", 12)}${padL("n", 5)}${padL("med realized", 15)}${padL("positive", 14)}${padL("med MFE", 10)}${padL("med MAE", 10)}`);
  const gradeRow = (label, list) => {
    const rp = list.map((r) => r.realized_pips).filter((n) => typeof n === "number" && Number.isFinite(n));
    const w = rp.filter((n) => n > 0).length;
    console.log(`  ${pad(label, 12)}${padL(list.length, 5)}${padL(medianPips(rp, true), 15)}${padL(`${w} (${pct(w, rp.length)})`, 14)}${padL(medianPips(list.map((r) => r.mfe)), 10)}${padL(medianPips(list.map((r) => r.mae)), 10)}`);
  };
  for (const g of ["A", "A-", "B", "C", "D"]) gradeRow(g, outcomeRows.filter((r) => r.grade === g));
  console.log(`  ${rule("-", 66)}`);
  gradeRow("B and above", outcomeRows.filter((r) => ["A", "A-", "B"].includes(r.grade)));

  const ungraded = outcomeRows.filter((r) => !["A", "A-", "B", "C", "D"].includes(r.grade)).length;
  if (ungraded) console.log(`  (${ungraded} outcome rows carried no grade and are excluded from the rows above)`);
}

// --------------------------------------------------------------------------- 8. the honest line
section("WHAT YOU CAN HONESTLY PUBLISH");
if (!finished.length) {
  console.log("Nothing. There are no finished biases in this window.");
} else {
  const all = summarize(finished);
  const bPlus = summarize(finished.filter((e) => ["A", "A-", "B"].includes(e.grade)));
  console.log("One sentence, and only this one:");
  console.log("");
  console.log(`  "Across ${finished.length} completed biases over the last ${LOOKBACK_DAYS} days, ${all.invalPct} were stopped out`);
  console.log(`   at their stated invalidation level; the median bias was held ${all.hold}."`);
  if (bPlus.n) {
    console.log("");
    console.log(`  (B-and-above slice, if you want the graded version: ${bPlus.n} biases, ${bPlus.invalPct} invalidated.)`);
  }
  console.log("");
  console.log("Read the caveats before this goes anywhere near the site:");
  console.log("  • This is an INVALIDATION RATE, not a win rate and not a return. A bias that ended");
  console.log("    without breaking its level was not necessarily profitable — nobody measured P&L here.");
  console.log("  • Episodes are reconstructed from transition rows, so a missed or duplicated row shifts");
  console.log("    the pairing. Treat these as engine diagnostics, not audited results.");
  if (finished.length < 50) {
    console.log("");
    console.log(`  ⚠️  SAMPLE TOO SMALL: ${finished.length} finished biases. Anything under ~50 is noise —`);
    console.log("      one unlucky week moves every percentage above by double digits. Do NOT put these");
    console.log("      numbers on the website, in an ad, or in a Telegram post yet.");
  } else {
    console.log("");
    console.log(`  Sample is ${finished.length} finished biases — past the ~50 minimum, but still thin. Re-run`);
    console.log("  this before every public claim and quote the window alongside the number.");
  }
}
console.log("");
}

await main();
