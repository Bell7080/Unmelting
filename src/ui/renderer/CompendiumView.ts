/**
 * CompendiumView — 도감 오버레이 서브뷰(적/함정/보물/꽃/카드팩/유물/손패/조합/용어 탭).
 * GameBoardRenderer에서 표시 책임만 옮겨 왔다 — 렌더 상태의 단일 출처는 host다.
 */

import type { GameBoardRenderer } from '@ui/GameBoardRenderer'
import { flowerDisplayName, type FlowerKind } from '@entities/Card'
import type { HandCardId } from '@entities/HandCard'
import { ENEMY_DEFINITIONS, MIMIC_BY_SPAN } from '@systems/CardSpawner'
import { HAND_CARD_DEFINITIONS, HAND_CARD_IDS } from '@data/HandCards'
import { RELIC_DEFINITIONS } from '@data/Relics'
import { HAND_CARD_RARITY, RARITY_CLASS_BY_TIER, SHOP_PACK_LABELS, SHOP_PACK_POOLS, type CardRarity } from '@data/ShopPools'
import { RECIPES } from '@data/Recipes'
import { spriteForHandCard, spriteForRelic, spriteForBasicPackItem, SpriteUrls } from '@ui/Sprites'
import {
  bookIcon,
  candleIcon,
  comboGaugeIcon,
  flameIcon,
  handCardIcon,
  heartIcon,
  shieldIcon,
  sparkleIcon,
  swordIcon,
  trapIcon,
} from '@ui/Icons'
import type { ShopPackKind } from '@ui/renderer/RendererTypes'

export class CompendiumView {
  constructor(private readonly host: GameBoardRenderer) {}

  /** Open the compendium overlay listing every field-card + hand-card def
   *  with stats and descriptions. Pure read-only browser; pressing the
   *  close button or ESC dismisses. */
  openCompendium(): void {
    let host = document.getElementById('compendium-overlay') as HTMLElement | null
    if (!host) {
      host = document.createElement('div')
      host.id = 'compendium-overlay'
      host.className = 'compendium-overlay'
      document.body.appendChild(host)
      host.addEventListener('click', (e) => {
        const t = e.target as HTMLElement
        if (t.dataset.compendiumClose !== undefined || t === host) {
          this.closeCompendium()
        }
        if (t.dataset.compendiumTab) {
          this.switchCompendiumTab(t.dataset.compendiumTab)
        }
      })
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && host?.classList.contains('is-open')) {
          this.closeCompendium()
        }
      })
    }
    host.innerHTML = this.renderCompendium('enemies')
    this.attachCompendiumRecipeFloat(host)
    host.classList.add('is-open')
  }

  private closeCompendium(): void {
    document.querySelectorAll('.compendium-recipe-float').forEach((el) => el.remove())
    document.getElementById('compendium-overlay')?.classList.remove('is-open')
  }

  private switchCompendiumTab(tab: string): void {
    const host = document.getElementById('compendium-overlay')
    if (!host) return
    document.querySelectorAll('.compendium-recipe-float').forEach((el) => el.remove())
    host.innerHTML = this.renderCompendium(tab)
    this.attachCompendiumRecipeFloat(host)
  }

  private renderCompendium(activeTab: string): string {
    const tabs: { id: string; label: string }[] = [
      { id: 'enemies', label: '적' },
      { id: 'traps', label: '함정' },
      { id: 'treasures', label: '보물' },
      { id: 'flowers', label: '꽃' },
      { id: 'packs', label: '카드팩' },
      { id: 'relics', label: '유물' },
      { id: 'hand', label: '손패' },
      { id: 'combo', label: '조합' },
      { id: 'terms', label: '용어' },
    ]
    const tabBar = tabs
      .map(
        (t) =>
          `<button class="compendium-tab ${t.id === activeTab ? 'is-active' : ''}" data-compendium-tab="${t.id}">${t.label}</button>`
      )
      .join('')
    let body = ''
    if (activeTab === 'enemies') body = this.renderCompendiumEnemies()
    else if (activeTab === 'traps') body = this.renderCompendiumTraps()
    else if (activeTab === 'treasures') body = this.renderCompendiumTreasures()
    else if (activeTab === 'flowers') body = this.renderCompendiumFlowers()
    else if (activeTab === 'hand') body = this.renderCompendiumHand()
    else if (activeTab === 'combo') body = this.renderCompendiumCombo()
    else if (activeTab === 'packs') body = this.renderCompendiumPacks()
    else if (activeTab === 'relics') body = this.renderCompendiumRelics()
    else body = this.renderCompendiumTerms()
    return `
      <div class="compendium-modal" role="dialog" aria-label="도감">
        <header class="compendium-header">
          <h2 class="compendium-title">
            <span class="compendium-title-icon">${bookIcon()}</span>
            도감
          </h2>
          <button class="compendium-close" data-compendium-close type="button" aria-label="닫기">✕</button>
        </header>
        <nav class="compendium-tabs" role="tablist">${tabBar}</nav>
        <section class="compendium-body" role="tabpanel">${body}</section>
        <footer class="compendium-footer">ESC 또는 바깥 클릭으로 닫기</footer>
      </div>
    `
  }

  private renderCompendiumEnemies(): string {
    const heart = heartIcon()
    const sword = swordIcon()
    const encountered = this.host.getGameState()?.encounteredEnemyNames ?? new Set<string>()

    // 개별 적 타일: 만난 적은 정상 표시, 미발견은 어둡게 처리.
    const enemyTile = (def: (typeof ENEMY_DEFINITIONS)[0]) => {
      const hp = def.healthOrDamage ?? 1
      const atk = def.attack ?? 1
      const spriteUrl = def.enemySpriteId ? SpriteUrls[def.enemySpriteId] : SpriteUrls.enemyMouse
      const known = encountered.has(def.name)
      return this.host.faces.codexTile({
        art: { kind: 'sprite', url: spriteUrl },
        name: known ? def.name : '???',
        tag: '1칸',
        chips: known
          ? [{ icon: heart, value: String(hp), tone: 'hp' }, { icon: sword, value: String(atk), tone: 'atk' }]
          : [],
        extraClass: known ? undefined : 'codex-tile--unknown',
      })
    }
    // 온보딩 축약형(바위)은 파일 번호와 무관하게 도감 최상단에 먼저 노출한다.
    const orderedEnemies = [
      ...ENEMY_DEFINITIONS.filter((d) => d.enemySpriteId === 'enemyRock'),
      ...ENEMY_DEFINITIONS.filter((d) => d.enemySpriteId !== 'enemyRock'),
    ]
    const allEnemyTiles = orderedEnemies.map(enemyTile).join('')

    // 합쳐진 적: 해당 이름이 encounteredEnemyNames에 있으면 표시.
    const formationTile = (span: 2 | 3, name: string, sprite: string) => {
      const bonus = span === 2 ? 2 : 3
      const known = encountered.has(name)
      return this.host.faces.codexTile({
        art: { kind: 'sprite', url: sprite },
        name: known ? name : '???',
        tag: `${span}칸`,
        chips: known
          ? [{ icon: heart, value: `합산 +${bonus}`, tone: 'hp' }, { icon: sword, value: `합산 +${bonus}`, tone: 'atk' }]
          : [],
        note: known ? `구성원 HP/ATK 합 +${bonus}/${bonus}.` : undefined,
        extraClass: known ? undefined : 'codex-tile--unknown',
      })
    }
    const mergeTwo = formationTile(2, '양초 무리', SpriteUrls.enemyWaves[2])
    const mergeThree = formationTile(3, '양초 군단', SpriteUrls.enemyWaves[3])

    // 미믹: 3가지 크기를 각각 독립 타일로.
    const mimicTiles = ([1, 2, 3] as const).map((span) => {
      const stats = MIMIC_BY_SPAN[span]
      const known = encountered.has('미믹')
      return this.host.faces.codexTile({
        art: { kind: 'sprite', url: SpriteUrls.mimic },
        name: known ? '미믹' : '???',
        tag: `${span}칸`,
        chips: known
          ? [
              { icon: heart, value: String(stats.health), tone: 'hp' },
              { icon: sword, value: String(stats.attack), tone: 'atk' },
              { label: '드롭 ', value: `${stats.drops}장`, tone: 'gold' },
            ]
          : [],
        note: known && span === 1 ? '보물상자가 변이된 특수 적.' : undefined,
        extraClass: known ? undefined : 'codex-tile--unknown',
      })
    }).join('')

    // 괴물꽃 (꽃 탭에서 이동).
    const monsterFlowerKnown = encountered.has('괴물꽃')
    const monsterFlowerTile = this.host.faces.codexTile({
      art: { kind: 'sprite', url: SpriteUrls.monsterFlower },
      name: monsterFlowerKnown ? '괴물꽃' : '???',
      tag: '특수 적',
      chips: monsterFlowerKnown
        ? [{ icon: heart, value: '꽃 수확값', tone: 'hp' }, { icon: sword, value: '꽃 수확값', tone: 'atk' }]
        : [],
      note: monsterFlowerKnown ? '꽃이 시들면 변이. 괴물꽃끼리만 병합.' : undefined,
      extraClass: monsterFlowerKnown ? undefined : 'codex-tile--unknown',
    })

    // 보스: 층별로 별도 타일을 유지해 처치/조우 진행도가 더 잘 읽히게 한다.
    const bossTile = (name: string, sprite: string, floor: string, hp: string, atk: string, note: string) => {
      const known = encountered.has(name)
      return this.host.faces.codexTile({
        art: { kind: 'sprite', url: sprite },
        name: known ? name : '???',
        tag: `${floor} 보스`,
        chips: known
          ? [{ icon: heart, value: hp, tone: 'hp' }, { icon: sword, value: atk, tone: 'atk' }]
          : [],
        note: known ? note : undefined,
        extraClass: known ? undefined : 'codex-tile--unknown',
      })
    }
    const bossTiles = [
      bossTile('양초 백작', SpriteUrls.boss, '30F', '50', '5', '30턴 제단 수문장. 3×3 보스.'),
      bossTile('불씨 기사단장', SpriteUrls.boss60, '60F', '80', '7', '저택의 방패. 3턴마다 기사단장의 손패 2장 발동.'),
      bossTile('밀랍 조각사', SpriteUrls.boss90, '90F', '60', '4', '90턴 제단 보스. 3턴마다 후방 이동과 소환 페이즈 사용.'),
    ].join('')

    return `
      <h3 class="compendium-section">적</h3>
      <div class="codex-tile-grid">${allEnemyTiles}</div>
      <h3 class="compendium-section">합쳐진 적</h3>
      <div class="codex-tile-grid">${mergeTwo}${mergeThree}</div>
      <h3 class="compendium-section">특수 적</h3>
      <div class="codex-tile-grid">${mimicTiles}${monsterFlowerTile}</div>
      <h3 class="compendium-section">보스</h3>
      <div class="codex-tile-grid">${bossTiles}</div>
    `
  }

  private renderCompendiumTraps(): string {
    // 함정 피해는 검이 아니라 함정(이빨) 아이콘이다 — 카드 face와 같은 어휘를 쓴다.
    const sword = trapIcon()
    const seen = this.host.getGameState()?.encounteredCardNames ?? new Set<string>()

    const webNames: Record<1 | 2 | 3, string> = { 1: '양초 거미줄', 2: '촛농 거미집', 3: '밀랍 거미굴' }
    const webDamage: Record<1 | 2 | 3, string> = { 1: '1', 2: '5', 3: '999' }
    const webTiles = ([1, 2, 3] as const)
      .map((span) => {
        const known = seen.has(webNames[span])
        return this.host.faces.codexTile({
          art: { kind: 'sprite', url: SpriteUrls.trapGroups.web[span] },
          name: known ? webNames[span] : '???',
          tag: `${span}칸`,
          chips: known ? [{ icon: sword, value: webDamage[span], tone: 'atk' }] : [],
          extraClass: known ? undefined : 'codex-tile--unknown',
        })
      })
      .join('')

    const sporeNames: Record<1 | 2 | 3, string> = { 1: '감염 포자', 2: '번식 포자군', 3: '포자 군락' }
    const sporeDamage: Record<1 | 2 | 3, string> = { 1: '1', 2: '3', 3: '5' }
    const sporeTiles = ([1, 2, 3] as const)
      .map((span) => {
        const known = seen.has(sporeNames[span])
        return this.host.faces.codexTile({
          art: { kind: 'sprite', url: SpriteUrls.trapGroups.spore[span] },
          name: known ? sporeNames[span] : '???',
          tag: `${span}칸`,
          chips: known
            ? [
                { icon: sword, value: sporeDamage[span], tone: 'atk' },
                { label: '전염 ', value: '2턴마다', tone: 'spore' },
              ]
            : [],
          extraClass: known ? undefined : 'codex-tile--unknown',
        })
      })
      .join('')

    const bombKnown = seen.has('양초 폭탄')
    const bombTile = this.host.faces.codexTile({
      art: { kind: 'sprite', url: SpriteUrls.traps.bomb },
      name: bombKnown ? '양초 폭탄' : '???',
      tag: '1칸',
      chips: bombKnown
        ? [
            { icon: sword, value: '5', tone: 'bomb' },
            { label: '점화 ', value: '1턴', tone: 'bomb' },
          ]
        : [],
      note: bombKnown ? '전방 도착 시 점화, 다음 턴 폭발. 인접 적도 피해.' : undefined,
      extraClass: bombKnown ? undefined : 'codex-tile--unknown',
    })

    // 온보딩 축약형 덤불을 함정 탭 최상단에 노출한다. (1/2/3칸 = 피해 1/2/3, 합체명은 추후 배선)
    const bushDamage: Record<1 | 2 | 3, string> = { 1: '1', 2: '2', 3: '3' }
    const bushTiles = ([1, 2, 3] as const)
      .map((span) => {
        const known = seen.has('덤불')
        return this.host.faces.codexTile({
          art: { kind: 'sprite', url: SpriteUrls.trapGroups.bush[span] },
          name: known ? '덤불' : '???',
          tag: `${span}칸`,
          chips: known ? [{ icon: sword, value: bushDamage[span], tone: 'atk' }] : [],
          note: known && span === 1 ? '닿으면 소량 피해만 주는 소프트 함정. 온보딩 축약형.' : undefined,
          extraClass: known ? undefined : 'codex-tile--unknown',
        })
      })
      .join('')

    return `
      <h3 class="compendium-section">덤불</h3>
      <div class="codex-tile-grid">${bushTiles}</div>
      <h3 class="compendium-section">거미줄</h3>
      <div class="codex-tile-grid">${webTiles}</div>
      <h3 class="compendium-section">폭탄</h3>
      <div class="codex-tile-grid">${bombTile}</div>
      <h3 class="compendium-section">포자</h3>
      <div class="codex-tile-grid">${sporeTiles}</div>
    `
  }

  private renderCompendiumTreasures(): string {
    const seen = this.host.getGameState()?.encounteredCardNames ?? new Set<string>()
    const char = this.host.getGameState()?.getCharacter()
    // 개봉식 유물 보유 시 사라짐 50→40%, 미믹화 10% 고정.
    const hasCeremony = char?.relics.includes('opening-ceremony') ?? false
    const disappearPct = hasCeremony ? 40 : 50
    const mimicPct = 10

    // 일반 상자: 1칸 1~2, 2칸 2~4, 3칸 3~6장 범위 랜덤 드롭. 50% 사라짐 + 10% 미믹화.
    const CHEST_RANGES:  [number, number][] = [[1,2],[2,4],[3,6]]
    const chestSpec: Array<{ span: 1 | 2 | 3; name: string; sprite: string }> = [
      { span: 1, name: '작은 상자',  sprite: SpriteUrls.chestSmall  },
      { span: 2, name: '적당한 상자', sprite: SpriteUrls.chestMedium },
      { span: 3, name: '큰 상자',    sprite: SpriteUrls.chestLarge  },
    ]
    const normalTiles = chestSpec
      .map((c) => {
        const known = seen.has(c.name)
        const [rMin, rMax] = CHEST_RANGES[c.span - 1]
        return this.host.faces.codexTile({
          art: { kind: 'sprite', url: c.sprite },
          name: known ? c.name : '???',
          tag: `${c.span}칸`,
          chips: known
            ? [
                { label: '드롭 ', value: `손패 ${rMin}~${rMax}장`, tone: 'gold' },
                { label: '사라짐 ', value: `${disappearPct}%`, tone: 'plain' },
                { label: '미믹화 ', value: `${mimicPct}%`, tone: 'spore' },
              ]
            : [],
          extraClass: known ? undefined : 'codex-tile--unknown',
        })
      })
      .join('')

    // 황금 상자: 1칸 2~3, 2칸 4~6, 3칸 6~9장 범위 랜덤 드롭. 50% 사라짐, 미믹화 없음.
    const GOLDEN_RANGES: [number, number][] = [[2,3],[4,6],[6,9]]
    const goldenSpec: Array<{ span: 1 | 2 | 3; name: string }> = [
      { span: 1, name: '황금 상자'       },
      { span: 2, name: '적당한 황금 상자' },
      { span: 3, name: '대형 황금 상자'   },
    ]
    const goldenTiles = goldenSpec
      .map((c) => {
        const known = seen.has(c.name)
        const [gMin, gMax] = GOLDEN_RANGES[c.span - 1]
        return this.host.faces.codexTile({
          art: { kind: 'sprite', url: SpriteUrls.chestGolden },
          name: known ? c.name : '???',
          tag: `${c.span}칸`,
          chips: known
            ? [
                { label: '드롭 ', value: `손패 ${gMin}~${gMax}장`, tone: 'gold' },
                { label: '사라짐 ', value: '50%', tone: 'plain' },
                { label: '불빛 ', value: '×2', tone: 'gold' },
              ]
            : [],
          extraClass: known ? 'codex-tile--golden' : 'codex-tile--unknown',
        })
      })
      .join('')

    const goldenKeyNote = char?.relics.includes('golden-key')
      ? '황금 열쇠 유물 보유 중 · 보물상자의 10%가 황금 상자로 교체. 미믹화 없음.'
      : '황금 열쇠 유물 보유 시 등장. 미믹화 없음.'

    // 온보딩 축약형 잡동사니를 보물 탭 최상단에 노출한다. (1/2/3칸 = 손패 0~1/1~2/2~3장)
    const junkRanges: Record<1 | 2 | 3, string> = { 1: '0~1', 2: '1~2', 3: '2~3' }
    const junkTiles = ([1, 2, 3] as const)
      .map((span) => {
        const known = seen.has('잡동사니')
        return this.host.faces.codexTile({
          art: { kind: 'sprite', url: SpriteUrls.junkGroups[span] },
          name: known ? '잡동사니' : '???',
          tag: `${span}칸`,
          chips: known ? [{ label: '드롭 ', value: `손패 ${junkRanges[span]}장`, tone: 'gold' }] : [],
          note: known && span === 1 ? '까면 손패를 주는 무해한 필러. 온보딩 축약형.' : undefined,
          extraClass: known ? undefined : 'codex-tile--unknown',
        })
      })
      .join('')

    return `
      <h3 class="compendium-section">잡동사니</h3>
      <div class="codex-tile-grid">${junkTiles}</div>
      <h3 class="compendium-section">일반 상자</h3>
      <div class="codex-tile-grid">${normalTiles}</div>
      <h3 class="compendium-section">황금 상자</h3>
      <p class="compendium-section-blurb">${goldenKeyNote}</p>
      <div class="codex-tile-grid">${goldenTiles}</div>
    `
  }

  private renderCompendiumFlowers(): string {
    const seen = this.host.getGameState()?.encounteredCardNames ?? new Set<string>()

    type Spec = { kind: FlowerKind; growth: string }
    // 수확물 표기(아이콘·이름·톤)는 CardFaceRenderer.flowerHarvestMeta 단일 출처를 쓴다 —
    // 카드 face와 도감이 다른 것을 말하면 "이 꽃이 뭘 주는가"가 두 값으로 갈린다.
    const specs: Spec[] = [
      { kind: 'chamomile', growth: '턴마다 +1'  },
      { kind: 'redRose',   growth: '턴마다 +1'  },
      { kind: 'marigold',  growth: '2턴마다 +1' },
      { kind: 'oleander',  growth: '턴마다 +1'  },
      { kind: 'lavender',  growth: '턴마다 +1'  },
    ]

    const seedKnown = seen.has(flowerDisplayName('seed'))
    const seedTile = this.host.faces.codexTile({
      art: { kind: 'sprite', url: SpriteUrls.flowers.seed },
      name: seedKnown ? flowerDisplayName('seed') : '???',
      tag: '씨앗',
      chips: seedKnown ? [{ label: '발화 ', value: '5종 중 랜덤', tone: 'flower' }] : [],
      note: seedKnown ? '대기 라인에서만 등장. 전방 도착 시 꽃으로 발화.' : undefined,
      extraClass: seedKnown ? undefined : 'codex-tile--unknown',
    })

    const flowerTiles = specs
      .map((s) => {
        const name = flowerDisplayName(s.kind)
        const known = seen.has(name)
        return this.host.faces.codexTile({
          art: { kind: 'sprite', url: SpriteUrls.flowers[s.kind] },
          name: known ? name : '???',
          tag: '버프칸',
          chips: known
            ? [
                {
                  icon: this.host.faces.flowerHarvestMeta(s.kind).icon,
                  label: '수확 ',
                  value: this.host.faces.flowerHarvestMeta(s.kind).label,
                  tone: this.host.faces.flowerHarvestMeta(s.kind).tone,
                },
                { label: '성장 ', value: s.growth, tone: 'plain' },
              ]
            : [],
          extraClass: known ? undefined : 'codex-tile--unknown',
        })
      })
      .join('')

    return `
      <h3 class="compendium-section">씨앗</h3>
      <div class="codex-tile-grid">${seedTile}</div>
      <h3 class="compendium-section">꽃</h3>
      <div class="codex-tile-grid">${flowerTiles}</div>
    `
  }

  private renderCompendiumHand(): string {
    // 보스 전용 찌꺼기 카드(탐욕의 동전)는 플레이어 덱 카드가 아니므로 손패 도감에서 숨긴다.
    const tiles = HAND_CARD_IDS.filter((id) => HAND_CARD_DEFINITIONS[id].dropSource !== 'boss').map((id) => {
      const def = HAND_CARD_DEFINITIONS[id]
      const locked = this.host.getLockedCardIds().has(id)
      // ATK 연동 카드: <br>만 · 로 치환, desc-dyn span은 유지해 Shift 토글이 도감에서도 동작.
      // 나머지 카드: <br>→· 후 HTML 태그 전부 제거한 평문 사용.
      const chipDesc = (desc: string) => desc.replace(/<br>/g, ' · ').replace(/<[^>]*>/g, '')
      const chipDescAtk = (desc: string) => desc.replace(/<br>/g, ' · ')
      const ATK_CARDS: ReadonlySet<HandCardId> = new Set([
        'ember', 'sacrifice-candle', 'levatein', 'firework', 'fire-arrow',
        'chandelier', 'bonfire', 'teapot', 'slash', 'candle-tome', 'sword-and-shield',
        'needle', 'guillotine', // 제물 축 ATK 카드 — 자해 표기 뒤 피해가 desc-dyn 수식 전환을 쓴다
        'book-of-flames', // 피해/성장 줄 모두 desc-dyn 수식 전환을 쓰므로 span 보존 필요
      ])
      const toChip = ATK_CARDS.has(def.id) ? chipDescAtk : chipDesc
      const singleDesc = toChip(this.host.faces.enhancedHandCardDescription(def.id, false))
      const tripleDesc = toChip(this.host.faces.enhancedHandCardDescription(def.id, true))
      return this.host.faces.codexTile({
        art: { kind: 'sprite', url: spriteForHandCard(def.id) },
        name: locked ? '???' : def.name,
        tags: locked ? ['잠김'] : this.host.faces.handCardTagLabels(def.id),
        rarityClass: RARITY_CLASS_BY_TIER[HAND_CARD_RARITY[id]],
        chips: locked ? [] : [
          { label: '', value: singleDesc, tone: 'plain' },
          { label: '★ ', value: tripleDesc, tone: 'plain' },
        ],
        extraClass: locked ? 'codex-tile--unknown' : 'codex-tile--hand',
      })
    })
    return `
      <h3 class="compendium-section">손패 카드</h3>
      <div class="codex-tile-grid">${tiles.join('')}</div>
    `
  }

  /** Pack tab: 손패/유물 탭과 같은 codexTile 그리드 양식으로 팩별 등장 항목을 보여준다.
   *  상점/제단 방문 전에는 해당 팩 섹션이 ???로 마스킹된다. */
  private renderCompendiumPacks(): string {
    const seenPacks = this.host.getGameState()?.encounteredPackKinds ?? new Set<string>()
    const rarityLabel: Record<CardRarity, string> = {
      common: '일반', rare: '희귀', epic: '영웅', unique: '고유', legendary: '전설',
    }

    const itemTile = (
      item: { title: string; effect: string; rarity: CardRarity; illu?: string },
      packKind: ShopPackKind
    ): string => {
      const itemArt =
        (item.illu ? spriteForBasicPackItem(item.illu) : undefined) ??
        SpriteUrls.packs[packKind]
      return this.host.faces.codexTile({
        art: { kind: 'sprite', url: itemArt },
        name: item.title,
        tag: rarityLabel[item.rarity],
        rarityClass: RARITY_CLASS_BY_TIER[item.rarity],
        chips: [{ value: item.effect, tone: 'gold' }],
        extraClass: 'codex-tile--relic',
      })
    }

    const noteTile = (packKind: ShopPackKind, name: string, effect: string, rarity: CardRarity): string =>
      this.host.faces.codexTile({
        art: { kind: 'sprite', url: SpriteUrls.packs[packKind] },
        name,
        tag: '가변',
        rarityClass: RARITY_CLASS_BY_TIER[rarity],
        chips: [{ value: effect, tone: 'gold' }],
        extraClass: 'codex-tile--relic',
      })

    // 팩 섹션: 방문 전에는 간판 카드 1장만 ???로 표시하고 항목 타일은 숨긴다.
    const packSection = (
      packKind: ShopPackKind,
      venue: '상점' | '제단',
      theme: string,
      tiles: string[]
    ): string => {
      const label = SHOP_PACK_LABELS[packKind]
      const known = seenPacks.has(packKind)
      const coverArt = SpriteUrls.packs[packKind]
      const coverCard = known
        ? this.host.faces.codexTile({
            art: { kind: 'sprite', url: coverArt },
            name: label.title,
            tag: venue,
            chips: [{ value: theme, tone: 'gold' }],
            extraClass: 'codex-tile--relic codex-tile--packcover',
          })
        : this.host.faces.codexTile({
            art: { kind: 'sprite', url: coverArt },
            name: '???',
            tag: venue,
            chips: [],
            extraClass: 'codex-tile--relic codex-tile--packcover codex-tile--unknown',
          })
      return `
        <h3 class="compendium-section">${known ? label.title : '???'} · ${venue}</h3>
        <div class="codex-tile-grid codex-tile-grid--relics">${coverCard}${known ? tiles.join('') : ''}</div>
      `
    }

    const basicTiles = SHOP_PACK_POOLS['basic-pack'].map((i) => itemTile(i, 'basic-pack'))
    const resourceTiles = SHOP_PACK_POOLS['resource-pack'].map((i) => itemTile(i, 'resource-pack'))

    return `
      <h3 class="compendium-section">카드팩 (Packs)</h3>
      <p class="compendium-section-blurb">10·20턴 상점과 30턴 제단에서 구매하는 팩. 방문해야 내용이 공개된다.</p>
      ${packSection('basic-pack', '상점', '즉시 효과 — 체력·불씨·콤보 게이지·방패·화폐를 즉시 보충한다.', basicTiles)}
      ${packSection('recipe-pack', '상점', '레시피 해금 — runLocked 레시피를 해금해 조합 발동 범위를 확장한다.', [
        noteTile('recipe-pack', '레시피 해금', '해금되지 않은 조합 레시피 중 재료가 갖춰진 항목을 해금 (런 보유 카드에 따라 변동)', 'rare'),
      ])}
      ${packSection('unlock-pack', '상점', '해금 — 손패 카드를 새로 해금해 드로우 풀을 확장한다.', [
        noteTile('unlock-pack', '손패 카드 해금', '해금되지 않은 손패 카드 중 1장을 해금 (런 보유 카드에 따라 변동)', 'rare'),
      ])}
      ${packSection('chance-pack', '제단', '확률 상승 — 특정 손패 카드의 드롭 가중치를 영구적으로 높인다.', [
        noteTile('chance-pack', '카드 등장률 상승', '현재 해금된 카드 중 1장 선택 — 해당 카드의 드롭 가중치를 기본값만큼 영구 추가', 'rare'),
      ])}
      ${packSection('resource-pack', '제단', '최대치 증가 — 최대 체력·손패·빛 게이지 등 영구 상한을 높인다.', resourceTiles)}
      ${packSection('delete-pack', '제단', '삭제 — 드로우 풀에서 손패 카드를 제거해 덱 농도를 높인다.', [
        noteTile('delete-pack', '손패 카드 삭제', '현재 런 드로우 풀에서 특정 카드를 제거해 뽑힐 빈도를 낮춘다', 'rare'),
      ])}
    `
  }

  private renderCompendiumRelics(): string {
    const owned = new Set(this.host.getGameState()?.getCharacter().relics ?? [])
    const cards = Object.values(RELIC_DEFINITIONS)
      .map((def) => {
        const isOwned = owned.has(def.id)
        return this.host.faces.codexTile({
          art: { kind: 'sprite', url: spriteForRelic(def.id) },
          name: def.name,
          tag: isOwned ? '보유 중' : '상점',
          rarityClass: RARITY_CLASS_BY_TIER[def.rarity],
          chips: [{ value: this.host.faces.relicEffectHtml(this.host.faces.relicDynamicEffect(def.id, def.effect, isOwned), def.spawnEffect, this.host.getSpawnWeightCtx(), isOwned), tone: 'gold' }],
          flavor: def.flavor,
          extraClass: ['codex-tile--relic', isOwned ? 'codex-tile--owned' : ''].filter(Boolean).join(' '),
        })
      })
      .join('')
    return `
      <h3 class="compendium-section">유물 (Relics)</h3>
      <p class="compendium-section-blurb">10턴마다 열리는 생쥐 상점에서 구매하는 지속 효과. 보유 중인 유물은 초록색 테두리로 표시된다.</p>
      <div class="codex-tile-grid codex-tile-grid--relics">${cards}</div>
    `
  }

  /**
   * Recipe mini-cards need the compendium body to scroll, but scroll containers
   * clip overflowing children. Clone the hovered stack into a fixed body-layer
   * so only that preview escapes the panel while the codex keeps its scrollbar.
   */
  private attachCompendiumRecipeFloat(host: HTMLElement): void {
    document.querySelectorAll('.compendium-recipe-float').forEach((el) => el.remove())
    let floating: HTMLElement | null = null
    const removeFloating = () => {
      // Restore the compact in-panel stack only after the detached fan preview
      // has folded away, preventing the two stacks from visually colliding.
      host
        .querySelectorAll<HTMLElement>('.compendium-card-art--recipe.is-floating')
        .forEach((el) => el.classList.remove('is-floating'))
      floating?.remove()
      floating = null
    }
    host.querySelectorAll<HTMLElement>('.compendium-card-art--recipe').forEach((art) => {
      const showFloating = () => {
        const stack = art.querySelector<HTMLElement>('.compendium-recipe-stack')
        if (!stack) return
        removeFloating()
        const rect = stack.getBoundingClientRect()
        // While the body clone is expanded, fade the original mini-cards in the
        // card art slot so the readable floating cards are not backed by ghosts.
        art.classList.add('is-floating')
        floating = stack.cloneNode(true) as HTMLElement
        floating.classList.add('compendium-recipe-float')
        floating.style.left = `${rect.left}px`
        floating.style.top = `${rect.top}px`
        floating.style.width = `${rect.width}px`
        floating.style.height = `${rect.height}px`
        floating.setAttribute('aria-hidden', 'true')
        document.body.appendChild(floating)
      }
      art.addEventListener('mouseenter', showFloating)
      art.addEventListener('focusin', showFloating)
      art.addEventListener('mouseleave', removeFloating)
      art.addEventListener('focusout', removeFloating)
    })
  }

  /**
   * 용어 탭 — 화면에 나오는 자원/상태 어휘의 단일 설명처.
   *
   * 각 항목에는 **화면에서 실제로 쓰는 아이콘**을 그대로 붙인다. 여기서 본 아이콘이
   * 카드·HUD·상점에서 같은 뜻으로 다시 나와야 도감이 사전 노릇을 한다.
   * 수치가 코드에 있는 항목은 숫자를 적지 말고 규칙만 적는다(밸런싱 때 어긋난다).
   */
  private renderCompendiumTerms(): string {
    const coin = '<span class="codex-coin-mark" aria-hidden="true">$</span>'
    const terms: { name: string; icon: string; desc: string }[] = [
      {
        name: '필드',
        icon: bookIcon(),
        desc: '플레이어 앞 3×3 그리드 레일 전체. 전방 3칸과 대기 6칸을 모두 포함한다.',
      },
      {
        name: '전방',
        icon: bookIcon(),
        desc: '플레이어 카드와 직접 대면 중인 최전방 라인(distance 0). 일반 보드 행동은 전방만 선택한다.',
      },
      {
        name: '대기',
        icon: bookIcon(),
        desc: '전방이 아닌 준비 중인 후방 2줄(distance 1~2), 총 6칸. 필드 지정 효과는 대기 칸도 대상으로 삼을 수 있다.',
      },
      {
        name: '트리플',
        icon: handCardIcon(),
        desc: '같은 손패 카드 3장이 손패에서 나란히 놓이면 자동으로 합쳐지는 ★ 강화 카드. 사용하면 트리플 효과가 나가고 콤보 게이지도 3칸 오른다.',
      },
      {
        name: '불빛',
        icon: sparkleIcon(),
        desc: '이 게임의 점수. 적 처치·보물·꽃 수확으로 모이고 상점 가격도 불빛으로 매겨진다.',
      },
      {
        name: `화폐(${'$'})`,
        icon: coin,
        desc: '상점 화폐. 불빛과 별개의 지갑이며, 새싹 병아리를 졸업해야 열린다.',
      },
      {
        name: '방패',
        icon: shieldIcon(),
        desc: '체력 위에 쌓이는 임시 체력. 피해를 먼저 흡수하고 소모되며, 방패가 다 막으면 체력은 줄지 않는다.',
      },
      {
        name: '함정 피해',
        icon: trapIcon(),
        desc: '함정 칸을 밟았을 때 내가 받는 피해. 적의 공격력(검)과는 다른 수치라 아이콘도 따로 쓴다. 3칸으로 합쳐진 거미줄은 즉사다.',
      },
      {
        name: '굳음',
        icon: bookIcon(),
        desc: '밀랍으로 하얗게 굳은 정지 상태. 남은 턴 동안 적 공격/보물 변동 같은 전방 이벤트가 멈춘다. 보스도 굳는다.',
      },
      {
        name: '빛 게이지',
        icon: flameIcon(),
        desc: '상단의 불씨 자원. 턴이 지나면 줄고 성냥으로 회복한다. 낮아질수록 적·함정이 더 자주 나오고, 바닥에 가까우면 적이 먼저 공격한다.',
      },
      {
        name: '콤보 게이지',
        icon: comboGaugeIcon(),
        desc: '손패를 쓸 때마다 차오르는 눈금(1장 1칸 · 트리플 3칸). 가득 차면 미리 고른 보상(공격력·최대 체력·불씨 한도·손패 한도)이 영구히 붙고, 넘친 칸은 다음 게이지로 이월된다.',
      },
      {
        name: '손패',
        icon: handCardIcon(),
        desc: '아래에 쌓아 두고 골라 쓰는 카드. 보물 칸·적 처치로 들어오며 한도를 넘으면 더 받지 못한다.',
      },
      {
        name: '보물 칸',
        icon: handCardIcon(),
        desc: '열면 손패를 주는 칸. 상자뿐 아니라 잡동사니·황금 상자도 여기 들어가고, 열쇠는 이 칸 전부를 대상으로 삼는다.',
      },
      {
        name: '별빛',
        icon: candleIcon(),
        desc: '90층부터 나오는 특수 보물. 90~100층에서는 별빛을 얻어야만 턴이 오른다.',
      },
      {
        name: '꽃',
        icon: sparkleIcon(),
        desc: '씨앗이 전방에 닿으면 피는 버프 칸. 종류마다 주는 것이 다르다 — 캐모마일 불빛, 레드로즈 체력, 메리골드 화폐, 올레안더 방패, 라벤더 콤보 게이지. 카드에 뜬 아이콘이 곧 수확물이다.',
      },
      {
        name: '정화',
        icon: flameIcon(),
        desc: '성수는 기본 사용 시 랜덤 포자 2장, 트리플 사용 시 필드 전체 포자를 제거한다.',
      },
    ]
    const cards = terms
      .map((t) =>
        this.host.faces.codexTile({
          art: { kind: 'icon', svg: t.icon },
          name: t.name,
          tag: '용어',
          note: t.desc,
          extraClass: 'codex-tile--term',
        })
      )
      .join('')
    return `<div class="codex-tile-grid codex-tile-grid--terms">${cards}</div>`
  }

  private renderCompendiumCombo(): string {
    const synthesisIntro = `
      <article class="compendium-card compendium-card-wide">
        <div class="compendium-card-art compendium-card-art--icon">${flameIcon()}</div>
        <header class="compendium-card-head">
          <span class="compendium-card-name">자동 합성 (트리플)</span>
          <span class="compendium-card-badge">합성</span>
        </header>
        <div class="compendium-card-row"><span class="compendium-card-label">조건</span><span class="compendium-card-value">손패에 같은 카드 3장이 연속</span></div>
        <div class="compendium-card-row"><span class="compendium-card-label">결과</span><span class="compendium-card-value">즉시 1장의 ★ 강화 카드로 합쳐짐. 사용 시 트리플 효과 발동.</span></div>
        <p class="compendium-card-desc">손패 슬롯 0~9 중 인접한 3칸이 같은 종류면 자동 합성. 별도 조작 없이 발동되며, 합성된 카드는 단일 슬롯을 차지한다.</p>
      </article>
    `
    const recipeCards = RECIPES.map((r) => {
      // 재료 카드 중 하나라도 잠겨 있으면 레시피 전체를 미발견 처리.
      const isLocked =
        this.host.getLockedRecipeIds().has(r.id) ||
        Object.keys(r.ingredients).some((id) => this.host.getLockedCardIds().has(id as HandCardId))
      const ingredientCards = Object.entries(r.ingredients).flatMap(([id, n]) => {
        const def = HAND_CARD_DEFINITIONS[id as HandCardId]
        if (!def) return []
        return Array.from({ length: n ?? 1 }, () =>
          this.host.faces.handCardFace(
            def.id,
            def.description,
            false,
            `compendium-recipe-mini ${this.host.faces.categoryClass(def.category)}`,
            undefined,
            false
          )
        )
      })
      return this.compendiumCard({
        art: {
          kind: 'recipe',
          html: `<div class="compendium-recipe-stack" style="--recipe-count: ${ingredientCards.length}; --recipe-center: ${(ingredientCards.length - 1) / 2}">${ingredientCards.join('')}</div>`,
        },
        name: isLocked ? '???' : r.name,
        badge: `${r.totalCount}장`,
        categoryClass: `compendium-recipe-card${isLocked ? ' compendium-card--unknown' : ''}`,
        stats: isLocked ? [] : [['효과', this.host.faces.recipeFlavorHtml(r)]],
      })
    }).join('')
    return `
      <h3 class="compendium-section">조합 레시피 (Recipes)</h3>
      <p class="compendium-section-blurb">손패를 사용할 때마다 해당 카드가 활성 체인에 추가된다. 체인의 multiset이 아래 재료를 모두 포함하면 그 레시피가 보너스로 발동한다.</p>
      <div class="compendium-grid">${recipeCards}</div>
      <h3 class="compendium-section">합성 (Synthesis)</h3>
      <div class="compendium-grid">${synthesisIntro}</div>
    `
  }

  /**
   * Unified compendium card template — every section uses this so the visual
   * grammar (art slot → name + badge → stat rows → description) reads as one
   * design language.
   */
  private compendiumCard(opts: {
    art:
      | { kind: 'sprite'; url: string }
      | { kind: 'icon'; svg: string }
      | { kind: 'recipe'; html: string }
    name: string
    badge?: string
    categoryClass?: string
    stats?: [string, string][]
    description?: string
  }): string {
    const artHtml =
      opts.art.kind === 'sprite'
        ? `<div class="compendium-card-art compendium-card-art--sprite" style="background-image: url('${opts.art.url}');"></div>`
        : opts.art.kind === 'icon'
          ? `<div class="compendium-card-art compendium-card-art--icon">${opts.art.svg}</div>`
          : `<div class="compendium-card-art compendium-card-art--recipe">${opts.art.html}</div>`
    const badgeHtml = opts.badge ? `<span class="compendium-card-badge">${opts.badge}</span>` : ''
    const statRows = (opts.stats ?? [])
      .map(
        ([k, v]) =>
          `<div class="compendium-card-row"><span class="compendium-card-label">${k}</span><span class="compendium-card-value">${v}</span></div>`
      )
      .join('')
    const descHtml = opts.description
      ? `<p class="compendium-card-desc">${opts.description}</p>`
      : ''
    const classes = ['compendium-card', opts.categoryClass ?? ''].filter(Boolean).join(' ')
    return `
      <article class="${classes}">
        ${artHtml}
        <header class="compendium-card-head">
          <span class="compendium-card-name">${opts.name}</span>
          ${badgeHtml}
        </header>
        ${statRows}
        ${descHtml}
      </article>
    `
  }
}
