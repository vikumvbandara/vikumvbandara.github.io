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
  let completed = 0;
  for (let i = 0; i < 1000; i++) {
    if (game.balance < 500) { game.reset(); completed = 0; }
    game.deal(500);
    while (game.state === 'playing' && handValue(game.player).total < 17) game.hit();
    game.stand();
    const all = [...game.player, ...game.dealer, ...game.deck];
    assert.equal(all.length, 52);
    assert.equal(new Set(all.map(c => c.rank + c.suit.name)).size, 52);
    assert.equal(Object.values(game.stats).reduce((a, b) => a + b), ++completed);
    assert.equal(game.balance, 100000 + game.netProfit);
    assert.ok(Number.isSafeInteger(game.balance) && game.balance >= 0);
  }
});

test('a wager is debited once and ordinary wins pay 1:1 profit', () => {
  const game = gameWith('10', '10', '8', '7');
  game.deal(2500);
  assert.equal(game.balance, 97500);
  assert.equal(game.netProfit, 0);
  assert.equal(game.deal(10000), false);
  assert.equal(game.wager, 2500);
  game.stand();
  assert.equal(game.balance, 102500);
  assert.equal(game.lastProfit, 2500);
  assert.equal(game.netProfit, 2500);
  game.stand();
  assert.equal(game.balance, 102500);
});

test('blackjack pays 3:2 profit with exact cents', () => {
  const game = gameWith('A', '9', 'K', '8');
  game.deal(2500);
  assert.equal(game.balance, 103750);
  assert.equal(game.lastProfit, 3750);
});

test('losses cost only the wager and ties return it, including two blackjacks', () => {
  for (const [ranks, expected] of [
    [['10', '10', '8', '9'], -2500],
    [['10', '10', '8', '8'], 0],
    [['A', 'A', 'K', 'Q'], 0],
    [['10', 'A', '8', 'K'], -2500],
  ]) {
    const game = gameWith(...ranks);
    game.deal(2500); game.stand();
    assert.equal(game.balance, 100000 + expected);
    assert.equal(game.lastProfit, expected);
    assert.equal(game.netProfit, expected);
  }
});

test('invalid and unaffordable wagers cannot deal or change funds', () => {
  const game = gameWith('10', '10', '8', '9');
  for (const wager of [0, -500, 100, 550, 500.5, NaN, Infinity, 100500, '2500']) {
    assert.equal(game.deal(wager), false);
    assert.equal(game.balance, 100000);
    assert.equal(game.round, 0);
  }
});

test('all-in loss prevents more hands until resetting the practice session', () => {
  const game = gameWith('10', '10', '8', '9');
  game.deal(100000);
  assert.equal(game.reset(), false, 'Cannot reset a wager in progress');
  game.stand();
  assert.equal(game.balance, 0);
  assert.equal(game.netProfit, -100000);
  assert.equal(game.deal(500), false);
  assert.equal(game.reset(), true);
  assert.equal(game.balance, 100000);
  assert.equal(game.netProfit, 0);
  assert.equal(game.round, 0);
  assert.deepEqual(game.stats, {wins: 0, losses: 0, ties: 0});
  assert.equal(game.deal(500), true);
});
