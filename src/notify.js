// Notify entry point (one-shot, used by GitHub Actions).
// Checks the requested shard and alerts subscribers about NEW major outages.
//
// Usage:
//   node src/notify.js --shard=a            # shard a services only
//   node src/notify.js --shard=b
//   node src/notify.js                      # both shards (local runs)
//   node src/notify.js --shard=a --dry-run  # print what would be sent

import { createStore } from './db.js';
import { checkFeeds } from './checker.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const shardArg = args.find((a) => a.startsWith('--shard='));
const shard = shardArg ? shardArg.split('=').slice(1).join('=') : 'all';

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token && !dryRun) {
  console.error('TELEGRAM_BOT_TOKEN is not set. Add it as a GitHub secret (see Bot README.md).');
  process.exit(2);
}

try {
  const store = await createStore();
  const { totalFeeds, feedFailures } = await checkFeeds({ store, token, shard, dryRun });
  // If every feed failed, the run itself is broken — make the workflow red.
  if (totalFeeds > 0 && feedFailures === totalFeeds) process.exit(1);
} catch (err) {
  console.error(`[notify] FATAL: ${err?.message ?? err}`);
  process.exit(1);
}
