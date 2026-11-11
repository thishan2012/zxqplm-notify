import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createStore } from '../src/db.js';

// File-backend tests only — the Turso backend is covered by the GitHub
// Actions runtime (real credentials, real network).

test('file backend: set/get/getJSON/del roundtrip', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ozb-state-'));
  t.after(() => rm(dir, { recursive: true, force: true }));

  const saved = { ...process.env };
  delete process.env.TURSO_DATABASE_URL;
  delete process.env.TURSO_AUTH_TOKEN;
  process.env.STATE_DIR = dir;
  t.after(() => {
    process.env = saved;
  });

  const store = await createStore();
  assert.equal(store.backend, 'file');

  assert.equal(await store.get('missing'), null);
  assert.deepEqual(await store.getJSON('missing', { fallback: true }), { fallback: true });

  await store.set('plain', 'hello');
  assert.equal(await store.get('plain'), 'hello');

  await store.setJSON('subscribers', { all: [1, 2], services: {} });
  assert.deepEqual(await store.getJSON('subscribers'), { all: [1, 2], services: {} });

  await store.del('plain');
  assert.equal(await store.get('plain'), null);
});
