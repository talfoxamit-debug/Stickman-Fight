import { CFG } from './config';
import { Input } from './core/input';
import { Match, type GameMode } from './game/match';
import { Fx } from './render/fx';
import { Renderer } from './render/renderer';
import { MATERIALS, PAINTABLE } from './powder/materials';
import { UPGRADES } from './game/save';
import { World } from './world/world';
import { EVOLUTIONS } from './physics/fighter';
import { SKILLS, skillNodePos } from './game/skills';

const canvas = document.getElementById('game') as HTMLCanvasElement;
canvas.width = CFG.view.width;
canvas.height = CFG.view.height;
const ctx = canvas.getContext('2d')!;

const input = new Input(canvas);
const fx = new Fx();
// Audio needs a user gesture to start (browser autoplay policy).
window.addEventListener('keydown', () => fx.audio.resume());
window.addEventListener('pointerdown', () => fx.audio.resume());
let match = new Match(fx, 'sandbox'); // a lively brawl plays behind the menu
let world: World | null = null;
const renderer = new Renderer(ctx);

let screen: 'menu' | 'play' = 'menu';
let paused = false;
let simTime = 0;
let accumulator = 0;
let last = performance.now();
const DT = CFG.sim.fixedDt;
const MAX_STEPS = 5;

let brush = 1;
let evoLabel = 'none';
const DIGITS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'];

const MODES: { key: string; mode: GameMode; label: string; desc: string }[] = [
  { key: '1', mode: 'versus', label: 'VERSUS (2P)', desc: 'Two humans, one keyboard. Best of 3.' },
  { key: '2', mode: 'solo', label: 'SOLO vs AI', desc: 'Fight the bot. P1 keyboard or mouse.' },
  { key: '3', mode: 'sandbox', label: 'SANDBOX / LAB', desc: 'Endless brawl + free chemistry painting.' },
  { key: '4', mode: 'survival', label: 'SURVIVAL', desc: 'Wave-based extraction: loot, level up, evolve (Z).' },
  { key: '5', mode: 'world', label: 'WORLD (Terraria-style)', desc: 'Explore + dig a big generated world. (early)' },
];

function startMode(mode: GameMode): void {
  if (mode === 'world') {
    world = new World(fx, 'none');
  } else {
    world = null;
    match = new Match(fx, mode);
  }
  screen = 'play';
}

function stepFixed(dtReal: number, fn: () => void): void {
  if (paused) return;
  accumulator += dtReal;
  let steps = 0;
  while (accumulator >= DT && steps < MAX_STEPS) {
    simTime += DT;
    fn();
    fx.update(DT);
    accumulator -= DT;
    steps++;
  }
  if (steps === MAX_STEPS) accumulator = 0;
}

function frame(now: number): void {
  const dtReal = Math.min(now - last, 100);
  last = now;

  if (input.consumePressed('KeyN')) fx.audio.toggleMute();

  if (screen === 'menu') {
    for (const m of MODES) if (input.consumePressed(`Digit${m.key}`)) startMode(m.mode);
    stepFixed(dtReal, () => match.step(simTime, [{ ...input.player(0), attack: false, block: false }, input.player(1)]));
    renderer.draw(match, fx, false);
    drawMenu();
  } else if (world) {
    if (input.consumePressed('KeyM') || input.consumePressed('Escape')) { world = null; screen = 'menu'; }
    else {
      if (input.consumePressed('KeyP')) paused = !paused;
      if (input.consumePressed('KeyK')) world.skillTreeOpen = !world.skillTreeOpen;
      if (input.consumePressed('KeyE')) world.crafting = !world.crafting;
      if (world.skillTreeOpen) {
        if (input.consumeClick()) {
          const cur = input.cursor();
          if (cur) for (const s of SKILLS) { const np = skillNodePos(s); if (Math.abs(cur.x - np.x) < 130 && Math.abs(cur.y - np.y) < 26) { world.learnSkill(s.id); break; } }
        }
      } else if (world.crafting) {
        for (let i = 0; i < world.craftDefs.length; i++) if (input.consumePressed(`Digit${i + 1}`)) world.craft(i);
      } else {
        if (input.consumePressed('KeyZ')) {
          const e = EVOLUTIONS[(EVOLUTIONS.indexOf(world.player.evolution) + 1) % EVOLUTIONS.length];
          world.player.evolution = e;
          evoLabel = e;
        }
        for (let i = 0; i < 4; i++) if (input.consumePressed(`Digit${i + 1}`)) world.useSkill(i, simTime);
        const w = world;
        stepFixed(dtReal, () => w.step(simTime, input.player(0)));
      }
    }
    if (world) { renderer.drawWorld(world, fx); drawCrosshair(); }
    else { renderer.draw(match, fx, paused); drawMenu(); }
  } else {
    handlePlayKeys();
    stepFixed(dtReal, () => match.step(simTime, [input.player(0), input.player(1)]));
    renderer.draw(match, fx, paused);
    drawBrush();
    drawCrosshair();
  }

  input.endFrame();
  requestAnimationFrame(frame);
}

function handlePlayKeys(): void {
  if (input.consumePressed('KeyM') || input.consumePressed('Escape')) { screen = 'menu'; return; }
  if (input.consumePressed('KeyP')) paused = !paused;
  if (input.consumePressed('KeyR')) match.restart();
  if (input.consumePressed('KeyB')) match.toggleBot();
  if (input.consumePressed('KeyC')) match.grid.clear();
  if (input.consumePressed('KeyZ')) evoLabel = match.cyclePlayerEvolution();
  const inHub = match.mode === 'survival' && (match.state === 'matchover' || match.state === 'prep');
  if (inHub) {
    for (let i = 0; i < UPGRADES.length; i++) if (input.consumePressed(`Digit${i + 1}`)) match.buyUpgrade(UPGRADES[i].key);
    if (match.state === 'prep' && (input.consumePressed('Enter') || input.consumePressed('Space'))) match.deploy();
  } else {
    for (let d = 0; d < DIGITS.length; d++) if (input.consumePressed(DIGITS[d]) && d < PAINTABLE.length) brush = d;
  }
  const cur = input.cursor();
  if (cur && input.isDown('KeyQ')) match.grid.paintPx(cur.x, cur.y, PAINTABLE[brush], 16);
}

function drawMenu(): void {
  ctx.save();
  ctx.fillStyle = 'rgba(8,6,16,0.72)';
  ctx.fillRect(0, 0, CFG.view.width, CFG.view.height);
  ctx.textAlign = 'center';
  ctx.shadowColor = '#ff37c8';
  ctx.shadowBlur = 30;
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 60px ui-monospace, monospace';
  ctx.fillText('STICKMAN FIGHT', CFG.view.width / 2, 130);
  ctx.shadowColor = '#00f0ff';
  ctx.fillStyle = '#7cff5a';
  ctx.font = 'bold 28px ui-monospace, monospace';
  ctx.fillText('P O W D E R   A R E N A', CFG.view.width / 2, 172);
  ctx.shadowBlur = 0;
  const y0 = 250;
  for (let i = 0; i < MODES.length; i++) {
    const m = MODES[i];
    const y = y0 + i * 78;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(CFG.view.width / 2 - 340, y - 30, 680, 64);
    ctx.fillStyle = '#ffcf4d';
    ctx.font = 'bold 26px ui-monospace, monospace';
    ctx.fillText(`[${m.key}]  ${m.label}`, CFG.view.width / 2, y);
    ctx.fillStyle = '#cbb8ff';
    ctx.font = '15px ui-monospace, monospace';
    ctx.fillText(m.desc, CFG.view.width / 2, y + 22);
  }
  ctx.fillStyle = '#8a86a8';
  ctx.font = '13px ui-monospace, monospace';
  ctx.fillText('press 1-5 to start  ·  in-game: M = menu', CFG.view.width / 2, CFG.view.height - 30);
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
