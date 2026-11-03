import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../supabase/functions/blackjack-leaderboard/handler.mjs';
import { BlackjackLeaderboard, signedMoney } from '../static/js/blackjack-leaderboard.mjs';

const token = '2c5794de-760c-4d87-a8fd-cf7d96ce807c';
const post = (body, session = token) => new Request('https://example.test', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-game-token': session, Origin: 'https://vikumvbandara.github.io' }, body: JSON.stringify(body) });
const score = { action: 'submit', name: 'Test Player', profit: 3750, hands: 1 };

test('public reads, session creation and authenticated score submission use only their intended calls', async () => {
  const calls = [];
  const handler = createHandler(async (name, args) => { calls.push({ name, args }); return name === 'blackjack_start_session' ? token : []; });
  assert.equal((await handler(new Request('https://example.test'))).status, 200);
  assert.deepEqual(await (await handler(post({ action: 'start' }, ''))).json(), { token });
  assert.equal((await handler(post(score))).status, 200);
  assert.deepEqual(calls, [
    { name: 'blackjack_top_scores', args: {} },
    { name: 'blackjack_start_session', args: {} },
    { name: 'blackjack_submit_score', args: { session_token: token, display_name: 'Test Player', net_cents: 3750, completed_hands: 1 } },
  ]);
});

test('malformed credentials, names, amounts and bodies never reach the database', async () => {
  let calls = 0;
  const handler = createHandler(async () => { calls++; });
  assert.equal((await handler(post(score, ''))).status, 401);
  for (const patch of [{ name: '   ' }, { name: 'a'.repeat(21) }, { name: 'a\nb' }, { profit: 1 }, { profit: -100250 }, { profit: 1000000250 }, { hands: 0 }, { hands: 1.5 }]) {
    assert.equal((await handler(post({ ...score, ...patch }))).status, 400);
  }
  assert.equal((await handler(post({ ...score, name: 'a'.repeat(1100) }))).status, 413);
  const foreign = new Request('https://example.test', { headers: { Origin: 'https://unrelated.test' } });
  assert.equal((await handler(foreign)).status, 403);
  assert.equal(calls, 0);
});

test('server failures never disclose backend details', async () => {
  let message = 'secret database detail';
  const handler = createHandler(async () => { throw new Error(message); });
  const failed = await handler(post(score));
  assert.equal(failed.status, 503);
  assert.doesNotMatch(await failed.text(), /secret database detail/);
  message = 'BJ_SESSION';
  assert.equal((await handler(post(score))).status, 401);
});

function clientFixture() {
  const client = Object.create(BlackjackLeaderboard.prototype);
  Object.assign(client, {
    generation: 1, snapshot: { profit: 3750, hands: 1 }, saved: null, busy: false,
    submitButton: { disabled: false }, name: { value: 'Player' }, notice: { textContent: '' },
    form: { reportValidity: () => true }, render: () => {}, load: async () => {},
  });
  return client;
}

test('one session is reused; a failed connection can be retried', async () => {
  const client = clientFixture(); let calls = 0;
  client.request = async () => { calls++; if (calls === 1) throw new Error('offline'); return { token }; };
  assert.equal(await client.start(), null);
  assert.equal(await client.start(), token);
  assert.equal(await client.start(), token);
  assert.equal(calls, 2);
});

test('an in-flight submission cannot overwrite a reset game', async () => {
  const client = clientFixture(); let resolve;
  client.start = async () => token;
  client.request = () => new Promise(done => { resolve = done; });
  const pending = client.submit();
  await Promise.resolve();
  client.reset();
  resolve({ player_name: 'Player', profit_cents: 3750, hands: 1 });
  await pending;
  assert.equal(client.saved, null);
  assert.equal(client.notice.textContent, '');
  assert.equal(client.busy, false);
});

test('submitting captures the finished hand even if play continues', async () => {
  const client = clientFixture(); let resolveToken; let submitted;
  client.start = () => new Promise(done => { resolveToken = done; });
  client.request = async body => { submitted = body; return { profit_cents: body.profit, hands: body.hands }; };
  const pending = client.submit();
  client.snapshot = { profit: 6250, hands: 2 };
  resolveToken(token);
  await pending;
  assert.equal(submitted.profit, 3750);
  assert.equal(submitted.hands, 1);
  assert.equal(client.snapshot.profit, 6250);
  assert.equal(client.saved.profit_cents, 3750);
});

test('practice dollar results keep cents and signs', () => {
  assert.equal(signedMoney(3750), '+$37.50');
  assert.equal(signedMoney(-2500), '-$25.00');
  assert.equal(signedMoney(0), '$0.00');
});
