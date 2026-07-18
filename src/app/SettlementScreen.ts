/**
 * SettlementScreen — 정산(온보딩 클리어/100F 클리어/사망) 오버레이 매니저.
 * 세 결말이 같은 골격(판정 헤드라인/스탯/에나 육각형/통산 기록)을 공유한다.
 * 런 상태 읽기와 재시작 동작은 deps로 주입받는다(상태 소유는 index.ts).
 */

import { GameState } from '@core/GameState'
import { GameBoardRenderer } from '@ui/GameBoardRenderer'
import { CompanionSystem } from '@systems/CompanionSystem'
import type { LifetimeRecordStore } from '@core/LifetimeRecord'

/** 정산 오버레이 한 장의 재료 — 세 결말이 같은 골격을 공유한다. */
export interface SettlementOverlayOptions {
  verdict: 'melting' | 'unmelting'
  sub: string
  /** 사망 전용 '다음에 주의' 한 줄 팁. */
  tip?: string
  statRows: { label: string; value: number }[]
  enaLine: string
  buttonLabel: string
  onButton: () => void
  /** 사망 톤 보정용 추가 카드 클래스. */
  cardClass?: string
}

export interface SettlementScreenDeps {
  gameState: GameState
  boardRenderer: GameBoardRenderer
  companion: CompanionSystem
  lifetimeRecordStore: LifetimeRecordStore
  getScore(): number
  /** 런 시작 시점 경험 축 값 — 정산 육각형의 이전 위치 표시용. */
  getRunStartAxisValues(): number[] | null
  wasRunEnteredFromLobby(): boolean
  /** 통산 기록 런당 1회 합산 가드 — 처음 호출이면 마킹 후 true, 이미 합산했으면 false. */
  tryMarkLifetimeRecorded(): boolean
  enterHearth(): void
  startGame(): Promise<void>
}

export class SettlementScreen {
  constructor(private readonly deps: SettlementScreenDeps) {}

  /** 판정 헤드라인/스탯/에나 육각형/시작 버튼 + 우측 하단 통산 기록을 한 골격으로 렌더한다. */
  openSettlementOverlay(o: SettlementOverlayOptions): void {
    const { boardRenderer, companion, lifetimeRecordStore } = this.deps
    const lifetime = lifetimeRecordStore.load()
    const overlay = document.createElement('div')
    overlay.className = 'game-over-overlay is-clear'
    overlay.innerHTML = `
    <div class="game-over-card settlement-card${o.cardClass ? ` ${o.cardClass}` : ''}">
      <h1 class="verdict-word verdict-${o.verdict}">${o.verdict === 'unmelting' ? 'Unmelting' : 'Melting'}</h1>
      <p class="verdict-sub">${o.sub}</p>
      ${o.tip ? `<p class="death-tip">${o.tip}</p>` : ''}
      <div class="settlement-body">
        <div class="settlement-stats">
          ${o.statRows.map((row) => `<p>${row.label} <strong>${row.value}</strong></p>`).join('')}
        </div>
        <div class="settlement-ena-panel">
          <p class="settlement-ena">${o.enaLine}</p>
          ${boardRenderer.renderSettlementHexagon(companion.getDisposition(), companion.getLearningSnapshot(), companion.getGrowth(), this.deps.getRunStartAxisValues() ?? undefined)}
        </div>
      </div>
      <button class="primary-btn" id="settlement-continue-btn">${o.buttonLabel}</button>
    </div>
    <aside class="settlement-lifetime" aria-label="통산 기록">
      <span class="settlement-lifetime-main">통산 ${lifetime.totalRuns}회 모험 · 클리어 ${lifetime.clears} · 최고 ${lifetime.bestFloor}층</span>
      <span class="settlement-lifetime-sub">처치 ${lifetime.totalKills} · 함정 ${lifetime.totalTraps} · 보물 ${lifetime.totalTreasures} · 불빛 ${lifetime.totalLight}</span>
    </aside>
  `
    document.body.appendChild(overlay)
    document.getElementById('settlement-continue-btn')?.addEventListener('click', () => {
      overlay.remove()
      o.onButton()
    })
  }

  /** 게임오버 사유별 정산 분기 — 통산 기록 합산은 런당 1회만. */
  showGameOver(): void {
    const { gameState, lifetimeRecordStore, companion } = this.deps
    // 통산 기록에 이번 런을 1회 합산한다(클리어/사망 공통) — 정산 우측 하단 표기의 원천.
    if (this.deps.tryMarkLifetimeRecorded()) {
      const cleared = gameState.gameOverReason === 'onboarding_clear_30' || gameState.gameOverReason === 'run_clear_100_turns'
      lifetimeRecordStore.recordRun({
        outcome: cleared ? 'clear' : 'death',
        floor: gameState.getCurrentTurn(),
        kills: gameState.runDefeatedEnemies,
        traps: gameState.runClearedTraps,
        treasures: gameState.runOpenedTreasures,
        light: this.deps.getScore(),
      })
    }

    const runStats = [
      { label: '처치한 적', value: gameState.runDefeatedEnemies },
      { label: '처리한 함정', value: gameState.runClearedTraps },
      { label: '발견한 보물', value: gameState.runOpenedTreasures },
      { label: '총 불빛', value: this.deps.getScore() },
    ]
    const fromLobby = this.deps.wasRunEnteredFromLobby()
    // 새로고침 대신 startGame()/거점으로 초기화한다. startGame이 카드/드롭/도감 잠금까지
    // 메타 기준으로 되돌려 새로고침과 같은 완전 초기화를 만든다.
    const continueRun = (): void => {
      if (fromLobby) this.deps.enterHearth()
      else void this.deps.startGame()
    }

    // 새싹 병아리 30F 클리어는 저택 복귀로만 닫는다.
    if (gameState.gameOverReason === 'onboarding_clear_30') {
      this.openSettlementOverlay({
        verdict: 'unmelting',
        sub: '새싹 병아리 클리어!',
        statRows: runStats,
        enaLine: '에나의 경험이 한 뼘 자랐다.',
        buttonLabel: '저택으로',
        onButton: () => this.deps.enterHearth(),
      })
      return
    }

    // 100층 클리어(테스트 플레이/정규 공통). 셔터는 내려온 채 검은 블러가 조용히 덮는다.
    if (gameState.gameOverReason === 'run_clear_100_turns') {
      this.openSettlementOverlay({
        verdict: 'unmelting',
        sub: '잿빛 굴레를 풀었다 — 100층 클리어!',
        statRows: runStats,
        enaLine: '에나와 끝까지 함께 올랐다.',
        buttonLabel: fromLobby ? '저택으로' : '다시 시작',
        onButton: continueRun,
      })
      return
    }

    // 사망: 왜 죽었는지(부제) · '다음에 주의' 팁 · 도달 층 스탯 · 에나의 아쉬움 한마디.
    const isTrap = gameState.gameOverReason === 'instant_death_trap'
    this.openSettlementOverlay({
      verdict: 'melting',
      sub: gameState.gameOverReason === 'character_defeated'
        ? '소녀의 심지가 꺼졌어요…'
        : isTrap
          ? '모든 길이 함정으로 막혔어요.'
          : '게임 종료',
      tip: isTrap
        ? '3칸으로 합쳐진 거미줄·함정은 즉사. 키틴으로 미리 청소하거나 합쳐지기 전에 처리하자.'
        : '체력이 0이 되면 끝. 촛농(회복)·양초(방패)로 피해를 미리 막고, 강적은 합체 전에 끊자.',
      statRows: [{ label: '도달 층', value: gameState.getCurrentTurn() }, ...runStats],
      enaLine: companion.deathLine(),
      buttonLabel: fromLobby ? '저택으로' : '다시 시작',
      onButton: continueRun,
      cardClass: 'death-card',
    })
  }
}
