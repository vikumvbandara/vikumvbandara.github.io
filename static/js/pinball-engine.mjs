export const WIDTH = 480;
export const HEIGHT = 720;
export const STEP = 1 / 240;
export const BALL_RADIUS = 9;
export const walls = [
  [24, 660, 24, 110], [24, 110, 80, 36], [80, 36, 360, 36],
  [360, 36, 466, 120], [466, 120, 466, 720],
  [420, 195, 420, 720],
  [24, 500, 62, 560], [62, 560, 112, 615],
  [420, 500, 382, 560], [382, 560, 332, 615],
];
export const bumpers = [
  { x: 155, y: 220, radius: 28 },
  { x: 290, y: 220, radius: 28 },
  { x: 222, y: 330, radius: 30 },
];
export const kickers = [[70, 454, 115, 524], [374, 454, 329, 524]];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// The simulation is independent of drawing and uses fixed steps at every frame rate.
export class PinballGame {
  constructor(best = 0) {
    this.best = best;
    this.reset();
  }

  reset() {
    this.score = 0;
    this.balls = 3;
    this.time = 0;
    this.hits = new Map();
    this.flippers = [
      { x: 112, y: 615, length: 95, angle: .4, rest: .4, raised: -.48, velocity: 0 },
      { x: 332, y: 615, length: 95, angle: Math.PI - .4, rest: Math.PI - .4, raised: Math.PI + .48, velocity: 0 },
    ];
    this.prepareBall();
  }

  prepareBall() {
    this.ball = { x: 443, y: 650, vx: 0, vy: 0 };
    this.state = 'ready';
    this.launched = false;
  }

  launch() {
    if (this.state !== 'ready') return;
    this.state = 'playing';
    this.ball.vx = 0;
    this.ball.vy = -1120;
  }

  togglePause() {
    if (this.state === 'playing') this.state = 'paused';
    else if (this.state === 'paused') this.state = 'playing';
  }

  award(id, points) {
    if (this.time - (this.hits.get(id) ?? -Infinity) < .14) return;
    this.hits.set(id, this.time);
    this.score += points;
    this.best = Math.max(this.best, this.score);
  }

  // Capsule collision with optional moving surface velocity for the flippers.
  collideSegment(segment, radius = 3, restitution = .8, surface = null) {
    const [ax, ay, bx, by] = segment;
    const dx = bx - ax, dy = by - ay;
    const t = clamp(((this.ball.x - ax) * dx + (this.ball.y - ay) * dy) / (dx * dx + dy * dy), 0, 1);
    const px = ax + t * dx, py = ay + t * dy;
    const ox = this.ball.x - px, oy = this.ball.y - py;
    const distance = Math.hypot(ox, oy);
    const contact = BALL_RADIUS + radius;
    if (distance >= contact) return false;
    const nx = distance > .001 ? ox / distance : dy / Math.hypot(dx, dy);
    const ny = distance > .001 ? oy / distance : -dx / Math.hypot(dx, dy);
    this.ball.x = px + nx * (contact + .1);
    this.ball.y = py + ny * (contact + .1);
    const sx = surface ? -surface.velocity * (py - surface.y) : 0;
    const sy = surface ? surface.velocity * (px - surface.x) : 0;
    const approach = (this.ball.vx - sx) * nx + (this.ball.vy - sy) * ny;
    if (approach >= 0) return false;
    this.ball.vx -= (1 + restitution) * approach * nx;
    this.ball.vy -= (1 + restitution) * approach * ny;
    return true;
  }

  flipperSegment(flipper) {
    return [flipper.x, flipper.y, flipper.x + Math.cos(flipper.angle) * flipper.length, flipper.y + Math.sin(flipper.angle) * flipper.length];
  }

  step(dt, held = {}) {
    if (this.state === 'paused' || this.state === 'over') return;
    this.time += dt;
    this.flippers.forEach((flipper, index) => {
      const target = held[index === 0 ? 'left' : 'right'] ? flipper.raised : flipper.rest;
      const previous = flipper.angle;
      flipper.angle += clamp(target - flipper.angle, -14 * dt, 14 * dt);
      flipper.velocity = (flipper.angle - previous) / dt;
    });
    if (this.state !== 'playing') return;
    const ball = this.ball;
    ball.vy += 620 * dt;
    ball.vx *= Math.exp(-.06 * dt);
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    for (const wall of walls) this.collideSegment(wall);
    // A one-way gate keeps the ball out of the launch lane after it enters the table.
    if (ball.x < 401) this.launched = true;
    if (this.launched) this.collideSegment([420, 110, 420, 195]);
    // If a weak rebound returns to the shooter lane, automatically serve it again.
    if (!this.launched && ball.x > 432 && ball.y > 650 && ball.vy > 0) ball.vy = -1120;
    bumpers.forEach((bumper, index) => {
      const dx = ball.x - bumper.x, dy = ball.y - bumper.y;
      const distance = Math.hypot(dx, dy);
      const contact = bumper.radius + BALL_RADIUS;
      if (distance >= contact) return;
      const nx = distance > .001 ? dx / distance : 0;
      const ny = distance > .001 ? dy / distance : -1;
      ball.x = bumper.x + nx * (contact + .2);
      ball.y = bumper.y + ny * (contact + .2);
      const approach = ball.vx * nx + ball.vy * ny;
      if (approach < 0) {
        const impulse = Math.max(440, -approach * 1.85);
        ball.vx += impulse * nx;
        ball.vy += impulse * ny;
        this.award(`bumper-${index}`, 100);
      }
    });
    kickers.forEach((kicker, index) => {
      if (this.collideSegment(kicker, 7, 1.05)) {
        ball.vx += index === 0 ? 100 : -100;
        ball.vy -= 110;
        this.award(`kicker-${index}`, 25);
      }
    });
    for (const flipper of this.flippers) this.collideSegment(this.flipperSegment(flipper), 9, .65, flipper);
    const speed = Math.hypot(ball.vx, ball.vy);
    if (speed > 1350) {
      ball.vx *= 1350 / speed;
      ball.vy *= 1350 / speed;
    }
    if (ball.y > HEIGHT + BALL_RADIUS) {
      this.balls -= 1;
      if (this.balls > 0) this.prepareBall();
      else this.state = 'over';
    }
  }
}
