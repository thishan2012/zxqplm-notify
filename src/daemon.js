// Long-running bot process for hosting platforms (FPS.ms, Wisure, Oracle Cloud, ...).
// Ideal home for the bot commands — replies arrive within seconds instead of
// waiting for a cron tick. Feed checking can run here too, or stay on GitHub Actions.
//
// Env vars:
//   TELEGRAM_BOT_TOKEN      (required)
//   TURSO_DATABASE_URL      (required — shared state with the GitHub Actions notify jobs)
//   TURSO_AUTH_TOKEN
//   ROLES                   commands | feeds | all   (default: all)
//                             commands → poll bot commands only (use this when feeds stay on Actions)
//                             feeds    → check the 20 feeds only
//                             all      → both
//   POLL_INTERVAL_SECONDS   (default 3, min 2)
//   FEED_CHECK_MINUTES      (default 15, min 1)
//   MAJOR_KEYWORDS          (optional, comma-separated)
//
// IMPORTANT: a Telegram bot has exactly one getUpdates consumer. If ROLES
// includes commands, the GitHub Actions Subscribe workflow must NOT poll too.

import { createStore } from './db.js';
import { checkFeeds } from './checker.js';
import { processUpdates } from './poller.js';

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('TELEGRAM_BOT_TOKEN is not set.');
  process.exit(2);
}

const rolesRaw = (process.env.ROLES ?? 'all').trim().toLowerCase();
const roles = new Set(rolesRaw.split(',').map((r) => r.trim()).filter(Boolean));
const runCommands = roles.has('all') || roles.has('commands');
const runFeeds = roles.has('all') || roles.has('feeds');
if (!runCommands && !runFeeds) {
  console.error(`ROLES must contain commands, feeds or all (got: ${rolesRaw}).`);
  process.exit(2);
}

const POLL_SECONDS = Math.max(2, Number(process.env.POLL_INTERVAL_SECONDS ?? 3) || 3);
const FEED_MINUTES = Math.max(1, Number(process.env.FEED_CHECK_MINUTES ?? 15) || 15);

const store = await createStore();
console.log(`[daemon] state backend: ${store.backend}`);
console.log(`[daemon] roles: ${[...roles].join('+')} — commands poll every ${POLL_SECONDS}s; feeds every ${FEED_MINUTES}m`);

let shuttingDown = false;
// Serialize ticks so an update poll and a feed check never interleave DB writes.
let queue = Promise.resolve();
const serialize = (fn) => {
  queue = queue.then(fn).catch((err) => console.error('[daemon] tick error:', err?.message ?? err));
  return queue;
};

let updateTimer = null;
let feedTimer = null;

function schedule(kind) {
  if (shuttingDown) return;
  if (kind === 'update') updateTimer = setTimeout(runUpdateTick, POLL_SECONDS * 1000);
  else feedTimer = setTimeout(runFeedTick, FEED_MINUTES * 60 * 1000);
}

async function runUpdateTick() {
  if (shuttingDown) return;
  await serialize(async () => {
    const { count } = await processUpdates({ token, store });
    if (count) console.log(`[daemon] processed ${count} update(s) at ${new Date().toISOString()}`);
  });
  schedule('update');
}

async function runFeedTick() {
  if (shuttingDown) return;
  await serialize(() => checkFeeds({ store, token, shard: 'all' }));
  schedule('feed');
}

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  clearTimeout(updateTimer);
  clearTimeout(feedTimer);
  console.log(`[daemon] ${signal} received — waiting for current work to finish, then exiting`);
  queue.then(() => process.exit(0)).catch(() => process.exit(1));
  // Hard cap so a stuck network call cannot hang the host forever.
  setTimeout(() => process.exit(0), 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// First pass immediately (this also bootstraps seen-ids on a fresh DB).
if (runCommands) await runUpdateTick();
if (runFeeds) await runFeedTick();
