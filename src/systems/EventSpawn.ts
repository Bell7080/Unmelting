/**
 * EventSpawn - Independent pseudo-random distribution (PRD) roll for the
 * "event door" rail cell.
 *
 * Design (locked):
 *  - The event door is NOT drawn from the weighted enemy/trap/treasure/flower
 *    bucket. It is a separate overlay roll, so it never touches the 100% normal
 *    spawn distribution or the left-side spawn probability panel.
 *  - Each eligible turn rolls an independent chance that ramps up while it keeps
 *    missing and resets the moment a door spawns (Dota-style PRD). This avoids
 *    both droughts and clusters.
 *  - Two phases:
 *      • Until the FIRST door of the run spawns, a steeper ramp guarantees an
 *        early "taste" before the 30F boss (chance crosses ~80% around turn 25).
 *      • After the first door, the ramp resets to a gentle slope tuned for a
 *        soft ~1–2 doors per 30-turn boss segment.
 *  - Milestone turns (every 10th: shops/altars/bosses) are skipped — no roll,
 *    accumulated chance simply carries to the next turn so the shutter beat is
 *    never crowded.
 *  - The 90–100F final ascent is owned by the starlight rule, so doors are
 *    disabled there entirely.
 */

export interface EventSpawnConfig {
  /** Chance on the first roll and immediately after every spawn (e.g. 0.01 = 1%). */
  baseChance: number
  /** Per-roll increment before the run's first door (steep, early guarantee). */
  earlyStep: number
  /** Per-roll increment after the first door (gentle soft pacing). */
  lateStep: number
  /** Roll-turns to hold at baseChance before ramping, shaping a convex early
   *  curve so the first door lands mid-to-late rather than clustering at turn ~6. */
  earlyDelayRolls: number
  /** Upper bound so a long miss streak still cannot exceed this per-turn chance. */
  maxChance: number
  /** Last turn a door may still spawn; the final ascent above this is disabled. */
  lastActiveTurn: number
}

/** Provisional defaults; the calibration sim (EventSpawn.sim.test.ts) reports the
 *  real first-door distribution so these are locked from data, not guesswork. */
export const DEFAULT_EVENT_SPAWN_CONFIG: EventSpawnConfig = {
  baseChance: 0.01,
  // 곡선 B(캘리브레이션 확정): 첫 문 평균 ~17턴(16~25 집중), 세그먼트당 ~1.2회.
  earlyStep: 0.07,
  lateStep: 0.012,
  earlyDelayRolls: 12,
  maxChance: 0.95,
  lastActiveTurn: 89,
}

export class EventSpawnController {
  private cfg: EventSpawnConfig
  private rng: () => number
  /** Current per-turn chance; accumulates across eligible misses, resets on spawn. */
  private chance: number
  /** Number of eligible misses since the last spawn (or run start), drives the ramp. */
  private misses: number
  /** The steep early ramp applies only until the run's first door appears. */
  private firstDoorSpawned: boolean

  constructor(config: EventSpawnConfig = DEFAULT_EVENT_SPAWN_CONFIG, rng: () => number = Math.random) {
    this.cfg = config
    this.rng = rng
    this.chance = config.baseChance
    this.misses = 0
    this.firstDoorSpawned = false
  }

  /** A turn is eligible if it is inside the run, not a milestone (every 10th),
   *  and not past the final-ascent cutoff. Milestone/late turns never roll. */
  isEligibleTurn(turn: number): boolean {
    if (turn <= 0 || turn > this.cfg.lastActiveTurn) return false
    if (turn % 10 === 0) return false
    return true
  }

  /** Current per-turn chance for display/debug. */
  getChance(): number {
    return this.chance
  }

  /** 런 재시작 시 PRD 상태를 초기화한다. */
  reset(): void {
    this.chance = this.cfg.baseChance
    this.misses = 0
    this.firstDoorSpawned = false
  }

  /** Resolve one turn. Ineligible turns carry the accumulated chance untouched.
   *  Eligible turns roll: a hit resets the ramp (and unlocks the gentle phase),
   *  a miss raises the chance for next time. Returns true when a door spawns. */
  rollForTurn(turn: number): boolean {
    if (!this.isEligibleTurn(turn)) return false

    const hit = this.rng() < this.chance
    if (hit) {
      this.firstDoorSpawned = true
      this.misses = 0
      this.chance = this.cfg.baseChance
      return true
    }

    this.misses += 1
    this.chance = this.computeChance(this.misses)
    return false
  }

  /** Linear ramp from baseChance after an initial flat hold, capped at maxChance.
   *  The slope is steep until the first door, then gentle for the rest of the run. */
  private computeChance(misses: number): number {
    const step = this.firstDoorSpawned ? this.cfg.lateStep : this.cfg.earlyStep
    const ramped = Math.max(0, misses - this.cfg.earlyDelayRolls)
    return Math.min(this.cfg.maxChance, this.cfg.baseChance + ramped * step)
  }
}
