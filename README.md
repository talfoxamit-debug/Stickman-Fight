# Stickman Fight: Powder Arena

> A chaotic real-time **ragdoll brawler** fused with a **falling-sand chemistry sandbox**,
> dressed up like *Mad Max meets Burning Man* — hyper-colorful, neon, and gleefully silly.
> Damage limbs, knock weapons off the arm that held them, melt armor in acid, electrify
> water, detonate gunpowder, and craft *genius* weapons from parts + elements. Couch
> 2-player, a vs-AI campaign, **and** a big Terraria-style **Survival** mode where you
> explore, loot, fight monsters, level up, and **evolve** (grow wings and fly, or become a
> digger and tunnel underground).

Inspired by physics ragdoll fighters (Stick Fight / Gang Beasts) **+** the emergent
element chemistry of dan-ball's *Powder Game / Dust2* **+** the loot-and-extract loop of
Arc Raiders **+** the open-world survival of Terraria — wrapped in absurd festival color.

---

## The fantasy

You are a stickman. So is your enemy. Every limb is a real physics body held on by a
joint with its own integrity. Hit an arm hard enough and it breaks off — and the sword
it was holding clatters to the floor for anyone to grab. The arena is alive: pools of
water, rivers of lava, gunpowder caches, oil slicks, acid pits, live wires. Combine
your weapons with the environment and you stop fighting like a brute and start fighting
like an **alchemist**.

## Status

🚧 **Pre-production.** This repo currently contains the design + plan. Nothing is
built yet — see the docs below, then we build it phase by phase (Phase 1 is an
independently fun, playable 2-player ragdoll duel).

## Docs

- **[docs/DESIGN.md](docs/DESIGN.md)** — full game design + technical architecture.
- **[docs/SURVIVAL.md](docs/SURVIVAL.md)** — the Terraria-style survival / RPG / extraction mode.
- **[docs/EVOLUTION.md](docs/EVOLUTION.md)** — evolution branches (wings/flight, digger, etc.).
- **[docs/ART_DIRECTION.md](docs/ART_DIRECTION.md)** — the "Burning Wasteland" colorful/silly look.
- **[docs/ROADMAP.md](docs/ROADMAP.md)** — phased build plan with checklists.

## Planned tech

TypeScript · Vite · Matter.js (rigid-body ragdolls) · custom cellular-automata powder
engine (typed arrays + Canvas/ImageData) · Howler (audio) · Gamepad + dual-keyboard
input · localStorage saves. No backend; runs in any modern browser and deploys static.

## Planned modes

- **Campaign (vs AI)** — themed elemental bosses; unlock weapon parts, armor & elements.
- **Versus (local 2P)** — bring your unlocked loadout, pick an arena, best-of-N.
- **The Lab (Sandbox)** — full powder sandbox + every part; invent and break things.
- **Trials** — technique & environment-kill challenges.
- **Survival / Expedition** — Terraria-style open world + Arc-Raiders-style extraction
  runs: explore, gather, fight zombies & monsters, harvest them for crafting, level up an
  RPG character, and **evolve** into branches (winged flier, underground digger, and more).
