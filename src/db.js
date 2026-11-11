// State store. Two backends:
//
// 1) Turso (libSQL / SQLite-compatible) — the recommended "separate DB".
//    Set TURSO_DATABASE_URL (libsql://... or https://...) and TURSO_AUTH_TOKEN
//    in the environment (locally: in .env; on GitHub: as repo secrets).
//    Tables are created automatically on first use. No server, no open ports —
//    the libSQL client talks over HTTP(S).
//
//    Schema: a single key/value table `kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)`.
//    Keys used: subscribers, tg_offset, seen:<serviceId>, stats:last-run:{shard}
//
// 2) Local file store fallback for development/tests — used automatically when
//    the Turso env vars are missing. Files land in $STATE_DIR/*.local.json
//    (default ./state/, git-ignored).

import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@libsql/client';

const KV_SCHEMA = 'CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)';

function tursoConfig() {
  const url = process.env.TURSO_DATABASE_URL?.trim().replace(/\/+$/, '');
  const authToken = process.env.TURSO_AUTH_TOKEN?.trim();
  if (url && authToken) return { url, authToken };
  return null;
}

function stateDir() {
  return process.env.STATE_DIR || path.join(process.cwd(), 'state');
}

function filePathFor(key) {
  // Keys never contain path separators by convention; enforce it anyway.
  const safe = key.replace(/[^A-Za-z0-9._-]/g, '_');
  return path.join(stateDir(), `${safe}.local.json`);
}

async function tursoStore({ url, authToken }) {
  const client = createClient({ url, authToken });
  await client.execute(KV_SCHEMA);

  const get = async (key) => {
    const res = await client.execute({ sql: 'SELECT value FROM kv WHERE key = ?', args: [key] });
    const row = res.rows[0];
    return row ? String(row.value) : null;
  };

  const set = async (key, value) => {
    await client.execute({
      sql: 'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      args: [key, value],
    });
  };

  const del = async (key) => {
    await client.execute({ sql: 'DELETE FROM kv WHERE key = ?', args: [key] });
  };

  return {
    backend: 'turso',
    get,
    set,
    del,
    async getJSON(key, fallback = null) {
      const raw = await get(key);
      return raw == null ? fallback : JSON.parse(raw);
    },
    setJSON: (key, value) => set(key, JSON.stringify(value)),
  };
}

async function fileStore() {
  const get = async (key) => {
    try {
      return await readFile(filePathFor(key), 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  };

  const set = async (key, value) => {
    await mkdir(stateDir(), { recursive: true });
    await writeFile(filePathFor(key), value, 'utf8');
  };

  const del = async (key) => {
    await rm(filePathFor(key), { force: true });
  };

  return {
    backend: 'file',
    get,
    set,
    del,
    async getJSON(key, fallback = null) {
      const raw = await get(key);
      return raw == null ? fallback : JSON.parse(raw);
    },
    setJSON: (key, value) => set(key, JSON.stringify(value)),
  };
}

export async function createStore() {
  const turso = tursoConfig();
  if (turso) return tursoStore(turso);
  return fileStore();
}
