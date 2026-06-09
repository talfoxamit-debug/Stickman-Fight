# Master Plan & Status

Living plan after the v0.18 review. Honest status: **strong core (ragdoll combat +
chemistry), weak shell (world/survival/RPG + feel).** Priority = depth + feel, not more
breadth.

## Locked decisions (made autonomously)

1. **Scale:** small character in a vast world — **big chunky tiles** (so the stickman is
   ~3-4 tiles) **+ a zoomed-out camera**. Fixes the v0.18 screenshot.
2. **The point:** full **RPG/combat loop** — explore → fight roaming monsters → gather
   drops + nodes → craft/upgrade weapons (chemistry) → descend/biomes → level up.
3. **Mining:** kept but **quick & chunky**; main materials come from **monsters + ore
   nodes/chests**, not slow tile-by-tile.

## Phases (priority order)

- **P1 — Core feel** (reused by everything): controls redesign + gamepad, combat/feel
  tuning, walk polish, and **procedural audio (Web Audio, no assets)** — SFX + music.
- **P2 — World rebuilt right:** camera zoom + big tiles (scale fix), camera follow,
  biomes + points of interest, on-screen goals, terrain feel, lighting/day-night.
- **P3 — World combat & monsters:** roaming monster AI on terrain, loot drops, ore
  nodes/chests, biome scaling, bosses.
- **P4 — RPG/progression:** inventory + stash, crafting (weapons/armor/chemistry/spells),
  the modular Forge, skill trees + leveling, RPG menu UI.
- **P5 — Spells:** chemistry-powered abilities (firebolt, frost nova, chain lightning…).
- **P6 — Survival/extraction:** deploy → explore → gather → extract (Arc-Raiders), risk
  on death; replaces arena-wave survival.
- **P7 — Building (optional sandbox):** place/remove blocks, base + stations.
- **P8 — Polish/tech:** neon art pass, particles/lighting, world chunking/streaming +
  active-region sim, save system, settings, deploy, controller.

## Process fix

Build in small, committed, sim-tested increments; capture acceptance per feature.
Stop piling breadth faster than it can be verified.

## Execution order (now)

1. World scale fix (tiles + zoom + camera).  ← first, fixes the obvious miss
2. World combat + roaming monsters + loot (the point).
3. Procedural audio.
4. Crafting + progression in the world.
