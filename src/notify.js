// Notify entry point. Checks one shard of services and alerts subscribers
// only about NEW major outages. First run bootstraps silently (no spam).
//
// Usage:
//   node src/notify.js --shard=a            # shard a services only
//   node src/notify.js --shard=b
//   node src/notify.js                      # both shards (local runs)
//   node src/notify.js --shard=a --dry-run  # print what would be sent

import { createStore } from './db.js';
import { SERVICES, servicesForShard } from './services.js';
import { fetchFeed, entryIsAlertable } from './feeds.js';
import { sendMessage } from './telegram.js';
import {
  SUBSCRIBERS_KEY,
  SEEN_PREFIX,
  LAST_RUN_PREFIX,
  normalizeSubs,
  subscribersFor,
  diffNewEntries,
  mergeSeen,
  removeChatId,
} from './subscribers.js';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
};

const shard = opt('shard', 'all');
const dryRun = flag('dry-run');

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function truncate(s, n) {
  s = String(s ?? '');
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function formatAlert(service, entry) {
  const lines = [
    `🚨 <b>Major outage</b> — ${escapeHtml(service.name)}`,
    '',
    `<b>${escapeHtml(truncate(entry.title, 300))}</b>`,
  ];
  if (entry.pubDate) lines.push(`🕒 ${escapeHtml(entry.pubDate)}`);
  if (entry.link) lines.push(`🔗 ${escapeHtml(entry.link)}`);
  return lines.join('\n');
}

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token && !dryRun) {
    console.error('TELEGRAM_BOT_TOKEN is not set. Add it as a GitHub secret (see README).');
    process.exit(2);
  }

  const shards = shard === 'all' ? ['a', 'b'] : [shard];
  const store = createStore();
  console.log(`[notify] state backend: ${store.backend}`);

  // Subscribers are shared between shards; read once, write once if pruned.
  let subs = normalizeSubs(await store.getJSON(SUBSCRIBERS_KEY, null));
  let subsDirty = false;
  const deadChatIds = new Set();

  let feedFailures = 0;
  let totalFeeds = 0;
  let totalAlerts = 0;

  for (const shardId of shards) {
    const services = servicesForShard(shardId);
    const shardStats = { shard: shardId, ranAt: new Date().toISOString(), results: [] };

    for (const service of services) {
      totalFeeds += 1;
      const result = { id: service.id, ok: false, newEntries: 0, alertable: 0, notified: 0 };
      try {
        const entries = await fetchFeed(service);
        const seenIds = await store.getJSON(SEEN_PREFIX + service.id, null);

        // Bootstrap: first ever sight of this feed — record current entries, alert nothing.
        if (seenIds === null) {
          await store.setJSON(SEEN_PREFIX + service.id, mergeSeen([], entries));
          console.log(`[${service.id}] bootstrap: recorded ${entries.length} existing entries, no alerts sent`);
          result.ok = true;
          result.bootstrap = true;
          shardStats.results.push(result);
          continue;
        }

        const newEntries = diffNewEntries(entries, seenIds);
        result.newEntries = newEntries.length;

        if (newEntries.length) {
          await store.setJSON(SEEN_PREFIX + service.id, mergeSeen(seenIds, newEntries));
        }

        const alertable = newEntries.filter((e) => entryIsAlertable(e));
        result.alertable = alertable.length;

        for (const entry of alertable) {
          totalAlerts += 1;
          const chatIds = subscribersFor(subs, service.id);
          const text = formatAlert(service, entry);
          if (dryRun) {
            console.log(`[dry-run] would alert ${chatIds.length} chat(s) for ${service.id}: ${entry.title}`);
            continue;
          }
          for (const chatId of chatIds) {
            try {
              await sendMessage(token, chatId, text);
              result.notified += 1;
            } catch (err) {
              console.error(`[${service.id}] send to ${chatId} failed: ${err.message}`);
              // 400 chat not found / 403 bot blocked → prune from subscribers.
              if (err.code === 400 || err.code === 403) deadChatIds.add(chatId);
            }
          }
        }

        result.ok = true;
        console.log(`[${service.id}] ok — ${entries.length} entries, ${newEntries.length} new, ${alertable.length} alertable, ${result.notified} sent`);
      } catch (err) {
        feedFailures += 1;
        result.error = String(err.message ?? err);
        console.error(`[${service.id}] FAILED: ${result.error}`);
      }
      shardStats.results.push(result);
    }

    try {
      await store.setJSON(LAST_RUN_PREFIX + shardId, shardStats);
    } catch (err) {
      console.error(`[notify] failed to write stats for shard ${shardId}: ${err.message}`);
    }
  }

  // Prune dead chat ids in one write.
  if (deadChatIds.size) {
    for (const chatId of deadChatIds) removeChatId(subs, chatId);
    subsDirty = true;
    console.log(`[notify] pruned ${deadChatIds.size} dead chat id(s)`);
  }
  if (subsDirty && !dryRun) {
    await store.setJSON(SUBSCRIBERS_KEY, subs);
  }

  console.log(`[notify] done — feeds ok: ${totalFeeds - feedFailures}/${totalFeeds}, alerts triggered: ${totalAlerts}`);

  // If every feed failed, the run itself is broken — make the workflow red.
  if (totalFeeds > 0 && feedFailures === totalFeeds) process.exit(1);
}

main().catch((err) => {
  console.error('[notify] fatal:', err);
  process.exit(1);
});
