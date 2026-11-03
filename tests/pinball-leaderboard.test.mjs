import test from 'node:test';
import assert from 'node:assert/strict';
import { Leaderboard } from '../static/js/pinball-leaderboard.mjs';

test('successful empty submission responses are accepted, not shown as failures', async () => {
  const client = Object.create(Leaderboard.prototype);
  client.config = { url: 'https://example.supabase.co', publishableKey: 'public-test-key' };
  client.fetcher = async (url, options) => {
    assert.ok(url.endsWith('/rest/v1/rpc/pinball_submit_score'));
    assert.equal(options.headers.apikey, 'public-test-key');
    assert.equal(JSON.parse(options.body).final_score, 100);
    return new Response(null, { status: 204 });
  };
  assert.equal(await client.rpc('pinball_submit_score', { final_score: 100 }), null);
});

test('server errors remain failures so a player can retry', async () => {
  const client = Object.create(Leaderboard.prototype);
  client.config = { url: 'https://example.supabase.co', publishableKey: 'public-test-key' };
  client.fetcher = async () => new Response('unavailable', { status: 503 });
  await assert.rejects(client.rpc('pinball_top_scores'));
});

test('launching additional balls reuses one online game session', async () => {
  const client = Object.create(Leaderboard.prototype);
  client.config = { url: 'https://example.supabase.co', publishableKey: 'public-test-key' };
  let starts = 0;
  client.rpc = async () => { starts++; return 'one-session'; };
  client.start();
  client.start();
  client.start();
  assert.equal(await client.run, 'one-session');
  assert.equal(starts, 1);
});
