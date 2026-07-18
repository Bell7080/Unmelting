/**
 * EventFlowManager — 이벤트 문(choice/minigame) 진입 흐름 매니저.
 * 문 클릭 → 레일 안정화 → 대사/선택(또는 미니게임 실시간 자원 싱크) → 효과 적용 →
 * 마무리 대사/커튼 → 레일 복귀까지를 담당한다. 상태 소유는 index.ts에 남는다.
 */

import type { GameState } from '@core/GameState'
import type { TurnManager } from '@core/TurnManager'
import type { CardSpawner } from '@systems/CardSpawner'
import { HandSystem } from '@systems/HandSystem'
import { DropSystem } from '@systems/DropSystem'
import type { CompanionSystem } from '@systems/CompanionSystem'
import { CompanionDirector, BARK_IMPORTANCE } from '@/app/CompanionDirector'
import type { GameBoardRenderer } from '@ui/GameBoardRenderer'
import type { SpeechBubble } from '@ui/SpeechBubble'
import { playDialogueLine } from '@ui/DialoguePlayer'
import { Lane, LANE_DISTANCE_COUNT } from '@entities/Lane'
import type { Card } from '@entities/Card'
import { pickEventForDoor, getEventDef, type EventId, type EventDefinition, type EventDialogueLine, type EventResourceSnapshot, type EventResourceSink } from '@data/Events'
import type { EventMinigameMoment } from '@data/CompanionLines'
import { getHandCardDef } from '@data/HandCards'
import { RECIPES } from '@data/Recipes'
import { RELIC_IDS, relicDrawWeight } from '@data/Relics'
import type { ResourceTrailSource } from '@/app/FeedbackTypes'

/** 이벤트 흐름이 런 상태·연출을 조작할 때 쓰는 주입 계약. */
export interface EventFlowDeps {
  gameState: GameState
  boardRenderer: GameBoardRenderer
  companion: CompanionSystem
  companionDirector: CompanionDirector
  turnManager: TurnManager
  cardSpawner: CardSpawner
  speechBubble: SpeechBubble
  eventDemonBubble: SpeechBubble
  /** 불빛/펄스 키 브리지 — index의 let 상태를 그대로 공유한다. */
  resources: { score: number; scorePulseKey: number }
  setInputLocked(locked: boolean): void
  render(): void
  wait(ms: number): Promise<void>
  recordNotice(message: string, kind: 'info' | 'hurt'): void
  resolveFullCandleGaugeEffects(source: ResourceTrailSource): Promise<void>
  /** 진행 중 체인/타임라인을 즉시 끊고 배너를 갱신한다(index 체인 소유). */
  cutActiveChain(): void
  /** 디버그 고정 이벤트 예약을 소비한다(있으면 반환 후 해제). */
  consumeDebugForcedEventId(): EventId | null
  compactAndRefillAllLanes(): boolean
  trackFieldEnemyEncounters(): void
  sweepFrontStarlights(): Promise<void>
}

export class EventFlowManager {
  constructor(private readonly deps: EventFlowDeps) {}

  /** index의 불빛 상태 브리지 — 원본 코드의 score 표기를 그대로 유지하기 위한 별칭. */
  private get res() { return this.deps.resources }

  async playEventDialogueLine(line: EventDialogueLine): Promise<void> {
    const bubble = line.speaker === 'player' ? this.deps.speechBubble : this.deps.eventDemonBubble
    const otherBubble = line.speaker === 'player' ? this.deps.eventDemonBubble : this.deps.speechBubble
    await playDialogueLine(bubble, otherBubble, line.text)
  }

  /** 이벤트 문 클릭 → 불빛/행동 없이 이벤트 진입(대사 → 선택 → 효과). 진입 동안 손패/칸
   *  선택을 잠그고, 선택 효과를 적용한 뒤 버튼→HUD 획득 블라스트를 쏘고 커튼을 열어 마무리한다.
   *  이벤트 진입은 런 턴을 올리지 않는다(상점처럼 막간 상호작용). */
  async handleEventDoorClick(lane: Lane, card: Card): Promise<void> {
    this.deps.setInputLocked(true)
    // 이벤트 진입 시 진행 중인 체인을 즉시 끊는다.
    this.deps.cutActiveChain()
    // 레일 안정화: 적 턴 없이 빈칸 낙하·전방 병합만 실행한다.
    // 꽃 성장·포자 감소·적 공격·상자 소멸 등 적 처리 로직은 건드리지 않는다.
    {
      let anyMoved = false
      let safety = LANE_DISTANCE_COUNT * 3 + 3
      while (safety-- > 0) {
        const moved = this.deps.gameState.compactLanes()
        if (!moved) break
        anyMoved = true
        this.deps.gameState.regroupAllRows()
        this.deps.turnManager.armFrontBombs()
        this.deps.render()
        await this.deps.wait(200)
      }
      if (anyMoved) {
        this.deps.gameState.regroupAllRows()
        this.deps.render()
        await this.deps.wait(340)
      }
    }
    // 디버그 커맨드로 고정 이벤트가 예약된 경우 그것을 사용하고, 아니면 랜덤 선택.
    const forcedId = this.deps.consumeDebugForcedEventId()
    const def = forcedId ? getEventDef(forcedId) : pickEventForDoor()
    const emberAvailable = this.deps.gameState.character.hand.some((h) => h.defId === 'ember')
    // 대사는 게임의 말풍선 시스템으로 출력한다. NPC 말풍선은 하단 배치/상단 꼬리로,
    // 클릭 시 타이핑 완료 또는 다음 줄 스킵이 가능하게 보스/플레이어 대사와 같은 촉감을 맞춘다.
    const playDialogue = async (lines: readonly EventDialogueLine[] = def.dialogue): Promise<void> => {
      for (const ln of lines) {
        // SKIP이 대사 도중 눌리면 다음 줄부터 건너뛴다(현재 줄은 클릭으로 넘긴다).
        if (this.deps.boardRenderer.wasEventIntroSkipped()) break
        await this.playEventDialogueLine(ln)
      }
      this.deps.speechBubble.dismiss()
      this.deps.eventDemonBubble.dismiss()
    }
    const consumeDoor = (): void => {
      // 문 소비: 레일에서 제거(불빛 미지급). 커튼 뒤에서 제거돼 빈칸 노출이 없다.
      lane.setCardAtDistance(0, null)
      this.deps.render()
    }
    // 한번 본 이벤트는 연출/대사를 SKIP 버튼으로 건너뛸 수 있다(unmelting. 접두사라 /리셋 대상).
    const seenKey = `unmelting.seen.event.${def.id}`
    const seenBefore = window.localStorage.getItem(seenKey) === '1'
    if (def.minigame) {
      // 미니게임형(미니언 저울/백작 가위바위보): 자원 스냅샷(시작값/상한)을 넘기고, 진행 중 각 액션은
      // 실시간 싱크로 실제 자원을 즉시 올리고 내린다(기존 HUD 트레일/카운터 피드백 재사용).
      const c = this.deps.gameState.character
      const snap: EventResourceSnapshot = {
        light: this.res.score, hand: c.hand.length, handMax: c.handMax,
        candle: c.candle, candleMax: c.candleMax,
        health: c.health, maxHealth: c.maxHealth, shield: c.shield,
        floor: this.deps.gameState.getCurrentTurn(),
      }
      const sink = this.makeEventResourceSink()
      // 에나의 미니게임 반응 — 결과가 찍히는 정확한 순간에 발화한다.
      // 잭팟/유물처럼 큰 순간은 확정, 잔잔한 승패는 절반 확률로 떠들지 않게 조절.
      const onMinigameMoment = (m: EventMinigameMoment): void => {
        const always = m === 'minion-jackpot' || m === 'rps-relic' || m === 'rps-streak'
        if (!always && Math.random() > 0.5) return
        this.deps.companionDirector.sayEnaBark(this.deps.companion.eventMinigameLine(m), { importance: BARK_IMPORTANCE.situation })
      }
      if (def.minigame.kind === 'minion-exchange') {
        await this.deps.boardRenderer.runMinionExchange(card.id, def, def.minigame, snap, sink, consumeDoor, playDialogue, onMinigameMoment, seenBefore)
      } else {
        await this.deps.boardRenderer.runCountRps(card.id, def, def.minigame, snap, sink, consumeDoor, playDialogue, onMinigameMoment, seenBefore)
      }
      // 미니게임 UI가 접혀 사라진 뒤(렌더러가 처리), 이벤트1처럼 마무리 대사 → 커튼 열기.
      // SKIP한 진입에서는 마무리 대사도 생략해 바로 레일로 복귀한다.
      if (!this.deps.boardRenderer.wasEventIntroSkipped()) await playDialogue(def.outro ?? [])
      window.localStorage.setItem(seenKey, '1')
      await this.deps.boardRenderer.closeEventEntry()
    } else {
      const { index, buttonRect } = await this.deps.boardRenderer.runEventEntry(card.id, def, emberAvailable, consumeDoor, playDialogue, seenBefore)
      // 불태우기(combat) 선택 시: 소비될 손패 불씨를 model 제거 전에 소각 연출.
      const choiceEffect = def.choices?.[index]?.effect
      if (choiceEffect?.kind === 'combat') {
        const burnIdx = this.deps.gameState.character.hand.findIndex((h) => h.defId === choiceEffect.consumeHand)
        if (burnIdx >= 0) await this.deps.boardRenderer.animateHandCardBurn(burnIdx)
      }
      // 선택 효과 적용 → HUD 갱신 → 눌린 버튼에서 해당 HUD로 획득 블라스트.
      const targets = this.applyEventChoice(def, index)
      this.deps.render()
      await this.deps.boardRenderer.playEventGainBlast(buttonRect, targets)
      await this.deps.boardRenderer.hideEventChoicesAfterSelection(index)
      // SKIP한 진입에서는 선택 후 마무리 대사도 생략한다(효과/블라스트는 그대로).
      if (!this.deps.boardRenderer.wasEventIntroSkipped()) await playDialogue(def.choices?.[index]?.afterDialogue ?? [])
      window.localStorage.setItem(seenKey, '1')
      // combat + 레시피 해금: 마무리 대사 직후 해금 카드 연출 → 도감으로 블라스트.
      if (choiceEffect?.kind === 'combat' && choiceEffect.unlocksRecipe) {
        const recipe = RECIPES.find((r) => r.id === choiceEffect.unlocksRecipe)
        if (recipe) {
          const ingredientText = Object.keys(recipe.ingredients)
            .map((id) => getHandCardDef(id as Parameters<typeof getHandCardDef>[0])?.name ?? id)
            .join(' + ')
          await this.deps.boardRenderer.animateEventRecipeUnlock(recipe.id, recipe.name, recipe.flavor, ingredientText)
        }
      }
      await this.deps.boardRenderer.closeEventEntry()
    }
    // 종료: 소비된 칸을 메우고 일반 진행으로 복귀한다.
    this.deps.compactAndRefillAllLanes()
    this.deps.gameState.regroupAllRows()
    this.deps.trackFieldEnemyEncounters()
    this.deps.turnManager.armFrontBombs()
    // 이벤트는 턴을 올리지 않으므로 포자·성장·시듦 틱은 건너뛴다.
    // 씨앗 개화는 위치 기반 트리거(전방 도달)이므로 이벤트 후에도 처리한다.
    const blooms = this.deps.turnManager.bloomFrontSeeds(this.deps.cardSpawner)
    // 리필로 새 이벤트 문이 전방에 도달했다면 일반 턴과 동일하게 즉시 카운트다운 뱃지를 띄운다.
    const startedEventDoors = this.deps.turnManager.startFrontEventDoorArrivals()
    this.deps.render()
    for (const t of startedEventDoors) this.deps.boardRenderer.popEventBadge(t.cardId)
    if (blooms.length > 0) await this.deps.boardRenderer.animateFlowerBlooms(blooms)
    // 90F 이전에 예약된 문(pendingEventDoor)은 최종 등반 레일에도 주입될 수 있어, 문 소비 후
    // 별빛이 전방으로 내려올 수 있다. 문 닫힘(만료)·정화 클러치 정리와 동일하게 즉시 수집까지
    // 마쳐야 별빛이 전방을 막은 채 다음 행동을 기다리는 교착을 막는다(별빛 없으면 no-op).
    await this.deps.sweepFrontStarlights()
    this.deps.setInputLocked(false)
  }

  /** 미니게임이 실시간으로 자원을 올리고 내릴 때 쓰는 싱크. 각 메서드는 실제 상태를 즉시 바꾸고
   *  기존 HUD 카운터 피드백 + 화면 갱신을 수행한다(버스트/트레일 연출은 렌더러가 쏜다). */
  makeEventResourceSink(): EventResourceSink {
    const c = this.deps.gameState.character
    return {
      gainLight: (amount: number) => {
        if (amount === 0) return
        this.res.score = Math.max(0, this.res.score + amount)
        this.res.scorePulseKey++
        if (amount >= 0) this.deps.boardRenderer.playScoreGainFeedback(this.res.score, this.res.scorePulseKey)
        else this.deps.boardRenderer.playScoreSpendFeedback(this.res.score, this.res.scorePulseKey)
        this.deps.render()
      },
      changeHealth: (amount: number) => {
        if (amount === 0) return
        // 방패/피해 유물 부수효과를 피하려 이벤트 거래 HP는 직접 클램프한다.
        c.health = Math.max(1, Math.min(c.maxHealth, c.health + amount))
        this.deps.boardRenderer.playHudCounterFeedback('health', c.health)
        this.deps.render()
      },
      gainCandle: (amount: number) => {
        if (amount === 0) return
        if (amount > 0) c.gainCandle(amount)
        else c.candle = Math.max(0, c.candle + amount)
        this.deps.boardRenderer.playHudCounterFeedback('candle', c.candle)
        if (amount > 0 && c.isCandleFull()) void this.deps.resolveFullCandleGaugeEffects({ kind: 'center' })
        this.deps.render()
      },
      gainShield: (amount: number) => {
        if (amount <= 0) return
        c.addShield(amount)
        this.deps.boardRenderer.playHudCounterFeedback('shield', c.shield)
        this.deps.render()
      },
      spendShield: (amount: number) => {
        if (amount <= 0) return
        c.shield = Math.max(0, c.shield - amount)
        this.deps.boardRenderer.playHudCounterFeedback('shield', c.shield)
        this.deps.render()
      },
      sellHand: (count: number) => {
        // 판 손패는 오래된 것(앞쪽)부터 제거한다.
        for (let i = 0; i < count && c.hand.length > 0; i += 1) c.removeHandCardAt(0)
        this.deps.render()
      },
      buyHand: (count: number) => {
        for (let i = 0; i < count; i += 1) HandSystem.enqueueDrop(c, DropSystem.generateDrop())
        this.deps.render()
      },
      grantRelic: () => { this.grantRandomRelicReward(); this.deps.render() },
    }
  }

  /** 등급 가중치로 미보유 유물 1개를 지급한다(백작 완승 보상 등). 성공 시 true. */
  grantRandomRelicReward(): boolean {
    const c = this.deps.gameState.character
    const pool = RELIC_IDS.filter((id) => !c.hasRelic(id) && !c.bannedRelics.includes(id))
    if (pool.length === 0) return false
    const weighted = pool.flatMap((id) => Array.from({ length: relicDrawWeight(id) }, () => id))
    const relicId = weighted[Math.floor(Math.random() * weighted.length)] ?? pool[0]
    return c.addRelic(relicId)
  }

  /** 이벤트 선택 효과를 게임 상태에 적용하고, 획득 블라스트를 쏠 HUD 타깃 목록을 돌려준다. */
  applyEventChoice(def: EventDefinition, index: number): string[] {
    const character = this.deps.gameState.character
    const choice = def.choices?.[index]
    if (!choice) return []
    const effect = choice.effect
    if (effect.kind === 'stat') {
      const targets: string[] = []
      if (effect.maxHealth) {
        if (effect.maxHealth < 0) character.spendMaxHealth(-effect.maxHealth)
        else character.increaseMaxHealth(effect.maxHealth)
        targets.push('health')
      }
      if (effect.damage) {
        character.applyDamageBoost(effect.damage)
        targets.push('attack')
      }
      this.deps.recordNotice(`이벤트: ${choice.label} 선택`, 'info')
      return targets
    }
    if (effect.kind === 'randomHand') {
      let added = 0
      for (const drop of DropSystem.generateDrops(effect.count)) {
        // enqueueDrop = 획득 공통 정리 — 이벤트 보상도 3장째면 즉시 트리플로 합성한다.
        if (HandSystem.enqueueDrop(character, drop)) added++
      }
      this.deps.recordNotice(`이벤트: ${choice.label} — 랜덤 손패 +${added}`, 'info')
      return ['hand']
    }
    // combat: 손패 불씨를 소모하고 레시피를 해금한다.
    const idx = character.hand.findIndex((h) => h.defId === effect.consumeHand)
    if (idx >= 0) character.removeHandCardAt(idx)
    if (effect.unlocksRecipe) {
      this.deps.gameState.unlockedRecipeIds.add(effect.unlocksRecipe)
      // 도감 레시피 잠금 상태도 즉시 동기화한다.
      this.deps.boardRenderer.setLockedRecipeIds(
        RECIPES.filter((r) => r.runLocked && !this.deps.gameState.unlockedRecipeIds.has(r.id)).map((r) => r.id)
      )
    }
    this.deps.recordNotice(`이벤트: 불태우기 — ${effect.unlocksRecipe ? '레시피 해금됨' : '위험한 기운이 깨어난다'}`, 'hurt')
    return []
  }
}
