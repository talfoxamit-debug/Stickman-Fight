# Stickman Fight: Powder Arena — Design & Architecture

This is the master design doc. It is opinionated but everything here is a proposal —
expect to tune numbers and cut/add features during the phased build (see
[ROADMAP.md](ROADMAP.md)).

---

## 1. Vision & pillars

A real-time ragdoll fighter where the **environment is a chemistry simulation** and
**every weapon is craftable from parts + elements**. The joy comes from *emergent*
plays the designers never explicitly coded: electrify a puddle the enemy is standing
in; lure them onto an oil patch and flick a torch; magnet their steel sword out of
their hand; break their weapon-arm and beat them with their own severed limb.

**Design pillars**

1. **Everything is physical & breakable.** Limbs, weapons, armor, and terrain are all
   objects in a simulation. No invisible hitboxes — what you see is what's simulated.
2. **The arena is a reactive sandbox.** Fire, water, oil, lava, gunpowder, acid, ice,
   steam, electricity, magnetism — all interact via simple, legible rules (Dust2 DNA).
3. **Players invent the strategy.** We supply parts and rules; players supply genius.
   The game *notices and names* clever techniques and rewards experimentation.
4. **Readable chaos.** It looks wild, but cause→effect is always understandable. A
   broken arm flops; a burning limb glows; electrified water sparks blue.
5. **Fun in 10 seconds, deep in 10 hours.** Phase 1 is a couch duel anyone gets
   instantly. The crafting + chemistry layers reward mastery.
6. **Maximalist, silly, colorful.** *Mad Max meets Burning Man* — neon, costumes, and
   nonsense props that make no sense in a wasteland. Every floppy gag still has
   satisfying game feel. See [ART_DIRECTION.md](ART_DIRECTION.md).

> This game has **three pillars of content** on one engine: (a) the **ragdoll duel**
> (Versus/Campaign), (b) the **chemistry sandbox** (the Lab), and (c) a big **Survival /
> Expedition** RPG-looter mode (Terraria-style world + extraction runs + monsters +
> crafting + **evolution branches**). The survival/RPG layer is detailed in
> [SURVIVAL.md](SURVIVAL.md) and [EVOLUTION.md](EVOLUTION.md); it **reuses** the combat,
> chemistry, Forge, armor, and AI systems below.

---

## 2. Core loop

```
Pick / craft loadout  ──►  Enter arena  ──►  Fight: damage limbs, disarm,
       ▲                                       exploit elements, survive hazards
       │                                                     │
   Unlock parts / armor / elements  ◄── Win round ◄──────────┘
       │
   Discover & get rewarded for new "techniques"
```

Match win conditions (configurable per mode): KO by destroying the **head** or
**torso** integrity, ring-out (knocked off the arena), or last-stickman-standing.

---

## 3. Core systems

### 3.1 The stickman — active ragdoll with breakable joints

Each stickman is a **compound ragdoll** in Matter.js:

| Part            | Body | Notes |
|-----------------|------|-------|
| Head            | circle | KO target; light |
| Torso           | capsule/rect | center of mass; KO target |
| Upper arm L/R   | rect | |
| Lower arm + hand L/R | rect | grips a weapon via a constraint |
| Upper leg L/R   | rect | |
| Lower leg + foot L/R | rect | ground contact, locomotion |

Parts are linked by **constraints (joints)**. Each joint has an **integrity** value
(HP). Crucially we use **active ragdoll**: PD / motor controllers drive joints toward a
*target pose* (stand, walk, swing, block) so the stickman is controllable, yet stays
springy so hits make it flail believably. This is the single most important game-feel
system — it is prototyped first (Phase 1) and tuned aggressively. Fallback if it feels
bad: semi-kinematic limbs that go ragdoll only on hit/break.

**Joint integrity & breaking**

- Integrity drains from: blunt/blade impacts (scaled by relative velocity × mass and
  weapon form), sustained heat, acid corrosion, explosion impulse, barbed weapons.
- At 0 integrity the constraint **breaks**: the limb (and any weapon/armor on it)
  detaches into free debris. A severed arm is a pickup-able object — and a viable
  improvised club.
- Visual states: healthy → bruised/cracked → limp/disabled (still attached, no motor)
  → detached.
- Disabling (not severing) a limb removes its function: break the weapon-arm → drop the
  weapon; break both legs → can't walk (drag yourself); pop the head → instant KO.

### 3.2 The powder sandbox — cellular automata

A coarse **cellular-automata grid** (typed arrays) simulates the environment. One cell
≈ 4 px (e.g. 480×270 cells at 1080p). Each cell stores: material id, temperature,
velocity hint, and flags. Materials update with simple, legible rules each fixed tick.

Material families: **powders** (fall + pile), **liquids** (fall + flow + level out),
**gases** (rise + diffuse), **solids/static** (terrain), **energy** (fire, spark).

See §4 for the full element list and reaction matrix. A shared **temperature field**
drives fire spread, freezing, melting, and steam, with simple diffusion/convection.

Performance: **active-chunk** dirty tracking (only chunks containing moving/reacting
cells update), double-buffered grid, per-frame update budget, and graceful resolution
downscaling on weak devices. Rendered to an offscreen canvas via `ImageData` then
scaled up (optional WebGL path later).

### 3.3 The bridge — coupling the two simulations

The magic lives where rigid bodies meet the cellular world. Coupling is intentionally
cheap (sample at a few points, not per-pixel):

**CA → bodies** (sample the grid under each limb/weapon AABB each tick):

- **Water/oil** → buoyancy + drag (float, slow movement, slippery exits).
- **Fire/lava** → accumulate heat on the limb → joint-integrity loss; ignite flammable
  armor/weapon coatings → the limb catches fire and spreads.
- **Acid** → corrosion damage to joint + strips armor and weapon coatings first.
- **Spark / electrified water** → stun (motor control disabled briefly) + damage;
  chains through metal armor and water.
- **Explosion** (gunpowder/TNT/nitro) → radial impulse (knockback, can sever joints) +
  heat + terrain destruction.
- **Magnet** → force on metal weapons/armor → drag the body or *yank the weapon away*.
- **Ice underfoot** → low friction (slip); **steam jet** → directional impulse
  (launch pads / rocket-jumps).

**Bodies → CA** (write cells where the body acts):

- **Hot/burning weapon** deposits heat/fire into cells it sweeps (draw a fire trail).
- **Emitter weapons** spray cells: flamethrower→fire, sprayer→acid, cannon→water,
  thrower→sand. **Container weapons** dump their payload of cells when they shatter.
- Moving bodies **displace** granular/liquid cells (wade through sand, splash water).
- **Blood** cells emitted on limb damage (cosmetic + slightly slick).
- Scoop the world: dip a flask in lava to load it; fill a tank from a water pool.

### 3.4 Weapons — the modular Forge (the "genius weapon" engine)

Weapons are **assembled from parts** so players invent their own. A weapon = one
**Form** + optional **Infusion(s)** + optional **Mechanism(s)** (+ a **Tank** for
emitters/containers).

**Forms** (how it deals/holds):
`Blade` (slash → joint cut), `Blunt` (impact → knockback + blunt joint damage),
`Pole/Spear` (reach, thrust), `Flail/Chain` (momentum, wraps), `Thrown` (bow / sling /
boomerang / javelin), `Shield` (block + bash), `Container/Flask` (holds a CA payload,
shatters to release), `Emitter/Nozzle` (continuously sprays a CA element from a tank),
`Tool` (grapple hook, magnet glove, net).

**Infusions / coatings** (element layer, can stack/limited):
`Flame`, `Frost`, `Acid`, `Shock`, `Gunpowder` (detonate on impact), `Magnetic`
(stick to / disarm metal), `Sticky/Tar` (glue limbs), `Oil` (slick), `Spore/Poison`.
Coatings can also be applied *in-match* by dipping into the environment.

**Mechanisms / mods** (behavior + stat tuning):
`Spinner` (chainsaw/drill — continuous contact), `Spring` (launch/recoil), `Heavy`
↔ `Light` (momentum vs speed), `Long` ↔ `Short`, `Barbed` (rips joints harder),
`Hollow` (fillable from the world).

Examples the system produces: *Heavy Flaming Barbed Flail*, *Acid Flask on a Chain*,
*Magnetic Disarming Hook*, *Frost Spear*, *Gunpowder Keg with a Fuse*, *Steam-powered
Spring Hammer*, *Chainsaw-on-a-Pole*. The combinations are the content.

Access: the **Forge** loadout screen pre-match (parts gated by campaign unlocks); **The
Lab** has everything unlocked; limited in-match crafting via the environment (dip,
fill, coat).

### 3.5 Armor / protection — material-aware, with trade-offs

Armor mounts on **individual limbs** (so unarmored limbs become targets). Each material
has chemistry-driven strengths *and* liabilities — no strictly-best armor:

| Armor | Strong vs | Weakness | Side effects |
|-------|-----------|----------|--------------|
| Steel plate | blunt, blade | shock, heat | heavy (slows, unbalances), **conducts** electricity/heat, **magnetic** (yank-able) |
| Ceramic | heat, fire | blunt (shatters) | brittle |
| Rubber/leather | shock | blade | light, flexible, insulates |
| Ice/frost shield | heat | blunt | melts away over time |
| Wood | cheap, light | fire, acid | flammable |

Armor adds **mass** (affects ragdoll balance + reach), provides an **HP buffer**, then
**degrades and falls off**. This makes limb-targeting strategic: hit the bare leg, or
hit the steel arm with a shock weapon instead of a blade.

### 3.6 Damage model (unified)

A single `applyDamage(target, joint, type, amount, source)` pipeline. Damage **types**:
`blunt`, `cut`, `heat`, `acid`, `shock`, `explosive`. Armor on the limb mitigates per
type (and may be the thing that's actually consumed). Result can be integrity loss,
limb disable, limb sever, stun, ignite, or KO. All combat — melee, projectile,
environment — funnels through this one path so interactions stay consistent.

---

## 4. Elements & reaction matrix (Dust2 DNA)

**Materials (v1 target set):** Sand, Water, Oil, Fire, Lava, Gunpowder, Nitro/TNT,
Acid, Ice, Steam, Smoke, Stone/Wall, Wood, Metal, Plant/Seed, Spark/Electricity,
Magnet, Glass, Salt, Blood. (Plus stretch: Virus/Spore, Gas, Wind.)

**Core reactions** (each is a tiny local rule; emergent combos arise from chaining):

| A | + B | → |
|---|-----|---|
| Fire | Oil / Wood / Plant | spreads Fire (+ Smoke / ash) |
| Fire | Water | Steam (Fire dies) |
| Fire | Ice | Water |
| Fire | Gunpowder / Nitro | **Explosion** (impulse + Fire, chains) |
| Lava | Water | Stone + Steam |
| Lava | flammables | Fire |
| Acid | Metal / Wood / Stone / flesh / armor | dissolves cell (+ acid fume) |
| Acid | Water | dilutes (slower) |
| Spark | Water | electrified Water (shocks bodies in it) |
| Spark | Metal | conducts (shocks holder/armor) |
| Spark | Gunpowder / Oil | ignites |
| Magnet | Metal | attraction force on cells/bodies/weapons |
| Steam | cold cell | condenses → Water |
| Sand | high heat | Glass |
| Salt | Water | dissolves; melts Ice |

Every cell also carries **temperature**; heat diffuses, enabling fire to spread, pools
to boil, and frost to creep. The matrix is data-driven (`data/materials.ts`) so we can
add elements without touching engine code.

---

## 5. "Genius" emergent techniques (the payoff)

These aren't hard-coded moves — they *fall out* of the systems above. The game
**detects, names, and rewards** them (achievements + unlocks) to teach players to think
like alchemists:

- **Disarm** — break the enemy's weapon-arm joint; their weapon drops.
- **Grave Robber** — pick up their dropped weapon, or their *severed arm*, and use it.
- **Bonfire** — bait them onto an oil slick, then ignite it.
- **Short Circuit** — electrify a puddle they're standing in (worse for them in steel).
- **Demolition** — detonate a gunpowder cache under a platform to collapse it.
- **Freeze & Shatter** — frost them solid, then a single blunt hit shatters them.
- **Magnet Mugging** — yank their steel sword out of their hand with a magnet glove.
- **Acid Bath** — drop them in acid; armor melts first, then limbs.
- **Steam Launch** — ride a vent for height, or launch the enemy off-stage.
- **Tar Pit** — glue their legs with sticky/tar, then pummel at leisure.

---

## 6. Crazy-fun feature list (the spice)

- **Living, destructible arenas** built from CA materials — dig through sand, melt
  stone with lava, burn wooden platforms until they collapse.
- **Electrified water** chain-shocks; **steam pressure** launches; **ice** is slippery.
- **Magnet** disarms metal & drags armored foes.
- **Plant/spore** grows along water and entangles limbs.
- **Improvised weapons**: throw anything; use a severed limb; fill a hollow club with
  gunpowder.
- **Environment-only KOs** as a bragging-rights win style.
- **Ragdoll comedy**: flailing, launches, slipping on ice, getting yanked by a magnet.
- **Mutators**: low-gravity, rising-lava floor, meteor showers, sudden death, wind that
  spreads fire and rain that puts it out.
- **Evolution branches** that grow new limbs and playstyles — sprout wings and fight from
  the air, or become a digger and tunnel underground ([EVOLUTION.md](EVOLUTION.md)).
- **Absurd festival props** as real weapons: flamethrower guitars, rubber-duck grenades,
  inflatable-flamingo shields, disco-ball flails, a shopping-cart mech
  ([ART_DIRECTION.md](ART_DIRECTION.md)).
- **The Lab doubles as a level editor** — paint materials, save arenas, share via
  export string.
- Stretch: replays / killcam, photo mode, online (rollback) — explicitly **out of
  scope for v1**.

---

## 7. Game modes

- **Campaign (vs AI)** — themed elemental bosses (Pyromancer, Cryomancer, Acidist,
  Voltaire, Magnetar, Demolitionist) in matching arenas; each win unlocks weapon parts,
  armor, or a new element. Light flavor/story between fights.
- **Versus (local 2P)** — both players craft a loadout from unlocked parts, pick an
  arena and mutators, best-of-N rounds on one keyboard (gamepads supported).
- **The Lab (Sandbox)** — every part + every material unlocked; spawn training dummies
  or an AI; pause/step the sim; paint terrain. Pure Dust2-style experimentation.
- **Trials** — bite-size challenges: "KO using only the environment," "Disarm without
  touching the torso," element puzzles, speed runs, technique trials.
- **Survival / Expedition (the big one)** — a Terraria-style open world you travel and
  gather from, **extraction-style runs** (deploy → scavenge into inventory → extract to
  keep loot, Arc-Raiders DNA), **zombies & monsters** you fight and **harvest** for
  crafting resources, a full **RPG menu** (level up character, gear, skills, spells), and
  **evolution branches** that physically mutate your ragdoll (grow wings and fly, become a
  digger and tunnel underground, etc.). Full design in **[SURVIVAL.md](SURVIVAL.md)** +
  **[EVOLUTION.md](EVOLUTION.md)**.

---

## 8. AI design

The AI is an **input-emulating controller** — it produces the same inputs a human
would, so it lives inside the same physics/chemistry rules (no cheating). A **utility /
behavior-tree** brain on top:

- **Perception:** nearest enemy, own & enemy limb integrity, weapon reach, and nearby
  hazards/resources (lava, water, gunpowder, magnet).
- **Decisions:** approach/retreat, target the weakest *or* most valuable enemy limb,
  time swings/blocks, dodge hazards, *exploit* the environment (shove toward lava,
  ignite oil), re-arm when disarmed.
- **Locomotion:** an active-ragdoll movement controller (move/balance targets) shared
  with the player so the AI walks the same way you do.
- **Difficulty** scales reaction time, accuracy, hazard-awareness, and aggression.
  Start dumb-but-functional (approach + swing + avoid hazard) and layer cleverness.

---

## 9. Controls

Action set: **Move L/R**, **Jump**, **Aim** (mouse or stick), **Attack/Swing**
(momentum-based — a held charge then release), **Grab/Throw**, **Pick up/Drop**,
**Use element/special** (emitter/infusion trigger), **Block**.

- **P1 (keyboard):** WASD move/jump, F attack, G grab, Space block (tunable).
- **P2 (keyboard):** Arrows move/jump, `.` attack, `/` grab, `Enter` block (tunable).
- **Gamepad:** full support via the Gamepad API; recommended for 2P comfort.
- Fully rebindable; mouse-aim for single-player.

---

## 10. Game feel / juice

Active ragdoll + chemistry already produce spectacle; we amplify with: screen shake
scaled to impact, hit-stop / slow-mo on KO and limb-sever, blood & spark particles,
material-tinted lighting (fire glow, electric flash), satisfying chunky SFX (Howler),
slow zoom on the final blow, and a kill-cam-lite freeze frame. Readability rules:
distinct silhouettes per limb state, color-coded element FX, and a clean HUD showing
per-limb integrity for both fighters.

---

## 11. Progression & meta

- **Unlocks:** weapon Forms, Infusions, Mechanisms, armor materials, and arena elements
  — earned through the campaign and trials, usable in Versus and the Lab.
- **Technique discovery:** the game detects named techniques (§5) and grants
  achievements + sometimes unlocks, nudging experimentation.
- **Persistence:** localStorage for unlocks, settings, saved loadouts, and saved Lab
  arenas (export/import string). No account/backend in v1.

---

## 12. Technical architecture

**Stack:** TypeScript · Vite (dev/build) · Matter.js (rigid bodies + constraints) ·
custom CA engine (typed arrays) · Canvas2D layered rendering (`ImageData` for the CA
layer; optional WebGL CA later) · Howler.js (audio) · Gamepad API + dual keyboard ·
localStorage. **No backend** — static deploy (e.g. GitHub Pages).

**Loop:** fixed-timestep accumulator for deterministic-ish sim; physics and CA tick at
fixed dt; render interpolates. CA may tick at a fraction of the physics rate for
performance.

**Render layers (back→front):** background/arena art → CA particle layer (offscreen,
scaled) → physics layer (stickmen drawn from body transforms, weapons, debris) → FX
(blood/sparks/shake) → HUD/UI.

**Modularity:** data-driven materials, weapon parts, armor, and campaign defs live in
`src/data/*` so designers tune content without touching engine code.

**Testing:** Vitest for pure logic — reaction rules, damage math, forge assembly,
technique detection. Manual playtest checklists per phase (the `/verify` and `/run`
skills can drive the app).

### Proposed project structure

```
index.html
src/
  main.ts                  # bootstrap + game loop
  core/                    # loop, fixed-timestep, rng, event bus, scene mgr
  render/                  # layered renderer, camera, FX
  physics/                 # Matter world, ragdoll factory, joints, weaponMount, debris
  powder/                  # CA: grid, materials, reactions, temperature, render
  bridge/                  # coupling: sampling, forces, emitters, damage-from-CA
  weapons/                 # parts, forge (assembly), infusions, weapon runtime
  armor/                   # material-aware armor
  combat/                  # unified damage model, limb integrity, KO rules
  ai/                      # input-emulating controller + behaviors (players & monsters)
  modes/                   # campaign, versus, sandbox(lab), trials, survival
  survival/                # world/zone gen, inventory+stash, extraction runs, RPG
                           #   (stats/skills/leveling), crafting, monsters, spells,
                           #   evolution branches + traversal (flight, dig)
  cosmetics/               # silly costume/prop overlay layer (art direction)
  ui/                      # menus, forge screen, HUD, RPG/inventory screens
  input/                   # keyboard (2 sets) + gamepad bindings
  data/                    # materials, weapon parts, armor, campaign, techniques
  save/                    # localStorage persistence
tests/                     # Vitest unit tests
docs/                      # this design + roadmap
```

---

## 13. Performance strategy

- **Coarse CA grid** (~4px cells) with **active-chunk** updates (skip static regions),
  double-buffering, and a per-frame update budget.
- **Cheap coupling:** sample CA only under limb/weapon AABBs + radial queries for
  explosions; never per-pixel against bodies.
- **Physics hygiene:** cap body/debris counts, merge/cull old debris, sleep static
  bodies.
- **Graceful degradation:** drop CA resolution / cap particle spawns on weak hardware;
  target 60fps, soft-floor 30fps.
- Optional later: move the CA step to a **WebGL shader** if Canvas2D becomes the bottleneck.

---

## 14. Key risks & mitigations

| Risk | Mitigation |
|------|------------|
| **Active-ragdoll feel** is the make-or-break and is genuinely hard | Prototype it *first* (Phase 1); tune PD gains; fallback to semi-kinematic-until-hit limbs |
| **CA + physics performance** | Coarse grid + active chunks + budget; profile early; WebGL fallback |
| **Coupling instability** (huge impulses) | Fixed timestep, clamp impulses, sample sparingly, integrate forces over time |
| **Emergent balance / unfairness** | Lab-first iteration, data-driven tuning, frequent playtests, mutator toggles |
| **AI in a chaotic world** | Input-emulating utility AI; ship "functional" first, layer cleverness |
| **Scope creep** (this is a big vision) | Strict phasing; **Phase 1 is independently fun and shippable** before any chemistry exists |

---

## 15. What "done enough to be fun" looks like

- **After Phase 1:** two humans can have a genuinely funny ragdoll sword duel where
  arms break off and weapons drop. Shippable on its own.
- **After Phase 3:** the arena is a reactive playground — fire, water, lava, gunpowder,
  acid, electricity — and the emergent techniques start happening.
- **After Phase 5:** full game shape — craft a loadout, beat the AI campaign, brawl 2P,
  experiment in the Lab.

See [ROADMAP.md](ROADMAP.md) for the phase-by-phase checklist.
