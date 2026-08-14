/**
 * `damageProfile` 정합 계약 — 데이터 테이블의 피해 근사가 `HandSystem` 실제 공식과
 * 어긋나지 않는지 **자동으로** 지킨다.
 *
 * 왜 필요한가: `HandCardAdvisor`(에나 판단)·`EnaTrainingSimulation`(학습)·
 * `BossDamageBudget`(보스 체력 역산)이 전부 이 근사에 의존한다. `HandSystem`의
 * 공식만 바꾸고 테이블을 놔두면 **화면도 테스트도 멀쩡한 채로** 에나가 없는 세계를
 * 배우고 보스 체력이 틀린 가정에서 뽑힌다. 지금까지는 사람이 기억해서 지켰다.
 *
 * 검사 방식은 문서 대조가 아니라 **실행 대조**다. 실제 `GameState`에 표적 하나를
 * 세우고 진짜 `HandSystem.useSingle()`을 돌려 깎인 체력을 잰다 — 검사용 사본을
 * 만들면 그 사본이 먼저 썩는다.
 */
import { describe, expect, it } from 'vitest'
import { GameState } from '@core/GameState'
import { Card, CardType } from '@entities/Card'
import { HAND_CARD_DEFINITIONS, HAND_CARD_IDS, getHandCardDef } from '@data/HandCards'
import type { HandCardId } from '@entities/HandCard'
import { HandSystem } from './HandSystem'
import { DropSystem } from './DropSystem'

/** 표적 체력 — 어떤 공격도 한 방에 못 죽여야 깎인 양을 그대로 잴 수 있다. */
const DUMMY_HP = 9999

/** 근사를 확인할 공격력 구간. 배율(atkMult)과 상수(flat)를 분리해 보려면 여러 점이 필요하다. */
const ATTACK_SAMPLES = [1, 2, 3, 5, 8, 12]

/**
 * 프로필이 없어도 되는 공격 카드와 그 이유.
 * **비워 두지 않는다** — 여기 적히지 않은 공격 카드는 프로필 누락으로 실패한다.
 */
const PROFILE_EXEMPT: Partial<Record<HandCardId, string>> = {
  // 피해가 공격력이 아니라 보유 방패에서 나온다. floor(atkMult×공)+flat 양식으로 표현 불가.
  'shield-bash': '피해원이 방패 수치라 공격력 기반 근사로 옮길 수 없다',
  // 피해가 **맞는 적의 공격력**이라 플레이어 공격력의 함수가 아니다.
  'hand-mirror': '피해원이 대상 적의 공격력이라 플레이어 공격력 기반 근사로 옮길 수 없다',
  // 실제 피해 계산이 index.ts(적 행동 2턴 시뮬 + ♥ 비례)에 있어 HandSystem 단독으로 안 끝난다.
  levatein: '피해 계산이 index.ts에 있고 최대 체력 비례라 이 양식 밖이다',
}

/** 근사값 — HandCardAdvisor·시뮬·보스 예산이 모두 쓰는 바로 그 식이다. */
function profileDamage(atkMult: number, flat: number, attack: number): number {
  return Math.floor(atkMult * attack) + flat
}

/**
 * 표적 하나를 세우고 카드를 실제로 써서 **깎인 체력 총합**을 잰다.
 *
 * 표적을 하나만 두는 이유: 광역·무작위·분배 카드도 대상이 하나뿐이면 모든 타격이
 * 그 하나에 꽂히므로, 카드 종류마다 다른 측정 코드를 쓰지 않고 한 잣대로 잴 수 있다.
 */
function measureDamage(defId: HandCardId, merged: boolean, attack: number): { dealt: number; removed: boolean } {
  const gs = new GameState()
  gs.character.damage = attack
  const enemy = new Card(`dummy-${defId}`, CardType.ENEMY, '표적', 'contract', DUMMY_HP, 1, {})
  gs.lanes[0].setCardAtDistance(0, enemy)

  gs.character.addHandCard({ ...DropSystem.makeCard(defId), merged })
  const result = HandSystem.useSingle(gs, HandSystem.newChain(), 0, {
    laneIndex: 0,
    distance: 0,
    card: enemy,
  })
  expect(result.success, `${defId}(${merged ? 'triple' : 'base'}) 사용이 실패했다: ${result.message}`).toBe(true)

  // 즉사 카드는 체력을 깎지 않고 카드를 판에서 걷어 낸다 — 피해 0으로 읽히므로 따로 본다.
  return { dealt: DUMMY_HP - enemy.getHealth(), removed: gs.lanes[0].getCardAtDistance(0) !== enemy }
}

describe('damageProfile 계약 — 데이터 테이블 ↔ HandSystem 실제 공식', () => {
  it('공격 카드에 damageProfile이 빠지지 않는다(면제는 이유와 함께 선언한다)', () => {
    const missing = HAND_CARD_IDS.filter((id) => {
      const def = HAND_CARD_DEFINITIONS[id]
      return def.category === 'attack' && !def.damageProfile && !PROFILE_EXEMPT[id]
    })

    // 프로필이 없으면 에나는 그 카드를 '피해 카드로 보지 않는다' — 조용히 전력에서 빠진다.
    expect(missing, `공격 카드인데 damageProfile이 없다: ${missing.join(', ')}`).toEqual([])
  })

  it('면제 목록에 죽은 항목이 남지 않는다', () => {
    for (const id of Object.keys(PROFILE_EXEMPT) as HandCardId[]) {
      const def = HAND_CARD_DEFINITIONS[id]
      expect(def, `면제 목록의 ${id}가 손패 테이블에 없다`).toBeDefined()
      // 프로필이 생겼는데 면제로 남아 있으면 검사에서 조용히 빠진다.
      expect(def.damageProfile, `${id}에 damageProfile이 생겼으니 면제 목록에서 빼야 한다`).toBeUndefined()
    }
  })

  it('확정 피해(deterministic) 카드의 근사가 실제 피해와 정확히 일치한다', () => {
    const mismatches: string[] = []

    for (const id of HAND_CARD_IDS) {
      const def = getHandCardDef(id)
      const profile = def.damageProfile
      if (!profile || !profile.deterministic) continue

      for (const [merged, formula] of [
        [false, profile.base],
        [true, profile.triple],
      ] as const) {
        // 즉사 트리플은 피해가 아니라 제거다 — 아래 전용 검사가 맡는다.
        if (merged && profile.tripleExecutes) continue
        for (const attack of ATTACK_SAMPLES) {
          const expected = profileDamage(formula.atkMult, formula.flat, attack)
          const { dealt } = measureDamage(id, merged, attack)
          if (dealt !== expected) {
            mismatches.push(
              `${id}(${merged ? 'triple' : 'base'}) 공격력 ${attack}: 근사 ${expected} ≠ 실제 ${dealt}`
            )
          }
        }
      }
    }

    expect(mismatches, `damageProfile이 HandSystem 실제 피해와 어긋난다:\n${mismatches.join('\n')}`).toEqual([])
  })

  it('tripleExecutes 표기가 실제 즉사 동작과 일치한다', () => {
    // 표기만 남고 동작이 평범한 피해로 바뀌면(혹은 그 반대면) 소비처가 조용히 틀린 가정을 쓴다.
    for (const id of HAND_CARD_IDS) {
      const profile = getHandCardDef(id).damageProfile
      if (!profile?.tripleExecutes) continue
      const { removed } = measureDamage(id, true, 1)
      // 표적은 체력 9999다 — 어떤 피해로도 못 죽으므로, 사라졌다면 즉사가 맞다.
      expect(removed, `${id} 트리플이 tripleExecutes 표기와 달리 표적을 제거하지 않았다`).toBe(true)
    }
  })

  it('무작위 피해(deterministic:false) 카드의 근사가 실제 기댓값을 넘지 않는다', () => {
    // 무작위 카드는 값이 흔들리므로 '같다'가 아니라 **과대평가하지 않는다**만 지킨다.
    // 근사가 실제보다 크면 에나가 못 잡을 적을 잡는다고 판단해 손패를 낭비한다.
    const overstated: string[] = []
    // 표본 잡음으로 깜빡이지 않게 굴림을 넉넉히 두고 2% 여유를 둔다. 프로필 자체를
    // 기댓값보다 아래로 잡아 두면 이 여유에 걸릴 일이 없다.
    const ROLLS = 200
    const NOISE_TOLERANCE = 1.02

    for (const id of HAND_CARD_IDS) {
      const def = getHandCardDef(id)
      const profile = def.damageProfile
      if (!profile || profile.deterministic) continue

      for (const [merged, formula] of [
        [false, profile.base],
        [true, profile.triple],
      ] as const) {
        for (const attack of ATTACK_SAMPLES) {
          const expected = profileDamage(formula.atkMult, formula.flat, attack)
          let total = 0
          for (let i = 0; i < ROLLS; i++) total += measureDamage(id, merged, attack).dealt
          const mean = total / ROLLS
          if (expected > mean * NOISE_TOLERANCE) {
            overstated.push(
              `${id}(${merged ? 'triple' : 'base'}) 공격력 ${attack}: 근사 ${expected} > 실측 평균 ${mean.toFixed(2)}`
            )
          }
        }
      }
    }

    expect(overstated, `무작위 피해 근사가 실제 기댓값을 넘는다:\n${overstated.join('\n')}`).toEqual([])
  })
})
