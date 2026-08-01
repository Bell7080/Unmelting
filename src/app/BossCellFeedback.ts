/**
 * BossCellFeedback — 보스 칸 타격 연출의 공용 변환기.
 *
 * 보스는 화면에서 큰 타일 하나라, 피해 수치를 타일 중앙에 띄우면 "방금 어느 칸을
 * 때렸는지"가 보이지 않는다. 모델(BossGimmickManager)이 beat마다 쌓아 둔 칸 타격
 * 기록을 연출 뷰로 옮기는 일을 손패·유물·직접 타격이 각자 하면 규칙이 갈리므로,
 * 이 파일 하나를 지나게 한다.
 */

import type { GameState } from '@core/GameState'
import type { BossGimmickStrikeView } from '@ui/GameBoardRenderer'

/**
 * 이번 beat에 보스 격자의 어느 칸이 맞았는지 꺼내 연출 뷰로 바꾼다(기록은 비워진다).
 *
 * 실제 HP 손실이 기록 합보다 작으면(방패 흡수·치명타 컷) 같은 비율로 줄여, 칸마다
 * 뜨는 수치의 합이 보스가 실제로 받은 피해와 어긋나지 않게 한다.
 */
export function drainBossCellStrikes(gs: GameState, observedLoss: number): BossGimmickStrikeView[] {
  const hits = gs.bossGimmicks?.takeHits() ?? []
  if (hits.length === 0) return []
  const modelTotal = hits.reduce((sum, hit) => sum + hit.damage, 0)
  const scale = modelTotal > 0 ? Math.min(1, observedLoss / modelTotal) : 0
  return hits.map((hit) => ({
    cellIndex: hit.cell.index,
    kind: hit.cell.kind,
    damage: Math.round(hit.cellDamage * scale),
    breakDamage: Math.round(hit.breakDamage * scale),
    wear: hit.cell.wear,
    broke: hit.broke,
  }))
}

/** 이전 beat가 남긴 칸 타격 기록을 버린다. 새 행동이 자기 타격만 연출하도록. */
export function discardBossCellStrikes(gs: GameState): void {
  gs.bossGimmicks?.takeHits()
}
