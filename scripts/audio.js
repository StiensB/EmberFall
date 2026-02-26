export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.enabled = false;
  }

  ensure() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return false;
      this.ctx = new AudioCtx();
    }
    this.enabled = true;
    return true;
  }

  beep(freq = 440, duration = 0.09, type = 'square', gain = 0.02) {
    if (!this.enabled || !this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = gain;
    o.connect(g).connect(this.ctx.destination);
    o.start();
    o.stop(this.ctx.currentTime + duration);
  }

  playSkill() { this.beep(660, 0.08, 'triangle', 0.03); }
  playHit() { this.beep(220, 0.05, 'square', 0.028); }
  playQuest() { this.beep(880, 0.1, 'sine', 0.026); }
}
