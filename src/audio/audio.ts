// Procedural sound via Web Audio — no assets. Short synthesized SFX for game feel.

export type SoundName =
  | 'hit' | 'swing' | 'heavy' | 'jump' | 'dodge' | 'boom'
  | 'parry' | 'dig' | 'ko' | 'ui' | 'zap' | 'spawn' | 'block' | 'land';

export class Audio {
  muted = false;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private last = new Map<SoundName, number>();

  private ensure(): AudioContext | null {
    if (typeof AudioContext === 'undefined') return null;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      const n = this.ctx.sampleRate * 0.4;
      this.noiseBuf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    return this.ctx;
  }

  resume(): void {
    const c = this.ensure();
    if (c && c.state === 'suspended') void c.resume();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  private tone(t: number, f0: number, f1: number, dur: number, vol: number, type: OscillatorType = 'sine'): void {
    const ctx = this.ctx!, g = ctx.createGain(), o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master!);
    o.start(t); o.stop(t + dur + 0.02);
  }

  private noise(t: number, dur: number, freq: number, vol: number, type: BiquadFilterType = 'lowpass'): void {
    const ctx = this.ctx!, src = ctx.createBufferSource(), filt = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = this.noiseBuf;
    filt.type = type; filt.frequency.value = freq; filt.Q.value = type === 'bandpass' ? 2 : 0.7;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt); filt.connect(g); g.connect(this.master!);
    src.start(t); src.stop(t + dur + 0.02);
  }

  play(name: SoundName, vol = 1): void {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();
    const now = ctx.currentTime;
    const lastT = this.last.get(name) ?? 0;
    if (now - lastT < 0.035) return; // rate-limit per sound
    this.last.set(name, now);
    const v = vol;
    switch (name) {
      case 'hit': this.noise(now, 0.07, 2000, 0.45 * v); this.tone(now, 150, 60, 0.1, 0.4 * v, 'triangle'); break;
      case 'heavy': this.noise(now, 0.12, 1200, 0.5 * v); this.tone(now, 110, 40, 0.18, 0.5 * v, 'sawtooth'); break;
      case 'swing': this.noise(now, 0.14, 1100, 0.18 * v, 'bandpass'); break;
      case 'dodge': this.noise(now, 0.18, 700, 0.16 * v, 'bandpass'); break;
      case 'jump': this.tone(now, 320, 620, 0.12, 0.22 * v, 'square'); break;
      case 'boom': this.noise(now, 0.35, 900, 0.6 * v); this.tone(now, 90, 28, 0.4, 0.6 * v, 'sawtooth'); break;
      case 'parry': this.tone(now, 1300, 1900, 0.08, 0.3 * v, 'square'); this.tone(now + 0.02, 2200, 2600, 0.1, 0.18 * v, 'sine'); break;
      case 'block': this.noise(now, 0.05, 3000, 0.25 * v, 'bandpass'); break;
      case 'land': this.noise(now, 0.09, 380, 0.32 * v); this.tone(now, 120, 50, 0.1, 0.22 * v, 'sine'); break;
      case 'dig': this.noise(now, 0.06, 700, 0.3 * v); break;
      case 'zap': this.tone(now, 2000, 1400, 0.12, 0.2 * v, 'square'); this.noise(now, 0.08, 3500, 0.2 * v, 'bandpass'); break;
      case 'spawn': this.tone(now, 160, 70, 0.25, 0.25 * v, 'sawtooth'); break;
      case 'ko': this.tone(now, 500, 700, 0.1, 0.3 * v, 'square'); this.tone(now + 0.09, 700, 950, 0.12, 0.3 * v, 'square'); this.tone(now + 0.2, 950, 1300, 0.16, 0.3 * v, 'square'); break;
      case 'ui': this.tone(now, 700, 700, 0.05, 0.2 * v, 'square'); break;
    }
  }
}
