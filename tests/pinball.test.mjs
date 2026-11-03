import test from 'node:test';
import assert from 'node:assert/strict';
import { PinballGame, STEP, bumpers } from '../static/js/pinball-engine.mjs';

function advance(game, seconds, controls = {}) {
  for (let i = 0; i < Math.round(seconds / STEP); i++) game.step(STEP, controls);
}

test('a launch enters the playfield, scores, and eventually drains without input', () => {
  const game = new PinballGame();
  game.launch();
  advance(game, 2);
  assert.equal(game.launched, true);
  assert.ok(game.ball.x < 420);
  advance(game, 28);
  assert.equal(game.state, 'ready');
  assert.equal(game.balls, 2);
  assert.ok(game.score > 0);
});

test('three drains end the game; restart preserves the best score', () => {
  const game = new PinballGame(500);
  game.award('test', 700);
  for (let remaining = 2; remaining >= 0; remaining--) {
    game.launch();
    game.ball = { x: 222, y: 732, vx: 0, vy: 500 };
    game.step(STEP);
    assert.equal(game.balls, remaining);
  }
  assert.equal(game.state, 'over');
  game.launch();
  assert.equal(game.state, 'over');
  game.reset();
  assert.equal(game.state, 'ready');
  assert.equal(game.balls, 3);
  assert.equal(game.score, 0);
  assert.equal(game.best, 700);
});

test('pause freezes physics and score, and resume continues the same ball', () => {
  const game = new PinballGame();
  game.launch();
  advance(game, 1);
  game.togglePause();
  const before = JSON.stringify(game);
  advance(game, 5, { left: true, right: true });
  assert.equal(JSON.stringify(game), before);
  game.togglePause();
  advance(game, .1);
  assert.notEqual(JSON.stringify(game), before);
  assert.equal(game.balls, 3);
});

test('bumper collision reflects the ball and awards only one hit during cooldown', () => {
  const game = new PinballGame();
  game.launch();
  const bumper = bumpers[0];
  const hit = () => {
    game.ball = { x: bumper.x, y: bumper.y - bumper.radius - 8, vx: 0, vy: 300 };
    game.step(STEP);
  };
  hit();
  assert.equal(game.score, 100);
  assert.ok(game.ball.vy < 0);
  hit();
  assert.equal(game.score, 100);
});

test('each moving flipper sends a descending ball back upward', () => {
  for (const side of ['left', 'right']) {
    const game = new PinballGame();
    game.launch();
    const flipper = game.flippers[side === 'left' ? 0 : 1];
    game.ball = {
      x: flipper.x + Math.cos(flipper.angle) * 65,
      y: flipper.y + Math.sin(flipper.angle) * 65 - 18,
      vx: 0, vy: 200,
    };
    advance(game, .03, { [side]: true });
    assert.ok(game.ball.vy < -200, `${side} flipper should kick upward`);
  }
});

test('sustained play remains finite and never exceeds the ball speed limit', () => {
  const game = new PinballGame();
  game.launch();
  for (let i = 0; i < 240 * 120; i++) {
    if (game.state === 'ready') game.launch();
    if (game.state === 'over') { game.reset(); game.launch(); }
    game.step(STEP, { left: i % 127 < 43, right: i % 157 < 61 });
    assert.ok(Object.values(game.ball).every(Number.isFinite));
    assert.ok(Math.hypot(game.ball.vx, game.ball.vy) <= 1350.001);
    assert.ok(game.balls >= 0 && game.balls <= 3);
  }
});
