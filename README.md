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

🟢 **Phases 1–2 playable.** A local 2-player active-ragdoll duel **inside a live
chemistry sandbox**: breakable limbs + weapon-drop, a full moveset (light combo /
heavy / stab + punch/kick fallback), mobility (double jump, dodge-roll i-frames,
block/parry), mouse aim, and a **falling-sand world** (sand/water/oil/fire/lava/acid/
gunpowder…) that burns, floats, melts, and explodes the fighters — paint hazards live
with `1-0`/`Q`/`C`. Survival, evolution, and the Forge are still on the
[roadmap](docs/ROADMAP.md).

## Run it

```bash
npm install
npm run dev      # open the printed localhost URL in a browser
```

Other scripts: `npm run build` (type-check + production bundle), `npm test` (headless
sim tests), `npm run preview` (serve the build).

### Controls

| | Move | Jump (×2) | Attack | Block | Grab | Dodge | Aim |
|--|--|--|--|--|--|--|--|
| **P1** | `A`/`D` | `W` | `F` or **LMB** | `S` or **RMB** | `G` | double-tap `A`/`D` | **mouse** |
| **P2** | `←`/`→` | `↑` | `.` | `↓` | `/` | double-tap `←`/`→` | — |

Global: **`B`** toggle P2 bot (play solo) · **`R`** rematch · **`P`** pause.

**Moveset (one attack key):**
- **Tap = light combo** → 3-hit chain: **slash → backslash → stab** (the thrust has reach).
  Keep tapping within the combo window to chain it.
- **Hold = heavy** → a telegraphed wind-up, then a big **overhead smash** with knockback
  and ~1.85× damage. Release to unleash.
- **Disarmed?** Attacks fall back to **punches and kicks** automatically.

**Mobility & defense:**
- **Double jump** + variable height (tap = short hop, hold = full jump) + coyote time.
- **Dodge roll** (double-tap a direction): a fast dash with **i-frames** (brief invulnerability).
- **Block** (hold): cuts damage/knockback from the front; a **well-timed block parries** —
  it negates the hit and **staggers** the attacker. Mouse players: aim with the cursor,
  **left-click** to attack, **right-click** to block.

> **Tip — limb tactics:** smash an arm to disarm your opponent (the weapon drops — grab
> it!), break both legs to cripple their movement, or land sustained head hits for a
> decapitation KO. Use the **stab** for reach, the **heavy** to launch them over the
> railing for a ring-out. **Disarmed?** You automatically fall back to **punches and
> kicks** — losing your weapon arm doesn't end the fight. Use the floating platforms to
> juke and dive-attack.

> Combat feel (PD-controlled "active ragdoll") is tuned via `src/config.ts` — every
> knob (gravity, swing speed, joint integrity, damage) lives there for easy playtesting.

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
