# Roadmap — Stickman Fight: Powder Arena

Phased so there's a **fun, playable build as early as possible** (end of Phase 1) and
each phase is independently demoable. Check items off as we go. See
[DESIGN.md](DESIGN.md) for the why behind each system.

**Cross-cutting (every phase):** apply the *Burning Wasteland* art direction —
hyper-colorful, silly, neon, nonsense props — as we build, not as a final coat
([ART_DIRECTION.md](ART_DIRECTION.md)). Always ship a **reduce-flashing / reduce-particles**
accessibility toggle alongside neon FX.

---

## Phase 0 — Skeleton (foundation) ✅ done

- [x] Vite + TypeScript project, `npm run dev` / `build` / `test`
- [x] Canvas renderer + screen-shake camera + fixed-timestep game loop (accumulator)
- [x] Matter.js world wired in; arena platform with edge railings + ring-out pit
- [x] Keyboard input layer (two players + global hotkeys)
- [x] Vitest set up with headless sim smoke tests

**Exit:** ✅ stable fixed-timestep sim with physics + input + rendering.

## Phase 1 — Ragdoll Slice ✅ *first genuinely fun build — done*

- [x] Compound ragdoll stickman (head/torso/arms/legs) with breakable constraints
- [x] **Active-ragdoll** controller (per-segment PD posing): stand, walk-bob, jump
- [x] Per-joint integrity + break → limb (and held weapon) detaches into debris
- [x] Grab + hold a melee weapon (constraint to hand); momentum swing; drop on
      weapon-arm break; throw + pick up loose weapons
- [x] Unified impact-based damage model v1 (per-part cooldown, damage cap, core HP)
- [x] Local 2-player on one keyboard; KO by core/decapitation/ring-out; best-of-3
      rounds + HUD (per-limb status, HP, score pips)
- [x] First juice pass: screen shake, hit-stop, impact + confetti particles
- [x] First **style** pass: neon festival look, silly props (party hats, tutus, disco
      mace / neon saber / doom baguette), confetti KO
- [x] Bonus: simple bot opponent for solo play (`B`)
- [ ] SFX/music (deferred to the Phase 6 juice pass)

**Exit:** ✅ a chaotic 2P ragdoll duel where arms break, weapons drop, and heads roll.
Feel is tunable in `src/config.ts`; needs human playtest tuning of the PD gains.

## Phase 2 — Powder Core

- [ ] CA engine: grid (typed arrays), double buffer, active-chunk updates, budget
- [ ] Materials v1: Sand, Water, Stone/Wall, Oil, Fire + temperature field
- [ ] CA render layer (ImageData → scaled canvas)
- [ ] Bridge: buoyancy/drag in liquids, body displacement of granular/liquid,
      heat→joint damage, ignite flammables, blood emit
- [ ] Arenas authored from CA materials; basic destructibility

**Exit:** fight inside a sandbox — wade through water, set things on fire, burn the floor.

## Phase 3 — Element Chemistry

- [ ] Add Lava, Acid, Gunpowder, Nitro/TNT, Ice, Steam, Smoke, Metal, Spark/Electricity,
      Magnet, Plant, Glass, Salt
- [ ] Full data-driven reaction matrix (§4) + temperature-driven spread/melt/freeze
- [ ] Bridge: acid corrosion, electrified water/metal stun, explosion impulses + terrain
      destruction, magnet forces, steam launch, ice friction
- [ ] Emitter weapons (flamethrower, acid sprayer, water cannon) + Container/flask
      weapons (load/dump CA payload); refill from environment

**Exit:** the reactive playground from the pitch — emergent techniques start happening.

## Phase 4 — The Forge (crafting + armor)

- [ ] Modular weapon assembly: Forms × Infusions × Mechanisms × Tanks
- [ ] Weapon runtime honoring assembled stats (mass, reach, contact, infusion effects)
- [ ] Material-aware armor per limb (steel/ceramic/rubber/ice/wood) with trade-offs +
      degradation/fall-off
- [ ] Forge / loadout UI; in-match environmental coating (dip/fill/coat)

**Exit:** craft a *Heavy Flaming Barbed Flail* (etc.) and armor each limb strategically.

## Phase 5 — Modes & AI

- [ ] Menu/scene flow; settings; pause
- [ ] **AI:** input-emulating utility controller (perceive, target limb, swing/dodge,
      exploit hazards, re-arm) + difficulty scaling
- [ ] **Campaign vs AI:** themed elemental bosses + matching arenas + unlock rewards
- [ ] **Versus 2P:** loadout select, arena + mutator select, best-of-N
- [ ] **The Lab (Sandbox):** all unlocked, material painting, spawn dummies/AI, pause/step
- [ ] **Trials:** technique + environment-kill challenges

**Exit:** the full game shape across all four modes.

## Phase 6 — Juice & Meta

- [ ] Full audio (SFX + music), slow-mo/zoom KO cam, particle/lighting polish
- [ ] Technique detection + naming + achievements/unlocks
- [ ] Persistence: unlocks, settings, saved loadouts, saved Lab arenas (export/import)
- [ ] Balancing pass via data files; mutators

**Exit:** it *feels* like a finished, juicy game.

## Phase 7 — Polish & Performance

- [ ] Device/resolution scaling + graceful CA degradation; profile + optimize
      (optional WebGL CA)
- [ ] Accessibility (rebinding, colorblind-safe element FX, scalable UI)
- [ ] Build + static deploy (e.g. GitHub Pages); README/play instructions
- [ ] Bug bash + final tuning

**Exit:** shippable v1.

---

## Phase 8 — Survival / Expedition (the big mode) 🏕️

The headline content mode: Terraria-style world + extraction runs + monsters + crafting +
RPG + evolution branches. **Reuses** the Phase 1–5 engine. Can start once Phase 5 (AI)
lands; ship it as a vertical slice (8a) first. Full design:
[SURVIVAL.md](SURVIVAL.md) + [EVOLUTION.md](EVOLUTION.md).

- [ ] **8a — Run skeleton:** one CA-terrain zone, deploy→explore→extract, basic inventory
      + Stash, one zombie type, melee only. *First playable run.*
- [ ] **8b — Harvest & craft:** monster drops → resources → craft weapon/armor at base;
      blueprints + recipes
- [ ] **8c — RPG meta:** XP/level, stats, skill trees, gear upgrade/tiering, survival save slot
- [ ] **8d — Content & chemistry monsters:** elemental archetypes + bosses, more biomes,
      day/night escalation, secure-pocket + down/loot-drop rules
- [ ] **8e — Spells & consumables:** spell system + tomes, potions/grenades/traps, base hub
- [ ] **8f — Evolution branches & traversal:** ragdoll mutation system + per-branch trees;
      prove with **Aviator** (flight) + **Burrower** (dig/tunnel), then Titan/Mutant/
      Tinker/Beast/Hydra as content
- [ ] Balancing pass on the economy (loot, craft costs, XP, evolution points)

**Exit:** deploy into the wasteland, scavenge & fight monsters, extract with loot, level
up, evolve into a flier or a digger, come back stronger.

---

## Stretch (post-v1, explicitly out of scope for now)

- Online multiplayer (rollback netcode); **survival co-op**
- Survival: persistent **overworld** map, **base-building** (terraform via the Lab editor),
  recover-your-dropped-loot runs
- Replays / killcam, photo mode
- Shareable arena/loadout/character codes & community level browser
- More elements (virus/spore, gases, wind/weather), more bosses, more mutators,
  more evolution branches

---

## Suggested first move

Build **Phase 0 + Phase 1** as a vertical slice and stop to playtest. If the active
ragdoll feels great, the rest of the vision is "just" content + chemistry on a proven
core. If it doesn't, we fix feel *before* building anything else on top of it.
