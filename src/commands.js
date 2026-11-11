// Bot command handling as a pure function so it can be unit-tested
// without Telegram or a database.
//
//   handleCommand(subs, chatId, text) -> { subs, reply }
//
// `subs` is mutated and returned for convenience.

import { SERVICES, findService } from './services.js';
import { emptySubs, normalizeSubs, removeChatId } from './subscribers.js';

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function serviceListText() {
  const lines = SERVICES.map((s) => `• <code>${s.id}</code> — ${escapeHtml(s.name)}`);
  return `Tracked services (${SERVICES.length}):\n${lines.join('\n')}\n\nUse <code>/subscribe &lt;id&gt;</code> or <code>/subscribe all</code>.`;
}

const HELP_TEXT = [
  'I alert you only when a <b>major outage</b> happens on a service you subscribed to.',
  '',
  '<b>Commands</b>',
  '/services — list all services and their ids',
  '/subscribe &lt;id|all&gt; — subscribe to a service (or everything)',
  '/unsubscribe &lt;id|all&gt; — unsubscribe',
  '/myservices — what you are subscribed to',
  '/stop — unsubscribe from everything',
  '/help — this message',
].join('\n');

export function handleCommand(inputSubs, chatId, rawText) {
  const subs = normalizeSubs(inputSubs ?? emptySubs());
  const text = String(rawText ?? '').trim();
  const [cmdRaw, ...rest] = text.split(/\s+/);
  const cmd = (cmdRaw ?? '').toLowerCase().replace(/@\w+$/, '');
  const arg = rest.join(' ').trim().toLowerCase();

  switch (cmd) {
    case '/start':
      return {
        subs,
        reply: `Hey! 👋 Welcome to <b>OutageNotifyBot</b>.\n\n${HELP_TEXT}`,
      };

    case '/help':
      return { subs, reply: HELP_TEXT };

    case '/services':
      return { subs, reply: serviceListText() };

    case '/subscribe': {
      if (!arg) return { subs, reply: 'Usage: /subscribe &lt;service-id|all&gt; — see /services for ids.' };
      if (arg === 'all') {
        if (subs.all.includes(chatId)) return { subs, reply: 'You are already subscribed to everything. ✅' };
        subs.all.push(chatId);
        return { subs, reply: 'Subscribed to <b>all</b> services. I will ping you only on major outages. ✅' };
      }
      const service = findService(arg);
      if (!service) return { subs, reply: `Unknown service <code>${escapeHtml(arg)}</code>. See /services for valid ids.` };
      const list = (subs.services[service.id] ??= []);
      if (list.includes(chatId)) return { subs, reply: `Already subscribed to <b>${escapeHtml(service.name)}</b>. ✅` };
      list.push(chatId);
      return { subs, reply: `Subscribed to <b>${escapeHtml(service.name)}</b>. I will ping you only on major outages. ✅` };
    }

    case '/unsubscribe': {
      if (!arg) return { subs, reply: 'Usage: /unsubscribe &lt;service-id|all&gt; — see /services for ids.' };
      if (arg === 'all') {
        const before = subs.all.length;
        subs.all = subs.all.filter((id) => id !== chatId);
        let removedFrom = before ? ['all'] : [];
        for (const [key, ids] of Object.entries(subs.services)) {
          if (ids.includes(chatId)) removedFrom.push(key);
          subs.services[key] = ids.filter((id) => id !== chatId);
          if (!subs.services[key].length) delete subs.services[key];
        }
        return { subs, reply: removedFrom.length ? 'Unsubscribed from everything. 👋' : 'You were not subscribed to anything.' };
      }
      const service = findService(arg);
      if (!service) return { subs, reply: `Unknown service <code>${escapeHtml(arg)}</code>. See /services for valid ids.` };
      const ids = subs.services[service.id] ?? [];
      if (!ids.includes(chatId)) return { subs, reply: `You were not subscribed to <b>${escapeHtml(service.name)}</b>.` };
      subs.services[service.id] = ids.filter((id) => id !== chatId);
      if (!subs.services[service.id].length) delete subs.services[service.id];
      return { subs, reply: `Unsubscribed from <b>${escapeHtml(service.name)}</b>.` };
    }

    case '/myservices': {
      const mine = Object.entries(subs.services)
        .filter(([, ids]) => ids.includes(chatId))
        .map(([id]) => id);
      const all = subs.all.includes(chatId);
      if (all) return { subs, reply: 'You are subscribed to <b>all</b> services. ✅' };
      if (!mine.length) return { subs, reply: 'You are not subscribed to anything yet. Use /services to see what I can track.' };
      return { subs, reply: `You are subscribed to:\n${mine.map((id) => `• <code>${id}</code>`).join('\n')}` };
    }

    case '/stop':
      removeChatId(subs, chatId);
      return { subs, reply: 'Done — you will not receive any more alerts. Type /start any time to come back. 👋' };

    default:
      return { subs, reply: `Unknown command. ${HELP_TEXT}` };
  }
}
