// Smoke-check every configured feed WITHOUT sending any alerts.
// Verifies HTTP reachability, parse-ability, entry count and the latest title.
// Run locally (needs network) or via the "Smoke Feeds" GitHub Actions workflow.
//
// Usage:
//   node src/smoke.js            # table for all 20 services
//   node src/smoke.js --strict   # exit 1 if any feed fails

import { SERVICES } from './services.js';
import { fetchFeed } from './feeds.js';

const strict = process.argv.includes('--strict');
const timeoutMs = 15000;

console.log(`Checking ${SERVICES.length} feeds (timeout ${timeoutMs / 1000}s)...\n`);

let failures = 0;

for (const service of SERVICES) {
  const started = Date.now();
  try {
    const entries = await fetchFeed(service, { timeoutMs });
    const latest = entries[0];
    const flag = service.verify ? ' (verify-me)' : '';
    console.log(`✅ ${service.id.padEnd(12)} ${String(entries.length).padStart(3)} entries  ${Date.now() - started}ms${flag}`);
    if (latest) console.log(`   ↳ latest: ${latest.title.slice(0, 120)}${latest.pubDate ? `  [${latest.pubDate}]` : ''}`);
  } catch (err) {
    failures += 1;
    console.log(`❌ ${service.id.padEnd(12)} FAILED  ${err.message}${service.verify ? '  (verify-me)' : ''}`);
  }
}

console.log(`\n${SERVICES.length - failures} ok, ${failures} failed`);
process.exit(strict && failures > 0 ? 1 : 0);
