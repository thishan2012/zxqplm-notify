// Subscribe entry point. Polls Telegram getUpdates, processes bot commands
// (/start, /subscribe, ...) and persists subscribers + the update offset.
//
// This is a poor-man's webhook: GitHub Actions cannot receive HTTP callbacks,
// so a cron workflow calls getUpdates instead. Keep polling frequency modest.
//
// Usage:
//   node src/subscribe.js            # one polling pass
//   node src/subscribe.js --dry-run  # process but do not send replies

import { createStore } from './db.js';
import { getUpdates, sendMessage } from './telegram.js';
import { SUBSCRIBERS_KEY, OFFSET_KEY, normalizeSubs } from './subscribers.js';
import { handleCommand } from './commands.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error('TELEGRAM_BOT_TOKEN is not set. Add it as a GitHub secret (see README).');
    process.exit(2);
  }

  const store = createStore();
  console.log(`[subscribe] state backend: ${store.backend}`);

  const offset = Number(await store.getJSON(OFFSET_KEY, 0)) || 0;
  const updates = await getUpdates(token, offset, { timeout: 0, limit: 100 });
  console.log(`[subscribe] ${updates.length} update(s) since offset ${offset}`);

  if (!updates.length) return;

  let subs = normalizeSubs(await store.getJSON(SUBSCRIBERS_KEY, null));
  let subsDirty = false;
  let maxUpdateId = offset - 1;

  const replies = []; // { chatId, text }

  for (const update of updates) {
    maxUpdateId = Math.max(maxUpdateId, update.update_id);
    const message = update.message ?? update.edited_message ?? null;
    const chatId = message?.chat?.id;
    const text = message?.text;
    if (!chatId || !text || !text.trim().startsWith('/')) continue;

    try {
      const result = handleCommand(subs, chatId, text);
      subs = result.subs;
      subsDirty = true;
      replies.push({ chatId, text: result.reply });
    } catch (err) {
      console.error(`[subscribe] command failed for update ${update.update_id}: ${err.message}`);
    }
  }

  if (subsDirty && !dryRun) {
    await store.setJSON(SUBSCRIBERS_KEY, subs);
    console.log('[subscribe] subscribers saved');
  }

  for (const { chatId, text } of replies) {
    if (dryRun) {
      console.log(`[dry-run] reply to ${chatId}: ${text}`);
      continue;
    }
    try {
      await sendMessage(token, chatId, text);
    } catch (err) {
      // Do not fail the run — advancing the offset matters more than one reply.
      console.error(`[subscribe] reply to ${chatId} failed: ${err.message}`);
    }
  }

  // Always advance the offset past everything we saw, otherwise we re-process forever.
  const newOffset = maxUpdateId + 1;
  if (!dryRun && newOffset > offset) {
    await store.setJSON(OFFSET_KEY, newOffset);
    console.log(`[subscribe] offset advanced to ${newOffset}`);
  }
}

main().catch((err) => {
  console.error('[subscribe] fatal:', err);
  process.exit(1);
});
