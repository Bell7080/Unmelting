// 자원팩(basic-pack) 항목 테이블. 레벨 디자인 전용 파일 — 여기서만 수정한다.
//
// 추가 양식 (한 줄 복사 후 수정):
// { id: 'basic_NNN', illu: 'basic_NNN', theme: 'resource', title: '이름', effect: '효과 텍스트', rarity: 'common'|'rare'|'epic'|'unique'|'legendary', weight: 숫자 }
//
// illu  → src/assets/sprites/basic/{illu}.webp 와 1:1 매칭. 일러스트 없으면 팩 기본 이미지로 폴백.
// weight → 높을수록 팩 오픈 시 등장 확률↑. 등급 공통 테이블(RARITY_DRAW_WEIGHTS) 대신 이 값을 사용.

import type { CardRarity } from '@data/ShopPools'

export interface BasicPackItem {
  id: string
  illu: string
  theme: 'resource'
  title: string
  effect: string
  rarity: CardRarity
  weight: number
}

export const BASIC_PACK_POOL: BasicPackItem[] = [
  // Common — weight 20
  { id: 'basic_001', illu: 'basic_001', theme: 'resource', title: '지혈',      effect: '체력 +3',        rarity: 'common',    weight: 20 },
  { id: 'basic_002', illu: 'basic_002', theme: 'resource', title: '발화',      effect: '불씨 게이지 +1', rarity: 'common',    weight: 20 },
  { id: 'basic_003', illu: 'basic_003', theme: 'resource', title: '하이 카드', effect: '콤보 게이지 +1', rarity: 'common',    weight: 20 },
  // Rare — weight 10
  { id: 'basic_004', illu: 'basic_004', theme: 'resource', title: '봉합',      effect: '체력 +5',        rarity: 'rare',      weight: 10 },
  { id: 'basic_005', illu: 'basic_005', theme: 'resource', title: '화재',      effect: '불씨 게이지 +2', rarity: 'rare',      weight: 10 },
  { id: 'basic_006', illu: 'basic_006', theme: 'resource', title: '투페어',    effect: '콤보 게이지 +2', rarity: 'rare',      weight: 10 },
  // Epic — weight 5
  { id: 'basic_007', illu: 'basic_007', theme: 'resource', title: '복원',      effect: '체력 +10',       rarity: 'epic',      weight: 5  },
  { id: 'basic_008', illu: 'basic_008', theme: 'resource', title: '대화재',    effect: '불씨 게이지 +3', rarity: 'epic',      weight: 5  },
  { id: 'basic_009', illu: 'basic_009', theme: 'resource', title: '플러시',    effect: '콤보 게이지 +3', rarity: 'epic',      weight: 5  },
  // Legendary — weight 2
  { id: 'basic_010', illu: 'basic_010', theme: 'resource', title: '갑옷 장착', effect: '방패 +3',        rarity: 'legendary', weight: 2  },
  // Unique — weight 1
  { id: 'basic_011', illu: 'basic_011', theme: 'resource', title: '동전 한 닢', effect: '화폐 +1',       rarity: 'unique',    weight: 1  },
]
