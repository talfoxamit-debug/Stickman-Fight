# Art Direction — "Burning Wasteland"

**One line:** *Mad Max meets Burning Man.* A cracked post-apocalyptic playa that someone
covered in neon, glitter, and absurd nonsense props. Maximalist, hyper-colorful, silly,
joyful chaos — but every floppy gag still has satisfying, readable game feel.

This identity applies to **every mode** (duels, survival, the Lab) and is a first-class
design pillar, not a skin.

---

## 1. Tone

- **Anti-serious.** The apocalypse is a costume party. Things that make *no sense* in a
  wasteland are the whole point.
- **Joyful violence.** Limbs pop off in confetti; explosions drop bass; KOs rain glitter.
- **Surreal juxtaposition.** Deadly chemistry hazards sit next to a giant disco ball and
  an inflatable flamingo.
- **Readable underneath the noise.** No matter how loud the screen gets, cause→effect is
  always legible (see color rules below).

## 2. Color & light

- **Hyper-saturated neon palette:** hot pink, cyan, acid green, electric purple, sunset
  orange, UV white — popped against **dusty desert neutrals** (tan, rust, bone) so the
  neon screams.
- **Everything glows at night.** The day/night cycle (survival mode) turns the playa
  into a light show: EL-wire outfits, glowing sculptures, neon trails. Day = dusty and
  bright; night = blacklight rave.
- **Element FX are vivid and color-coded for readability:** fire = orange→white with
  rainbow embers, electricity = neon blue/white arcs, acid = glowing toxic green, frost
  = pale cyan, gunpowder = white flash + colored smoke, magnet = purple shimmer.
- Particles everywhere: confetti, glitter, dust kicks, sparks, bubble-machine bubbles,
  rainbow motion trails on fast swings.

## 3. Characters — silly by default

Stickmen stay simple (clean line bodies + colored limbs for readability) but are
**adorned with ridiculous, customizable costumes** layered cosmetically over the ragdoll:

- EL-wire bodysuits, tutus, fur/yeti boots, giant goggles, mohawks, LED helmets, animal
  onesies, capes, glitter beards, light-up everything, flower crowns, fanny packs.
- **Even functional armor looks absurd:** the steel plate is a hammered-out disco ball;
  the heat-resist helmet is a traffic cone; the shield is a pizza slice or an inflatable
  flamingo. Function (from the armor system) is unchanged — only the look is silly.
- Cosmetics are a customization layer (unlockable in survival, equippable everywhere) and
  must never obscure limb-state readability (damaged/limp/severed limbs still read clearly).

## 4. Nonsense props & weapons (post-apoc that makes no sense)

Lean hard into absurd objects that still map onto real **Forge** weapon Forms/Infusions:

- Flamethrower **guitar**, glow-stick swords, rubber-duck grenades, kazoo of doom,
  bubble-machine acid sprayer, traffic-cone spear, frying-pan shield, unicorn-floatie
  battering ram, shopping-cart "mech," couch-on-wheels art car, leaf-blower wind gun,
  confetti cannon (that fires real shrapnel), disco-ball flail.
- Each is just a **reskin of a real weapon** (e.g., the confetti cannon = a Thrown/Emitter
  Form with shrapnel) — silly look, serious mechanics.

## 5. Environments & set-pieces

- Wasteland biomes (see SURVIVAL.md) **dotted with Burning-Man art installations:** neon
  sculptures, geodesic domes, fire-spinning totems, glowing giant mushrooms, art cars,
  and a wooden **"Effigy"** that is fully burnable (set it alight for a spectacle — and a
  level-changing fire).
- Hazards double as art: lava rivers lit like lava lamps, acid pools that glow, a Tesla-
  coil totem, a magnet sculpture that steals your sword.
- **Boss idea:** a giant rolling Disco-Ball golem; a Mutant Vehicle art-car boss.

## 6. Audio & UI

- **Audio:** festival/EDM-leaning, playful. Air-horns and kazoos on hits, a bass drop on
  explosions, a record-scratch on a whiffed swing, cheering crowd on KOs.
- **UI:** festival-poster / sticker-zine aesthetic — funky display type, neon outlines,
  hand-drawn energy. Menus feel like flyers stapled to a wasteland pole.
- **Death/KO:** confetti + glitter burst, slow-mo, crowd cheer. Losing is funny, not grim.

## 7. Implementation notes (keep it cheap & readable)

- Characters draw as vector lines from ragdoll transforms + a **cosmetic overlay layer**
  (decals/sprites attached per limb) — no heavy rigging.
- A global **palette/lighting pass** (additive glow at night, bloom on neon/element FX)
  sells the look without per-asset cost.
- Readability guardrails: element colors are fixed and consistent; limb-state always
  visible; a "reduce flashing / reduce particles" accessibility toggle is required (lots
  of neon + flashes ⇒ photosensitivity care).
