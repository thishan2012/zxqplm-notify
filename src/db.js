// State store. Two backends:
//
// 1) Upstash Redis via its HTTP REST API (recommended — this is the "separate DB").
//    Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in the environment
//    (locally: in .env; on GitHub: as repo secrets). No server, no open ports.
//
// 2) Local file store fallback for development/tests — used automatically when
//    the Upstash env vars are missing. Files land in ./state/*.local.json
//    (git-ignored).

import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

const FILE_STATE_DIR = path.join(process.cwd(), 'state');

function upstashConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return { url: url.replace(/\/+$/, ''), token };
  return null;
}

async function upstashGet({ url, token }, key) {
  const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Upstash GET ${key} failed: HTTP ${res.status} ${await res.text()}`);
  const body = await res.json();
  return body.result ?? null;
}

async function upstashSet({ url, token }, key, value) {
  const res = await fetch(`${url}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'text/plain; charset=utf-8',
    },
    body: value,
  });
  if (!res.ok) throw new Error(`Upstash SET ${key} failed: HTTP ${res.status} ${await res.text()}`);
}

async function upstashDel({ url, token }, key) {
  const res = await fetch(`${url}/del/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Upstash DEL ${key} failed: HTTP ${res.status} ${await res.text()}`);
}

function filePathFor(key) {
  // Keys never contain path separators by convention; enforce it anyway.
  const safe = key.replace(/[^A-Za-z0-9._-]/g, '_');
  return path.join(FILE_STATE_DIR, `${safe}.local.json`);
}

async function fileGet(key) {
  try {
    return await readFile(filePathFor(key), 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

async function fileSet(key, value) {
  await mkdir(FILE_STATE_DIR, { recursive: true });
  await writeFile(filePathFor(key), value, 'utf8');
}

async function fileDel(key) {
  await rm(filePathFor(key), { force: true });
}

export function createStore() {
  const upstash = upstashConfig();

  if (upstash) {
    return {
      backend: 'upstash',
      get: (key) => upstashGet(upstash, key),
      set: (key, value) => upstashSet(upstash, key, value),
      del: (key) => upstashDel(upstash, key),
      async getJSON(key, fallback = null) {
        const raw = await upstashGet(upstash, key);
        return raw == null ? fallback : JSON.parse(raw);
      },
      setJSON: (key, value) => upstashSet(upstash, key, JSON.stringify(value)),
    };
  }

  return {
    backend: 'file',
    get: fileGet,
    set: fileSet,
    del: fileDel,
    async getJSON(key, fallback = null) {
      const raw = await fileGet(key);
      return raw == null ? fallback : JSON.parse(raw);
    },
    setJSON: (key, value) => fileSet(key, JSON.stringify(value)),
  };
}
