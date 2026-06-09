import { CFG } from './config';
import { Input } from './core/input';
import { Match } from './game/match';
import { Fx } from './render/fx';
import { Renderer } from './render/renderer';

const canvas = document.getElementById('game') as HTMLCanvasElement;
canvas.width = CFG.view.width;
canvas.height = CFG.view.height;
const ctx = canvas.getContext('2d')!;

const input = new Input();
const fx = new Fx();
const match = new Match(fx);
const renderer = new Renderer(ctx);

let paused = false;
let simTime = 0;
let accumulator = 0;
let last = performance.now();
const DT = CFG.sim.fixedDt;
const MAX_STEPS = 5; // avoid the "spiral of death" if a frame stalls

function frame(now: number): void {
  const dtReal = Math.min(now - last, 100);
  last = now;

  // Global hotkeys (one-shot).
  if (input.consumePressed('KeyP')) paused = !paused;
  if (input.consumePressed('KeyR')) match.restart();
  if (input.consumePressed('KeyB')) match.toggleBot();

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
  input.endFrame();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
