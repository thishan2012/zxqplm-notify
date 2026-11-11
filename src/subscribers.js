// Pure-ish helpers for subscriber records and alert diffing — exported for tests.
//
// Subscribers live under a single DB key "subscribers":
//   {
//     "all": [chatId, ...],              // subscribed to every service (/subscribe all)
//     "services": { "github": [chatId] } // per-service
//   }

export const SUBSCRIBERS_KEY = 'subscribers';
export const OFFSET_KEY = 'tg_offset';
export const SEEN_PREFIX = 'seen:';
export const LAST_RUN_PREFIX = 'stats:last-run:';
const SEEN_CAP = 100;

export function emptySubs() {
  return { all: [], services: {} };
}

export function normalizeSubs(raw) {
  const subs = emptySubs();
  if (!raw || typeof raw !== 'object') return subs;
  if (Array.isArray(raw.all)) subs.all = [...new Set(raw.all.map(Number).filter(Number.isFinite))];
  if (raw.services && typeof raw.services === 'object') {
    for (const [id, ids] of Object.entries(raw.services)) {
      if (!Array.isArray(ids)) continue;
      const clean = [...new Set(ids.map(Number).filter(Number.isFinite))];
      if (clean.length) subs.services[id] = clean;
    }
  }
  return subs;
}

export function subscribersFor(subs, serviceId) {
  const ids = new Set(subs.all ?? []);
  for (const id of subs.services?.[serviceId] ?? []) ids.add(id);
  return [...ids];
}

export function removeChatId(subs, chatId) {
  subs.all = (subs.all ?? []).filter((id) => id !== chatId);
  for (const key of Object.keys(subs.services ?? {})) {
    subs.services[key] = subs.services[key].filter((id) => id !== chatId);
    if (!subs.services[key].length) delete subs.services[key];
  }
  return subs;
}

// Given feed entries and previously-seen ids, return what's new.
export function diffNewEntries(entries, seenIds) {
  const seen = new Set(seenIds ?? []);
  return entries.filter((e) => !seen.has(e.id));
}

export function mergeSeen(seenIds, entries) {
  const merged = [...(seenIds ?? []), ...entries.map((e) => e.id)];
  return [...new Set(merged)].slice(-SEEN_CAP);
}
