# Survival / Expedition Mode — design

The headline single-player (+ co-op stretch) mode: a **Terraria-style open world** you
travel and gather from, an **RPG progression** layer (level up character, gear, skills,
spells), a **round/run-based extraction loop** (deploy → scavenge into inventory →
extract to keep it, Arc-Raiders-style), and **zombies & monsters** you fight and
**harvest for crafting resources**.

The big idea: this mode is **content + meta on top of the existing engine**. Combat is
the same active-ragdoll system, the world *is* the powder/chemistry simulation (so you
dig, burn, freeze, and electrify terrain exactly like in a duel), weapons come from the
**Forge**, and monsters are ragdolls — you can break their limbs and loot the parts.

---

## 1. The loop (two nested loops)

**Run loop (per expedition, the Arc-Raiders DNA):**

```
Base → pick loadout from Stash → deploy into a Zone → explore, gather, fight monsters,
find caches/blueprints → reach an EXTRACTION point → bank everything to Stash.
Go down before extracting → you drop unsecured loot (a small "secure pocket" survives).
```

**Meta loop (between runs, the Terraria/RPG DNA):**

```
Banked resources → craft/upgrade weapons, armor, chemistry, consumables (Forge + Lab)
→ spend XP on skills/spells, level gear → tackle deeper, more dangerous Zones → repeat.
```

Risk vs reward is the engine: deeper zones = better loot + nastier monsters/hazards;
carrying more loot = more to lose if you die before extracting.

---

## 2. The world (Terraria-style)

A large 2D side-on world made of **biomes/zones**, each themed around an element, a
monster set, and signature resources. The terrain is literally CA material (dig, melt,
burn, freeze it), with day/night and escalating danger.

| Zone | Theme / hazard | Signature resources | Monsters |
|------|----------------|--------------------|----------|
| Surface Plains | safe-ish tutorial | wood, plant, basic ore | shambler zombies |
| Forest / Swamp | acid bogs, vines | acid reagent, spores, hide | acid slimes, spitters |
| Caves / Underground | dark, fragile rock | ore, metal, crystals | runners, brutes |
| Volcanic Depths | lava rivers, heat | sulfur (→gunpowder), obsidian, fire essence | fire imps, bombers |
| Frozen Tundra | ice, slip, cold | frost essence, salt | ice wraiths |
| Ruined City | dense PvE, traps | scrap, electronics, batteries | runner hordes, electric drones |
| The Deep / Reactor | end-game, radiation/magnet | rare alloys, cores | magnet golems, bosses |

World generation: procedural per-zone layout (or hand-authored shells + proc variants)
built from the material grid, so chemistry, digging, and destruction all "just work."
Stretch: a persistent overworld map you traverse between zones.

**Day/night & escalation:** night (and deeper depth) spawns more and worse monsters,
raising extraction tension — leave with your loot before the horde arrives.

---

## 3. Inventory, stash & extraction (Arc-Raiders DNA)

- **Inventory (per run):** grid + weight limited. Holds weapons, parts, armor,
  reagents, materials, consumables, and quest/loot items. Heavier load → slower, worse
  ragdoll balance (ties into the physics).
- **Secure pocket:** a tiny protected slot whose contents survive death — meaningful
  "do I risk one more cache?" decisions.
- **Stash (at base):** large persistent storage. Everything you extract banks here.
- **Extraction points:** marked exits (sometimes contested/timed). Reaching one = run
  success and loot is secured.
- **Death/down state:** going down before extraction drops unsecured loot at your body
  (recoverable on a later run as a stretch), keeps secure-pocket items. No permadeath of
  the character (your level/skills persist) — you lose *stuff*, not progress.
- **Caches & blueprints:** lootable containers; blueprints unlock new Forge parts,
  recipes, and spells.

---

## 4. Monsters & zombies (ragdoll PvE + harvesting)

All enemies are built on the **same active-ragdoll system** as players, so you can
break their limbs, disarm them, and they react to chemistry (burn, freeze, electrify).
Killing/dismembering them yields **harvestable resources** tied to their theme → the
crafting loop.

**Archetypes**

- **Shambler / Runner zombies** — basic melee, swarm at night; drop flesh, bone, scrap.
- **Bomber / Bloater** — explodes on death (gunpowder burst); drops sulfur/explosive
  reagent — kite it into a group or a fuel cache.
- **Brute** — heavy, armored limbs (target the bare joints); drops hide/alloy.
- **Elemental monsters** — Fire Imp (flame essence), Ice Wraith (frost essence), Acid
  Slime (acid + sticky/tar reagent), Spark Drone (electric core), Magnet Golem (metal
  ore, magnetic). Each drop feeds the matching weapon **infusion**.
- **Spitters / ranged** — lob acid/projectiles; drop venom glands.
- **Biome bosses** — large set-piece ragdolls with breakable phases and rich drops +
  guaranteed blueprints.

**Harvesting:** sever a part / finish a kill → resources drop as pickups (or auto-loot).
Specific parts gate specific recipes (e.g., imp core → Flame infusion tier-up; slime →
Sticky coating; golem core → Magnet glove; bomber sac → gunpowder kegs).

---

## 5. RPG progression menu

A proper RPG screen with character, gear, skills, and spells. The deepest layer of the
RPG — **evolution branches** that physically mutate your ragdoll into distinct playstyles
(grow wings and fly, become a digger and tunnel underground, etc.) — has its own doc:
**[EVOLUTION.md](EVOLUTION.md)**.

**Character stats** (gain points on level-up, spend or grow via use):

- **Health** — survivability / KO threshold.
- **Stamina** — sprint, swing charge, blocking, spellcasting fuel.
- **Strength** — melee/thrown damage + carry weight.
- **Agility** — move speed + ragdoll balance/control (better active-ragdoll handling).
- **Toughness** — limb integrity + armor effectiveness.
- **Alchemy/Intellect** — spell power, crafting quality, better reaction mastery.

**Skill trees**

- **Combat** — heavier swings, faster recovery, reliable disarms, block→counter,
  thrown-weapon mastery, finishers.
- **Alchemy/Chemistry** — stronger/longer reactions, element mastery (resist + amplify),
  brewing potions, better infusions, bigger emitter tanks.
- **Survival** — gather yield, carry weight, quieter movement, hazard resistance,
  extraction perks (faster extract, bigger secure pocket).
- **Spells** — the magic branch (§7).

**Gear leveling:** upgrade/tier individual weapons and armor with resources — add/raise
an infusion tier, reinforce joints, swap to lighter alloy, expand an emitter tank. Gear
has levels + rarity. This is where most resources go.

---

## 6. Crafting

Harvested resources + reagents → items, all through the existing **Forge** plus an
**Alchemy Lab** and **Anvil** at base (and portable lite-crafting in the field):

- **Weapons** — assemble Forms × Infusions × Mechanisms × Tanks (the Forge), now gated
  by gathered materials and blueprints.
- **Armor** — material-aware per-limb pieces (steel/ceramic/rubber/ice/wood) crafted
  from ore/hide/alloy.
- **Chemistry items** — acid flasks, gunpowder kegs, frost grenades, oil bombs,
  potions/elixirs, traps, emitter ammo. These are literally CA payloads you carry.
- **Consumables** — heal, stamina, antidote, temporary buffs, splints (re-attach a limb
  mid-run).

Recipes unlock via blueprints found on runs / from bosses, so progression has discovery.

---

## 7. Spells (magic layer)

Spells make the "alchemist" fantasy literal and **reuse the CA + bridge engine** — most
spells just emit materials/forces into the world. They cost stamina/mana + sometimes
reagents, and scale with Alchemy + the Spells skill tree.

Examples: **Firebolt** (emit fire cells), **Frost Nova** (freeze nearby water/enemies),
**Acid Spray**, **Chain Lightning** (arcs through water/metal — devastating on armored
foes), **Magnetize** (rip metal weapons/armor), **Conjure Wall** (spawn stone/ice
terrain — cover or a trap), **Telekinesis** (grab & throw bodies/weapons), **Summon**
(a temporary ally ragdoll). Spells are gatherable/learnable items in the world (tomes).

---

## 8. Base / home

A hub with: **Stash** (storage), **Forge** + **Alchemy Lab** + **Anvil** (crafting),
**Skill Trainer** (spend XP), and a board for runs/bounties. Minimal building in v1
(place stations + storage). Full Terraria-style terraforming/base-building is a
**stretch** goal layered on the existing material editor (the Lab is already a level
editor).

---

## 9. What's reused vs new

**Reused (already in the core plan):** active-ragdoll combat, powder/chemistry CA,
the bridge (heat/acid/shock/explosion/magnet effects), modular Forge weapons,
material-aware armor, unified damage model, AI controller (for monsters).

**New systems this mode needs:**

- World/zone generation + streaming; biomes; day/night & danger escalation.
- Inventory + weight + Stash + secure pocket; loot tables & caches; blueprints.
- Extraction-run loop + run state (deploy/down/extract) + persistence (separate save).
- RPG: stats, skill trees, leveling, gear upgrade/tiering.
- Crafting recipes + stations (Forge/Lab/Anvil) + Alchemy items/consumables.
- Monster archetypes, spawning/horde director, harvest drops.
- Spell system (caster, mana/stamina, reagent cost, spell library).
- Base hub UI + economy/balancing.
- (Stretch) co-op, persistent overworld, base-building, recover-your-loot runs.

---

## 10. Build approach (sub-phases)

This is large; it lands **after** the core combat + chemistry + Forge + AI exist
(Roadmap Phases 1–5). Build it as a vertical slice first, then widen:

- **8a — Run skeleton:** one zone from CA terrain, deploy→explore→extract, basic
  inventory + Stash, one zombie type, melee only. *First playable run.*
- **8b — Harvest & craft:** monster drops → resources → craft a weapon/armor at base;
  blueprints + recipes.
- **8c — RPG meta:** XP/level, stats, skill trees, gear upgrading, save slot.
- **8d — Content & chemistry monsters:** elemental monster archetypes, more biomes,
  day/night escalation, secure pocket + death/down loot rules.
- **8e — Spells & polish:** spell system + tomes, consumables/traps, base hub, balancing.
- **8f — Evolution branches & traversal:** ragdoll mutation system + per-branch trees;
  prove it with **Aviator** (wings/flight controller) and **Burrower** (dig/tunnel
  controller); then Titan/Mutant/Tinker/Beast/Hydra as content. See
  [EVOLUTION.md](EVOLUTION.md).
- **Stretch:** co-op, overworld, base-building.

**Slice-first rule:** ship **8a** (a single satisfying scavenge-and-extract run that
reuses the duel combat) before building the RPG/crafting depth on top of it.
