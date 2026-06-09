import { CFG } from './config';
import { Input } from './core/input';
import { Match, type GameMode } from './game/match';
import { Fx } from './render/fx';
import { Renderer } from './render/renderer';
import { MATERIALS, PAINTABLE } from './powder/materials';
import { UPGRADES } from './game/save';

const canvas = document.getElementById('game') as HTMLCanvasElement;
canvas.width = CFG.view.width;
canvas.height = CFG.view.height;
const ctx = canvas.getContext('2d')!;

const input = new Input(canvas);
const fx = new Fx();
let match = new Match(fx, 'sandbox'); // a lively brawl plays behind the menu
const renderer = new Renderer(ctx);

let screen: 'menu' | 'play' = 'menu';
let paused = false;
let simTime = 0;
let accumulator = 0;
let last = performance.now();
const DT = CFG.sim.fixedDt;
const MAX_STEPS = 5; // avoid the "spiral of death" if a frame stalls

let brush = 1; // index into PAINTABLE
let evoLabel = 'none';
const DIGITS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'];

const MODES: { key: string; mode: GameMode; label: string; desc: string }[] = [
  { key: '1', mode: 'versus', label: 'VERSUS (2P)', desc: 'Two humans, one keyboard. Best of 3.' },
  { key: '2', mode: 'solo', label: 'SOLO vs AI', desc: 'Fight the bot. P1 keyboard or mouse.' },
  { key: '3', mode: 'sandbox', label: 'SANDBOX / LAB', desc: 'Endless brawl + free chemistry painting.' },
  { key: '4', mode: 'survival', label: 'SURVIVAL', desc: 'Wave-based extraction: loot, level up, evolve (Z), extract @ wave 6.' },
];

function startMode(mode: GameMode): void {
  match = new Match(fx, mode);
  screen = 'play';
}

function frame(now: number): void {
  const dtReal = Math.min(now - last, 100);
  last = now;

  if (screen === 'menu') {
    for (const m of MODES) if (input.consumePressed(`Digit${m.key}`)) startMode(m.mode);
  } else {
    if (input.consumePressed('KeyM') || input.consumePressed('Escape')) screen = 'menu';
    if (input.consumePressed('KeyP')) paused = !paused;
    if (input.consumePressed('KeyR')) match.restart();
    if (input.consumePressed('KeyB')) match.toggleBot();
    if (input.consumePressed('KeyC')) match.grid.clear();
    if (input.consumePressed('KeyZ')) evoLabel = match.cyclePlayerEvolution();
    const inShop = match.mode === 'survival' && match.state === 'matchover';
    if (inShop) {
      for (let i = 0; i < UPGRADES.length; i++) if (input.consumePressed(`Digit${i + 1}`)) match.buyUpgrade(UPGRADES[i].key);
    } else {
      for (let d = 0; d < DIGITS.length; d++) if (input.consumePressed(DIGITS[d]) && d < PAINTABLE.length) brush = d;
    }
    const cur = input.cursor();
    if (cur && input.isDown('KeyQ')) match.grid.paintPx(cur.x, cur.y, PAINTABLE[brush], 16);
  }

  const running = !paused && (screen === 'play' || screen === 'menu');
  if (running) {
    accumulator += dtReal;
    let steps = 0;
    while (accumulator >= DT && steps < MAX_STEPS) {
      simTime += DT;
      const p1 = screen === 'play' ? input.player(0) : { ...input.player(0), attack: false, block: false };
      match.step(simTime, [p1, input.player(1)]);
      fx.update(DT);
      accumulator -= DT;
      steps++;
    }
    if (steps === MAX_STEPS) accumulator = 0;
  }

  renderer.draw(match, fx, paused);

  if (screen === 'menu') {
    drawMenu();
  } else {
    drawBrush();
    drawCrosshair();
  }

  input.endFrame();
  requestAnimationFrame(frame);
}

function drawMenu(): void {
  ctx.save();
  ctx.fillStyle = 'rgba(8,6,16,0.72)';
  ctx.fillRect(0, 0, CFG.view.width, CFG.view.height);
  ctx.textAlign = 'center';

  ctx.shadowColor = '#ff37c8';
  ctx.shadowBlur = 30;
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 64px ui-monospace, monospace';
  ctx.fillText('STICKMAN FIGHT', CFG.view.width / 2, 150);
  ctx.shadowColor = '#00f0ff';
  ctx.fillStyle = '#7cff5a';
  ctx.font = 'bold 30px ui-monospace, monospace';
  ctx.fillText('P O W D E R   A R E N A', CFG.view.width / 2, 196);
  ctx.shadowBlur = 0;

  const y0 = 290;
  for (let i = 0; i < MODES.length; i++) {
    const m = MODES[i];
    const y = y0 + i * 84;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(CFG.view.width / 2 - 320, y - 34, 640, 70);
    ctx.fillStyle = '#ffcf4d';
    ctx.font = 'bold 30px ui-monospace, monospace';
    ctx.fillText(`[${m.key}]  ${m.label}`, CFG.view.width / 2, y);
    ctx.fillStyle = '#cbb8ff';
    ctx.font = '16px ui-monospace, monospace';
    ctx.fillText(m.desc, CFG.view.width / 2, y + 24);
  }

  ctx.fillStyle = '#8a86a8';
  ctx.font = '14px ui-monospace, monospace';
  ctx.fillText('Press 1 / 2 / 3 to start  ·  in-game: M = menu', CFG.view.width / 2, CFG.view.height - 40);
  ctx.restore();
}

function drawBrush(): void {
  const bMat = MATERIALS[PAINTABLE[brush]];
  ctx.save();
  ctx.font = '12px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = `rgb(${bMat.rgb[0]},${bMat.rgb[1]},${bMat.rgb[2]})`;
  ctx.fillRect(12, CFG.view.height - 44, 14, 14);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText(`brush: ${bMat.name}  (1-0 pick · Q paint · C clear · M menu)`, 32, CFG.view.height - 33);
  ctx.fillStyle = 'rgba(124,255,90,0.85)';
  ctx.fillText(`P1 evolution: ${evoLabel}  (Z: fly/dig/tank/beast/mutant/tinker)`, 32, CFG.view.height - 56);
  ctx.restore();
}

function drawCrosshair(): void {
  const p1 = input.player(0);
  if (p1.aimX == null || p1.aimY == null) return;
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

requestAnimationFrame(frame);
