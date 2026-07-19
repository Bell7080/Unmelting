/**
 * RelicEffectsManager — 유물 발동/처리 매니저.
 * 처치 연쇄(붉은 포션/잉크/야망/파편), 피격·생존(권위/희망/에나 각성), 구매 즉발 효과,
 * 턴 시작 유물, 소소한 클러치(급소)까지 유물 효과 실행을 한곳에서 담당한다.
 * 수치 상태(score)·게임 플래그·로그 소유는 index.ts(컴포지션 루트)에 남긴다.
 */

import type { GameState } from '@core/GameState'
import type { EnemyHit } from '@core/TurnManager'
import type { GameBoardRenderer, ActivityLogEntry } from '@ui/GameBoardRenderer'
import type { CardSpawner } from '@systems/CardSpawner'
import type { CompanionSystem, SystemEncounterKind } from '@systems/CompanionSystem'
import { CompanionDirector, BARK_IMPORTANCE } from '@/app/CompanionDirector'
import { CardType, type Card } from '@entities/Card'
import { HandSystem } from '@systems/HandSystem'
import { DropSystem } from '@systems/DropSystem'
import { runTagReactions, SHARD_GENERATORS, handCardIdsWithTag } from '@systems/TagReactions'
import { getHandCardDef, HAND_CARD_IDS, HAND_CARD_DEFINITIONS } from '@data/HandCards'
import { getRelicDef, type RelicId } from '@data/Relics'
import type { HandCardDefinition } from '@entities/HandCard'
import type { BurstTheme } from '@ui/SquareBurst'
import type { PlayerResourceSnapshot, ResourceTrailSource, TrailResourceKind } from '@/app/FeedbackTypes'

/** 활동 로그 초안 — index.ts의 로그 스탬프(id 부여) 전 단계와 동일한 형태. */
type ActivityLogDraft = Omit<ActivityLogEntry, 'id'>

/** 유물 효과가 런 상태·연출을 조작할 때 쓰는 주입 계약. 상태 소유는 index.ts에 남긴다. */
export interface RelicEffectsDeps {
  gameState: GameState
  boardRenderer: GameBoardRenderer
  cardSpawner: CardSpawner
  companion: CompanionSystem
  companionDirector: CompanionDirector
  /** 런 진행 중 여부(index의 gameActive) — 구매 감상평 게이트. */
  isGameActive(): boolean
  /** 불빛(score) 증가 + 펄스 키 갱신 — 수치 상태는 index가 소유한다. */
  addScore(amount: number): void
  recordNotice(message: string, kind: 'info'): void
  recordRelicActivation(relicId: RelicId, message: string): void
  render(): void
  pushActivityLogsInDisplayOrder(logs: ActivityLogDraft[]): void
  /** 턴 배율·지터 포함 불빛 로그 생성(+score 반영)은 index의 단일 출처를 쓴다. */
  createScoreLog(label: string, baseValue: number, kind: ActivityLogEntry['kind']): ActivityLogDraft
  createItemGainLogs(itemNames: string[]): ActivityLogDraft[]
  scoreForCardRemoval(card: Card): number
  scoreLabelForCard(card: Card): string
  snapshotPlayerResources(): PlayerResourceSnapshot
  playResourceTrail(source: ResourceTrailSource, resource: TrailResourceKind, count: number): Promise<void>
  playPlayerGainTrails(source: ResourceTrailSource, before: PlayerResourceSnapshot): Promise<void>
  playHandTargetBlasts(cardIds: Iterable<string>, theme: BurstTheme): Promise<void>
  snapshotFieldCardPayloads(): { cardId: string; type: CardType }[]
  burstScoreGain(): void
  /** 희망 부활 후 전체 보드 재구축 beat — index 준비 리필 루프를 그대로 쓴다. */
  runPreparationRefreshAfterFieldEffects(options?: { avoidFrontMergeOnFullRefill?: boolean }): Promise<void>
  encounterIntroLineOnce(kind: SystemEncounterKind): string | null
}

export class RelicEffectsManager {
  constructor(private readonly deps: RelicEffectsDeps) {}

  /** Heal 1 HP per defeated enemy; Blood Pack reacts via onHealGain callback. */
  private async applyRedPotionEnemyDefeats(count: number): Promise<void> {
    const { gameState, recordRelicActivation, snapshotPlayerResources, playPlayerGainTrails } = this.deps
    if (count <= 0 || !gameState.character.hasRelic('red-potion')) return
    for (let i = 0; i < count; i++) {
      const beforeResources = snapshotPlayerResources()
      const healed = gameState.character.heal(1)
      if (healed <= 0) continue
      recordRelicActivation('red-potion', `체력 +${healed}`)
      await playPlayerGainTrails({ kind: 'chain' }, beforeResources)
    }
  }

  /** Shield from Wax Crow when treasure cards are actually acquired. */
  async applyWaxCrowTreasureGains(count: number): Promise<void> {
    const { gameState, recordRelicActivation, snapshotPlayerResources, playPlayerGainTrails } = this.deps
    if (count <= 0 || !gameState.character.hasRelic('wax-crow')) return
    const beforeResources = snapshotPlayerResources()
    const shielded = gameState.character.addShield(count)
    if (shielded <= 0) return
    recordRelicActivation('wax-crow', `방패 +${shielded}`)
    await playPlayerGainTrails({ kind: 'chain' }, beforeResources)
  }

  /** 헌혈팩: 회복량만큼 전방 랜덤 적 1장에게 피해. onHealGain 콜백에서 호출된다. */
  async applyBloodPackHit(amount: number): Promise<void> {
    const { gameState, boardRenderer, recordRelicActivation } = this.deps
    const hit = gameState.damageRandomFrontEnemy(amount)
    if (!hit) {
      recordRelicActivation('blood-pack', '전방 적 없음')
      return
    }
    recordRelicActivation('blood-pack', `전방 랜덤 적 피해 ${hit.amount}`)
    await boardRenderer.animateDamageNumbersById([{ cardId: hit.cardId, amount: hit.amount }])
    if (hit.defeated) {
      await boardRenderer.animateCardConsumeByIds([{ cardId: hit.cardId, type: CardType.ENEMY }], {
        suppressBurstIds: new Set([hit.cardId]),
      })
      await this.onEnemiesDefeated(1)
    }
  }

  /** 가시 방패: 획득 방패 1당 전방 랜덤 적을 1씩 찌른다(방어=공격). 처치는 처치 후속을 이어받는다. */
  async applyThornShieldHits(shieldGained: number): Promise<void> {
    const { gameState, boardRenderer, recordRelicActivation } = this.deps
    let hits = 0
    let kills = 0
    for (let i = 0; i < shieldGained; i++) {
      const hit = gameState.damageRandomFrontEnemy(1)
      if (!hit) break // 전방 적 없음
      hits++
      await boardRenderer.animateDamageNumbersById([{ cardId: hit.cardId, amount: hit.amount }])
      if (hit.defeated) {
        await boardRenderer.animateCardConsumeByIds([{ cardId: hit.cardId, type: CardType.ENEMY }], {
          suppressBurstIds: new Set([hit.cardId]),
        })
        kills++
      }
    }
    if (hits === 0) return // 전방 적이 없으면 조용히 종료
    recordRelicActivation('thorn-shield', kills > 0 ? `전방 적 관통 (처치 ${kills})` : `전방 적 피해 ${hits}`)
    if (kills > 0) await this.onEnemiesDefeated(kills)
  }

  /** 적 처치 시 처치 기반 유물을 한 번에 처리한다(붉은 포션 회복 + 잉크와 깃펜 카운트).
   *  blood-pack은 onHealGain 콜백으로 자동 발동되므로 별도 파라미터 불필요. */
  async onEnemiesDefeated(count: number): Promise<void> {
    if (count <= 0) return
    await this.applyRedPotionEnemyDefeats(count)
    this.applyInkQuillKills(count)
    this.applyAmbitionKills(count)
    this.applyShardGenerators(count)
  }

  /** 파편 생성기 유물: 처치마다 태그 파편 손패를 지급한다(SHARD_GENERATORS 데이터 주도).
   *  같은 생성기 유물을 여럿 보유하면 지급량이 배수로 늘어난다(중복 스택). */
  private applyShardGenerators(kills: number): void {
    const { gameState, recordRelicActivation, render } = this.deps
    if (kills <= 0) return
    const character = gameState.character
    for (const gen of SHARD_GENERATORS) {
      const copies = character.relics.filter((id) => id === gen.relicId).length
      if (copies === 0) continue
      const want = kills * gen.perKill * copies
      let granted = 0
      for (let i = 0; i < want; i++) {
        // enqueueDrop = 일반 획득과 같은 정리 경로(손패 가득이면 중단). 3장째는 자동 트리플.
        if (!HandSystem.enqueueDrop(character, DropSystem.makeCard(gen.shard))) break
        granted++
      }
      if (granted > 0) {
        recordRelicActivation(gen.relicId, `${getHandCardDef(gen.shard).name} +${granted}`)
        render()
      }
    }
  }

  /** 야망: 적 8처치마다 불빛을 25씩 늘어나며(25→50→75…) 획득한다. 누적 보너스는 런 동안 유지. */
  private applyAmbitionKills(count: number): void {
    const { gameState, recordRelicActivation, playResourceTrail, burstScoreGain } = this.deps
    if (count <= 0 || !gameState.character.hasRelic('ambition')) return
    gameState.enhancements.ambitionKillCount += count
    while (gameState.enhancements.ambitionKillCount >= 8) {
      gameState.enhancements.ambitionKillCount -= 8
      gameState.enhancements.ambitionCurrentGain += 25
      const gained = this.gainFixedLight('야망', gameState.enhancements.ambitionCurrentGain)
      recordRelicActivation('ambition', `불빛 +${gained}`)
      void playResourceTrail({ kind: 'chain' }, 'score', 1)
      burstScoreGain()
    }
  }

  /** 정직: 손패 5장 사용마다 불빛 100 획득. 사용 수는 런 동안 누적. */
  applyHonestyHandUse(count: number): void {
    const { gameState, recordRelicActivation, playResourceTrail, burstScoreGain } = this.deps
    if (count <= 0 || !gameState.character.hasRelic('honesty')) return
    gameState.enhancements.honestyHandUseCount += count
    while (gameState.enhancements.honestyHandUseCount >= 5) {
      gameState.enhancements.honestyHandUseCount -= 5
      const gained = this.gainFixedLight('정직', 100)
      recordRelicActivation('honesty', `불빛 +${gained}`)
      void playResourceTrail({ kind: 'chain' }, 'score', 1)
      burstScoreGain()
    }
  }

  /** 태그 반응형 유물 디스패처: 사용한 손패의 시너지 태그에 반응하는 유물 효과를
   *  TagReactions 데이터로부터 발동한다. 새 태그 반응형 유물은 index.ts 수정 없이
   *  Relics.ts 정의 + TAG_REACTIONS 항목 추가만으로 여기서 자동 처리된다. */
  applyHandCardUseRelics(def: HandCardDefinition, merged: boolean): void {
    const { gameState, boardRenderer, recordRelicActivation, render } = this.deps
    const tags = def.synergyTags
    // 혈마법진: 제물 손패를 쓸 때마다 사용 수를 세어 5마다 최대 체력·불빛을 영구 성장시킨다.
    if (tags?.includes('sacrifice')) this.applyBloodSigilCardUse()
    if (!tags || tags.length === 0) return
    const outcomes = runTagReactions('handCardUsed', {
      character: gameState.character,
      enhancements: gameState.enhancements,
      tags,
      merged,
    })
    for (const outcome of outcomes) {
      // 파편 지급형(사용 기반 생성기): enqueueDrop = 일반 획득과 같은 정리 경로(손패 가득이면 무시).
      if (outcome.grantCard) {
        if (!HandSystem.enqueueDrop(gameState.character, DropSystem.makeCard(outcome.grantCard))) continue
        recordRelicActivation(outcome.relicId, outcome.message)
        render()
        continue
      }
      recordRelicActivation(outcome.relicId, outcome.message)
      // 자원 변화는 이미 Character에 반영됐고, 여기서는 HUD 카운터 펄스만 재생한다.
      if (outcome.feedback === 'ember') boardRenderer.playHudCounterFeedback('ember', gameState.character.ember)
      else if (outcome.feedback === 'candle') boardRenderer.playHudCounterFeedback('candle', gameState.character.candle)
      else if (outcome.feedback === 'shield') boardRenderer.playHudCounterFeedback('shield', gameState.character.shield)
      else if (outcome.feedback === 'health') boardRenderer.playHudCounterFeedback('health', gameState.character.health)
    }
  }

  /** 변칙: 플레이어가 체력을 5 잃을 때마다 불씨 게이지 +1. 누적 피해는 Character가 보관한다.
   *  미보유 시 누적을 비워, 나중에 획득해도 이전 피해가 소급 발동하지 않게 한다. */
  applyAnomalyHealthLoss(): void {
    const { gameState, boardRenderer, recordRelicActivation } = this.deps
    const character = gameState.character
    if (!character.hasRelic('anomaly')) { character.relicDamageTaken = 0; return }
    while (character.relicDamageTaken >= 5) {
      character.relicDamageTaken -= 5
      character.gainEmber(1)
      boardRenderer.playHudCounterFeedback('ember', character.ember)
      recordRelicActivation('anomaly', '불씨 +1')
    }
  }

  /** 맹신: 1$ 획득마다 불빛 50 획득(코인 1당 +50). 코인 획득 지점마다 amount로 호출한다. */
  applyBlindFaithCoins(amount: number): void {
    const { gameState, recordRelicActivation, playResourceTrail, burstScoreGain } = this.deps
    if (amount <= 0 || !gameState.character.hasRelic('blind-faith')) return
    const gained = this.gainFixedLight('맹신', 50 * amount)
    recordRelicActivation('blind-faith', `불빛 +${gained}`)
    void playResourceTrail({ kind: 'chain' }, 'score', 1)
    burstScoreGain()
  }

  /** 잉크와 깃펜: 적 5처치마다 콤보 게이지 +1. 처치 수는 런 동안 누적한다.
   *  채워진 게이지는 액션 종료 시 resolveFullCandleGaugeEffects가 정산한다. */
  private applyInkQuillKills(count: number): void {
    const { gameState, boardRenderer, recordRelicActivation } = this.deps
    if (count <= 0 || !gameState.character.hasRelic('ink-quill')) return
    gameState.enhancements.inkQuillKillCount += count
    while (gameState.enhancements.inkQuillKillCount >= 5) {
      gameState.enhancements.inkQuillKillCount -= 5
      gameState.character.gainCandle(1)
      boardRenderer.playHudCounterFeedback('candle', gameState.character.candle)
      recordRelicActivation('ink-quill', '콤보 게이지 +1')
    }
  }

  /** 품격있는 대처: 나에게 피해를 입힌 적들에게 각각 피해 1로 반격한다.
   *  적 페이즈(runEnemyPhase) 직후, 플레이어 피격 연출이 끝난 뒤 호출한다. */
  async applyDignifiedRetaliation(hits: EnemyHit[]): Promise<void> {
    const { gameState, boardRenderer, recordRelicActivation } = this.deps
    if (gameState.isGameOver || !gameState.character.hasRelic('graceful-response')) return
    // 실제로 피해를 입힌 적만(방패로 0이면 제외), 다중 레인 점유 적은 cardId로 중복 제거.
    const attackerIds = [...new Set(hits.filter((h) => h.damage > 0).map((h) => h.cardId))]
    if (attackerIds.length === 0) return
    const damaged: { cardId: string; amount: number }[] = []
    const killedIds: string[] = []
    // 반격 피해: Math.floor(공격력 × 0.3) + 1 — atkDmgHtml과 동일한 공식
    const dmg = Math.max(1, Math.floor(gameState.character.damage * 0.3) + 1)
    for (const id of attackerIds) {
      const hit = gameState.damageEnemyById(id, dmg)
      if (!hit) continue
      damaged.push({ cardId: hit.cardId, amount: hit.amount })
      if (hit.defeated) killedIds.push(hit.cardId)
    }
    if (damaged.length === 0) return
    const dmgForLog = Math.max(1, Math.floor(gameState.character.damage * 0.3) + 1)
    recordRelicActivation('graceful-response', `반격 피해 ${dmgForLog} (${damaged.length}체)`)
    await boardRenderer.animateDamageNumbersById(damaged)
    if (killedIds.length > 0) {
      await boardRenderer.animateCardConsumeByIds(
        killedIds.map((cardId) => ({ cardId, type: CardType.ENEMY })),
        { suppressBurstIds: new Set(killedIds) }
      )
      await this.onEnemiesDefeated(killedIds.length)
    }
  }

  /** Hope is a one-shot revive: show its bespoke relic burst, remove itself,
   *  ban future offers, clear the rail, then hand control back to the player. */
  /** 권위: 치명적 피해를 단 한 번 체력 1로 버틴다(필드는 그대로). 발동 후 다시 등장하지 않게 밴한다.
   *  희망처럼 화면 중앙 연출 + 체력 게이지 확대 + 붉은빛을 보여 준 뒤 유물을 파괴한다. */
  private async tryResolveAuthoritySurvive(): Promise<boolean> {
    const { gameState, boardRenderer, recordRelicActivation, render } = this.deps
    const character = gameState.character
    // takeDamage가 체력을 1에서 멈추고 세운 pending 플래그로만 발동한다(0→부활이 아니라 1에서 정지).
    if (!character.authoritySurvivePending) return false
    character.authoritySurvivePending = false
    await boardRenderer.animateAuthoritySurvive('authority')
    character.removeRelic('authority', true)
    character.health = Math.max(1, character.health)
    gameState.isGameOver = false
    gameState.gameOverReason = ''
    recordRelicActivation('authority', '체력 1로 생존')
    render()
    return true
  }

  /** 사망(치명타) 처리 순서: 권위(체력 1로 생존, 필드 유지) → 희망(체력 10 부활, 필드 제거). */
  async tryResolveSurvivalRelics(): Promise<boolean> {
    if (await this.tryResolveAuthoritySurvive()) return true
    if (await this.tryResolveHopeRevive()) return true
    // 최후의 수단: 다른 부활 수단이 모두 실패한 진짜 죽음 직전, 아주 드물게 에나가 각성한다.
    if (await this.tryResolveCompanionAwaken()) return true
    return false
  }

  /**
   * 에나의 각성(최후의 의지). 다른 부활 수단이 전부 실패한 사망 직전에만, 런당 한 번,
   * 아주 드물게 발동한다. 화려한 연출과 함께 체력 전체 회복 + 공격력 +1로 되살린다.
   */
  private async tryResolveCompanionAwaken(): Promise<boolean> {
    const { gameState, boardRenderer, companion, companionDirector, recordNotice, render } = this.deps
    const character = gameState.character
    if (character.isAlive()) return false
    if (!companion.tryAwaken()) return false
    await boardRenderer.animateClutchOnPlayer('attack-gain', true)
    character.fullHeal()
    character.applyDamageBoost(1)
    gameState.isGameOver = false
    gameState.gameOverReason = ''
    recordNotice('에나의 각성! 체력 전체 회복 · 공격력 +1', 'info')
    render()
    companionDirector.showClutchChain('awaken', '체력 전체 회복 · 공격력 +1')
    companionDirector.sayEnaBark(companion.awakenLine(), { importance: BARK_IMPORTANCE.clutch })
    return true
  }

  private async tryResolveHopeRevive(): Promise<boolean> {
    const { gameState, boardRenderer, recordRelicActivation, render, snapshotPlayerResources, playPlayerGainTrails, playHandTargetBlasts, snapshotFieldCardPayloads, runPreparationRefreshAfterFieldEffects } = this.deps
    const character = gameState.character
    if (character.isAlive() || !character.hasRelic('hope')) return false
    const beforeResources = snapshotPlayerResources()
    const fieldCards = snapshotFieldCardPayloads()

    // The relic must still be present in the owned fan while this plays, so the
    // one-shot removal happens after the centered shake/white-pop beat.
    await boardRenderer.animateHopeRelicRevive('hope')
    character.removeRelic('hope', true)

    // Hope is a full field-cleanup relic: first mark every visible card from the
    // center, then let the stale DOM cards burst/fade before the model is cleared.
    await playHandTargetBlasts(
      fieldCards.map((card) => card.cardId),
      'score'
    )
    await boardRenderer.animateCardConsumeByIds(fieldCards)

    gameState.clearField()
    character.maxHealth = Math.max(character.maxHealth, 10)
    character.health = 10
    gameState.isGameOver = false
    gameState.gameOverReason = ''
    recordRelicActivation('hope', '체력 10으로 부활, 필드 제거')
    render()
    await playPlayerGainTrails({ kind: 'center' }, beforeResources)
    await runPreparationRefreshAfterFieldEffects({ avoidFrontMergeOnFullRefill: true })
    return true
  }

  /** 고정 불빛 획득 공통 경로. 턴 배율(getTurnScoreMultiplier)은 적용하지 않되, 자원팩 등이
   *  올리는 글로벌 불빛 획득량 보너스(enhancements.scoreMultiplier)는 모든 불빛 획득에 반영한다.
   *  야망/맹신/정직/별빛 랜턴/무료카드 등 고정 불빛 획득이 모두 이 함수를 거친다. */
  gainFixedLight(label: string, baseValue: number, kind: ActivityLogEntry['kind'] = 'score'): number {
    const { gameState, addScore, pushActivityLogsInDisplayOrder } = this.deps
    if (baseValue <= 0) return 0
    const amount = Math.max(0, Math.round(baseValue * gameState.enhancements.scoreMultiplier))
    if (amount <= 0) return 0
    addScore(amount)
    pushActivityLogsInDisplayOrder([{ label, scoreDelta: amount, kind }])
    return amount
  }

  /** 매 턴 발동하는 유물 효과를 한 곳에서 처리한다. */
  async applyTurnStartRelics(): Promise<void> {
    const { gameState, recordRelicActivation, render, playResourceTrail, burstScoreGain } = this.deps
    const character = gameState.character
    const turn = gameState.getCurrentTurn()

    // 별빛 랜턴: 5턴마다 불빛 200 (턴 배율 없음).
    if (character.hasRelic('golden-squirrel') && turn !== 0 && turn % 5 === 0) {
      const gained = this.gainFixedLight('별빛 랜턴', 200)
      recordRelicActivation('golden-squirrel', `불빛 +${gained}`)
      await playResourceTrail({ kind: 'chain' }, 'score', 1)
      burstScoreGain()
    }

    // 에나벨라의 반지: 7턴마다 최하단(비합체) 손패 1장을 트리플로 승격. 이미 트리플이면 위 카드로.
    if (character.hasRelic('annabella-ring') && turn !== 0 && turn % 7 === 0) {
      const target = character.hand.find((c) => c.merged !== true)
      if (target) {
        target.merged = true // 게임 로직은 merged 플래그만 읽는다(mergeSourceUids는 렌더 연출 전용).
        recordRelicActivation('annabella-ring', `${getHandCardDef(target.defId).name} 트리플 승격`)
        render()
        await playResourceTrail({ kind: 'chain' }, 'hand', 1)
      }
    }

    // 기사도: 4턴마다 knight 태그 손패 중 dropWeight 기반 랜덤 1장 지급.
    if (character.hasRelic('chivalry') && turn !== 0 && turn % 4 === 0) {
      const knightPool = HAND_CARD_IDS.filter((id) => HAND_CARD_DEFINITIONS[id].jobTags?.includes('knight'))
      if (knightPool.length > 0) {
        const total = knightPool.reduce((s, id) => s + (HAND_CARD_DEFINITIONS[id].dropWeight ?? 1), 0)
        let roll = Math.random() * total
        let picked = knightPool[0]
        for (const id of knightPool) {
          roll -= HAND_CARD_DEFINITIONS[id].dropWeight ?? 1
          if (roll <= 0) { picked = id; break }
        }
        const drop = DropSystem.makeCard(picked)
        // enqueueDrop = 획득 공통 정리 — 기사도 지급이 3장째면 즉시 트리플로 합성한다.
        const added = HandSystem.enqueueDrop(character, drop)
        if (added) {
          const name = HAND_CARD_DEFINITIONS[picked].name
          recordRelicActivation('chivalry', `${name} 획득`)
          render()
          await playResourceTrail({ kind: 'chain' }, 'hand', 1)
        }
      }
    }

    // 도서관: 매 턴 카운트다운 -1(마도서 사용도 -1). 0에서 마도서 카드 지급 후 +4.
    this.advanceLibrary(1)
  }

  /** 도서관: 카운트다운을 steps만큼 줄이고, 0 이하가 될 때마다 마도서(tome) 카드 1장을 지급 후 +4.
   *  턴 진행과 마도서 사용이 같은 카운트다운을 공유해, 마도서를 굴릴수록 다음 책이 빨리 온다. */
  advanceLibrary(steps: number): void {
    const { gameState, recordRelicActivation, render } = this.deps
    const character = gameState.character
    if (!character.hasRelic('library')) return
    gameState.enhancements.libraryCountdown -= steps
    const tomeIds = handCardIdsWithTag('tome')
    while (gameState.enhancements.libraryCountdown <= 0) {
      gameState.enhancements.libraryCountdown += 4
      if (tomeIds.length === 0) break
      const pick = tomeIds[Math.floor(Math.random() * tomeIds.length)]
      if (!HandSystem.enqueueDrop(character, DropSystem.makeCard(pick))) break // 손패 가득
      recordRelicActivation('library', `${getHandCardDef(pick).name} 획득`)
      render()
    }
  }

  /** 소중한 머리: 체력이 최대치의 절반 이하로 감소하면 전체 회복 후 파괴.
   *  fullHeal()이 onHealGain 콜백을 발동해 blood-pack을 자동 처리한다. */
  async applyPreciousHeadCheck(): Promise<void> {
    const { gameState, boardRenderer, recordRelicActivation, render, snapshotPlayerResources, playPlayerGainTrails } = this.deps
    const character = gameState.character
    if (!character.hasRelic('precious-head')) return
    if (character.health <= 0 || character.health > character.maxHealth / 2) return
    const beforeResources = snapshotPlayerResources()
    // 파괴 연출(강도 2)을 먼저 보여 준 뒤 회복/파괴를 확정한다.
    await boardRenderer.animateRelicDestroy('precious-head', 2)
    character.fullHeal()
    character.removeRelic('precious-head', true)
    recordRelicActivation('precious-head', '체력 전체 회복 (발동 후 파괴)')
    render()
    await playPlayerGainTrails({ kind: 'chain' }, beforeResources)
  }

  /** 훌륭한 대화수단: 플레이어가 적을 공격할 때마다 2.5% 확률로 파괴, 공격력 +2 환원. */
  async applyGreatNegotiationOnAttack(): Promise<void> {
    const { gameState, boardRenderer, recordRelicActivation, render } = this.deps
    const character = gameState.character
    if (!character.hasRelic('great-negotiation') || Math.random() >= 0.025) return
    // 파괴 연출(강도 1: 정말 간단한 소각)을 유물이 부채에 남아 있는 동안 먼저 재생한다.
    await boardRenderer.animateRelicDestroy('great-negotiation', 1)
    character.damage = Math.max(1, character.damage - 2)
    character.removeRelic('great-negotiation', true)
    recordRelicActivation('great-negotiation', '파괴! 공격력 -2 환원')
    render()
  }

  /** 찬스: 적 타격 후 15% 확률로 추가 타격. 빠른 따닥 느낌으로 짧게 처리. */
  async applyChanceExtraHit(card: Card, distance: number): Promise<void> {
    const { gameState, boardRenderer, recordRelicActivation, pushActivityLogsInDisplayOrder, createScoreLog, scoreForCardRemoval, scoreLabelForCard, playResourceTrail } = this.deps
    if (!gameState.character.hasRelic('chance') || Math.random() >= 0.15) return
    if (card.health <= 0) return
    const char = gameState.character
    // 빠른 추가 타격 — 공격 애니메이션 없이 피해 숫자만 즉시 표시.
    const newHealth = card.takeDamage(char.damage)
    recordRelicActivation('chance', `추가 타격 ${char.damage}`)
    await boardRenderer.animateDamageNumbersById([{ cardId: card.id, amount: char.damage }])
    if (newHealth <= 0) {
      const base = scoreForCardRemoval(card)
      if (base > 0) {
        pushActivityLogsInDisplayOrder([createScoreLog(scoreLabelForCard(card), base, 'enemy')])
        await playResourceTrail({ kind: 'card', cardId: card.id }, 'score', 1)
      }
      if (card.isSpecialEnemy) await this.applyPadlockMimicBonus(card)
      await boardRenderer.animateCardConsumeByIds([{ cardId: card.id, type: CardType.ENEMY }], {
        suppressBurstIds: new Set([card.id]),
      })
      gameState.removeCardFromRow(card, distance)
      await this.onEnemiesDefeated(1)
    }
  }

  /** 물양동이: 타격한 적 25% 확률로 추가 피해(공격력 × 0.5 + 1, 최소 1). */
  async applyWaterBucketExtraDamage(card: Card, distance: number): Promise<void> {
    const { gameState, boardRenderer, recordRelicActivation, pushActivityLogsInDisplayOrder, createScoreLog, scoreForCardRemoval, scoreLabelForCard, playResourceTrail } = this.deps
    if (!gameState.character.hasRelic('water-bucket') || Math.random() >= 0.25) return
    if (card.health <= 0) return
    // atkDmgHtml과 동일한 공식
    const dmg = Math.max(1, Math.floor(gameState.character.damage * 0.5) + 1)
    const newHealth = card.takeDamage(dmg)
    recordRelicActivation('water-bucket', `추가 피해 ${dmg}`)
    await boardRenderer.animateDamageNumbersById([{ cardId: card.id, amount: dmg }])
    if (newHealth <= 0) {
      const base = scoreForCardRemoval(card)
      if (base > 0) {
        pushActivityLogsInDisplayOrder([createScoreLog(scoreLabelForCard(card), base, 'enemy')])
        await playResourceTrail({ kind: 'card', cardId: card.id }, 'score', 1)
      }
      if (card.isSpecialEnemy) await this.applyPadlockMimicBonus(card)
      await boardRenderer.animateCardConsumeByIds([{ cardId: card.id, type: CardType.ENEMY }], {
        suppressBurstIds: new Set([card.id]),
      })
      gameState.removeCardFromRow(card, distance)
      await this.onEnemiesDefeated(1)
    }
  }

  /** 소소한 클러치 — 급소: 살아남은 적에게 가끔 추가 피해(공격력 + 2). */
  async applyCompanionCrit(card: Card, distance: number): Promise<void> {
    const { gameState, boardRenderer, companion, companionDirector, recordNotice, pushActivityLogsInDisplayOrder, createScoreLog, scoreForCardRemoval, scoreLabelForCard, playResourceTrail } = this.deps
    if (!companionDirector.companionWorldCanSpeak() || card.health <= 0) return
    if (!companion.rollMinorClutch('crit', { adversity: card.enemyPower >= 6 || card.getHealth() > gameState.character.damage * 2 })) return
    const dmg = Math.max(1, gameState.character.damage + 2)
    const newHealth = card.takeDamage(dmg)
    recordNotice(`에나의 의지 — 급소! 추가 피해 ${dmg}`, 'info')
    void boardRenderer.animateClutchOnPlayer('attack-gain')
    companionDirector.showClutchChain('crit', `급소 추가 타격 ${dmg}`)
    companionDirector.sayEnaBark(companion.minorClutchLine('crit'), { importance: BARK_IMPORTANCE.clutch })
    // 급소 피해는 레바테인 스타일 특수 폰트로 한 번 더(일반 -1 뒤에 -2가 황금빛으로).
    await boardRenderer.animateCritDamageOnCard(card.id, dmg)
    if (newHealth <= 0) {
      const base = scoreForCardRemoval(card)
      if (base > 0) {
        pushActivityLogsInDisplayOrder([createScoreLog(scoreLabelForCard(card), base, 'enemy')])
        await playResourceTrail({ kind: 'card', cardId: card.id }, 'score', 1)
      }
      if (card.isSpecialEnemy) await this.applyPadlockMimicBonus(card)
      await boardRenderer.animateCardConsumeByIds([{ cardId: card.id, type: CardType.ENEMY }], {
        suppressBurstIds: new Set([card.id]),
      })
      gameState.removeCardFromRow(card, distance)
      await this.onEnemiesDefeated(1)
    }
  }

  /** 자물쇠: 미믹 처치 시 불빛 +25% + 손패 +1. */
  async applyPadlockMimicBonus(card: Card): Promise<void> {
    const { gameState, recordRelicActivation, render, pushActivityLogsInDisplayOrder, createItemGainLogs, scoreForCardRemoval, playResourceTrail, burstScoreGain } = this.deps
    if (!gameState.character.hasRelic('padlock')) return
    // 불빛 +25% (미믹 기본 점수 기준, 턴 배율 없이 고정 지급)
    const baseScore = scoreForCardRemoval(card)
    const bonusLight = Math.max(1, Math.ceil(baseScore * 0.25))
    const gained = this.gainFixedLight('자물쇠 · 미믹 불빛', bonusLight)
    recordRelicActivation('padlock', `미믹 불빛 +${gained}`)
    await playResourceTrail({ kind: 'chain' }, 'score', 1)
    burstScoreGain()
    // 손패 +1
    // enqueueDrop = 획득 공통 정리 — 자물쇠 보너스가 3장째면 즉시 트리플로 합성한다.
    const drop = DropSystem.generateDrop('enemy-kill')
    const added = HandSystem.enqueueDrop(gameState.character, drop)
    if (added) {
      const dropDef = getHandCardDef(drop.defId)
      pushActivityLogsInDisplayOrder(createItemGainLogs([dropDef.name]))
      render()
      await playResourceTrail({ kind: 'chain' }, 'hand', 1)
    }
  }

  /** Immediate stat effects for relics whose benefit is granted on purchase. */
  async applyRelicPurchaseEffect(id: RelicId): Promise<void> {
    const { gameState, cardSpawner, companion, companionDirector, isGameActive, render, snapshotPlayerResources, playPlayerGainTrails, encounterIntroLineOnce } = this.deps
    // 동료(에나) 구매 감상평 — 상점/제단에서도 한마디(사치품엔 짓궂게, 가문 물건엔 반갑게).
    // companionWorldCanSpeak는 상점을 막으므로 여기선 가볍게 게이팅한다(.player-card HUD에 표시).
    // 태어나서 첫 유물이라면 감상 대신 '지니면 계속 효과'라는 교육형 소개를 우선한다.
    if (isGameActive() && !gameState.isGameOver) {
      const relicIntro = encounterIntroLineOnce('relic')
      companionDirector.sayEnaBark(relicIntro ?? companion.onBuyRelic(id, getRelicDef(id).rarity), { importance: BARK_IMPORTANCE.situation })
    }
    // 구매 즉시 스탯만 올리고 체인 로그에는 남기지 않는다. 트레일은 상점에서
    // 숨겨진 체인 배너 대신 화면 중앙에서 HUD로 날린다.
    if (id === 'carving-knife') {
      const beforeResources = snapshotPlayerResources()
      gameState.character.applyDamageBoost(1)
      await playPlayerGainTrails({ kind: 'center' }, beforeResources)
      return
    }
    if (id === 'lifeline') {
      const beforeResources = snapshotPlayerResources()
      // increaseMaxHealth가 onHealGain 콜백으로 blood-pack을 자동 처리한다.
      gameState.character.increaseMaxHealth(5)
      await playPlayerGainTrails({ kind: 'center' }, beforeResources)
    }
    if (id === 'first-candle') {
      const beforeResources = snapshotPlayerResources()
      // 첫 양초: 최대 체력 +5 / 공격력 +1 / 불씨 한도 +2 / 최대 손패 +2 / 콤보 한도 -1.
      // 손패·콤보 한도는 수치 트레일이 없으므로 체력/불씨/공격력만 중앙 트레일로 보인다.
      // increaseMaxHealth가 onHealGain 콜백으로 blood-pack을 자동 처리한다.
      gameState.character.increaseMaxHealth(5)
      gameState.character.applyDamageBoost(1)
      gameState.character.increaseEmberMax(2)
      gameState.character.increaseHandMax(2)
      gameState.character.decreaseCandleMax(1)
      await playPlayerGainTrails({ kind: 'center' }, beforeResources)
    }
    if (id === 'hegemony') {
      const beforeResources = snapshotPlayerResources()
      // 패도: 최대 체력 -10(제 살 깎기) + 공격력 +2. 구매 가능 여부는 relicPurchaseBlocked가 막는다.
      gameState.character.spendMaxHealth(10)
      gameState.character.applyDamageBoost(2)
      render()
      await playPlayerGainTrails({ kind: 'center' }, beforeResources)
    }
    if (id === 'hourglass') {
      // 불씨 소모 주기 +1턴.
      const beforeResources = snapshotPlayerResources()
      gameState.character.increaseEmberDecayTurns(1)
      await playPlayerGainTrails({ kind: 'center' }, beforeResources)
    }
    if (id === 'great-negotiation') {
      // 공격력 +2. 매 턴 파괴 확률은 applyTurnStartRelics에서 처리.
      const beforeResources = snapshotPlayerResources()
      gameState.character.applyDamageBoost(2)
      await playPlayerGainTrails({ kind: 'center' }, beforeResources)
    }
    if (id === 'pickaxe') {
      // 보물 스폰 가중치 +5.
      cardSpawner.adjustRelicSpawn('treasure', 5)
    }
    if (id === 'axe') {
      // 불빛 획득량 +10% (글로벌 scoreMultiplier에 누적).
      gameState.enhancements.scoreMultiplier *= 1.10
    }
    if (id === 'annabella-pendant') {
      const beforeResources = snapshotPlayerResources()
      // 공격력 +2 + 적 스폰 HP +3 + 적 스폰 가중치 +5.
      gameState.character.applyDamageBoost(2)
      cardSpawner.adjustRelicSpawn('enemy', 5)
      cardSpawner.adjustRelicEnemyHpBonus(3)
      await playPlayerGainTrails({ kind: 'center' }, beforeResources)
    }
    if (id === 'padlock') {
      // 보물 스폰 가중치 -5.
      cardSpawner.adjustRelicSpawn('treasure', -5)
    }
    if (id === 'charred-paper') {
      // 적 스폰 가중치 -5.
      cardSpawner.adjustRelicSpawn('enemy', -5)
    }
    if (id === 'golden-key') {
      // 보물 스폰 중 30% 확률로 황금 상자로 대체한다.
      cardSpawner.adjustGoldenChestWeight(0.3)
    }
    if (id === 'sweet-temptation') {
      // 함정 피해 +1 (ActionSystem이 character.trapDamageBonus를 읽는다).
      gameState.character.trapDamageBonus += 1
    }
    if (id === 'discount-coupon') {
      // 상점 품목 5% 할인 (priceForRelic / currentShopPackCost에서 참조).
      gameState.enhancements.shopDiscountPct += 5
    }
    if (id === 'sanitizer') {
      // 포자 스폰 가중치 -2 (spawnEffect.delta와 동기화).
      cardSpawner.adjustRelicSpawn('spore', -2)
    }
    if (id === 'wax-harmony') {
      // 꽃 스폰 가중치 +2 (spawnEffect.delta와 동기화).
      cardSpawner.adjustRelicSpawn('flower', 2)
    }
    if (id === 'trap-master') {
      // 함정 30% 무효화 확률 (ActionSystem이 character.trapIgnoreChance를 읽는다).
      gameState.character.trapIgnoreChance += 0.30
    }
    if (id === 'last-supper') {
      const beforeResources = snapshotPlayerResources()
      const stats = gameState.character.customRelicProfiles['last-supper']?.stats ?? {}
      // 만찬 유물은 유저가 고른 3개 재료의 누적 스탯을 그대로 적용한다.
      if (stats.maxHealth) gameState.character.increaseMaxHealth(stats.maxHealth)
      if (stats.emberMax) gameState.character.increaseEmberMax(stats.emberMax)
      if (stats.handMax) gameState.character.increaseHandMax(stats.handMax)
      if (stats.damage) gameState.character.applyDamageBoost(stats.damage)
      if (stats.scorePct) gameState.enhancements.scoreMultiplier *= (1 + stats.scorePct / 100)
      await playPlayerGainTrails({ kind: 'center' }, beforeResources)
    }
    // chivalry, luxury: 구매 즉발 효과 없음 — 각각 매 3턴 트리거 / 불빛 소비 시 트리거.
  }

  /** 일부 유물은 불빛 가격 외 추가 구매 조건이 있다(패도: 최대 체력 16 이상). 충족 못 하면 true. */
  relicPurchaseBlocked(id: RelicId): boolean {
    const { gameState } = this.deps
    // spendMaxHealth는 최대 체력이 1 미만이 되지 않게 막으므로, -10 후 최소 1이 남는 11 이상이어야 한다.
    if (id === 'hegemony') return gameState.character.maxHealth < 11
    return false
  }

  /** 악마 인형 유물: 자해 20마다 불빛 획득량 +10% · 공격력 +1. */
  applyDemonDollSelfDamage(amount: number): void {
    const { gameState, recordRelicActivation } = this.deps
    if (!gameState.character.hasRelic('demon-doll') || amount <= 0) return
    const enhancements = gameState.enhancements
    enhancements.demonDollSelfDamageAccum += amount
    const gained = Math.floor(enhancements.demonDollSelfDamageAccum / 20)
    if (gained <= 0) return
    enhancements.demonDollSelfDamageAccum %= 20
    enhancements.demonDollBonusAtk += gained
    for (let i = 0; i < gained; i++) {
      enhancements.scoreMultiplier *= 1.10
      gameState.character.applyDamageBoost(1)
    }
    recordRelicActivation('demon-doll', `자해 20 누적 → 불빛 +10%, 공격력 +${gained} (누적 +${enhancements.demonDollBonusAtk})`)
  }

  /** 혈서: 자해 5 누적마다 제물(sacrifice) 태그 손패 1장(비보스 풀 dropWeight 가중)을 손에 흘려 넣는다. */
  applyBloodWritSelfDamage(amount: number): void {
    const { gameState, recordRelicActivation, render } = this.deps
    const character = gameState.character
    if (!character.hasRelic('blood-writ') || amount <= 0) return
    const enhancements = gameState.enhancements
    enhancements.bloodWritSelfDamageAccum += amount
    // 제물 손패 풀: sacrifice 태그 + 일반 획득 가능(보스/유물 전용 파편 제외).
    const pool = HAND_CARD_IDS.filter((id) => {
      const d = HAND_CARD_DEFINITIONS[id]
      return d.synergyTags?.includes('sacrifice') && d.dropSource !== 'boss' && d.dropSource !== 'relic'
    })
    if (pool.length === 0) { enhancements.bloodWritSelfDamageAccum %= 5; return }
    while (enhancements.bloodWritSelfDamageAccum >= 5) {
      enhancements.bloodWritSelfDamageAccum -= 5
      const total = pool.reduce((s, id) => s + (HAND_CARD_DEFINITIONS[id].dropWeight ?? 1), 0)
      let roll = Math.random() * total
      let picked = pool[0]
      for (const id of pool) {
        roll -= HAND_CARD_DEFINITIONS[id].dropWeight ?? 1
        if (roll <= 0) { picked = id; break }
      }
      // enqueueDrop = 획득 공통 정리(손패 가득이면 중단). 3장째면 자동 트리플.
      if (!HandSystem.enqueueDrop(character, DropSystem.makeCard(picked))) break
      recordRelicActivation('blood-writ', `${getHandCardDef(picked).name} 획득`)
      render()
    }
  }

  /** 응고: 자해 2 누적마다 방패 +1. 절반 효율이 제물 순환의 폭주 방지 브레이크다. */
  applyCoagulationSelfDamage(amount: number): void {
    const { gameState, recordRelicActivation, snapshotPlayerResources, playPlayerGainTrails } = this.deps
    if (!gameState.character.hasRelic('coagulation') || amount <= 0) return
    const enhancements = gameState.enhancements
    enhancements.coagulationSelfDamageAccum += amount
    const gained = Math.floor(enhancements.coagulationSelfDamageAccum / 2)
    if (gained <= 0) return
    enhancements.coagulationSelfDamageAccum %= 2
    const beforeResources = snapshotPlayerResources()
    const shielded = gameState.character.addShield(gained)
    if (shielded <= 0) return
    recordRelicActivation('coagulation', `방패 +${shielded}`)
    void playPlayerGainTrails({ kind: 'chain' }, beforeResources)
  }

  /** 수혈: 입은 자해 피해량만큼 필드 랜덤 적에게 1씩 분산 타격한다(가시 방패와 동일 경로). */
  async applyTransfusionSelfDamage(amount: number): Promise<void> {
    const { gameState, boardRenderer, recordRelicActivation } = this.deps
    if (!gameState.character.hasRelic('transfusion') || amount <= 0) return
    let hits = 0
    let kills = 0
    for (let i = 0; i < amount; i++) {
      const hit = gameState.damageRandomFrontEnemy(1)
      if (!hit) break // 전방 적 없음
      hits++
      await boardRenderer.animateDamageNumbersById([{ cardId: hit.cardId, amount: hit.amount }])
      if (hit.defeated) {
        await boardRenderer.animateCardConsumeByIds([{ cardId: hit.cardId, type: CardType.ENEMY }], {
          suppressBurstIds: new Set([hit.cardId]),
        })
        kills++
      }
    }
    if (hits === 0) return
    recordRelicActivation('transfusion', kills > 0 ? `자해 분산 (처치 ${kills})` : `자해 분산 피해 ${hits}`)
    if (kills > 0) await this.onEnemiesDefeated(kills)
  }

  /** 혈마법진: 제물 손패 5회 사용마다 최대 체력 +2 · 불빛 획득량 +5%(복리). 사용 수는 런 동안 누적. */
  applyBloodSigilCardUse(): void {
    const { gameState, recordRelicActivation, snapshotPlayerResources, playPlayerGainTrails } = this.deps
    if (!gameState.character.hasRelic('blood-sigil')) return
    const enhancements = gameState.enhancements
    enhancements.bloodSigilUseCount += 1
    while (enhancements.bloodSigilUseCount >= 5) {
      enhancements.bloodSigilUseCount -= 5
      const beforeResources = snapshotPlayerResources()
      gameState.character.increaseMaxHealth(2)
      enhancements.scoreMultiplier *= 1.05
      recordRelicActivation('blood-sigil', '최대 체력 +2 · 불빛 +5%')
      void playPlayerGainTrails({ kind: 'chain' }, beforeResources)
    }
  }

  /** 사치품 유물: 불빛 소비량 누적 후 2000마다 공격력 +1 처리. 최대 누적 공격력 +3. */
  applyLuxuryScoreSpend(amount: number): void {
    const { gameState, recordRelicActivation } = this.deps
    if (!gameState.character.hasRelic('luxury') || amount <= 0) return
    const enhancements = gameState.enhancements
    const maxBonus = 3
    if (enhancements.luxuryBonusAtk >= maxBonus) return // 이미 최대치
    enhancements.luxuryScoreSpent += amount
    const potential = Math.floor(enhancements.luxuryScoreSpent / 2000)
    if (potential <= 0) return
    enhancements.luxuryScoreSpent %= 2000
    const gained = Math.min(potential, maxBonus - enhancements.luxuryBonusAtk)
    if (gained <= 0) return
    enhancements.luxuryBonusAtk += gained
    gameState.character.applyDamageBoost(gained)
    recordRelicActivation('luxury', `불빛 2000 소비 → 공격력 +${gained} (누적 +${enhancements.luxuryBonusAtk})`)
  }
}
