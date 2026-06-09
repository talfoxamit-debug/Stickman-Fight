import { CFG } from './config';
import { Input } from './core/input';
import { Match } from './game/match';
import { Fx } from './render/fx';
import { Renderer } from './render/renderer';
import { MATERIALS, PAINTABLE } from './powder/materials';

const canvas = document.getElementById('game') as HTMLCanvasElement;
canvas.width = CFG.view.width;
canvas.height = CFG.view.height;
const ctx = canvas.getContext('2d')!;

const input = new Input(canvas);
const fx = new Fx();
const match = new Match(fx);
const renderer = new Renderer(ctx);

let paused = false;
let simTime = 0;
let accumulator = 0;
let last = performance.now();
const DT = CFG.sim.fixedDt;
const MAX_STEPS = 5; // avoid the "spiral of death" if a frame stalls

// Powder brush (sandbox painting): 1-0 select, hold Q to paint, C to clear.
let brush = 1; // index into PAINTABLE (Water by default)
const DIGITS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'];

function frame(now: number): void {
  const dtReal = Math.min(now - last, 100);
  last = now;

  // Global hotkeys (one-shot).
  if (input.consumePressed('KeyP')) paused = !paused;
  if (input.consumePressed('KeyR')) match.restart();
  if (input.consumePressed('KeyB')) match.toggleBot();
  if (input.consumePressed('KeyC')) match.grid.clear();
  for (let d = 0; d < DIGITS.length; d++) if (input.consumePressed(DIGITS[d]) && d < PAINTABLE.length) brush = d;

  // Paint the selected material at the cursor while holding Q.
  const cur = input.cursor();
  if (cur && input.isDown('KeyQ')) match.grid.paintPx(cur.x, cur.y, PAINTABLE[brush], 16);

  if (!paused) {
    accumulator += dtReal;
    let steps = 0;
    while (accumulator >= DT && steps < MAX_STEPS) {
      simTime += DT;
      match.step(simTime, [input.player(0), input.player(1)]);
      fx.update(DT);
      accumulator -= DT;
      steps++;
    }
    if (steps === MAX_STEPS) accumulator = 0; // drop backlog
  }

  renderer.draw(match, fx, paused);

  // Powder brush indicator (sandbox).
  const bMat = MATERIALS[PAINTABLE[brush]];
  ctx.save();
  ctx.font = '12px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = `rgb(${bMat.rgb[0]},${bMat.rgb[1]},${bMat.rgb[2]})`;
  ctx.fillRect(12, CFG.view.height - 44, 14, 14);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText(`brush: ${bMat.name}  (1-0 pick · hold Q paint · C clear)`, 32, CFG.view.height - 33);
  ctx.restore();

  // P1 aim crosshair (when the mouse is in use).
  const p1 = input.player(0);
  if (p1.aimX != null && p1.aimY != null) {
    ctx.save();
    ctx.strokeStyle = 'rgba(0,240,255,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p1.aimX, p1.aimY, 9, 0, Math.PI * 2);
    ctx.moveTo(p1.aimX - 14, p1.aimY); ctx.lineTo(p1.aimX - 4, p1.aimY);
    ctx.moveTo(p1.aimX + 4, p1.aimY); ctx.lineTo(p1.aimX + 14, p1.aimY);
    ctx.moveTo(p1.aimX, p1.aimY - 14); ctx.lineTo(p1.aimX, p1.aimY - 4);
    ctx.moveTo(p1.aimX, p1.aimY + 4); ctx.lineTo(p1.aimX, p1.aimY + 14);
    ctx.stroke();
    ctx.restore();
  }

  input.endFrame();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
