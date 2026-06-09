# Evolution Branches — the core RPG identity

Everyone starts as a **plain stickman**. As you progress (mainly in Survival mode), you
spend **evolution points** to mutate down one or more **branches** that *physically
change your ragdoll* and unlock whole new playstyles and traversal — wings to take to the
air, digging claws to live underground, extra arms to dual-wield, and more.

Because the body is a **real ragdoll**, evolutions are not stat tweaks — they literally
**add/modify limbs, constraints, and movement controllers**. That's what makes them feel
huge, and it reuses systems we already have (the world is CA terrain, so digging just
edits the grid; flight just adds appendages + a flight controller).

---

## 1. How it works

- **Start:** baseline stickman (the duel/versus default).
- **Evolve:** spend **evolution points** (from leveling + rare **mutation reagents**
  harvested from monsters/zones) into a branch's tree.
- **Physical mutation:** picking nodes attaches new bodies/constraints to your ragdoll
  (a wing, a drill-arm, a tail, a third arm, boosters) and swaps in new **traversal
  controllers** (flight, dig, climb).
- **Specialize or hybridize:** go deep in one branch for a strong identity, or mix
  branches with trade-offs (an evolution-point budget + conflicting body parts keep it
  balanced — you can't be everything).
- **Reversible-ish:** respec at base for a cost, so experimenting is encouraged (fits the
  silly, playful tone).
- **Cosmetic + functional:** every mutation has a loud, colorful, silly look (neon wings,
  glitter drill) consistent with the art direction — while staying readable.

---

## 2. Branches (examples — designed to be extended)

### 🪽 Aviator (air)
Grow **wings** (new physics appendages) and go airborne.
- **Traversal:** glide, flap to gain height, air-dash, hover; ride **updrafts** from fire
  and **steam vents** (real chemistry synergy). Fight from above with dive attacks.
- **Trade-offs:** light + fast but fragile; heavy armor kills your lift, so you stay
  nimble and lightly armored.
- **Sample nodes:** Stronger Lift → Dive Bomb → Feather Storm (drop a cloud of blades) →
  Thermal Soaring (gain energy from heat).

### ⛏️ Burrower (ground / underground)
Grow **reinforced claws / a drill** and master the dirt.
- **Traversal:** **dig fast through CA terrain**, tunnel underground, burst up for ambush
  attacks, and build tunnel networks/traps. Strong on and *under* the ground — where the
  best ore/resources live.
- **Trade-offs:** dominant on the ground and in caves, weak in the air; slower over open
  terrain than an Aviator.
- **Sample nodes:** Faster Dig → Seismic Slam (shockwave) → Sinkhole (collapse terrain on
  foes) → Tunnel Network (fast-travel your dug tunnels).

### 💪 Titan (heavy / tank)
Bulk up — bigger body, thicker limbs, more mass.
- Heavy melee, throw heavy objects/bodies, shrug off hits; reinforced joints (harder to
  dismember). Slow but unstoppable. Synergizes with heavy armor + blunt weapons.

### ⚗️ Mutant Alchemist (chemistry body)
Infuse your body with the elements.
- Element resistance/immunity, **exude clouds** (acid/fire/spore), bonus **spell power**,
  and an **extra casting arm**. The walking-hazard playstyle. Pairs with the spell layer.

### 🔧 Tinker (mechanized)
Graft mechanical parts onto the ragdoll.
- **Rocket boosters** (boost-dash / rocket-jump), a **grappling arm**, a built-in
  **emitter** (flamethrower/acid arm), or **wheels** for speed. The gadget playstyle —
  very on-theme with art-car / shopping-cart-mech aesthetics.

### 🦎 Beast (mobility)
Extra legs + a tail.
- Quadruped speed, pounce attacks, wall-climbing, tail swipes. The agile skirmisher.

### 🐙 Hydra (multi-limb)
Grow **extra arms**.
- Wield multiple weapons at once (a flaming sword *and* an acid flask *and* a shield),
  or cast + fight simultaneously. The juggler/duelist fantasy.

---

## 3. Why this is cheap to build on our engine

- **Ragdoll is modular:** mutations = attach/detach extra bodies + constraints to the
  existing compound ragdoll. Limb-damage/dismember rules already apply to the new parts
  (yes, your wings can get broken off).
- **Terrain is CA:** digging = edit/displace grid cells; tunnels are just carved terrain.
  No special-case world geometry.
- **Chemistry synergies are free:** updrafts (fire/steam) lift Aviators; lava/acid feed
  Mutants; the bridge already moves bodies with fields.
- **New work is mainly controllers + trees:** a flight controller, a dig controller, and
  per-branch skill trees/cosmetics. Reuses input, AI (monsters can evolve too!), and the
  RPG menu.

---

## 4. Build placement

Lands inside the Survival/RPG track (Roadmap **Phase 8**), as sub-phase **8f**, after the
core run loop + RPG meta exist. Recommended first two branches to prove the system:
**Aviator** (new aerial traversal) and **Burrower** (new terrain/dig traversal) — they're
the most distinct and the user-requested examples, and they exercise the two hardest new
controllers (flight + digging) up front. Add Titan/Mutant/Tinker/Beast/Hydra as content
afterward.

> Monsters can use branches too — a winged zombie or a burrowing brute reuses the exact
> same system, instantly widening the bestiary.
