// Input for two local players: keyboard for both, plus mouse aim/buttons for P1.

import { CFG } from '../config';

export interface PlayerInput {
  left: boolean;
  right: boolean;
  jump: boolean;
  attack: boolean;
  grab: boolean;
  block: boolean;
  /** Aim point in internal (1280x720) coords, or null when not aiming (keyboard only). */
  aimX: number | null;
  aimY: number | null;
}

export const EMPTY_INPUT: PlayerInput = {
  left: false, right: false, jump: false, attack: false, grab: false, block: false,
  aimX: null, aimY: null,
};

type Bind = { left: string; right: string; jump: string; attack: string; grab: string; block: string };

const BINDS: [Bind, Bind] = [
  { left: 'KeyA', right: 'KeyD', jump: 'KeyW', attack: 'KeyF', grab: 'KeyG', block: 'KeyS' },
  { left: 'ArrowLeft', right: 'ArrowRight', jump: 'ArrowUp', attack: 'Period', grab: 'Slash', block: 'ArrowDown' },
];

export class Input {
  private down = new Set<string>();
  private justPressed = new Set<string>();
  private mClientX = 0;
  private mClientY = 0;
  private mLeft = false;
  private mRight = false;
  private mActive = false; // becomes true once the mouse is used (then P1 aims with it)
  private mClick = false; // one-shot left-click (for UI)

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
      if (!this.down.has(e.code)) this.justPressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => { this.down.clear(); this.mLeft = false; this.mRight = false; });

    canvas.addEventListener('mousemove', (e) => {
      this.mClientX = e.clientX;
      this.mClientY = e.clientY;
      this.mActive = true;
    });
    canvas.addEventListener('mousedown', (e) => {
      this.mActive = true;
      if (e.button === 0) { this.mLeft = true; this.mClick = true; }
      if (e.button === 2) this.mRight = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mLeft = false;
      if (e.button === 2) this.mRight = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private aim(): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: ((this.mClientX - r.left) / r.width) * CFG.view.width,
      y: ((this.mClientY - r.top) / r.height) * CFG.view.height,
    };
  }

  player(i: 0 | 1): PlayerInput {
    const b = BINDS[i];
    const kb: PlayerInput = {
      left: this.down.has(b.left),
      right: this.down.has(b.right),
      jump: this.down.has(b.jump),
      attack: this.down.has(b.attack),
      grab: this.down.has(b.grab),
      block: this.down.has(b.block),
      aimX: null,
      aimY: null,
    };
    if (i === 0 && this.mActive) {
      const a = this.aim();
      kb.aimX = a.x;
      kb.aimY = a.y;
      kb.attack = kb.attack || this.mLeft;
      kb.block = kb.block || this.mRight;
    }
    return kb;
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  /** True once per fresh left-click (for UI buttons). */
  consumeClick(): boolean {
    if (this.mClick) { this.mClick = false; return true; }
    return false;
  }

  /** Internal-resolution cursor position (or null if the mouse hasn't been used). */
  cursor(): { x: number; y: number } | null {
    return this.mActive ? this.aim() : null;
  }

  consumePressed(code: string): boolean {
    if (this.justPressed.has(code)) {
      this.justPressed.delete(code);
      return true;
    }
    return false;
  }

  endFrame(): void {
    this.justPressed.clear();
  }
}
