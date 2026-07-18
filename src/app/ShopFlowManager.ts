/**
 * ShopFlowManager — 상점(10/20턴)·제단(30n턴)·강제 시련 흐름 매니저.
 * 방문 단위 상태(오퍼/무료카드/팩 누적가)와 구매·픽·리롤 핸들링, EXIT 후 보스 게이트 연결을 담당한다.
 * 수치 상태(불빛/화폐)·게임 플래그·로그 소유는 index.ts(컴포지션 루트)에 남긴다.
 */

import type { GameState } from '@core/GameState'
import type { TurnManager } from '@core/TurnManager'
import type { BossEventController } from '@core/BossEvent'
import type { RunCardPool } from '@core/RunCardPool'
import type { CardSpawner } from '@systems/CardSpawner'
import { altarPackBaseCost, regularShopPackBaseCost, packCostWithRepeats } from '@core/ShopPricing'
import { sampleWeightedWithoutReplacement, sampleWithoutReplacement } from '@core/Sampling'
import type {
  GameBoardRenderer,
  ActivityLogEntry,
  ShopBuyDetail,
  ShopOfferView,
  ShopPackKind,
  ShopPackItemView,
  ShopPackPickDetail,
  ShopPackPickerView,
  ShopStateView,
} from '@ui/GameBoardRenderer'
import { SquareBurst } from '@ui/SquareBurst'
import { spriteForBasicPackItem, spriteForHandCard, recipeSprite001, SpriteUrls } from '@ui/Sprites'
import type { CompanionSystem, SystemEncounterKind } from '@systems/CompanionSystem'
import { CompanionDirector, BARK_IMPORTANCE } from '@/app/CompanionDirector'
import type { RelicEffectsManager } from '@/app/RelicEffectsManager'
import { HandSystem, type ChainState } from '@systems/HandSystem'
import { DropSystem } from '@systems/DropSystem'
import { getHandCardDef, HAND_CARD_DEFINITIONS } from '@data/HandCards'
import type { HandCardId } from '@entities/HandCard'
import { getRelicDef, RELIC_IDS, relicDrawWeight, type RelicId } from '@data/Relics'
import { HAND_CARD_RARITY, CHANCE_PACK_RARITY_BOOST, SHOP_PACK_POOLS, SHOP_PACK_LABELS } from '@data/ShopPools'
import { RECIPES } from '@data/Recipes'
import { TRIAL_DEFINITIONS } from '@data/Trials'
import { BASIC_PACK_POOL } from '@data/BasicPackPool'
import { enaRuntimeObserver, shopKindToPurchaseId } from '@/rl/EnaRuntimeObserver'
import type { PlayerResourceSnapshot, ResourceTrailSource, TrailResourceKind } from '@/app/FeedbackTypes'

/** 활동 로그 초안 — index.ts의 로그 스탬프(id 부여) 전 단계와 동일한 형태. */
type ActivityLogDraft = Omit<ActivityLogEntry, 'id'>

/** 강제 시련 카드 런타임 형태 — apply는 index의 applyTrialEffect 클로저를 캡슐화한다. */
export interface ForcedTrialRuntimeCard {
  id: string
  title: string
  effect: string
  spriteUrl: string
  apply: () => void
}

const SHOP_PACK_KINDS: readonly ShopPackKind[] = ['basic-pack', 'recipe-pack', 'unlock-pack', 'chance-pack', 'resource-pack', 'delete-pack']

// 공용 무료카드('무료 카드')는 방문마다 하나의 랜덤 효과로 고정한다.
type ShopFreeGiftKind = 'score-300' | 'coin-1' | 'health-5' | 'gauge-3' | 'ember-3' | 'hand-2'

/** 무료 카드 보상 표기 소스. 항목을 추가해도 랜덤 추첨 주석/개수가 자동으로 따라간다.
 *  표기 양식: 스탯류는 명사형 `+N`, 불빛/화폐는 아이콘·단위 표기(✦300, 1$)를 유지한다. */
const SHOP_FREE_GIFT_REWARDS: Record<ShopFreeGiftKind, { description: string; amount: number }> = {
  'score-300': { description: '✦300', amount: 300 },
  'coin-1': { description: '1$', amount: 1 },
  'health-5': { description: '체력 +5', amount: 5 },
  'gauge-3': { description: '콤보 게이지 +3', amount: 3 },
  'ember-3': { description: '불씨 게이지 +3', amount: 3 },
  'hand-2': { description: '랜덤 손패 +2', amount: 2 },
}
const SHOP_FREE_GIFT_KINDS = Object.keys(SHOP_FREE_GIFT_REWARDS) as ShopFreeGiftKind[]

/** Active pack-picker session. Holds the rolled items + the pack kind so the
 *  shopPackPick handler can look the picked item up and apply its effect. */
interface ActivePackSession {
  kind: ShopPackKind
  items: ShopPackPickItem[]
  /** 세션 내 재뽑기 횟수. 비용은 1 + rerollCount$ */
  rerollCount: number
}
interface ShopPackPickItem extends ShopPackItemView {
  /** Applied when the player picks this card. Coins/score may be mutated
   *  through closures, hence the void return + async wrapper. */
  apply: () => Promise<void> | void
}

/** 새싹 병아리(온보딩) 전용 기본 유물 8종 — 게임을 처음 접하는 사람도 바로 이해하는 효과만.
 *  스폰 확률·상자 소멸 같은 아직 안 배운 개념(곡괭이/개봉식)은 빼고, 체력·공격·회복·불빛·불씨·방패
 *  같은 눈에 보이는 기본 개념을 가르치는 유물로 구성한다. */
const ONBOARDING_RELIC_IDS: RelicId[] = [
  'lifeline',      // 최대 체력 +5
  'carving-knife', // 공격력 +1
  'red-potion',    // 적 처치 시 체력 +1
  'chance',        // 직접 타격 15% 확률로 한 번 더
  'axe',           // 불빛 획득량 +10%
  'ambition',      // 적 8회 처치마다 불빛 +25
  'hourglass',     // 불씨 소모 주기 +1턴(불씨가 더 오래 간다)
  'wax-crow',      // 보물 획득 시 방패 +1(방패 개념 학습)
]

/** 온보딩 커먼 풀에서도 제외(잠금)하는 손패 — 물뿌리개는 초반에 혼란을 줘 빼고,
 *  동전은 새싹 단계 화폐($) 획득 전면 잠금 정책으로 뺀다(보물상자 보너스 드롭 차단).
 *  index의 온보딩 커먼 풀 구성도 이 목록을 공유한다. */
export const ONBOARDING_BANNED_CARDS: HandCardId[] = ['watering-can', 'coin']

/** 상점 흐름이 런 상태·연출을 조작할 때 쓰는 주입 계약. 상태 소유는 index.ts에 남는다. */
export interface ShopFlowDeps {
  gameState: GameState
  boardRenderer: GameBoardRenderer
  companion: CompanionSystem
  companionDirector: CompanionDirector
  relicEffects: RelicEffectsManager
  turnManager: TurnManager
  bossController: BossEventController
  runCardPool: RunCardPool
  cardSpawner: CardSpawner
  /** 불빛/화폐/펄스 키 — getter/setter 브리지로 index의 let 상태를 그대로 공유한다. */
  resources: { score: number; coins: number; scorePulseKey: number; coinPulseKey: number }
  forcedTrialCards: readonly ForcedTrialRuntimeCard[]
  getChain(): ChainState
  clearChainTimeline(): void
  setInputLocked(locked: boolean): void
  render(): void
  recordNotice(message: string, kind: 'info' | 'hurt' | 'win'): void
  wait(ms: number): Promise<void>
  encounterIntroLineOnce(kind: SystemEncounterKind): string | null
  isOnboardingActive(): boolean
  snapshotPlayerResources(): PlayerResourceSnapshot
  playPlayerGainTrails(source: ResourceTrailSource, before: PlayerResourceSnapshot): Promise<void>
  playResourceTrail(source: ResourceTrailSource, resource: TrailResourceKind, count: number): Promise<void>
  resolveFullCandleGaugeEffects(source: ResourceTrailSource): Promise<void>
  pushActivityLogsInDisplayOrder(logs: ActivityLogDraft[]): void
  /** 90F 시련 종료 직후 별빛 등반 규칙 발동(index 소유). */
  activateFinalAscentStarlightRule(): void
  /** 런 진행 중 여부(index의 gameActive). */
  isGameActive(): boolean
  /** 화폐 획득 로그(index 로그 스탬프 공유). */
  recordCoinGain(label: string, amount: number): void
  /** 런 종료 마감(정산 화면으로 이어짐). */
  finishTurn(): void
  /** 100층 도달 목표 턴 수(index 상수). */
  runTargetTurns: number
  /** 보스 격파 후 구역 전환 커튼(index의 zoneCurtain/ZONE_LIST 래퍼). */
  showZoneCurtain(zoneIndex: number): Promise<void>
  formatTrialSummary(prefix: string): string
}

export class ShopFlowManager {
  private shopOpen = false
  private currentShopOffers: ShopOfferView[] = []
  /** 제단(30턴) 무료 유물은 1회 단일 픽이다. 한 번 고르면 다시 못 고르게 잠근다. */
  private altarRelicPicked = false
  private shopRerollCount = 0
  /** 방문 내 카드팩별 구매 횟수. 가격은 각 팩의 초기 가격을 매 구매마다 한 번 더 얹는다. */
  private shopPackBuys: Record<ShopPackKind, number> = Object.fromEntries(
    SHOP_PACK_KINDS.map((kind) => [kind, 0])
  ) as Record<ShopPackKind, number>
  /** 리롤 연타로 유물 DOM/상태가 엇갈리지 않도록 비동기 리롤 동안 입력을 잠근다. */
  private shopRerollInProgress = false
  private freeCardClaimed = false
  private freeCoinCardClaimed = false
  private freeGiftKind: ShopFreeGiftKind = 'coin-1'
  private currentShopMode: 'shop' | 'altar' = 'shop'
  private activePackSession: ActivePackSession | null = null

  constructor(private readonly deps: ShopFlowDeps) {}

  /** index의 불빛/화폐 상태 브리지 — 원본 코드의 score/coins 표기를 그대로 유지하기 위한 별칭. */
  private get res() { return this.deps.resources }

  /** 상점/제단 오버레이가 열려 있는지 — 월드 바크 게이트/디버그 가드가 읽는다. */
  isOpen(): boolean { return this.shopOpen }

  /** 팩 피커 세션만 정리(넘기기/외부 취소). */
  resetPackSession(): void { this.activePackSession = null }

  /** 새 런 시작 시 방문 상태 초기화 — 열린 오버레이 정리는 호출부(boardRenderer)가 담당한다. */
  resetForNewRun(): void {
    this.shopOpen = false
    this.currentShopOffers = []
    this.altarRelicPicked = false
    this.activePackSession = null
  }

  getShopPriceMultiplier(): number {
    const turn = this.deps.gameState.getCurrentTurn()
    if (turn <= 10) return 0.8
    return 1 + Math.max(0, turn - 10) * 0.02
  }

  /** basePrice는 Relics.ts 정의에서 읽는다. 실제 식은 -76~+104 비대칭 지터를 만들어 비원형 가격을 낸다.
   *  후반 인플레이션 배수를 곱해 고층에서 불빛 가격이 가팔라지게 한다.
   *  할인 쿠폰 등 shopDiscountPct가 0 초과이면 해당 비율만큼 추가 인하한다. */
  priceForRelic(id: RelicId): number {
    const base = getRelicDef(id).basePrice
    const jitter = Math.floor((Math.random() - 0.42) * 180)
    const raw = Math.max(120, Math.round((base + jitter) * this.getShopPriceMultiplier()))
    const discountFactor = 1 - Math.min(0.8, this.deps.gameState.enhancements.shopDiscountPct / 100)
    return Math.max(120, Math.round(raw * discountFactor))
  }

  /** Generate up to three unowned, unbanned relics + per-spawn this.res.score price. */
  rollShopOffers(excludeIds: string[] = []): ShopOfferView[] {
    const character = this.deps.gameState.character
    // 제단도 상점과 동일하게 전체 유물 풀에서 3장을 뽑는다(상위 등급 제한 없음).
    // 단, 온보딩은 초반 기본 유물만 노출한다(레어 이상 잠금).
    let sourcePool = RELIC_IDS.filter(
      (id) => !character.hasRelic(id) && !character.bannedRelics.includes(id)
    )
    if (this.deps.isOnboardingActive()) sourcePool = sourcePool.filter((id) => ONBOARDING_RELIC_IDS.includes(id))
    // 리롤 시 현재 배치된 유물은 제외한다. 풀이 부족하면 제외 없이 폴백한다.
    const excludeSet = new Set(excludeIds)
    const filteredPool = excludeSet.size > 0
      ? sourcePool.filter((id) => !excludeSet.has(id))
      : sourcePool
    const effectivePool = filteredPool.length >= 3 ? filteredPool : sourcePool
    // 등급 기본 가중치(common 자주, legendary 드물게)에 유물별 지정 weight를 더해 적용한다.
    const weightedPool = effectivePool.flatMap((relicId) => {
      const weight = relicDrawWeight(relicId)
      return Array.from({ length: weight }, () => relicId)
    })
    return weightedPool
      .map((relicId) => ({ relicId, sort: Math.random() }))
      .sort((a, b) => a.sort - b.sort)
      // 실제 노출 3장은 항상 중복 없이 보이도록 정규화한다.
      .filter((entry, i, arr) => arr.findIndex((v) => v.relicId === entry.relicId) === i)
      .slice(0, 3)
      .map(({ relicId }) => ({ relicId, price: this.priceForRelic(relicId) }))
  }

  /** Pack cost source of truth. UI 표기와 실제 차감이 갈라지지 않도록 구매 처리도 이 함수만 사용한다.
   *  카드팩은 유물과 달리 고정 시작가에 방문 내 구매 횟수만 누적한다. */
  altarBasePackCost(): number {
    // 30/60/90층 제단 팩 층별 시작가 공식은 ShopPricing(공유 모듈)이 단일 출처다.
    return altarPackBaseCost(this.deps.gameState.getCurrentTurn())
  }

  baseShopPackCost(kind: ShopPackKind): number {
    if (this.currentShopMode === 'altar') return this.altarBasePackCost()
    switch (kind) {
      case 'basic-pack':
      case 'recipe-pack':
      case 'unlock-pack':
        // 일반 상점 3팩 공통 시작가: 10층 120에서 10층마다 +40 (20F 160, 40F 240 …).
        return regularShopPackBaseCost(this.deps.gameState.getCurrentTurn())
      // 제단 전용 팩이 일반 상점에서 호출되면 안전한 기본값으로 막는다.
      default: return this.altarBasePackCost()
    }
  }

  currentShopPackCost(kind: ShopPackKind): number {
    const base = this.baseShopPackCost(kind)
    // 각 팩은 구매할 때마다 자기 초기 가격만큼 증가한다(예: 1500→3000→4500).
    const raw = packCostWithRepeats(base, this.shopPackBuys[kind] ?? 0)
    const discountFactor = 1 - Math.min(0.8, this.deps.gameState.enhancements.shopDiscountPct / 100)
    return Math.max(1, Math.round(raw * discountFactor))
  }

  /** Build the renderer-facing split-shop state with visit-local pack costs.
   *  Reroll cost is denominated in this.res.coins (화폐) — the renderer reads `this.res.coins`
   *  to decide whether the reroll button is affordable. */
  buildShopStateView(): ShopStateView {
    const base: ShopStateView = {
      mode: this.currentShopMode,
      relicOffers: this.currentShopOffers,
      freeCardClaimed: this.freeCardClaimed,
      freeCoinCardClaimed: this.freeCoinCardClaimed,
      freeCardDescription: SHOP_FREE_GIFT_REWARDS[this.freeGiftKind].description,
      rerollCost: 1 + this.shopRerollCount,
      coins: this.res.coins,
      basicPackCost: this.currentShopPackCost('basic-pack'),
      packCosts: Object.fromEntries(
        SHOP_PACK_KINDS.map((kind) => [kind, this.currentShopPackCost(kind)])
      ) as Partial<Record<ShopPackKind, number>>,
    }
    return base
  }

  /** 상점/제단 오버레이를 연다. 셔터를 내리고 방문 단위 상태를 초기화한 뒤 본문을 노출한다.
   *  10/20턴 상점, 30/60/90턴 제단, 100F 보스 직전 마지막 제단이 모두 이 경로를 공유한다. */
  async openShopOverlay(mode: 'shop' | 'altar'): Promise<void> {
    this.currentShopMode = mode
    this.shopOpen = true
    this.deps.setInputLocked(true)
    this.currentShopOffers = this.rollShopOffers()
    this.altarRelicPicked = false
    this.shopRerollCount = 0
    this.shopPackBuys = Object.fromEntries(
      SHOP_PACK_KINDS.map((kind) => [kind, 0])
    ) as Record<ShopPackKind, number>
    this.shopRerollInProgress = false
    this.freeCardClaimed = false
    // 제단 동전 한 닢도 방문 단위 무료 보상이므로 30/60/90턴마다 다시 활성화한다.
    this.freeCoinCardClaimed = false
    // 방문 시작 시 무료 카드의 효과를 현재 등록된 n종 중 하나로 확정한다.
    // 새싹 병아리(온보딩)에서는 화폐($) 획득 요소를 전부 잠그므로 동전 결과를 풀에서 뺀다.
    const giftPool = this.deps.isOnboardingActive()
      ? SHOP_FREE_GIFT_KINDS.filter((kind) => kind !== 'coin-1')
      : SHOP_FREE_GIFT_KINDS
    this.freeGiftKind = giftPool[Math.floor(Math.random() * giftPool.length)]
    this.activePackSession = null
    // The shutter is a hard turn break: cut the chain before the shop overlay
    // appears so the floating chain text never hangs above the shop tab.
    HandSystem.resetChain(this.deps.getChain())
    this.deps.clearChainTimeline()
    // 상점/제단 방문 시 해당 모드의 팩 종류를 발견 처리한다.
    const packsByMode: Record<'shop' | 'altar', string[]> = {
      shop:  ['basic-pack', 'recipe-pack', 'unlock-pack'],
      altar: ['resource-pack', 'delete-pack', 'chance-pack'],
    }
    for (const k of packsByMode[mode]) this.deps.gameState.encounteredPackKinds.add(k)
    this.deps.recordNotice(mode === 'altar' ? '레일이 멈추고 제단이 열렸다' : '레일이 멈추고 상점이 열렸다', 'info')
    this.deps.render()
    await this.deps.boardRenderer.playShopTransition()
    this.deps.boardRenderer.openShop(this.buildShopStateView(), this.res.score, this.deps.gameState.character)
    // 태어나서 첫 상점/제단이라면 무엇을 할 수 있는 곳인지 한 번 소개한다(팩 구매 대사처럼
    // 침묵 구간 게이트를 의도적으로 우회해 직접 발화).
    const shopIntro = this.deps.encounterIntroLineOnce(mode === 'altar' ? 'altar' : 'shop')
    if (shopIntro) this.deps.companionDirector.sayEnaBark(shopIntro, { importance: BARK_IMPORTANCE.situation })
  }
  /** 레시피 재료를 "양초 + 불씨" / "성냥 ×2" 형식의 한 줄 문자열로 변환한다. */
  buildRecipeNote(ingredients: Partial<Record<HandCardId, number>>): string {
    return Object.entries(ingredients)
      .filter(([, n]) => n && n > 0)
      .map(([id, n]) => n === 1
        ? getHandCardDef(id as HandCardId).name
        : `${getHandCardDef(id as HandCardId).name} ×${n}`)
      .join(' + ')
  }

  /** Build the random "3-card" contents for a pack the player just bought.
   *  Each entry carries an `apply` closure so the pick handler stays small. */
  rollPackItems(kind: ShopPackKind): ShopPackPickItem[] {
    const character = this.deps.gameState.character
    if (kind === 'basic-pack') {
      // 자원팩 — BasicPackPool.ts 에서 테이블 관리, 항목별 weight 사용.
      // 새싹 병아리(온보딩)에서는 화폐($) 획득 요소를 잠그므로 동전 한 닢(basic_011)을 제외한다.
      const basicPool = this.deps.isOnboardingActive()
        ? BASIC_PACK_POOL.filter((entry) => entry.id !== 'basic_011')
        : BASIC_PACK_POOL
      return sampleWeightedWithoutReplacement(
        basicPool.map((entry) => ({
          ...entry,
          theme: 'resource' as const,
          spriteUrl: spriteForBasicPackItem(entry.illu),
          apply: () => {
            switch (entry.id) {
              case 'basic_001': character.heal(3);        return
              case 'basic_002': character.gainEmber(1);   return
              case 'basic_003': character.gainCandle(1);  return
              case 'basic_004': character.heal(5);        return
              case 'basic_005': character.gainEmber(2);   return
              case 'basic_006': character.gainCandle(2);  return
              case 'basic_007': character.heal(10);       return
              case 'basic_008': character.gainEmber(3);   return
              case 'basic_009': character.gainCandle(3);  return
              case 'basic_010': character.addShield(5);   return
              case 'basic_011': this.res.coins += 1; this.deps.relicEffects.applyBlindFaithCoins(1); return
            }
          },
        })),
        3
      )
    }
    if (kind === 'recipe-pack') {
      // 조합팩 — runLocked 레시피 중 재료가 이미 해금된 항목만 제시한다.
      const { unlocked } = this.deps.runCardPool.snapshot()
      const lockedRecipes = RECIPES.filter((r) =>
        r.runLocked &&
        !r.eventOnly &&
        !this.deps.gameState.unlockedRecipeIds.has(r.id) &&
        Object.keys(r.ingredients).every((id) => unlocked.includes(id as HandCardId))
      )
      if (lockedRecipes.length === 0) return []
      return sampleWithoutReplacement(lockedRecipes, Math.min(3, lockedRecipes.length)).map((r) => ({
        id: `recipe-${r.id}`,
        theme: 'unlock' as const,
        title: r.name,
        effect: this.deps.boardRenderer.recipeEffectHtml(r),
        rarity: 'rare' as const,
        spriteUrl: recipeSprite001 ?? SpriteUrls.packs['recipe-pack'],
        typeLabel: '레시피',
        recipeNote: this.buildRecipeNote(r.ingredients),
        apply: () => { this.deps.gameState.unlockedRecipeIds.add(r.id) },
      }))
    }
    if (kind === 'chance-pack') {
      // 확률팩 — 해금된 일반 드롭 풀 카드 중 3장 제시, 선택 시 T1 개별 카드 가중치 영구 추가.
      const { unlocked } = this.deps.runCardPool.snapshot()
      // boss 전용·dropWeight 0 카드(검은 양초 등 이벤트 아이템) 제외
      const chancePool = unlocked.filter(id => {
        const d = HAND_CARD_DEFINITIONS[id]
        return d && d.dropSource !== 'boss' && (d.dropWeight ?? 0) > 0
      })
      if (chancePool.length === 0) return []
      // 확률을 2자리까지 표기하되 불필요한 끝자리 0 제거
      const fmt = (p: number) => String(parseFloat((p * 100).toFixed(2)))
      const drawIds = sampleWithoutReplacement(chancePool, Math.min(3, chancePool.length))
      return drawIds.map((id) => {
        const def = getHandCardDef(id)
        // 등급별 부스트 폭은 학습 시뮬과 공유하는 ShopPools 단일 출처를 읽는다.
        const boostToAdd = CHANCE_PACK_RARITY_BOOST[HAND_CARD_RARITY[id] ?? 'common'] ?? 1
        const { before, after } = DropSystem.computeDropProbability(
          id, chancePool, this.deps.gameState.enhancements.tier1CardBoosts, boostToAdd,
        )
        return {
          id: `chance-${id}`,
          theme: 'unlock' as const,
          title: def.name,
          effect: `등장 확률 ${fmt(before)}% → ${fmt(after)}%`,
          rarity: HAND_CARD_RARITY[id],
          spriteUrl: spriteForHandCard(id),
          typeLabel: '확률',
          handCardId: id,
          apply: () => {
            this.deps.gameState.enhancements.tier1CardBoosts[id] = (this.deps.gameState.enhancements.tier1CardBoosts[id] ?? 0) + boostToAdd
            DropSystem.setTier1CardBoosts(this.deps.gameState.enhancements.tier1CardBoosts)
          },
        }
      })
    }
    if (kind === 'resource-pack') {
      // 제단 자원팩 — 30층마다 고정 가격으로 열리는 영구 보정 풀이며 항목별 weight를 따른다.
      const rawPool = SHOP_PACK_POOLS['resource-pack'].map((entry) => ({
        ...entry,
        spriteUrl: entry.illu ? spriteForBasicPackItem(entry.illu) : undefined,
        apply: () => {
          switch (entry.id) {
            case 'altar-clothes-thick':  character.increaseMaxHealth(5);                 return
            case 'altar-heating':        character.applyDamageBoost(1);                  return
            case 'altar-backpack-large': character.increaseHandMax(2);                   return
            case 'altar-matchbox':       character.increaseEmberMax(2);                  return
            case 'altar-wick-thick':     character.increaseEmberDecayTurns(1);           return
            case 'altar-joker-card':     character.decreaseCandleMax(1);                 return
            case 'altar-lantern':        this.deps.gameState.enhancements.scoreMultiplier *= 1.10; return
            case 'altar-one-coin':       this.res.coins += 1; this.deps.relicEffects.applyBlindFaithCoins(1);            return
          }
        },
      }))
      return sampleWeightedWithoutReplacement(rawPool, Math.min(3, rawPool.length))
    }
    if (kind === 'unlock-pack') {
      // 해금팩 — 런에서 잠긴 카드(runLocked) + 삭제팩으로 밴된 카드를 해금한다.
      // 보스 전용 찌꺼기 카드(탐욕의 동전 등)는 제외한다.
      const { locked, banned } = this.deps.runCardPool.snapshot()
      const cardPool = [...locked, ...banned].filter((id) => getHandCardDef(id).dropSource !== 'boss')
      if (cardPool.length === 0) return []
      return sampleWithoutReplacement(cardPool, Math.min(3, cardPool.length)).map((id) => {
        const def = getHandCardDef(id)
        const isBanned = banned.includes(id)
        return {
          id: `unlock-${id}`,
          theme: 'unlock' as const,
          title: def.name,
          effect: isBanned ? `[재해금] ${this.deps.boardRenderer.cardEffectHtml(id)}` : this.deps.boardRenderer.cardEffectHtml(id),
          rarity: HAND_CARD_RARITY[id],
          spriteUrl: spriteForHandCard(id),
          typeLabel: '손패',
          handCardId: id,
          apply: () => {
            if (isBanned) this.deps.runCardPool.unban(id)
            else this.deps.runCardPool.unlockForRun(id)
          },
        }
      })
    }
    if (kind === 'delete-pack') {
      // 풀 = 현재 해금된 카드 중 이벤트 보스 전용(검은 양초 등) 제외
      const { unlocked } = this.deps.runCardPool.snapshot()
      const deletePool = unlocked.filter(id => getHandCardDef(id).dropSource !== 'boss')
      if (deletePool.length === 0) return []
      const drawIds = sampleWithoutReplacement(deletePool, Math.min(3, deletePool.length))
      return drawIds.map((id) => {
        const def = getHandCardDef(id)
        return {
          id: `delete-${id}`,
          theme: 'unlock' as const,
          title: def.name,
          effect: `앞으로 ${def.name} 등장 금지`,
          rarity: HAND_CARD_RARITY[id],
          spriteUrl: spriteForHandCard(id),
          typeLabel: '삭제',
          handCardId: id,
          apply: () => { this.deps.runCardPool.ban(id) },
        }
      })
    }
    return []
  }
  /** Open the pack picker for the just-clicked pack tile. Deducts the price
   *  if the player can afford it, otherwise no-op. */
  async openPackPurchase(kind: ShopPackKind): Promise<void> {
    const cost = this.currentShopPackCost(kind)
    if (this.res.score < cost) return
    this.res.score = Math.max(0, this.res.score - cost)
    this.res.scorePulseKey++
    // 사치품: 불빛 소비 추적 (2000마다 공격력 +1).
    this.deps.relicEffects.applyLuxuryScoreSpend(cost)
    // 구매 직후 같은 팩 가격을 초기 가격만큼 올려 다음 표기/차감에 반영한다.
    this.shopPackBuys[kind] = (this.shopPackBuys[kind] ?? 0) + 1
    enaRuntimeObserver.recordShopPurchase(this.deps.gameState, shopKindToPurchaseId(kind))
    // 팩 구매 감상 — 상점은 월드 바크 게이트 밖이므로 유물 구매평과 같은 가벼운 게이트 + 확률로만 말한다.
    if (this.deps.isGameActive() && !this.deps.gameState.isGameOver && Math.random() < 0.5) {
      this.deps.companionDirector.sayEnaBark(this.deps.companion.packLine(kind), { importance: BARK_IMPORTANCE.situation })
    }
    // Keep picker title synchronized with the shared pack label table.
    const title = SHOP_PACK_LABELS[kind].title
    const items = this.rollPackItems(kind)
    this.activePackSession = { kind, items, rerollCount: 0 }
    // Spend feedback before the picker so the this.res.score panel ticks down on click.
    const packTile = document.querySelector<HTMLElement>(`#shop-overlay .shop-pack-card[data-shop-buy-kind="${kind}"]`)
    if (packTile) await this.deps.boardRenderer.playShopPurchaseImpact(packTile, "score")
    this.deps.boardRenderer.playScoreSpendFeedback(this.res.score, this.res.scorePulseKey)
    // 불빛 → 팩 타일 트레일 (피커 열림과 동시에 배경 재생)
    this.deps.boardRenderer.fireScoreSpendTrailToTarget(packTile, cost)
    this.deps.boardRenderer.openShop(this.buildShopStateView(), this.res.score, this.deps.gameState.character)
    const view: ShopPackPickerView = {
      packKind: kind,
      title,
      // 삭제팩·해금팩·조합팩·확률팩은 선택을 강제하지 않고 넘기기 버튼으로 패스 가능하다.
      passable: kind === 'delete-pack' || kind === 'unlock-pack' || kind === 'recipe-pack' || kind === 'chance-pack',
      // spriteUrl 포함: enhance/unlock/delete 팩은 카드별 일러스트가 있어야 식별 가능하다.
      items: items.map(({ id, title, effect, theme, rarity, spriteUrl, typeLabel, recipeNote, handCardId }) => ({ id, title, effect, theme, rarity, spriteUrl, typeLabel, recipeNote, handCardId })),
      rerollCost: 1 + (this.activePackSession?.rerollCount ?? 0),
      coins: this.res.coins,
    }
    this.deps.boardRenderer.openPackPicker(view)
  }

  /** Apply the player's pick from an active pack session, then close the picker. */
  async handleShopPackPick(detail: ShopPackPickDetail): Promise<void> {
    if (!this.activePackSession || this.activePackSession.kind !== detail.packKind) return
    const picked = this.activePackSession.items.find((it) => it.id === detail.itemId)
    if (!picked) return
    const beforeResources = this.deps.snapshotPlayerResources()
    const beforeCoins = this.res.coins
    // 확률팩 부스트 상세 기록용: apply 전후 T1 부스트 차이로 실제 추가량을 얻는다.
    const boostBefore = picked.handCardId ? (this.deps.gameState.enhancements.tier1CardBoosts[picked.handCardId] ?? 0) : 0
    await picked.apply()
    // 에나 관측: 팩에서 실제로 고른 카드/부스트를 상세 기록해 런 후 학습 신호로 쓴다.
    if (
      detail.packKind === 'chance-pack' || detail.packKind === 'unlock-pack' || detail.packKind === 'delete-pack'
    ) {
      const boostAfter = picked.handCardId ? (this.deps.gameState.enhancements.tier1CardBoosts[picked.handCardId] ?? 0) : 0
      enaRuntimeObserver.recordShopPurchase(this.deps.gameState, `pick:${detail.packKind}`, {
        itemId: detail.itemId,
        handCardId: picked.handCardId,
        boostAdded: boostAfter > boostBefore ? boostAfter - boostBefore : undefined,
      })
    }
    // unlock-pack/delete-pack 선택 후 runCardPool이 바뀌므로 드롭 풀 및 도감 잠금 표시를 재동기화한다.
    const poolSnap = this.deps.runCardPool.snapshot()
    DropSystem.setAllowedPool(poolSnap.unlocked)
    this.deps.boardRenderer.setLockedCardIds([...poolSnap.locked, ...poolSnap.banned])
    // runLocked 레시피 잠금도 재동기화한다.
    this.deps.boardRenderer.setLockedRecipeIds(
      RECIPES.filter((r) => r.runLocked && !this.deps.gameState.unlockedRecipeIds.has(r.id)).map((r) => r.id)
    )
    this.activePackSession = null
    this.deps.boardRenderer.closePackPicker()
    // 맛보기: 해금팩 첫 구매 시 선택한 카드 1장을 손패에 직접 지급한다.
    // enqueueDrop = 일반 획득과 같은 정리 경로 — 이미 2장 든 카드의 맛보기도 즉시 트리플로 합성된다.
    if (detail.packKind === 'unlock-pack' && (this.shopPackBuys['unlock-pack'] ?? 0) <= 1) {
      const tasteId = detail.itemId.startsWith('unlock-') ? (detail.itemId.slice(7) as HandCardId) : null
      if (tasteId && HandSystem.enqueueDrop(this.deps.gameState.character, DropSystem.makeCard(tasteId))) {
        this.deps.render()
        await this.deps.boardRenderer.animateResourceTrailFromCenter('hand', 1, 'hand-recovery')
      }
    }
    // Most pack effects mutate character stats; play the standard player-gain
    // trail so HP/방패/공격력 등 변화에 카드/숫자 피드백이 같이 따라온다.
    await this.deps.playPlayerGainTrails({ kind: 'chain' }, beforeResources)
    // '동전 한 닢' 등 화폐 아이템은 playPlayerGainTrails가 다루지 않으므로(coin 미포함)
    // 단독 코인 카드/동전 한 닢과 같은 펄스키+트레일+지갑 버스트 문법으로 별도 라우팅한다.
    // applyBlindFaithCoins는 apply() 내부에서 이미 처리됐으므로 여기서 재호출하지 않는다.
    const pickedCoinGain = this.res.coins - beforeCoins
    if (pickedCoinGain > 0) {
      this.res.coinPulseKey++
      this.deps.recordCoinGain(picked.title, pickedCoinGain)
      await this.deps.playResourceTrail({ kind: 'chain' }, 'coin', pickedCoinGain)
    }
    // 자원팩 등 게이지 아이템 선택 시 게이지가 가득 찼으면 보상 효과를 즉시 발동한다.
    await this.deps.resolveFullCandleGaugeEffects({ kind: 'chain' })
    this.deps.render()
    this.deps.boardRenderer.openShop(this.buildShopStateView(), this.res.score, this.deps.gameState.character)
  }

  /** 팩 피커 재뽑기: 1+횟수$ 차감 후 같은 팩 종류로 새 3장을 뽑아 피커를 갱신한다. */
  async handleShopPackReroll(packKind: ShopPackKind): Promise<void> {
    if (!this.activePackSession || this.activePackSession.kind !== packKind) return
    const cost = 1 + this.activePackSession.rerollCount
    if (this.res.coins < cost) return
    this.res.coins -= cost
    this.res.coinPulseKey++
    this.deps.relicEffects.applyBlindFaithCoins(-cost)
    this.deps.boardRenderer.playCoinSpendFeedback(this.res.coins, this.res.coinPulseKey)
    await this.deps.boardRenderer.playPackRerollFeedback(cost)
    this.activePackSession.rerollCount++
    this.activePackSession.items = this.rollPackItems(packKind)
    const newView: ShopPackPickerView = {
      packKind,
      title: SHOP_PACK_LABELS[packKind].title,
      passable: packKind === 'delete-pack' || packKind === 'unlock-pack' || packKind === 'recipe-pack' || packKind === 'chance-pack',
      items: this.activePackSession.items.map(({ id, title, effect, theme, rarity, spriteUrl, typeLabel, recipeNote, handCardId }) => ({ id, title, effect, theme, rarity, spriteUrl, typeLabel, recipeNote, handCardId })),
      rerollCost: 1 + this.activePackSession.rerollCount,
      coins: this.res.coins,
    }
    this.deps.boardRenderer.refreshPackPickerCards(newView)
  }

  async handleShopBuy(detail: ShopBuyDetail): Promise<void> {
    if (!this.shopOpen) return
    if (
      detail.kind !== 'relic' &&
      detail.kind !== 'free-card' &&
      detail.kind !== 'free-coin-card' &&
      detail.kind !== 'reroll' &&
      detail.kind !== 'basic-pack' &&
      detail.kind !== 'recipe-pack' &&
      detail.kind !== 'unlock-pack' &&
      detail.kind !== 'chance-pack' && detail.kind !== 'resource-pack' && detail.kind !== 'delete-pack'
    )
      return
    if (detail.kind === 'free-card' || detail.kind === 'free-coin-card') {
      if (detail.kind === 'free-card') {
        if (this.freeCardClaimed) return
        this.freeCardClaimed = true
        // 무료 카드는 사용 즉시 소모되며, 실제 보상량과 트레일 입력을 같은 데이터에서 읽는다.
        const freeGift = SHOP_FREE_GIFT_REWARDS[this.freeGiftKind]
        if (this.freeGiftKind === 'score-300') {
          // 불빛 보상도 글로벌 불빛 획득량 보너스(scoreMultiplier)를 공통 적용한다.
          this.deps.relicEffects.gainFixedLight('무료 카드', freeGift.amount)
          // 불빛 보상은 무료카드에서 불빛 패널로 직접 날려 기존 획득 문법을 유지한다.
          await this.deps.boardRenderer.consumeFreeCardAndRouteReward('free-card', 'score', freeGift.amount, 'score')
        } else if (this.freeGiftKind === 'coin-1') {
          this.res.coins += freeGift.amount
          this.res.coinPulseKey++
          this.deps.relicEffects.applyBlindFaithCoins(freeGift.amount)
          // 화폐 보상은 코인 톤 burst(treasure-gain)로 발사 — 불빛(this.res.score) burst가
          // 같이 뜨던 버그 수정. 보상 종류에 맞는 입자 색감만 보이도록 한다.
          await this.deps.boardRenderer.consumeFreeCardAndRouteReward('free-card', 'coin', freeGift.amount, 'treasure-gain')
        } else if (this.freeGiftKind === 'health-5') {
          this.deps.gameState.character.heal(freeGift.amount)
          // 체력 보상은 HP 바로 꽂혀야 피드백이 정확히 읽힌다.
          await this.deps.boardRenderer.consumeFreeCardAndRouteReward('free-card', 'health', freeGift.amount, 'health-gain')
        } else if (this.freeGiftKind === 'gauge-3') {
          this.deps.gameState.character.gainCandle(freeGift.amount)
          // 게이지 보상은 캔들 게이지 목적지로 분기한다.
          await this.deps.boardRenderer.consumeFreeCardAndRouteReward('free-card', 'gauge', freeGift.amount, 'gauge-gain')
          // 트레일 직후 게이지 카운터를 즉시 반영하고, 가득 찼을 경우 보상 효과까지 처리한다.
          this.deps.boardRenderer.playHudCounterFeedback('candle', this.deps.gameState.character.candle)
          await this.deps.resolveFullCandleGaugeEffects({ kind: 'center' })
        } else if (this.freeGiftKind === 'ember-3') {
          this.deps.gameState.character.gainEmber(freeGift.amount)
          // 불씨 보상은 상단 ember HUD로 직접 날린다.
          await this.deps.boardRenderer.consumeFreeCardAndRouteReward('free-card', 'ember', freeGift.amount, 'score')
        } else {
          for (let i = 0; i < freeGift.amount; i += 1) {
            // 해금되지 않았거나 삭제팩으로 밴된 카드가 섞이지 않도록 드롭 풀(unlocked) 기준으로 뽑는다.
            // enqueueDrop = 획득 공통 정리 — 상점 경로엔 지연 합성 스캔이 없어 3장째를 여기서 합성한다.
            HandSystem.enqueueDrop(this.deps.gameState.character, DropSystem.generateDrop())
          }
          // 손패 보상은 손패 스택 목적지로 날려 카드 획득 흐름과 같은 언어를 사용한다.
          await this.deps.boardRenderer.consumeFreeCardAndRouteReward('free-card', 'hand', freeGift.amount, 'hand-control')
        }
      } else {
        if (this.freeCoinCardClaimed) return
        this.freeCoinCardClaimed = true
        this.res.coins += 1
        this.res.coinPulseKey++
        this.deps.relicEffects.applyBlindFaithCoins(1)
        // 제단 동전 한 닢은 경제 밸런스 조정 후 1$만 지급한다. source burst도 코인 톤
        // (treasure-gain)으로 발사해 불빛 입자가 같이 뜨는 시각 혼선을 제거.
        await this.deps.boardRenderer.consumeFreeCardAndRouteReward('free-coin-card', 'coin', 1, 'treasure-gain')
      }
      this.deps.boardRenderer.playScoreGainFeedback(this.res.score, this.res.scorePulseKey)
      this.deps.boardRenderer.playCoinGainFeedback(this.res.coins, this.res.coinPulseKey)
      this.deps.render()
      this.deps.boardRenderer.openShop(this.buildShopStateView(), this.res.score, this.deps.gameState.character)
      return
    }
    if (
      detail.kind === 'basic-pack' || detail.kind === 'recipe-pack' || detail.kind === 'unlock-pack' ||
      detail.kind === 'chance-pack' || detail.kind === 'resource-pack' || detail.kind === 'delete-pack'
    ) {
      await this.openPackPurchase(detail.kind)
      return
    }
    if (detail.kind === 'reroll') {
      if (this.shopRerollInProgress) return
      this.shopRerollInProgress = true
      try {
        const rerollCost = 1 + this.shopRerollCount
        // Reroll is paid in 화폐(this.res.coins) now, not 불빛(this.res.score).
        if (this.res.coins < rerollCost) return
        this.res.coins = Math.max(0, this.res.coins - rerollCost)
        this.res.coinPulseKey++
        this.shopRerollCount += 1
        // Resolve the new offer slate BEFORE the flip so we can swap the
        // relic content mid-flip (180° back-face moment). Purchased slots
        // stay frozen so EXIT does not resurrect cards into bought gaps.
        // 현재 배치된 비구매 유물은 리롤 결과에서 제외한다(풀이 부족하면 자동 폴백).
        const currentRelicIds = this.currentShopOffers
          .filter((e) => !e.purchased)
          .map((e) => e.relicId)
        const freshOffers = this.rollShopOffers(currentRelicIds)
        let freshIndex = 0
        const nextOffers = this.currentShopOffers.map((entry) => {
          if (entry.purchased) return entry
          const next = freshOffers[freshIndex]
          freshIndex += 1
          return next ?? entry
        })
        const rerollBtn = document.querySelector<HTMLElement>('#shop-overlay .shop-reroll-btn')
        // 애니메이션이 시작되기 전부터 버튼을 비활성처럼 보여 연타 피드백을 차단한다.
        rerollBtn?.classList.add('is-reroll-locked')
        if (rerollBtn) await this.deps.boardRenderer.playShopPurchaseImpact(rerollBtn, "score")
        this.deps.boardRenderer.playCoinSpendFeedback(this.res.coins, this.res.coinPulseKey)
        // Commit the new offers BEFORE running the flip so any incidental
        // re-render (e.g. openShop's refresh path) sees the fresh data,
        // matching what the mid-flip swap puts on screen.
        this.currentShopOffers = nextOffers
        await this.deps.boardRenderer.playShopRerollFeedback(rerollCost, nextOffers, this.res.score, this.deps.gameState.character)
        this.deps.boardRenderer.openShop(this.buildShopStateView(), this.res.score, this.deps.gameState.character)
      } finally {
        // 어떤 애니메이션 경로로 끝나도 다음 리롤은 완료 후에만 다시 열린다.
        document.querySelector<HTMLElement>('#shop-overlay .shop-reroll-btn')?.classList.remove('is-reroll-locked')
        this.shopRerollInProgress = false
      }
      return
    }
    if (!detail.relicId) return
    const offer = this.currentShopOffers.find((entry) => entry.relicId === detail.relicId)
    if (!offer || offer.purchased) return
    // 불빛 가격 외 추가 구매 조건(패도 최대 체력 등) 미충족 시 자원 부족처럼 막는다(상점·제단 공통).
    if (this.deps.relicEffects.relicPurchaseBlocked(detail.relicId)) { this.deps.boardRenderer.openShop(this.buildShopStateView(), this.res.score, this.deps.gameState.character); return }
    // 제단: 유물은 무료 단일 픽 — 가격 없이 1장만 획득하고 나머지는 사그라들며 사라진다.
    if (this.currentShopMode === 'altar') {
      await this.pickAltarRelicFree(detail.relicId)
      return
    }
    if (this.res.score < offer.price) { this.deps.boardRenderer.openShop(this.buildShopStateView(), this.res.score, this.deps.gameState.character); return }
    if (!this.deps.gameState.character.addRelic(detail.relicId)) {
      this.deps.render()
      return
    }
    enaRuntimeObserver.recordShopPurchase(this.deps.gameState, `relic:${detail.relicId}`)
    // Pay the light price. We DO log the deduction — pure number-pulse on the
    // light panel is too easy to miss, so the activity log row makes the spend concrete.
    const def = getRelicDef(detail.relicId)
    this.res.score = Math.max(0, this.res.score - offer.price)
    this.res.scorePulseKey++
    // 사치품: 불빛 소비 추적 (2000마다 공격력 +1).
    this.deps.relicEffects.applyLuxuryScoreSpend(offer.price)
    this.deps.pushActivityLogsInDisplayOrder([
      {
        label: `유물 구매: ${def.name}`,
        scoreDelta: -offer.price,
        kind: 'score' as const,
      },
    ])
    // Spend feedback reverses the usual gain trail: 불빛 leaves the left panel
    // and lands on the clicked relic card before that card turns purchased.
    const relicCard = document.querySelector<HTMLElement>(`#shop-overlay .shop-relic-card[data-shop-buy="${detail.relicId}"]`)
    if (relicCard) await this.deps.boardRenderer.playShopPurchaseImpact(relicCard, "score")
    this.deps.boardRenderer.playScoreSpendFeedback(this.res.score, this.res.scorePulseKey)
    await this.deps.boardRenderer.animateShopPurchaseTrailToRelic(
      detail.relicId,
      Math.min(9, Math.max(1, Math.ceil(offer.price / 200)))
    )
    offer.purchased = true
    await this.deps.relicEffects.applyRelicPurchaseEffect(detail.relicId)
    this.deps.boardRenderer.prepareRelicArrivalFromShop(detail.relicId)
    this.deps.render()
    await this.deps.boardRenderer.animatePreparedRelicArrival()
    this.deps.boardRenderer.openShop(this.buildShopStateView(), this.res.score, this.deps.gameState.character)
  }

  /** 제단 무료 유물 단일 픽: 선택 1장만 무료로 획득하고, 비선택 2장은 불씨가 사그라들듯
   *  사라진다. 픽 후에는 제단 유물 레이어를 비워 재선택을 막는다. */
  async pickAltarRelicFree(relicId: RelicId): Promise<void> {
    if (this.altarRelicPicked) return
    if (!this.deps.gameState.character.addRelic(relicId)) { this.deps.render(); return }
    this.altarRelicPicked = true
    const def = getRelicDef(relicId)
    this.deps.pushActivityLogsInDisplayOrder([{ label: `제단 유물: ${def.name}`, kind: 'item-gain' as const }])
    // 선택 1장은 살짝 떠오르고, 나머지 2장은 ember 버스트와 함께 사그라든다.
    await this.deps.boardRenderer.resolveAltarRelicPick(relicId)
    // 즉발 효과(조각칼/첫 양초 등) 적용 후 보유 유물 부채꼴로 이동.
    await this.deps.relicEffects.applyRelicPurchaseEffect(relicId)
    this.deps.boardRenderer.prepareRelicArrivalFromShop(relicId)
    // 픽이 끝나면 유물 오퍼를 비워 재렌더 시 제단 유물 카드가 사라지게 한다.
    this.currentShopOffers = []
    this.deps.render()
    await this.deps.boardRenderer.animatePreparedRelicArrival()
    this.deps.boardRenderer.openShop(this.buildShopStateView(), this.res.score, this.deps.gameState.character)
  }

  async closeShopAndResume(): Promise<void> {
    if (!this.shopOpen) return
    this.shopOpen = false
    this.currentShopOffers = []
    // EXIT while a pack picker is mid-open just drops the picker; the cost has
    // already been spent so the unused roll simply burns. Clearing the session
    // prevents stale picks from firing after the next shop opens.
    if (this.activePackSession) {
      this.activePackSession = null
      this.deps.boardRenderer.closePackPicker()
    }
    // Exit beat: cards bounce down then swoosh upward in random staggered
    // order WITHOUT covering the candle gauge (clipped by the shell). Only
    // after the cards have fully left do we tear down the overlay and
    // raise the shutter so the player can resume the turn.
    await this.deps.boardRenderer.playShopExitAnimation()
    this.deps.boardRenderer.closeShop()
    // 제단 EXIT는 셔터를 올리지 않고 곧장 보스 게이트로 이어간다.
    // 30/60/90턴 제단은 각 층 보스 전투로 분기하고, 보상/시련 구조는 공통 컨트롤러가 재사용한다.
    if (this.currentShopMode === 'altar') {
      await this.deps.boardRenderer.playAltarBossGateTransition()
      this.deps.turnManager.setTurnMode('boss_phase')
      this.deps.recordNotice('셔터 레일이 흔들리며 보스가 강림한다', 'hurt')
      if (this.deps.gameState.getCurrentTurn() >= this.deps.runTargetTurns) {
        // 100F 최종 보스: 격파 후 runBossEvent가 보상/시련까지 잇고, 돌아오면 런 클리어로 닫는다.
        this.deps.recordNotice('100층 최종 보스가 잿빛 굴레를 드리운다', 'hurt')
        await this.deps.bossController.run100F()
        this.deps.gameState.endGame('run_clear_100_turns')
        this.deps.recordNotice('100층 보스 격파 — 잿빛 굴레가 풀렸다', 'win')
        // 클리어 타이틀(Unmelting 정산 창)은 사망과 같은 finishTurn 경로로 연다 — endGame만으로는
        // 아무도 showGameOver를 부르지 않아 격파 후 화면이 그대로 멈춰 있었다.
        this.deps.finishTurn()
      } else if (this.deps.gameState.getCurrentTurn() === 90) {
        await this.deps.bossController.run90F()
        // 90F 시련 종료 → 구역 4 (더욱 깊은 숲) 전환
        await this.deps.showZoneCurtain(3)
      } else if (this.deps.gameState.getCurrentTurn() === 60) {
        await this.deps.bossController.run60F()
        // 60F 시련 종료 → 구역 3 (어두운 숲) 전환
        await this.deps.showZoneCurtain(2)
      } else {
        await this.deps.bossController.run30F()
        // 30F 시련 종료 → 구역 2 (정원 풀밭) 전환
        await this.deps.showZoneCurtain(1)
      }
      this.deps.setInputLocked(false)
      this.deps.render()
      return
    }
    await this.deps.boardRenderer.playShopResumeTransition()

    this.deps.setInputLocked(false)
    this.deps.render()
  }
  /** Forced trial after boss: 베일이 레일 크기로 내려옴 → 카드들이 한 박자 늦게
   *  떨어진다. 선택 시 자동 EXIT 흐름(카드 회수 → 레이어 회수 → 셔터 상승).
   *  진동 없이 바로 열도록 변경 — quake가 셔터를 들썩여 보여 제거. */
  async openTrialOverlayForced(): Promise<void> {
    this.deps.boardRenderer.openForcedTrialShopFlow(
      this.deps.forcedTrialCards.map(({ id, title, effect, spriteUrl }) => {
        // 시련 {{trial-spawn}} 토큰을 현 시점 실효 확률 변화량으로 치환한다.
        const resolvedEffect = effect.replace('{{trial-spawn}}', () => {
          const def = TRIAL_DEFINITIONS.find((d) => d.id === id)
          if (def?.effectKind.type === 'treasure-spawn-scale') {
            const pct = this.deps.cardSpawner.trialScaleToPct(def.effectKind.factor)
            return `${pct >= 0 ? '+' : ''}${pct}%`
          }
          return ''
        })
        return { id, title, effect: resolvedEffect, spriteUrl }
      })
    )
    await new Promise<void>((resolve) => {
      let picked = false
      const finalize = async (): Promise<void> => {
        document.removeEventListener('forcedTrialPick', onPick)
        // playShopExitAnimation: 카드들이 위로 빠진다 → closeShop: 레이어 회수
        // → playShopResumeTransition: 셔터 상승. 상점 EXIT와 완전히 같은 비트.
        await this.deps.boardRenderer.playShopExitAnimation()
        this.deps.boardRenderer.closeShop()
        await this.deps.boardRenderer.playShopResumeTransition()
        if (this.deps.gameState.getCurrentTurn() === 90) {
          // 셔터가 완전히 열린 뒤 짧은 정적을 두고, 화면 연출과 함께 최종 등반 규칙을 켠다.
          await this.deps.wait(320)
          this.deps.activateFinalAscentStarlightRule()
          await this.deps.boardRenderer.playFinalAscentRuleAwakening()
        }
        // 시련 종료 직전 손패 차단 해제 → 일반 turn 입력 가능.
        this.deps.bossController.postPhaseHandLocked = false
        resolve()
      }
      const onPick = (event: Event): void => {
        const custom = event as CustomEvent<{ id?: string }>
        const id = custom.detail?.id
        const pickedCard = this.deps.forcedTrialCards.find((card) => card.id === id)
        if (!pickedCard || picked) return
        picked = true
        pickedCard.apply()
        // 시련 각오 한마디 — 보스 격파 직후의 드문 이벤트라 확률 게이트 없이 1회 말한다.
        // 태어나서 첫 시련이라면 각오 대신 '런 내내 지속되는 조건'이라는 교육형 소개를 우선한다.
        this.deps.companionDirector.sayEnaBark(this.deps.encounterIntroLineOnce('trial') ?? this.deps.companion.trialLine(), { importance: BARK_IMPORTANCE.situation })
        // 선택된 카드 자체에 burst 이펙트. 동일한 카드 위에서 효과가 "터지며 적용"되는
        // 시각 비트를 만든 뒤 자동으로 EXIT 시퀀스가 이어진다.
        const pickedEl = document.querySelector<HTMLElement>(`[data-trial-pick="${id}"]`)
        if (pickedEl) SquareBurst.playOn(pickedEl, 'score', { count: 18, spread: 140, duration: 620 })
        this.deps.recordNotice(this.deps.formatTrialSummary(`시련 적용: ${pickedCard.title}`), 'info')
        window.setTimeout(() => void finalize(), 620)
      }
      document.addEventListener('forcedTrialPick', onPick)
    })
  }
}
