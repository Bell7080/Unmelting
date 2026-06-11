// 강화팩(upgrade-pack) 항목 테이블. 레벨 디자인 전용 파일 — 여기서만 수정한다.
//
// 추가 양식 (한 줄 복사 후 수정):
// { id: 'triple-{cardId}' | 'recipe-{recipeId}', theme: 'upgrade', title: '이름', effect: '효과 텍스트', rarity: 'common'|'rare'|'epic'|'unique'|'legendary', weight: 숫자 }
//
// id 규칙 — 효과/등장 조건/일러스트가 모두 id 접두사로 연결된다:
//   triple-{cardId}    → 해당 손패 카드가 해금된 런에서만 등장. 트리플 발동 효과를 +1 한다.
//   recipe-{recipeId}  → 레시피 재료가 모두 해금된 런에서만 등장. 레시피 효과를 +1 한다.
// 등장 필터는 systems/UpgradePackPool.ts, 실제 적용은 index.ts rollPackItems가 담당한다.
// weight → 높을수록 팩 오픈 시 등장 확률↑.
// 일러스트는 새 스프라이트를 만들지 않고 기존 손패 아트를 재사용한다(spriteForUpgradePackItem):
//   triple → 그 카드 아트, recipe → 레시피 첫 재료 카드 아트.
//
// effect 표기 규칙 — "★ 수치" 형식. 카드명·트리플 문구는 title에 있으므로 effect에 반복 금지.

import type { CardRarity } from '@data/ShopPools'

export interface UpgradePackItem {
  id: string
  theme: 'upgrade'
  title: string
  effect: string
  rarity: CardRarity
  weight: number
}

export const UPGRADE_PACK_POOL: UpgradePackItem[] = [
  // ── 트리플 강화 — 기본 6장 (common/legendary) ──────────────────────────────
  { id: 'triple-wax-drop', theme: 'upgrade', title: '촛농 트리플',   effect: '★ 체력 +1 추가',       rarity: 'common',    weight: 20 },
  { id: 'triple-candle',   theme: 'upgrade', title: '양초 트리플',   effect: '★ 방패 +1 추가',       rarity: 'common',    weight: 20 },
  { id: 'triple-ember',    theme: 'upgrade', title: '불씨 트리플',   effect: '★ 피해 +1 추가',       rarity: 'common',    weight: 20 },
  { id: 'triple-match',    theme: 'upgrade', title: '성냥 트리플',   effect: '★ 불씨 +1 추가',       rarity: 'common',    weight: 20 },
  { id: 'triple-coin',     theme: 'upgrade', title: '동전 트리플',   effect: '★ 화폐 +1 추가',       rarity: 'legendary', weight: 1  },
  { id: 'triple-card',     theme: 'upgrade', title: '카드 트리플',   effect: '★ 콤보 게이지 +1 추가', rarity: 'epic',      weight: 5  },

  // ── 트리플 강화 — 신규 카드 ──────────────────────────────────────────────────
  { id: 'triple-wax',             theme: 'upgrade', title: '밀랍 트리플',       effect: '★ 굳음 +1턴 추가',          rarity: 'common',    weight: 15 },
  { id: 'triple-sacrifice-candle',theme: 'upgrade', title: '제물 양초 트리플',  effect: '★ 피해 +1 추가',            rarity: 'rare',      weight: 10 },
  { id: 'triple-firework',        theme: 'upgrade', title: '폭죽 트리플',       effect: '★ 분산 피해 +1 추가',       rarity: 'rare',      weight: 10 },
  { id: 'triple-sacrifice-shield',theme: 'upgrade', title: '희생 방패 트리플',  effect: '★ 방패 +1 추가',            rarity: 'rare',      weight: 10 },
  { id: 'triple-chandelier',      theme: 'upgrade', title: '샹들리에 트리플',   effect: '★ 피해 +1 추가',            rarity: 'legendary', weight: 2  },
  { id: 'triple-fire-arrow',      theme: 'upgrade', title: '불화살 트리플',     effect: '★ 최대 피해 +5 추가',       rarity: 'rare',      weight: 10 },
  { id: 'triple-book-of-flames',  theme: 'upgrade', title: '화염의 서 트리플',  effect: '★ 피해 +1 추가',            rarity: 'epic',      weight: 5  },
  { id: 'triple-shield-bash',     theme: 'upgrade', title: '방패 밀치기 트리플',effect: '★ 배율 +1 추가 (방패×4)',   rarity: 'rare',      weight: 10 },
  { id: 'triple-teapot',          theme: 'upgrade', title: '주전자 트리플',     effect: '★ 기본 피해 +2 추가',       rarity: 'epic',      weight: 5  },
  { id: 'triple-teacup',          theme: 'upgrade', title: '찻잔 트리플',       effect: '★ 승수 +1 추가',            rarity: 'epic',      weight: 6  },
  { id: 'triple-bonfire',         theme: 'upgrade', title: '모닥불 트리플',     effect: '★ 피해·체력 각 +1 추가',    rarity: 'rare',      weight: 10 },
  { id: 'triple-shackles',        theme: 'upgrade', title: '족쇄 트리플',       effect: '★ 방패·체력 각 +1 추가',    rarity: 'epic',      weight: 5  },
  { id: 'triple-slash',           theme: 'upgrade', title: '참격 트리플',       effect: '★ (미정)',                  rarity: 'epic',      weight: 6  },
  { id: 'triple-candle-tome',     theme: 'upgrade', title: '양초의 서 트리플',  effect: '★ 방패 +1 추가',            rarity: 'epic',      weight: 5  },
  { id: 'triple-ritual-candle',   theme: 'upgrade', title: '의식 양초 트리플',  effect: '★ 손패 +1 추가',            rarity: 'rare',      weight: 10 },

  // ── 레시피 강화 — 기본 (rare/epic/legendary) ─────────────────────────────────
  { id: 'recipe-ignite',         theme: 'upgrade', title: '점화 강화',       effect: '점화 레시피 피해 +1',         rarity: 'rare',      weight: 10 },
  { id: 'recipe-hot',            theme: 'upgrade', title: '뜨거움 강화',     effect: '뜨거움 레시피 피해 +1',       rarity: 'rare',      weight: 10 },
  { id: 'recipe-fuse',           theme: 'upgrade', title: '도화선 강화',     effect: '도화선 레시피 피해 +1',       rarity: 'rare',      weight: 10 },
  { id: 'recipe-candle-smash',   theme: 'upgrade', title: '양초 스매쉬 강화',effect: '양초 스매쉬 레시피 처치 +1장',rarity: 'epic',      weight: 5  },
  { id: 'recipe-greed',          theme: 'upgrade', title: '탐욕 강화',       effect: '탐욕 레시피 변환 +1칸',       rarity: 'epic',      weight: 5  },
  { id: 'recipe-locksmith',      theme: 'upgrade', title: '열쇠공 강화',     effect: '열쇠공 레시피 획득 +1개',     rarity: 'epic',      weight: 5  },
  { id: 'recipe-mine-sweeper',   theme: 'upgrade', title: '지뢰제거반 강화', effect: '지뢰제거반 레시피 변환 +1칸', rarity: 'epic',      weight: 5  },
  { id: 'recipe-shuffle',        theme: 'upgrade', title: '셔플 강화',       effect: '셔플 레시피 드로우 +1장',     rarity: 'legendary', weight: 1  },
  { id: 'recipe-dividend',       theme: 'upgrade', title: '배당금 강화',     effect: '배당금 레시피 화폐 +1$',      rarity: 'legendary', weight: 1  },

  // ── 레시피 강화 — 신규 레시피 (rare) ─────────────────────────────────────────
  { id: 'recipe-flame-infusion', theme: 'upgrade', title: '불꽃 주입 강화',  effect: '불꽃 주입 레시피 불씨 +1',    rarity: 'rare',      weight: 10 },
  { id: 'recipe-bond',           theme: 'upgrade', title: '결속 강화',       effect: '결속 레시피 회복 +1',         rarity: 'rare',      weight: 10 },
  { id: 'recipe-glass-shards',   theme: 'upgrade', title: '유리 파편 강화',  effect: '유리 파편 레시피 피해 +1',    rarity: 'rare',      weight: 10 },
  { id: 'recipe-blood-pact',     theme: 'upgrade', title: '혈약 강화',       effect: '혈약 레시피 회복 +1',         rarity: 'rare',      weight: 10 },
  { id: 'recipe-bright-ceiling', theme: 'upgrade', title: '밝은 천장 강화',  effect: '밝은 천장 레시피 불씨 +1',    rarity: 'rare',      weight: 10 },
  { id: 'recipe-fireworks-show', theme: 'upgrade', title: '불꽃놀이 강화',   effect: '불꽃놀이 레시피 피해 +1',     rarity: 'rare',      weight: 10 },
  { id: 'recipe-hospitality',    theme: 'upgrade', title: '대접 강화',       effect: '대접 레시피 회복 +1',         rarity: 'rare',      weight: 10 },
  { id: 'recipe-flame-chain',    theme: 'upgrade', title: '불꽃 사슬 강화',  effect: '불꽃 사슬 레시피 피해 +1',    rarity: 'rare',      weight: 10 },
  { id: 'recipe-banquet',        theme: 'upgrade', title: '연회 강화',       effect: '연회 레시피 피해 +1',         rarity: 'rare',      weight: 10 },

  // ── 레시피 강화 — 해금팩 전용 (rare/legendary) ───────────────────────────────
  { id: 'recipe-backfire',       theme: 'upgrade', title: '역화 강화',       effect: '역화 레시피 피해 +1',         rarity: 'rare',      weight: 10 },
  { id: 'recipe-rage',           theme: 'upgrade', title: '분노 강화',       effect: '분노 레시피 피해 +1',         rarity: 'rare',      weight: 10 },
  { id: 'recipe-mythic-flame',   theme: 'upgrade', title: '신화의 불꽃 강화',effect: '신화의 불꽃 레시피 피해 +1',  rarity: 'legendary', weight: 1  },
]
