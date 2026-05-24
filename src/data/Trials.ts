/**
 * Trial card definitions — declarative payload only.
 * The apply() logic lives in index.ts where runModifiers is scoped;
 * this file describes *what* each trial does so it can be data-driven and sheet-exported.
 */

/** Discriminated union describing the run modifier each trial applies. */
export type TrialEffectKind =
  | { type: 'enemy-stat-bonus'; hpBonus: number; atkBonus: number }
  | { type: 'trap-damage-bonus'; value: number }
  | { type: 'treasure-spawn-scale'; factor: number }

/** Sprite slot key matching SpriteUrls.trials in Sprites.ts. */
export type TrialSpriteKey = '001' | '004' | '007'

export interface TrialDefinition {
  id: string
  title: string
  /** Display text shown on the trial card. */
  effect: string
  spriteKey: TrialSpriteKey
  effectKind: TrialEffectKind
}

export const TRIAL_DEFINITIONS: TrialDefinition[] = [
  {
    id: 'arsonist',
    title: '광란',
    effect: '앞으로 나올 모든 적의 체력 +1, 공격력 +1',
    spriteKey: '001',
    effectKind: { type: 'enemy-stat-bonus', hpBonus: 1, atkBonus: 1 },
  },
  {
    id: 'candle-hunter',
    title: '역경',
    effect: '앞으로 나올 모든 함정의 피해 +1',
    spriteKey: '004',
    effectKind: { type: 'trap-damage-bonus', value: 1 },
  },
  {
    id: 'poverty',
    title: '가난',
    effect: '앞으로 나올 보물상자 등장 확률 25% 감소',
    spriteKey: '007',
    effectKind: { type: 'treasure-spawn-scale', factor: 0.75 },
  },
]
