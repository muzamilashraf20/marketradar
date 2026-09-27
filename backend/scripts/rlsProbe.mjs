// ---------------------------------------------------------------------------
// RLS probe — READ-ONLY. What can the PUBLIC anon key see?
//
// The anon key ships in the frontend bundle, so anything it can read is public.
// This asks PostgREST, with only that key and no session, for each table and
// reports: HTTP status, how many rows are visible, and the column NAMES of the
// first visible row. It never prints a row value, the URL's key, or any secret.
//
// No writes. No service key. Imports nothing from the backend.
//
// Run from backend/ (PowerShell):
//   node scripts/rlsProbe.mjs --env ..\frontend\.env
//   (or set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the environment)
//
// Optional — check the logged-in path still works after RLS:
//   $env:SUPABASE_USER_JWT = '<access_token of a logged-in user>'
//   node scripts/rlsProbe.mjs --env ..\frontend\.env
//   Expect user_plans = 1 row (their own) and every other table = 0.
//   The token is in the browser's localStorage key sb-<project>-auth-token → access_token.
//
// Exit code 1 if anon can see any row in any table, so it can gate a checklist.
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

// Tables the code touches (frontend + backend). The live schema is also read from
// PostgREST's OpenAPI root, so a table missing from this list still gets probed.
const KNOWN_TABLES = [
  'user_plans', 'app_state', 'bias_state_v2', 'bias_history', 'bias_history_v2',
  'trades', 'telegram_subscribers', 'email_subscribers', 'social_queue', 'release_actuals',
];

function loadEnvFile(path) {
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

const envIdx = process.argv.indexOf('--env');
const fileEnv = envIdx > -1 ? loadEnvFile(process.argv[envIdx + 1]) : {};
const pick = (...names) => {
  for (const n of names) if (process.env[n] || fileEnv[n]) return process.env[n] || fileEnv[n];
  return null;
};

const URL_BASE = pick('VITE_SUPABASE_URL', 'SUPABASE_URL');
const ANON = pick('VITE_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY');
const USER_JWT = process.env.SUPABASE_USER_JWT || null;

if (!URL_BASE || !ANON) {
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (pass --env <path to frontend/.env>).');
  process.exit(2);
}

// Refuse to run with anything but an anon key — a service key would bypass RLS and
// make every table look "exposed", and the point is to test what the public sees.
function jwtRole(token) {
  try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).role || null; }
  catch { return null; }
}
const anonRole = ANON.startsWith('sb_publishable_') ? 'anon' : jwtRole(ANON);
if (anonRole !== 'anon') {
  console.error(`Key role is "${anonRole}", not "anon". Refusing to probe with a privileged key.`);
  process.exit(2);
}

const rest = `${URL_BASE.replace(/\/+$/, '')}/rest/v1`;

async function discoverTables(bearer) {
  try {
    const res = await fetch(`${rest}/`, { headers: { apikey: ANON, Authorization: `Bearer ${bearer}` } });
    if (!res.ok) return [];
    const spec = await res.json();
    return Object.keys(spec.paths || {})
      .filter((p) => p !== '/' && !p.startsWith('/rpc/'))
      .map((p) => p.slice(1));
  } catch { return []; }
}

async function probe(table, bearer) {
  const res = await fetch(`${rest}/${encodeURIComponent(table)}?select=*&limit=1`, {
    headers: { apikey: ANON, Authorization: `Bearer ${bearer}`, Prefer: 'count=exact' },
  });
  let body = null;
  try { body = await res.json(); } catch { /* empty */ }

  if (!res.ok) {
    // PGRST205 = table not in schema cache; 42501 = permission denied (grant revoked).
    const code = body?.code || '';
    const note = code === 'PGRST205' || res.status === 404 ? 'not found'
      : code === '42501' ? 'permission denied'
      : `error ${code}`.trim();
    return { table, status: res.status, rows: 0, columns: [], note };
  }

  // content-range: "0-0/57" or "*/0"
  const total = Number((res.headers.get('content-range') || '').split('/')[1]);
  const rows = Number.isFinite(total) ? total : (Array.isArray(body) ? body.length : 0);
  const columns = Array.isArray(body) && body[0] ? Object.keys(body[0]) : [];
  return { table, status: res.status, rows, columns, note: rows > 0 ? 'EXPOSED' : 'ok (0 rows)' };
}

async function run(label, bearer) {
  const discovered = await discoverTables(bearer);
  const tables = [...new Set([...KNOWN_TABLES, ...discovered])].sort();
  console.log(`\n== ${label} ==  (${discovered.length ? `${discovered.length} tables exposed in OpenAPI` : 'OpenAPI root not readable'})`);
  const results = [];
  for (const t of tables) results.push(await probe(t, bearer));

  const w = Math.max(...tables.map((t) => t.length));
  for (const r of results) {
    console.log(`${r.table.padEnd(w)}  ${String(r.status).padEnd(3)}  rows=${String(r.rows).padEnd(4)}  ${r.note}`);
    if (r.columns.length) console.log(`${''.padEnd(w)}       columns: ${r.columns.join(', ')}`);
  }
  return results;
}

const anonResults = await run('anon key, no session', ANON);
const exposed = anonResults.filter((r) => r.rows > 0);

if (USER_JWT) {
  if (jwtRole(USER_JWT) !== 'authenticated') {
    console.error('\nSUPABASE_USER_JWT is not an "authenticated" access token — skipping the logged-in pass.');
  } else {
    const authResults = await run('logged-in user (SUPABASE_USER_JWT)', USER_JWT);
    const plans = authResults.find((r) => r.table === 'user_plans');
    const others = authResults.filter((r) => r.table !== 'user_plans' && r.rows > 0);
    console.log(`\nuser_plans for this user: ${plans?.rows ?? 0} row(s) — expected 1 (0 if they have no plan row yet).`);
    if (plans?.rows > 1) console.log('!! more than one user_plans row visible to a single user — the SELECT policy is too wide.');
    if (others.length) console.log(`!! a logged-in user can also read: ${others.map((r) => r.table).join(', ')}`);
  }
}

console.log(exposed.length
  ? `\nFAIL — anon can read ${exposed.length} table(s): ${exposed.map((r) => `${r.table}(${r.rows})`).join(', ')}`
  : '\nPASS — anon can read no rows in any probed table.');
process.exit(exposed.length ? 1 : 0);
