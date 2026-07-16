/**
 * BossSpecs — 보스 핵심 전투 스펙의 단일 출처.
 *
 * 실게임(BossEvent.ts의 BossDef)과 학습 시뮬(EnaTrainingSimulation의 BOSS_PROFILES)이
 * 같은 수치를 복제해 들고 있던 누수를 막는다. 보스 밸런싱은 이 파일만 고치면
 * 본편과 에나 학습 세계가 함께 움직인다. 연출/대사/스프라이트는 BossEvent.ts에 남긴다.
 */

/** 보스 한 명의 전투 핵심 수치(연출 제외). */
export interface BossCoreSpec {
  name: string
  maxHp: number
  attack: number
  /** 반격(공격) 주기 — n턴마다 1회. */
  attackInterval: number
  /** 보스 HP를 이만큼 잃을 때마다 플레이어 손패 1장 지급. */
  handGiftStep: number
}

/** 정규 등반 보스(30/60/90/100F). */
export const BOSS_CORE_SPECS: Record<30 | 60 | 90 | 100, BossCoreSpec> = {
  30: { name: '양초 백작', maxHp: 50, attack: 4, attackInterval: 2, handGiftStep: 15 },
  60: { name: '불씨 기사단장', maxHp: 80, attack: 7, attackInterval: 2, handGiftStep: 15 },
  90: { name: '밀랍 조각사', maxHp: 130, attack: 10, attackInterval: 3, handGiftStep: 15 },
  100: { name: '녹지 않는 마녀', maxHp: 270, attack: 15, attackInterval: 2, handGiftStep: 15 },
}

/** 새싹 병아리(온보딩) 30F 보스 — 손패 5 감소마다 지급으로 초보에게 넉넉하다. */
export const ONBOARDING_CAT_SPEC: BossCoreSpec = {
  name: '양초 고양이', maxHp: 30, attack: 3, attackInterval: 2, handGiftStep: 5,
}

/** 악마 소환 레시피 이벤트 보스 — 발동 턴에 비례해 자란다. */
export function demonSummonSpec(turn: number): BossCoreSpec {
  return { name: '검은 양초 악마', maxHp: 130 + turn, attack: 3 + Math.floor(turn / 10), attackInterval: 2, handGiftStep: 15 }
}
