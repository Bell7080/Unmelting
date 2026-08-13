/**
 * 보스 밸런스 리포트 — `npm run balance:boss`.
 *
 * "체력을 몇으로 둘까"를 단일 타수 가정으로 정하면 실제 전투와 어긋난다. 보스전에서
 * 플레이어가 쏟아붓는 화력은 직접 타격 하나가 아니라 **손에 든 공격 손패 3~4장 +
 * 부위 파괴 보너스 + 레시피·유물 시너지**의 합이고, 그 합은 뽑기 운에 따라 몇 배씩
 * 흔들린다(광역 손패 한 장이 격자 9칸에 전부 꽂히기 때문).
 *
 * 이 도구는 체력 산출과 **같은 모델**(`BossDamageBudget`)로 그 분포를 몬테카를로로
 * 뽑아, 보스마다 실제 필요한 행동 수의 p10/중앙/p90을 보여 준다. 밸런싱은 중앙값이
 * 아니라 이 폭을 보고 판단한다.
 *
 * 참고 리포트이며 빌드 게이트가 아니다. 게임 런타임에서 import 하지 않는다.
 */

import {
  BOSS_CORE_SPECS,
  BOSS_FIGHT_BUDGETS,
  ONBOARDING_CAT_SPEC,
  ONBOARDING_CAT_BUDGET,
  demonSummonSpec,
  demonSummonBudget,
  type BossCoreSpec,
} from '@data/BossSpecs'
import {
  bossAttackCardPool,
  bossGridModel,
  directHitDamage,
  handCardDamage,
  handCardImpact,
  expectedHandCardDamage,
  type BossAttackCard,
  type BossFightBudget,
  type BossGridModel,
} from '@data/BossDamageBudget'

// ── 몬테카를로 ─────────────────────────────────────────────────────────────

/** 재현 가능한 난수(리포트가 실행마다 흔들리면 비교할 수 없다). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function drawWeighted(pool: BossAttackCard[], rng: () => number): BossAttackCard {
  const total = pool.reduce((s, c) => s + c.weight, 0)
  let roll = rng() * total
  for (const card of pool) {
    roll -= card.weight
    if (roll <= 0) return card
  }
  return pool[pool.length - 1]
}

interface Scenario {
  label: string
  /** 이 시나리오에서 뽑힐 수 있는 카드. */
  pool: BossAttackCard[]
  /** 손에 쥔 공격 손패 장수(아래 forced 포함). */
  handSize: number
  /** 반드시 손에 있다고 두는 카드. 이 카드의 피해도 손패피해에 **함께** 센다. */
  forced?: BossAttackCard
}

interface Outcome {
  handDamage: number
  directHits: number
  unmodeled: number
}

function simulate(
  scenario: Scenario,
  spec: BossCoreSpec,
  attack: number,
  grid: BossGridModel,
  trials: number,
  seed: number
): Outcome[] {
  const rng = mulberry32(seed)
  const perHit = directHitDamage(attack, grid)
  const out: Outcome[] = []
  for (let i = 0; i < trials; i++) {
    let handDamage = 0
    let unmodeled = 0
    if (scenario.forced) handDamage += handCardDamage(scenario.forced, attack, grid)
    const drawn = scenario.handSize - (scenario.forced ? 1 : 0)
    for (let c = 0; c < drawn; c++) {
      const card = drawWeighted(scenario.pool, rng)
      if (card.reach === 'unmodeled') unmodeled++
      handDamage += handCardDamage(card, attack, grid)
    }
    const remaining = Math.max(0, spec.maxHp - handDamage)
    out.push({ handDamage, directHits: remaining / perHit, unmodeled })
  }
  return out
}

const quantile = (sorted: number[], q: number): number =>
  sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]

function summarize(values: number[]): { p10: number; p50: number; p90: number; mean: number } {
  const sorted = [...values].sort((a, b) => a - b)
  return {
    p10: quantile(sorted, 0.1),
    p50: quantile(sorted, 0.5),
    p90: quantile(sorted, 0.9),
    mean: values.reduce((s, v) => s + v, 0) / values.length,
  }
}

// ── 리포트 ─────────────────────────────────────────────────────────────────

const TRIALS = 20000
/** 보스전에 들고 들어간다고 보는 공격 손패 장수 — 사용자가 세운 기준. */
const HAND_SIZES = [3, 4]

interface BossRow {
  label: string
  spec: BossCoreSpec
  fight: BossFightBudget
}

function bossRows(): BossRow[] {
  return [
    { label: '새싹 30F 양초 고양이', spec: ONBOARDING_CAT_SPEC, fight: ONBOARDING_CAT_BUDGET },
    { label: '30F 양초 백작', spec: BOSS_CORE_SPECS[30], fight: BOSS_FIGHT_BUDGETS[30] },
    { label: '60F 불씨 기사단장', spec: BOSS_CORE_SPECS[60], fight: BOSS_FIGHT_BUDGETS[60] },
    { label: '90F 밀랍 조각사', spec: BOSS_CORE_SPECS[90], fight: BOSS_FIGHT_BUDGETS[90] },
    { label: '100F 녹지 않는 마녀', spec: BOSS_CORE_SPECS[100], fight: BOSS_FIGHT_BUDGETS[100] },
    { label: '악마(60턴 발동)', spec: demonSummonSpec(60), fight: demonSummonBudget(60) },
  ]
}

const fmt = (n: number, digits = 1): string => n.toFixed(digits).padStart(6)

function main(): void {
  const pool = bossAttackCardPool()
  const unlocked = pool.filter((c) => !c.runLocked)
  const noChandelier = unlocked.filter((c) => c.id !== 'chandelier')
  const areaCards = pool.filter((c) => c.reach === 'area')

  console.log('=== 보스전 화력 분포 리포트 ===')
  console.log(`몬테카를로 ${TRIALS.toLocaleString()}회 · 공격 손패 ${HAND_SIZES.join('/')}장 가정`)
  console.log('행동 수 = 손패 사용 + 직접 타격. 지원 화력(레시피·유물)은 체력 산출에만 반영된다.\n')

  console.log('[드로우 풀] 보스전에 뽑힐 수 있는 공격 손패')
  const totalWeight = unlocked.reduce((s, c) => s + c.weight, 0)
  for (const c of [...unlocked].sort((a, b) => b.weight - a.weight)) {
    const share = ((c.weight / totalWeight) * 100).toFixed(1)
    const kindLabel = c.reach === 'area' ? '광역' : c.reach === 'unmodeled' ? '미모델' : c.aimed ? '조준' : '무작위'
    const dmg = c.reach === 'unmodeled' ? '' : `  ${c.atkMult}공+${c.flat}`
    // 3~4장 뽑았을 때 이 카드가 손에 **한 장이라도** 들어올 확률. 한 장의 위력만 보면
    // "이 카드가 전투를 지배한다"로 읽히지만, 실제로는 대개 안 들어온다.
    const p3 = (1 - (1 - c.weight / totalWeight) ** 3) * 100
    const p4 = (1 - (1 - c.weight / totalWeight) ** 4) * 100
    console.log(
      `  ${c.name.padEnd(10)} w=${String(c.weight).padStart(2)} (${share.padStart(4)}%) ${kindLabel}${dmg}` +
        `   손에 들어올 확률 3장 ${p3.toFixed(0).padStart(2)}% / 4장 ${p4.toFixed(0).padStart(2)}%`
    )
  }
  console.log(`  (해금 전 잠긴 공격 손패 ${pool.length - unlocked.length}종 제외)`)
  console.log(`  광역 손패: ${areaCards.map((c) => `${c.name}${c.runLocked ? '(잠김)' : ''}`).join(', ')}\n`)

  for (const row of bossRows()) {
    const grid = bossGridModel(row.fight.gimmickKind)
    const attack = row.fight.playerAttack
    const perHit = directHitDamage(attack, grid)
    console.log(`── ${row.label} · HP ${row.spec.maxHp} · 가정 공격력 ${attack} · 목표 행동 ${row.fight.targetActions}`)
    console.log(
      `   격자 ${grid.cells}칸 · 최고 ×${grid.bestMultiplier} · 평균 ×${grid.averageMultiplier.toFixed(2)}` +
        ` · 부위 파괴 ×${grid.breakBonusFactor.toFixed(2)} · 직접 1타 ${perHit.toFixed(1)}` +
        ` · 손패 1장 기대 ${expectedHandCardDamage(attack, grid, unlocked).toFixed(1)}`
    )
    // 한 장을 지금 썼을 때 실제로 깎이는 체력(부위 파괴 보너스 없음). 전투 기여분과
    // 구분해서 찍는다 — 이 둘을 섞으면 카드 한 장이 1.8배 세 보인다.
    const oneShot = [...unlocked]
      .filter((c) => c.reach !== 'unmodeled')
      .sort((a, b) => handCardImpact(b, attack, grid) - handCardImpact(a, attack, grid))
      .slice(0, 3)
      .map((c) => {
        const hit = handCardImpact(c, attack, grid)
        return `${c.name} ${hit.toFixed(0)}(${((hit / row.spec.maxHp) * 100).toFixed(0)}%)`
      })
    console.log(`   1회 실효 피해 상위 — ${oneShot.join(' · ')}`)
    for (const handSize of HAND_SIZES) {
      report(`무작위 ${handSize}장`, unlocked, handSize, row, grid, attack)
      report('└ 샹들리에 없음', noChandelier, handSize, row, grid, attack)
      const chandelier = unlocked.find((c) => c.id === 'chandelier')
      if (chandelier) {
        // 강제 카드를 체력에서 미리 빼면 그 피해가 표에서 사라져 '확정'이 오히려
        // 약해 보인다(실제로 그렇게 읽혔다). 손에 쥐여 주고 피해도 함께 센다.
        report('└ 샹들리에 확정', unlocked, handSize, row, grid, attack, 0, chandelier)
      }
    }
    console.log('')
  }

  console.log('읽는 법')
  console.log('  · "총 행동"이 목표 행동 근처면 곡선이 맞는 것이다.')
  console.log('  · p10과 p90의 폭이 목표의 절반을 넘으면 뽑기 운이 난이도를 지배하고 있다는 뜻이다.')
  console.log('  · 미모델(레바테인·방패 밀치기·손거울)은 0으로 세므로 실제는 이 값보다 조금 세다.')
  console.log('  · "1회 실효 피해"는 지금 한 번 썼을 때 깎이는 체력이고, 표의 손패피해는')
  console.log('    전투 전체에 상각된 부위 파괴 보너스까지 얹은 기여분이다 — 둘을 섞지 말 것.')
  console.log('  · 광역 카드는 성한 칸에만 들어간다. 칸이 깨질수록 약해지는데 모델은 항상')
  console.log('    전체 칸으로 계산하므로, 후반부 광역 피해는 표보다 낮다.')
  console.log('  · 광역 한 방이 깨는 칸 수에는 상한이 있다(BOSS_GIMMICK_MAX_BREAKS_PER_SWEEP).')
  console.log('    표의 부위 파괴 보너스는 전투 전체에 상각한 값이라, 단두대 같은 단발 광역의')
  console.log('    실제 순간 피해는 표보다 낮다 — 한 방 격파를 막는 장치다.')
}

function report(
  label: string,
  pool: BossAttackCard[],
  handSize: number,
  row: BossRow,
  grid: BossGridModel,
  attack: number,
  extraActions = 0,
  forced?: BossAttackCard
): void {
  const outcomes = simulate({ label, pool, handSize, forced }, row.spec, attack, grid, TRIALS, 12345 + handSize)
  const hand = summarize(outcomes.map((o) => o.handDamage))
  const actions = summarize(outcomes.map((o) => o.directHits + handSize + extraActions))
  console.log(
    `   ${label.padEnd(14)} 손패피해 중앙 ${fmt(hand.p50)} (p10 ${fmt(hand.p10)} / p90 ${fmt(hand.p90)})` +
      `  →  총 행동 중앙 ${fmt(actions.p50)} (p10 ${fmt(actions.p10)} / p90 ${fmt(actions.p90)})`
  )
}

main()
