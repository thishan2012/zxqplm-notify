import test from 'node:test';
import assert from 'node:assert/strict';

import { handleCommand } from '../src/commands.js';
import { emptySubs, normalizeSubs, subscribersFor, removeChatId } from '../src/subscribers.js';

const CHAT = 123456789;

test('/start replies with help and subscribes nobody', () => {
  const { subs, reply } = handleCommand(emptySubs(), CHAT, '/start');
  assert.deepEqual(subs, emptySubs());
  assert.match(reply, /OutageNotifyBot/);
});

test('/subscribe <service> adds the chat id', () => {
  const { subs, reply } = handleCommand(emptySubs(), CHAT, '/subscribe github');
  assert.deepEqual(subs.services.github, [CHAT]);
  assert.match(reply, /GitHub/);
});

test('/subscribe all adds the chat id to the all list', () => {
  const { subs } = handleCommand(emptySubs(), CHAT, '/subscribe all');
  assert.deepEqual(subs.all, [CHAT]);
});

test('/subscribe with unknown id fails gracefully', () => {
  const { subs, reply } = handleCommand(emptySubs(), CHAT, '/subscribe nope');
  assert.deepEqual(subs, emptySubs());
  assert.match(reply, /Unknown service/);
});

test('subscribing twice is idempotent', () => {
  let { subs } = handleCommand(emptySubs(), CHAT, '/subscribe github');
  ({ subs } = handleCommand(subs, CHAT, '/subscribe github'));
  assert.deepEqual(subs.services.github, [CHAT]);
});

test('subscribersFor unions all + per-service without duplicates', () => {
  let subs = emptySubs();
  subs.all.push(CHAT);
  subs.services.github = [CHAT, 999];
  assert.deepEqual(subscribersFor(subs, 'github').sort(), [CHAT, 999].sort());
  assert.deepEqual(subscribersFor(subs, 'stripe'), [CHAT]);
});

test('/unsubscribe removes only that service', () => {
  let { subs } = handleCommand(emptySubs(), CHAT, '/subscribe github');
  ({ subs } = handleCommand(subs, CHAT, '/subscribe stripe'));
  ({ subs } = handleCommand(subs, CHAT, '/unsubscribe github'));
  assert.equal(subs.services.github, undefined);
  assert.deepEqual(subs.services.stripe, [CHAT]);
});

test('/unsubscribe all removes everything for this chat', () => {
  let subs = { all: [CHAT, 1], services: { github: [CHAT, 2], stripe: [3] } };
  ({ subs } = handleCommand(subs, CHAT, '/unsubscribe all'));
  assert.deepEqual(subs.all, [1]);
  assert.deepEqual(subs.services.github, [2]);
  assert.deepEqual(subs.services.stripe, [3]);
});

test('/stop wipes the chat from every list', () => {
  let subs = removeChatId({ all: [CHAT], services: { github: [CHAT, 42] } }, CHAT);
  assert.deepEqual(subs.all, []);
  assert.deepEqual(subs.services.github, [42]);
});

test('/myservices reflects state', () => {
  let { subs } = handleCommand(emptySubs(), CHAT, '/subscribe arena');
  const { reply } = handleCommand(subs, CHAT, '/myservices');
  assert.match(reply, /arena/);
});

test('unknown commands get help text', () => {
  const { reply } = handleCommand(emptySubs(), CHAT, '/bogus');
  assert.match(reply, /Unknown command/);
});

test('normalizeSubs dedupes and drops junk', () => {
  const subs = normalizeSubs({ all: [1, 1, 'x', 2], services: { github: [3, 3, NaN], empty: [], junk: 'no' } });
  assert.deepEqual(subs.all, [1, 2]);
  assert.deepEqual(subs.services.github, [3]);
  assert.equal(subs.services.empty, undefined);
  assert.equal(subs.services.junk, undefined);
});

test('commands are case-insensitive and tolerate @botname suffix', () => {
  const { subs } = handleCommand(emptySubs(), CHAT, '/Subscribe@zxqplm_bot GitHub');
  assert.deepEqual(subs.services.github, [CHAT]);
});
