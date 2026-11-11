// Turso connection self-check. Prints which URL host is being used (never the token)
// and verifies the kv table can be created/read. Exits 1 with actionable output on failure.
//
// Usage:
//   TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... node src/db-check.js

import { createStore } from './db.js';

const url = process.env.TURSO_DATABASE_URL?.trim();
const token = process.env.TURSO_AUTH_TOKEN?.trim();

if (!url || !token) {
  console.error('[db-check] TURSO_DATABASE_URL and/or TURSO_AUTH_TOKEN is not set.');
  process.exit(2);
}

function hostOf(u) {
  try {
    const withScheme = u.includes('://') ? u : `libsql://${u}`;
    return new URL(withScheme).host;
  } catch {
    return `(unparseable: ${String(u).slice(0, 30)}…)`;
  }
}

console.log(`[db-check] URL host: ${hostOf(url)}`);
console.log(`[db-check] token: ${token.length} chars, starts with "${token.slice(0, 6)}…"`);
if (!/^(libsql|https|wss):\/\//.test(url)) {
  console.error('[db-check] WARNING: URL has no libsql:// or https:// scheme — Turso URLs look like libsql://<db>-<org>.turso.io');
}

try {
  const store = await createStore();
  console.log(`[db-check] backend: ${store.backend}`);
  await store.setJSON('health:ping', { ok: true, at: new Date().toISOString() });
  const value = await store.getJSON('health:ping', null);
  await store.del('health:ping');
  console.log(`[db-check] read/write OK — ${JSON.stringify(value)}`);
  process.exit(0);
} catch (err) {
  const msg = String(err?.message ?? err);
  console.error(`[db-check] FAILED: ${msg}`);
  if (/400/.test(msg)) {
    console.error('[db-check] HTTP 400 from Turso usually means the URL host is wrong (e.g. dashboard URL pasted instead of `turso db show --url`).');
    console.error('[db-check] Expected: libsql://<db>-<org>.turso.io  |  Token should start with eyJ...');
  } else if (/401|403|unauthori[sz]ed|token/i.test(msg)) {
    console.error('[db-check] Auth rejected — the token is invalid, expired, or belongs to a different database/org.');
  }
  process.exit(1);
}
