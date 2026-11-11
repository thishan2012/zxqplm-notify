import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseFeed, entryIsAlertable, isMajor } from '../src/feeds.js';
import { diffNewEntries, mergeSeen } from '../src/subscribers.js';

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const read = (name) => readFile(path.join(fixtures, name), 'utf8');

test('parses RSS 2.0 feeds', async () => {
  const entries = parseFeed(await read('statuspage.rss'), { id: 'example' });
  assert.equal(entries.length, 2);
  assert.equal(entries[0].id, 'https://examplestatus.com/incidents/abc123');
  assert.equal(entries[0].title, 'Major Service Outage with Git Operations');
  assert.equal(entries[0].link, 'https://examplestatus.com/incidents/abc123');
  assert.ok(entries[0].pubDate.includes('2026'));
});

test('parses Atom feeds', async () => {
  const entries = parseFeed(await read('statuspage.atom'), { id: 'example', format: 'atom' });
  assert.equal(entries.length, 2);
  assert.equal(entries[0].id, 'https://examplestatus.com/incidents/xyz789');
  assert.equal(entries[0].link, 'https://examplestatus.com/incidents/xyz789');
  assert.equal(entries[0].title, 'Critical disruption with Edge Network');
});

test('parses Google Cloud incidents.json', async () => {
  const entries = parseFeed(await read('gc-incidents.json'), { id: 'gcloud', format: 'json-gc' });
  assert.equal(entries.length, 2);
  assert.equal(entries[0].id, 'IncIdent-gcloud-001');
  assert.equal(entries[0]._forcedMajor, true);
  assert.equal(entries[1]._forcedMajor, false);
});

test('major-outage filter fires only on big incidents', async () => {
  const rss = parseFeed(await read('statuspage.rss'), { id: 'example' });
  assert.equal(entryIsAlertable(rss[0]), true, 'major outage should alert');
  assert.equal(entryIsAlertable(rss[1]), false, 'scheduled maintenance should not alert');

  const atom = parseFeed(await read('statuspage.atom'), { id: 'example', format: 'atom' });
  assert.equal(entryIsAlertable(atom[0]), true, 'critical disruption should alert');
  assert.equal(entryIsAlertable(atom[1]), false, 'informational notice should not alert');

  const gc = parseFeed(await read('gc-incidents.json'), { id: 'gcloud', format: 'json-gc' });
  assert.equal(entryIsAlertable(gc[0]), true, 'SERVICE_OUTAGE should alert even without keywords');
  assert.equal(entryIsAlertable(gc[1]), false, 'SERVICE_INFORMATION should not alert');
});

test('isMajor respects MAJOR_KEYWORDS override semantics', () => {
  assert.equal(isMajor({ title: 'Elevated error rates', description: '' }, ['error']), true);
  assert.equal(isMajor({ title: 'Elevated error rates', description: '' }, ['outage']), false);
});

test('diffNewEntries returns only unseen ids', () => {
  const entries = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(diffNewEntries(entries, ['a', 'b']), [{ id: 'c' }]);
  assert.deepEqual(diffNewEntries(entries, []), entries);
});

test('mergeSeen dedupes and caps at 100', () => {
  const entries = Array.from({ length: 120 }, (_, i) => ({ id: `id-${i}` }));
  const merged = mergeSeen(['old-1', 'old-2'], entries);
  assert.equal(merged.length, 100);
  assert.ok(!merged.includes('old-1'));
  assert.ok(merged.includes('id-119'));
});

test('throws on garbage input', () => {
  assert.throws(() => parseFeed('<html><body>nope</body></html>', { id: 'broken' }));
});
