import { CFG } from '../config';
import { randRange, pick } from '../core/util';
import type { FxSink } from '../game/match';
import { Audio, type SoundName } from '../audio/audio';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  rot: number;
  vr: number;
  color: string;
  square: boolean;
}

const CONFETTI = ['#ff37c8', '#00f0ff', '#ffcf4d', '#7cff5a', '#b18bff', '#ff6b6b', '#ffffff'];
const BLOOD = ['#c8121b', '#e02030', '#8a0b12', '#ff3b4a', '#a00d16'];

/** Particles + screen shake. Implements FxSink so the Match can poke it directly. */
export class Fx implements FxSink {
  private parts: Particle[] = [];
  private shakeAmt = 0;
  shakeX = 0;
  shakeY = 0;
  audio = new Audio();

  sound(name: SoundName, vol = 1): void {
    this.audio.play(name, vol);
  }

  impact(x: number, y: number, strength: number, color: string): void {
    const n = Math.min(24, 4 + Math.floor(strength));
    for (let i = 0; i < n; i++) {
      const a = randRange(0, Math.PI * 2);
      const sp = randRange(1, 2 + strength * 0.25);
      this.parts.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 1,
        life: randRange(260, 520),
        max: 520,
        size: randRange(1.5, 3.5),
        rot: 0, vr: 0,
        color,
        square: false,
      });
    }
  }

  blood(x: number, y: number, amount: number): void {
    const n = Math.min(34, 4 + Math.floor(amount * 1.1));
    for (let i = 0; i < n; i++) {
      const a = randRange(0, Math.PI * 2);
      const sp = randRange(1, 2 + amount * 0.35);
      this.parts.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - randRange(0.5, 2.5),
        life: randRange(500, 1400),
        max: 1400,
        size: randRange(1.6, 4.2),
        rot: 0, vr: 0,
        color: pick(BLOOD),
        square: false,
      });
    }
  }

  confetti(x: number, y: number): void {
    this.audio.play('ko');
    for (let i = 0; i < 90; i++) {
      const a = randRange(0, Math.PI * 2);
      const sp = randRange(2, 8);
      this.parts.push({
        x: x + randRange(-30, 30),
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - randRange(2, 6),
        life: randRange(900, 1800),
        max: 1800,
        size: randRange(3, 6),
        rot: randRange(0, Math.PI),
        vr: randRange(-0.3, 0.3),
        color: pick(CONFETTI),
        square: true,
      });
    }
  }

  shake(amount: number): void {
    this.shakeAmt = Math.max(this.shakeAmt, amount);
  }

  update(dtMs: number): void {
    const dt = dtMs / 16.67;
    for (const p of this.parts) {
      p.vy += 0.18 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.life -= dtMs;
    }
    this.parts = this.parts.filter((p) => p.life > 0 && p.y < CFG.view.height + 40);

    this.shakeAmt *= 0.86;
    if (this.shakeAmt < 0.2) this.shakeAmt = 0;
    this.shakeX = randRange(-this.shakeAmt, this.shakeAmt);
    this.shakeY = randRange(-this.shakeAmt, this.shakeAmt);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.parts) {
      const alpha = Math.min(1, p.life / 300);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      if (p.square) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}
