/**
 * FeedbackTypes — 자원 트레일/스냅샷 공용 계약.
 * 연출 구현은 index.ts(추후 매니저)가 갖고, 호출하는 매니저들은 이 타입만 의존한다.
 */

/** 트레일 증가분 계산용 플레이어 자원 스냅샷. */
export interface PlayerResourceSnapshot {
  health: number
  maxHealth: number
  shield: number
  ember: number
  candle: number
  damage: number
}

/** 트레일 출발점 — 카드/화면 중앙/체인 배너. */
export type ResourceTrailSource = { kind: 'card'; cardId: string } | { kind: 'center' } | { kind: 'chain' }

/** 수치형 트레일이 다루는 자원 종류(NUMERIC_RESOURCE_TRAILS 키와 동일). */
export type TrailResourceKind = 'health' | 'shield' | 'ember' | 'gauge' | 'attack' | 'score' | 'coin' | 'hand'
