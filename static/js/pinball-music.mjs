// An original, softly voiced arcade loop. No downloads or third-party audio.
export class ArcadeMusic {
  constructor() {
    this.enabled = false;
    this.playing = false;
    this.volume = .25;
    this.timer = null;
    this.voices = new Set();
    this.step = 0;
  }

  async enable() {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) throw new Error('Audio is not supported in this browser.');
    if (!this.context) {
      this.context = new Audio();
      this.output = this.context.createGain();
      this.output.gain.value = this.volume * .3;
      this.output.connect(this.context.destination);
    }
    await this.context.resume();
    this.enabled = true;
    this.update();
  }

  setVolume(value) {
    this.volume = Math.max(0, Math.min(1, value));
    if (this.output) this.output.gain.setTargetAtTime(this.volume * .3, this.context.currentTime, .04);
  }

  setPlaying(value) {
    if (this.playing === value) return;
    this.playing = value;
    this.update();
  }

  disable() {
    this.enabled = false;
    this.update();
  }

  update() {
    if (!this.enabled || !this.playing) {
      clearInterval(this.timer);
      this.timer = null;
      for (const voice of this.voices) { try { voice.stop(); } catch { /* Already ended. */ } }
      this.voices.clear();
      return;
    }
    if (this.timer) return;
    this.nextTime = this.context.currentTime + .04;
    this.schedule();
    this.timer = setInterval(() => this.schedule(), 80);
  }

  note(midi, time, length, level, type) {
    const voice = this.context.createOscillator();
    const envelope = this.context.createGain();
    voice.type = type;
    voice.frequency.value = 440 * 2 ** ((midi - 69) / 12);
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(level, time + .012);
    envelope.gain.exponentialRampToValueAtTime(.001, time + length);
    voice.connect(envelope);
    envelope.connect(this.output);
    this.voices.add(voice);
    voice.onended = () => { this.voices.delete(voice); voice.disconnect(); envelope.disconnect(); };
    voice.start(time);
    voice.stop(time + length + .02);
  }

  schedule() {
    const melody = [72, 76, 79, 83, 79, 76, 74, 79, 72, 76, 81, 79, 76, 74, 72, null,
      69, 72, 76, 79, 76, 72, 74, 76, 71, 74, 79, 81, 79, 74, 71, null];
    const bass = [48, 53, 45, 55];
    // Never schedule a backlog if the browser has throttled the tab.
    this.nextTime = Math.max(this.nextTime, this.context.currentTime);
    while (this.nextTime < this.context.currentTime + .18) {
      const index = this.step % melody.length;
      if (melody[index]) this.note(melody[index], this.nextTime, .21, .34, 'triangle');
      if (index % 2 === 0) this.note(bass[Math.floor(index / 8)], this.nextTime, .36, .45, 'sine');
      this.step++;
      this.nextTime += 60 / 112 / 2;
    }
  }
}
