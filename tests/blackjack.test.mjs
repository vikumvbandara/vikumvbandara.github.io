import test from 'node:test';
import assert from 'node:assert/strict';
import { BlackjackGame, handValue, shuffledDeck, SUITS } from '../static/js/blackjack-engine.mjs';

const cards = (...ranks) => ranks.map(rank => ({ rank, suit: SUITS[0] }));
const gameWith = (...ranks) => new BlackjackGame(() => cards(...ranks).reverse());

test('a shuffled deck contains all 52 unique cards', () => {
  const deck = shuffledDeck(() => .4);
  assert.equal(deck.length, 52);
  assert.equal(new Set(deck.map(c => c.rank + c.suit.name)).size, 52);
});

test('aces adapt to prevent busting, including multiple aces', () => {
  assert.deepEqual(handValue(cards('A', '6')), { total: 17, soft: true });
  assert.deepEqual(handValue(cards('A', '6', 'K')), { total: 17, soft: false });
  assert.deepEqual(handValue(cards('A', 'A', '9')), { total: 21, soft: true });
  assert.deepEqual(handValue(cards('A', 'A', '9', 'K')), { total: 21, soft: false });
});

test('naturals resolve immediately and two naturals tie', () => {
  for (const [ranks, outcome] of [
    [['A', '9', 'K', '8'], 'win'],
    [['9', 'A', '8', 'K'], 'loss'],
    [['A', 'A', 'K', 'Q'], 'tie'],
  ]) {
    const game = gameWith(...ranks);
    game.deal();
    assert.equal(game.state, 'over');
    assert.equal(game.outcome, outcome);
    assert.equal(Object.values(game.stats).reduce((a, b) => a + b), 1);
  }
});

test('dealer stands on soft 17 and does not draw an extra card', () => {
  const game = gameWith('10', 'A', '8', '6', 'K');
  game.deal(); game.stand();
  assert.equal(game.dealer.length, 2);
  assert.equal(game.outcome, 'win');
});

test('dealer draws below 17 and can bust', () => {
  const game = gameWith('10', '9', '8', '7', 'K');
  game.deal(); game.stand();
  assert.equal(handValue(game.dealer).total, 26);
  assert.equal(game.outcome, 'win');
});

test('busting loses immediately and repeated actions cannot change the result', () => {
  const game = gameWith('10', '9', '7', '7', 'K');
  game.deal(); game.hit();
  assert.equal(game.outcome, 'loss');
  assert.equal(game.dealer.length, 2);
  const snapshot = JSON.stringify(game);
  assert.equal(game.hit(), false);
  assert.equal(game.stand(), false);
  assert.equal(JSON.stringify(game), snapshot);
});

test('hitting 21 automatically stands, and ordinary equal totals tie', () => {
  const game = gameWith('7', '10', '4', '6', 'K', '5');
  game.deal(); game.hit();
  assert.equal(game.state, 'over');
  assert.equal(game.outcome, 'tie');
  assert.equal(game.stats.ties, 1);
});

test('dealer wins with a higher total', () => {
  const game = gameWith('10', '10', '8', '9');
  game.deal(); game.stand();
  assert.equal(game.outcome, 'loss');
});

test('dealing during a hand is ignored; the next hand resets cards but keeps stats', () => {
  const game = gameWith('10', '10', '8', '7');
  assert.equal(game.hit(), false);
  game.deal();
  assert.equal(game.deal(), false);
  assert.equal(game.round, 1);
  game.stand();
  game.deal();
  assert.equal(game.round, 2);
  assert.equal(game.player.length, 2);
  assert.equal(game.dealer.length, 2);
  assert.equal(game.stats.wins, 1);
  assert.equal(game.state, 'playing');
});

test('long practice sessions conserve cards and count each round once', () => {
  const game = new BlackjackGame();
  for (let i = 0; i < 1000; i++) {
    game.deal();
    while (game.state === 'playing' && handValue(game.player).total < 17) game.hit();
    game.stand();
    const all = [...game.player, ...game.dealer, ...game.deck];
    assert.equal(all.length, 52);
    assert.equal(new Set(all.map(c => c.rank + c.suit.name)).size, 52);
    assert.equal(Object.values(game.stats).reduce((a, b) => a + b), i + 1);
  }
});
