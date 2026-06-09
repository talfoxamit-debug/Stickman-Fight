// Keyboard input for two local players on one keyboard, plus global hotkeys.

export interface PlayerInput {
  left: boolean;
  right: boolean;
  jump: boolean;
  attack: boolean; // edge-triggered consumption handled by the fighter
  grab: boolean;
}

export const EMPTY_INPUT: PlayerInput = {
  left: false,
  right: false,
  jump: false,
  attack: false,
  grab: false,
};

type Bind = { left: string; right: string; jump: string; attack: string; grab: string };

const BINDS: [Bind, Bind] = [
  { left: 'KeyA', right: 'KeyD', jump: 'KeyW', attack: 'KeyF', grab: 'KeyG' },
  { left: 'ArrowLeft', right: 'ArrowRight', jump: 'ArrowUp', attack: 'Period', grab: 'Slash' },
];

export class Input {
  private down = new Set<string>();
  /** Global one-shot key events consumed by the game (restart, pause, bot). */
  private justPressed = new Set<string>();

  constructor() {
    window.addEventListener('keydown', (e) => {
      // Prevent the page from scrolling on arrows/space.
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
      if (!this.down.has(e.code)) this.justPressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
  }

  player(i: 0 | 1): PlayerInput {
    const b = BINDS[i];
    return {
      left: this.down.has(b.left),
      right: this.down.has(b.right),
      jump: this.down.has(b.jump),
      attack: this.down.has(b.attack),
      grab: this.down.has(b.grab),
    };
  }

  /** True once per physical press. */
  consumePressed(code: string): boolean {
    if (this.justPressed.has(code)) {
      this.justPressed.delete(code);
      return true;
    }
    return false;
  }

  /** Call at the end of each frame to clear one-shot state. */
  endFrame(): void {
    this.justPressed.clear();
  }
}
