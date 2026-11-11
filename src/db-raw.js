// Diagnostic: raw HTTP probe of the Turso hrana v2 endpoint.
// The official client hides the response BODY on non-2xx responses,
// which is why a bare "HTTP 400" is all we ever see. This probe prints
// the server's actual response text (Turso error bodies contain no secrets).
//
// Usage:
//   TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... node src/db-raw.js

const rawUrl = (process.env.TURSO_DATABASE_URL ?? '').trim().replace(/\/+$/, '');
const token = (process.env.TURSO_AUTH_TOKEN ?? '').trim();

if (!rawUrl || !token) {
  console.error('[db-raw] TURSO_DATABASE_URL and/or TURSO_AUTH_TOKEN is not set.');
  process.exit(2);
}

const httpsUrl = rawUrl.replace(/^libsql:/i, 'https:').replace(/^wss?:/i, 'ws2:').replace(/^ws2:/i, 'https:');
const probeUrl = `${httpsUrl}/v2/pipeline`;

console.log(`[db-raw] POST ${probeUrl}`);
console.log(`[db-raw] auth header: Bearer ${token.slice(0, 8)}… (${token.length} chars, ${token.startsWith('eyJ') ? 'looks like a JWT' : 'NOT a JWT?!'})`);

const body = JSON.stringify({
  requests: [
    { type: 'execute', stmt: { sql: 'SELECT 1', args: [], named_args: [], want_rows: true } },
    { type: 'close' },
  ],
});

try {
  const resp = await fetch(probeUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body,
  });
  const text = await resp.text();
  console.log(`[db-raw] status: ${resp.status}`);
  console.log(`[db-raw] content-type: ${resp.headers.get('content-type')}`);
  console.log(`[db-raw] body: ${text.slice(0, 800)}`);
  process.exit(0); // always "ok" — this is a diagnostic, not a check
} catch (err) {
  console.error(`[db-raw] request itself failed: ${err?.message ?? err}`);
  process.exit(1);
}
