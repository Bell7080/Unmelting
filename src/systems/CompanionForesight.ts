/**
 * CompanionForesight - 예측 대비의 '그릇'(위협 추정 모듈).
 *
 * 3x3 보드 + 플레이어 상태를 읽어 가까운 위협을 추정한다. 지금은 게임 데이터에 근거한
 * 가벼운 휴리스틱 전방-예측이지만, 의도적으로 순수 함수 + 명확한 출력으로 두어
 * 추후 헤드리스 셀프플레이/딥러닝이 이 자리를 *학습된 추정*으로 대체할 수 있게 한다.
 * (설계: Ena_Companion_AI_Design.md §5 — 예측 반응)
 *
 * 거미줄(웹 함정)은 1/2/3칸에서 1/5/즉사 피해(CardSpawner 기준). 1칸짜리가 여럿이면
 * 한 행으로 합쳐져 큰 거미줄이 되어 치명적일 수 있다 — 합쳐지기 전에 미리 치우는 게 핵심.
 */

import type { Lane } from '@entities/Lane'
import { LANE_DISTANCE_COUNT } from '@entities/Lane'
import { CardType } from '@entities/Card'
import type { Card } from '@entities/Card'
import type { Character } from '@entities/Character'

export interface ThreatReport {
  /** 합쳐지기 전 청소 가능한 1칸 거미줄 수. */
  webCount: number
  /** 그 거미줄들이 한 행으로 합쳐졌을 때 추정 피해(3칸=치명적, 2칸=5). */
  potentialWebDamage: number
  /** 합쳐진 거미줄 피해가 현재 체력으로 치명적인가. */
  webLethal: boolean
  /** 합쳐지기 전에 청소/키틴으로 미리 치우는 게 이로운가. */
  recommendCleanup: boolean
}

/** 합쳐졌을 때 칸 수별 거미줄 추정 피해. 3칸 이상은 '즉사'급으로 크게 본다. */
function mergedWebDamage(webCount: number): number {
  if (webCount >= 3) return 99
  if (webCount === 2) return 5
  return webCount
}

/** 3x3 보드 + 플레이어 상태를 읽어 가까운 위협을 추정한다. */
export function assessThreats(lanes: readonly Lane[], character: Character): ThreatReport {
  const seen = new Set<Card>()
  let webCount = 0
  for (const lane of lanes) {
    for (let d = 0; d < LANE_DISTANCE_COUNT; d++) {
      const card = lane.getCardAtDistance(d)
      if (!card || seen.has(card)) continue
      seen.add(card)
      // 청소가 지울 수 있는 '1칸' 거미줄만 누적 위협으로 센다(합쳐지기 전 단계).
      if (card.type === CardType.TRAP && card.trapKind === 'web' && card.groupCount === 1) {
        webCount += 1
      }
    }
  }
  const potentialWebDamage = mergedWebDamage(webCount)
  const webLethal = potentialWebDamage >= character.health
  // 1칸 거미줄이 둘 이상 — 합쳐져 커지기 전에 치우는 게 이롭다.
  const recommendCleanup = webCount >= 2
  return { webCount, potentialWebDamage, webLethal, recommendCleanup }
}
