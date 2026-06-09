# Game-Feel Plan — locomotion & melee (Phase 1.5)

Research-backed plan to fix the two issues from playtest: **"swings are slow"** and
**"no walking animation — they glide like ghosts."** Sources at the bottom.

## What the good games do

**Procedural walking (no hand-drawn animation required).** Active-ragdoll/2D games drive
each leg toward a *target pose* computed from a walk phase:

- Upper legs swing fore/aft as `±A·sin(phase)`, the two legs in **opposite phase**.
- **Knees bend on the lifting (back) half** of the cycle so the foot clears the ground.
- **Advance `phase` by distance travelled**, not by time, so step cadence matches speed
  and the feet don't ice-skate ("no easing while a foot is planted" → less sliding).
- Add **arm counter-swing** and a subtle hip bob for life.

**Melee swings are 3 phases** (and must feel responsive):

1. **Anticipation / cock-back** — a quick 0.1–0.2 s "tell" where the arm pulls back. This
   both telegraphs the hit and loads the swing so the strike has a longer, faster arc.
2. **Strike** — a *fast* forward whip; this is the damage window.
3. **Follow-through / recovery** — sells weight; the arm settles back to guard.

Plus: **near-instant response to input** (a held-then-released attack feels laggy), and
**1–4 frames of hitstop** on contact massively boosts the sense of impact.

## Plan (tiered)

### Tier 1 — implemented now (directly fixes the report)

- [x] **Procedural walk cycle**: leg target angles driven by `sin(walkPhase)`, opposite
      phase, knee bend on the lift half, arm counter-swing. Phase advances with horizontal
      speed so cadence tracks movement (kills the "ghost glide").
- [x] **Snappy 3-phase swing**: short cock-back → fast forward whip → settle. Shorter total
      time + higher whip speed so swings read as fast and hit harder.
- [x] **Swing trail**: a fading streak off the weapon tip while it's moving fast, so the eye
      reads the swing as quick and weighty.
- [x] Hitstop already fires on solid hits (kept/tuned).

### Tier 2 — next, if we want it crisper

- [ ] **Foot IK (two-bone)**: raycast down per foot, plant it, solve knee/hip so feet stick
      to the ground and push off — removes residual sliding, looks pro.
- [ ] **Hip/torso bob** synced to the step for extra bounce.
- [ ] **Per-weapon swing tuning** (heavy mace = slower, bigger wind-up + more hitstop; light
      saber = faster) — sets up the modular-weapon Forge later.
- [ ] **Lunge on strike**: a small forward hop into the swing for commitment + spacing.

### Tier 3 — polish

- [ ] Squash/landing flex, turn-around pivot, idle sway/breathing.
- [ ] Directional swings (up/down/forward) and a light/heavy attack split.

## Tuning knobs

All of the above live in `src/config.ts` under `control` (walk + swing motion) and
`combat` (swing timing/damage), so feel iteration is fast: describe it → dial it in.

## Sources

- Little Polygon — Procedural Animation: Locomotion: https://blog.littlepolygon.com/posts/loco1/
- Little Polygon — Two-bone IK: https://blog.littlepolygon.com/posts/twobone/
- Sergio Abreu — How to make Active Ragdolls in Unity: https://sergioabreu-g.medium.com/how-to-make-active-ragdolls-in-unity-35347dcb952d
- Jettelly — Self-Balancing Active Ragdoll: https://jettelly.com/blog/self-balancing-active-ragdoll-in-unity-breakdown-of-an-upcoming-tool
- SLYNYRD — Pixelblog 9, Melee Attacks: https://www.slynyrd.com/blog/2018/9/8/pixelblog-9-melee-attacks
- Wayline — Impactful Melee Combat for Indie Games: https://www.wayline.io/blog/impactful-melee-combat-indie-games
- GameRant — Avowed's responsive melee weight/impact: https://gamerant.com/avowed-melee-combat-first-person-rpg-weight-responsive-impact/
