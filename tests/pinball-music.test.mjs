import test from 'node:test';
import assert from 'node:assert/strict';
import { ArcadeMusic } from '../static/js/pinball-music.mjs';

test('music is opt-in, schedules notes, stops on pause, and resumes without overlapping timers', async () => {
  const originalWindow = globalThis.window;
  let starts = 0, stops = 0;
  const parameter = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime(value) { this.value = value; } });
  class AudioContext {
    currentTime = 0;
    destination = {};
    resume() { return Promise.resolve(); }
    createGain() { return { gain: parameter(), connect() {}, disconnect() {} }; }
    createOscillator() {
      return { frequency: parameter(), connect() {}, disconnect() {}, start() { starts++; }, stop() { stops++; } };
    }
  }
  globalThis.window = { AudioContext };
  const music = new ArcadeMusic();
  try {
    music.setPlaying(true);
    assert.equal(starts, 0, 'No audio before a user enables music');
    await music.enable();
    assert.ok(starts >= 2, 'Melody and bass both play');
    const timer = music.timer;
    music.setPlaying(true);
    assert.equal(music.timer, timer);
    music.setVolume(0);
    assert.equal(music.output.gain.value, 0);
    music.setPlaying(false);
    assert.equal(music.timer, null);
    assert.equal(music.voices.size, 0);
    assert.ok(stops >= starts);
    music.setPlaying(true);
    assert.ok(music.timer);
    music.disable();
    assert.equal(music.timer, null);
  } finally { music.disable(); globalThis.window = originalWindow; }
});
