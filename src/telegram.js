// Minimal Telegram Bot API client over built-in fetch.

export async function tgApi(token, method, params = {}) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  let body = null;
  try { body = await res.json(); } catch { /* leave null */ }
  if (!res.ok || !body?.ok) {
    const desc = body?.description ?? `HTTP ${res.status}`;
    const err = new Error(`Telegram ${method} failed: ${desc}`);
    err.telegram = true;
    err.code = body?.error_code ?? res.status;
    throw err;
  }
  return body.result;
}

export const sendMessage = (token, chatId, text) =>
  tgApi(token, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });

export const getUpdates = (token, offset, { timeout = 0, limit = 100 } = {}) =>
  tgApi(token, 'getUpdates', { offset, timeout, limit });
