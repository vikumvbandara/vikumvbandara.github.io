import { PinballGame, WIDTH, HEIGHT, STEP, BALL_RADIUS, walls, bumpers, kickers } from './pinball-engine.mjs';

const root = document.querySelector('[data-pinball]');
if (root) {
  const canvas = root.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    root.querySelector('[data-status]').textContent = 'Your browser does not support this game’s canvas. Try another browser.';
  } else {
    init(root, canvas, ctx);
  }
}

function init(root, canvas, ctx) {
  const score = root.querySelector('[data-score]');
  const best = root.querySelector('[data-best]');
  const balls = root.querySelector('[data-balls]');
  const status = root.querySelector('[data-status]');
  const launch = root.querySelector('[data-launch]');
  const pause = root.querySelector('[data-pause]');
  const restart = root.querySelector('[data-restart]');
  let savedBest = 0;
  try {
    const value = Number(localStorage.getItem('vikum-pinball-best'));
    if (Number.isSafeInteger(value) && value > 0) savedBest = value;
  } catch { /* Storage is optional. */ }
  const game = new PinballGame(savedBest);
  const keys = new Set();
  const pointers = { left: new Set(), right: new Set() };
  const flipperButtons = [...root.querySelectorAll('[data-flipper]')];
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let previousState = '';
  let lastTime = 0;
  let accumulator = 0;
  let animation = 0;

  const held = () => ({
    left: keys.has('ArrowLeft') || keys.has('KeyA') || pointers.left.size > 0,
    right: keys.has('ArrowRight') || keys.has('KeyD') || pointers.right.size > 0,
  });
  function clearControls() {
    keys.clear();
    pointers.left.clear();
    pointers.right.clear();
    flipperButtons.forEach(button => { button.dataset.held = 'false'; });
  }
  function sync() {
    if (score.textContent !== game.score.toLocaleString()) score.textContent = game.score.toLocaleString();
    if (best.textContent !== game.best.toLocaleString()) best.textContent = game.best.toLocaleString();
    if (balls.textContent !== String(game.balls)) balls.textContent = String(game.balls);
    launch.disabled = game.state !== 'ready';
    pause.disabled = !['playing', 'paused'].includes(game.state);
    pause.textContent = game.state === 'paused' ? 'Resume' : 'Pause';
    flipperButtons.forEach(button => { button.disabled = ['paused', 'over'].includes(game.state); });
    if (game.best > savedBest) {
      savedBest = game.best;
      try { localStorage.setItem('vikum-pinball-best', String(savedBest)); } catch { /* Optional persistence. */ }
    }
    if (game.state !== previousState) {
      status.textContent = {
        ready: game.balls === 3 ? 'Ready when you are. Launch your first ball.' : `Ball lost. ${game.balls} ${game.balls === 1 ? 'ball' : 'balls'} left — launch again!`,
        playing: 'Ball in play. Hit the bumpers and keep it rolling!',
        paused: 'Paused. Resume whenever you’re ready.',
        over: `Game over! You scored ${game.score.toLocaleString()} points. Start a new game to try again.`,
      }[game.state];
      previousState = game.state;
    }
  }
  function focusTable() { canvas.focus({ preventScroll: true }); }
  launch.addEventListener('click', () => { game.launch(); focusTable(); sync(); });
  pause.addEventListener('click', () => { clearControls(); game.togglePause(); focusTable(); sync(); });
  restart.disabled = false;
  restart.addEventListener('click', () => {
    clearControls();
    game.reset();
    previousState = '';
    focusTable();
    sync();
  });
  canvas.addEventListener('pointerdown', focusTable);
  flipperButtons.forEach(button => {
    const side = button.dataset.flipper;
    button.addEventListener('pointerdown', event => {
      if (event.button !== 0 || button.disabled) return;
      event.preventDefault();
      pointers[side].add(event.pointerId);
      button.setPointerCapture(event.pointerId);
      button.dataset.held = 'true';
      focusTable();
    });
    function release(event) {
      pointers[side].delete(event.pointerId);
      button.dataset.held = String(pointers[side].size > 0);
    }
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
    button.addEventListener('contextmenu', event => event.preventDefault());
    // The visible controls are also usable with a keyboard when tabbed to.
    button.addEventListener('keydown', event => {
      if (event.code === 'Space' || event.code === 'Enter') {
        event.preventDefault();
        pointers[side].add('keyboard');
        button.dataset.held = 'true';
      }
    });
    button.addEventListener('keyup', event => {
      if (event.code === 'Space' || event.code === 'Enter') {
        pointers[side].delete('keyboard');
        button.dataset.held = String(pointers[side].size > 0);
      }
    });
    button.addEventListener('blur', () => {
      pointers[side].delete('keyboard');
      button.dataset.held = String(pointers[side].size > 0);
    });
  });
  root.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(event.code)) {
      event.preventDefault();
      keys.add(event.code);
    } else if (event.code === 'Space' && event.target === canvas) {
      event.preventDefault();
      if (!event.repeat) { game.launch(); sync(); }
    } else if (event.code === 'KeyP' && !event.repeat) {
      event.preventDefault();
      clearControls();
      game.togglePause();
      sync();
    }
  });
  window.addEventListener('keyup', event => { keys.delete(event.code); });
  function autoPause() {
    clearControls();
    if (game.state === 'playing') game.togglePause();
    sync();
  }
  window.addEventListener('blur', autoPause);
  root.addEventListener('focusout', event => {
    if (!root.contains(event.relatedTarget)) autoPause();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      autoPause();
      cancelAnimationFrame(animation);
    } else {
      lastTime = 0;
      accumulator = 0;
      animation = requestAnimationFrame(frame);
    }
  });

  function strokeLine(segment, color, width) {
    ctx.beginPath();
    ctx.moveTo(segment[0], segment[1]);
    ctx.lineTo(segment[2], segment[3]);
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    ctx.stroke();
  }
  function circle(x, y, radius, fill, stroke, width = 1) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
  }
  function label(text, x, y, size, color) {
    ctx.fillStyle = color;
    ctx.font = `${size}px Menlo, Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(text, x, y);
  }
  function draw() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== WIDTH * ratio || canvas.height !== HEIGHT * ratio) {
      canvas.width = WIDTH * ratio;
      canvas.height = HEIGHT * ratio;
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = '#101d28';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    for (let x = 42; x < 420; x += 24) {
      for (let y = 64; y < 690; y += 24) circle(x, y, 1, '#263743');
    }
    ctx.fillStyle = '#172936';
    ctx.fillRect(424, 194, 38, 526);
    circle(222, 280, 131, null, '#25414c');
    circle(222, 280, 140, null, '#20333f');
    label('P I N B A L L', 222, 100, 24, '#b4f3e4');
    label('KEEP IT ROLLING', 222, 126, 10, '#83a1af');
    for (const wall of walls) {
      strokeLine(wall, '#263f4e', 10);
      strokeLine(wall, '#6d8d9e', 3);
    }
    strokeLine([420, 110, 420, 195], '#71dcc5', 2);
    bumpers.forEach((bumper, index) => {
      const active = !reducedMotion.matches && game.time - (game.hits.get(`bumper-${index}`) ?? -Infinity) < .16;
      circle(bumper.x, bumper.y, bumper.radius + 9, null, '#34535b', 2);
      circle(bumper.x, bumper.y, bumper.radius, active ? '#d4fff3' : '#71dcc5', '#b4f3e4', 2);
      circle(bumper.x, bumper.y, bumper.radius - 8, '#183e43', '#4f9d90');
      label('100', bumper.x, bumper.y + 5, 13, '#c7fff1');
    });
    kickers.forEach(kicker => {
      strokeLine(kicker, '#543d32', 22);
      strokeLine(kicker, '#eab17f', 12);
    });
    label('25', 74, 433, 11, '#eab17f');
    label('25', 372, 433, 11, '#eab17f');
    label('V I K U M ’ S   A R C A D E', 222, 448, 10, '#7493a3');
    for (const flipper of game.flippers) {
      strokeLine(game.flipperSegment(flipper), '#2c716b', 24);
      strokeLine(game.flipperSegment(flipper), '#a0ecda', 18);
      circle(flipper.x, flipper.y, 6, '#24525a');
    }
    label('↓  DRAIN  ↓', 222, 700, 10, '#7493a3');
    for (let y = 682; y < 710; y += 6) strokeLine([433, y, 453, y], '#6d8d9e', 2);
    if (game.state !== 'over') {
      const { x, y } = game.ball;
      circle(x + 3, y + 4, BALL_RADIUS + 1, '#00000066');
      const metal = ctx.createRadialGradient(x - 3, y - 4, 1, x, y, BALL_RADIUS);
      metal.addColorStop(0, '#ffffff');
      metal.addColorStop(.45, '#d5e2ec');
      metal.addColorStop(1, '#708a9d');
      circle(x, y, BALL_RADIUS, metal);
    }
    if (game.state !== 'playing') {
      ctx.fillStyle = '#101d28ee';
      ctx.fillRect(82, 466, 280, 76);
      const title = { ready: 'READY TO ROLL?', paused: 'PAUSED', over: 'GAME OVER' }[game.state];
      const subtitle = { ready: 'SPACE / LAUNCH BALL', paused: 'P / RESUME', over: `${game.score.toLocaleString()} POINTS · PLAY AGAIN?` }[game.state];
      label(title, 222, 496, 19, '#b4f3e4');
      label(subtitle, 222, 521, 11, '#a7bfcc');
    }
  }
  function frame(timestamp) {
    const elapsed = lastTime ? Math.min((timestamp - lastTime) / 1000, .05) : 0;
    lastTime = timestamp;
    accumulator += elapsed;
    const controls = held();
    while (accumulator >= STEP) {
      game.step(STEP, controls);
      accumulator -= STEP;
    }
    flipperButtons.forEach(button => { button.dataset.held = String(controls[button.dataset.flipper]); });
    sync();
    draw();
    animation = requestAnimationFrame(frame);
  }
  sync();
  animation = requestAnimationFrame(frame);
}
