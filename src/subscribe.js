// Subscribe entry point (one-shot, used by GitHub Actions).
// One pass of getUpdates — processes pending bot commands, persists subscribers + offset.
//
// NOTE: normally the always-on daemon (src/daemon.js) handles commands.
// This CLI remains as a BACKUP for when the daemon host is down.
//
// Usage:
//   node src/subscribe.js            # one polling pass
//   node src/subscribe.js --dry-run  # process but do not send replies / advance offset

import { createStore } from './db.js';
import { processUpdates } from './poller.js';

const dryRun = process.argv.includes('--dry-run');

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('TELEGRAM_BOT_TOKEN is not set. Add it as a GitHub secret (see Bot README.md).');
  process.exit(2);
}

const store = await createStore();
console.log(`[subscribe] state backend: ${store.backend}`);
try {
  const { count } = await processUpdates({ token, store, dryRun });
  if (!count) console.log('[subscribe] no pending updates');
} catch (err) {
  console.error('[subscribe] fatal:', err);
  process.exit(1);
}
