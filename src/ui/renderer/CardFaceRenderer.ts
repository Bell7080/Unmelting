/**
 * CardFaceRenderer — 손패/유물/도감 카드 face HTML 빌더.
 * GameBoardRenderer와 서브 렌더러들이 같은 face 마크업을 공유하도록 분리했다.
 */

import type { GameState } from '@core/GameState'
import type { CandleMode } from '@entities/Character'
import type { HandCardId, HandCategory, JobTag } from '@entities/HandCard'
import { getHandCardDef } from '@data/HandCards'
import { getRelicDef, type RelicId } from '@data/Relics'
import type { Recipe } from '@data/Recipes'
import { spriteForHandCard, spriteForRelic, SpriteUrls } from '@ui/Sprites'
import { flameIcon, heartIcon, pouchIcon, swordIcon } from '@ui/Icons'
import { atkDmgHtml, hpDmgHtml, rangeDmgHtml } from '@ui/DamageDisplay'
import type { SpawnWeightContext } from '@ui/renderer/RendererTypes'
import { escapeHtml } from './Html'

/** CardFaceRenderer가 렌더러 상태를 읽는 최소 계약. */
export interface CardFaceHost {
  getGameState(): GameState | null
  getSpawnWeightCtx(): SpawnWeightContext | undefined
}

/** 카드/유물 face HTML 빌더 — 호스트 상태는 CardFaceHost 계약으로만 읽는다. */
export class CardFaceRenderer {
  constructor(private readonly host: CardFaceHost) {}

  /**
   * 유물 효과 본문을 화면용 HTML로 변환한다.
   *
   * 변환 규칙:
   * 1. `불빛` → ✦ 글리프 치환
   * 2. `{{spawn}}` → 실제 확률 변화량(%) 치환. spawnEffect 있는 유물 전용.
   *    - spawnEffect가 있으면 자동으로 shift-only 스폰 화살표 (밝음: N→M%) 추가
   * 3. `[dyn:기본|수식]` → desc-dyn 구조 (수식 부분만 감싸기, 도감/손패 방식과 동일)
   * 4. `[shift:텍스트]` → .shift-only span (기본 숨김, Shift 시 표시)
   */
  relicEffectHtml(
    effect: string,
    spawnEffect?: { type: 'enemy' | 'treasure' | 'spore' | 'flower'; delta: number },
    ctx?: SpawnWeightContext,
    isOwned: boolean = false,
  ): string {
    // atkDmgHtml 등으로 미리 조립된 HTML은 \x00 접두사로 표시 → escapeHtml 건너뜀
    if (effect.charCodeAt(0) === 0) return effect.slice(1).replace(/불빛/g, '✦')

    // \n은 줄 구분 효과(만찬 유물 스탯 3줄 등) → <br>로 변환
    let t = escapeHtml(effect).replace(/불빛/g, '✦').replace(/\n/g, '<br>')

    // {{spawn}} 치환: 밝음 티어 기준 확률 변화량
    if (spawnEffect && ctx && ctx.total > 0) {
      const ctxVal = spawnEffect.type === 'enemy' ? ctx.enemy
        : spawnEffect.type === 'treasure' ? ctx.treasure
        : spawnEffect.type === 'flower' ? ctx.flower
        : ctx.trap
      let pctChange: number
      let beforePct: number, afterPct: number
      if (isOwned) {
        const beforeVal = ctxVal - spawnEffect.delta
        const beforeTotal = ctx.total - spawnEffect.delta
        pctChange = beforeTotal > 0
          ? Math.round((ctxVal / ctx.total - beforeVal / beforeTotal) * 100)
          : 0
        beforePct = beforeTotal > 0 ? Math.round(beforeVal / beforeTotal * 100) : 0
        afterPct = ctx.total > 0 ? Math.round(ctxVal / ctx.total * 100) : 0
      } else {
        const newVal = Math.max(0, ctxVal + spawnEffect.delta)
        const newTotal = Math.max(1, ctx.total + spawnEffect.delta)
        pctChange = Math.round((newVal / newTotal - ctxVal / ctx.total) * 100)
        beforePct = ctx.total > 0 ? Math.round(ctxVal / ctx.total * 100) : 0
        afterPct = Math.round(newVal / newTotal * 100)
      }
      const sign = pctChange >= 0 ? '+' : ''
      t = t.replace('{{spawn}}', `${sign}${pctChange}%`)
      // spawn 유물은 자동으로 Shift 시 밝음 기준 before→after% 추가
      t += `<span class="shift-only"> (밝음: ${beforePct}→${afterPct}%)</span>`
    } else {
      t = t.replace('{{spawn}}', '')
    }

    // [atk]를 먼저 치환해야 [dyn:...|([atk]×...)] 수식 안의 ] 가 [^\]]+ 패턴을 조기 종료시키지 않는다.
    t = t.replace(/\[atk\]/g, swordIcon())

    // [dyn:기본|수식] → 수식 부분만 desc-dyn으로 감싸기 (도감/손패 방식과 동일)
    t = t.replace(/\[dyn:([^\|]+)\|([^\]]+)\]/g, (_, s, d) => {
      return `<span class="desc-dyn"><span class="desc-dyn__s">${s}</span><span class="desc-dyn__d">${d}</span></span>`
    })

    // [shift:텍스트] → .shift-only span
    t = t.replace(/\[shift:([^\]]+)\]/g, (_, x) => {
      return `<span class="shift-only">${x}</span>`
    })

    return t
  }

  /** 런타임 상태에 따라 effect 문자열을 완성해 반환한다.
   *  [dyn:기본|수식] / [shift:텍스트] 토큰을 실제 수치로 채워 넣는다.
   *  상태 없이는 staticEffect를 그대로 반환한다. */
  relicDynamicEffect(id: RelicId, staticEffect: string, isOwned: boolean = false): string {
    const enh = this.host.getGameState()?.enhancements
    const char = this.host.getGameState()?.getCharacter()

    // scoreMultiplier 영향 불빛 획득 유물: 합산 수치 표시 + Shift에 (기본+보너스) 분해
    if (id === 'golden-squirrel' && enh) {
      const base = 200; const actual = Math.round(base * enh.scoreMultiplier)
      const bonus = actual - base
      return bonus > 0
        ? `5턴마다 불빛 [dyn:${actual}|(${base}+${bonus})] 획득`
        : `5턴마다 불빛 ${actual} 획득`
    }
    if (id === 'blind-faith' && enh) {
      const base = 50; const actual = Math.round(base * enh.scoreMultiplier)
      const bonus = actual - base
      return bonus > 0
        ? `$1 획득마다 불빛 [dyn:${actual}|(${base}+${bonus})] 획득`
        : `$1 획득마다 불빛 ${actual} 획득`
    }
    if (id === 'honesty' && enh) {
      const base = 100; const actual = Math.round(base * enh.scoreMultiplier)
      const bonus = actual - base
      return bonus > 0
        ? `손패 5장 사용마다 불빛 [dyn:${actual}|(${base}+${bonus})] 획득`
        : `손패 5장 사용마다 불빛 ${actual} 획득`
    }

    // 모래시계: 현재 소모 주기 기준 before→after
    if (id === 'hourglass' && char) {
      const after = isOwned ? char.emberDecayTurns : char.emberDecayTurns + 1
      const before = after - 1
      return `${staticEffect}[shift: (${before}→${after})]`
    }

    // 할인 쿠폰: 현재 할인율 기준 before→after
    if (id === 'discount-coupon' && enh) {
      const before = isOwned ? enh.shopDiscountPct - 5 : enh.shopDiscountPct
      const after = isOwned ? enh.shopDiscountPct : enh.shopDiscountPct + 5
      return `${staticEffect}[shift: (${before}→${after}%)]`
    }

    // 도끼: 불빛 배율 before→after
    if (id === 'axe' && enh) {
      const before = isOwned
        ? Math.round((enh.scoreMultiplier / 1.1 - 1) * 100)
        : Math.round((enh.scoreMultiplier - 1) * 100)
      const after = isOwned
        ? Math.round((enh.scoreMultiplier - 1) * 100)
        : Math.round((enh.scoreMultiplier * 1.1 - 1) * 100)
      return `${staticEffect}[shift: (+${before}%→+${after}%)]`
    }

    // 함정의 대가: 함정 무시 확률 before→after
    if (id === 'trap-master' && char) {
      const before = isOwned
        ? Math.round((char.trapIgnoreChance - 0.30) * 100)
        : Math.round(char.trapIgnoreChance * 100)
      const after = isOwned
        ? Math.round(char.trapIgnoreChance * 100)
        : Math.round((char.trapIgnoreChance + 0.30) * 100)
      return `${staticEffect}[shift: (${before}→${after}%)]`
    }

    // 개봉식: 보물 사라짐 확률 50→40% (항상 고정, 중복 획득 불가)
    if (id === 'opening-ceremony') {
      return `${staticEffect}[shift: (50→40%)]`
    }

    // 황금 열쇠: 항상 0→30% (중복 획득 불가)
    if (id === 'golden-key') {
      return `${staticEffect}[shift: (0→30%)]`
    }

    // 달콤한 유혹: 함정 피해 보너스 + 불빛 before→after
    if (id === 'sweet-temptation' && char) {
      const dmgCurrent = char.trapDamageBonus
      const dmgBefore = isOwned ? dmgCurrent - 1 : dmgCurrent
      const dmgAfter = isOwned ? dmgCurrent : dmgCurrent + 1
      return `함정 피해 [dyn:+1|(+${dmgBefore}→+${dmgAfter})] · 함정 처리 불빛 [dyn:+30%|(0→30%)]`
    }

    // 품격있는 대처 / 물양동이: atkDmgHtml과 동일한 Math.floor 공식으로 실시간 계산.
    // \x00 접두사로 relicEffectHtml의 escapeHtml을 건너뛴다.
    if (id === 'graceful-response' && char) {
      return '\x00피해를 입힌 적에게 반격 ' + atkDmgHtml(char.damage, 0.3, 1)
    }
    if (id === 'water-bucket' && char) {
      return '\x00직접 타격한 적 25% 확률 추가 ' + atkDmgHtml(char.damage, 0.5, 1)
    }

    return staticEffect
  }

  /** Owned relics reuse the shop card reading structure without the price tag.
   *  Keeping the same art/body/title/effect/flavor class names lets inventory
   *  cards scale up on hover with text legibility matching shop relic cards. */
  relicPreviewFace(id: RelicId): string {
    const def = getRelicDef(id)
    const enh = this.host.getGameState()?.enhancements
    const char = this.host.getGameState()?.getCharacter()
    const profile = char?.customRelicProfiles[id]
    const title = profile?.name ?? def.name
    const effect = profile?.effect ?? def.effect
    const flavor = profile?.flavor ?? def.flavor
    // 유물별 런타임 누적치를 카드 하단 칩으로 표기한다.
    let bonusChip = ''
    if (id === 'luxury' && enh) {
      // 사치품: 불빛 소모치와 공격력 보너스를 별도 줄로 분리
      const atkLabel = enh.luxuryBonusAtk >= 3 ? `공격력 +${enh.luxuryBonusAtk} (MAX)` : `공격력 +${enh.luxuryBonusAtk}`
      bonusChip = `<p class="shop-relic-bonus-chip">불빛 소모치 <strong>${enh.luxuryScoreSpent}</strong></p><p class="shop-relic-bonus-chip">${atkLabel}</p>`
    } else if (id === 'demon-doll' && enh) {
      bonusChip = `<p class="shop-relic-bonus-chip">자해 <strong>${enh.demonDollSelfDamageAccum}</strong>/20 · 공격력 +<strong>${enh.demonDollBonusAtk}</strong></p>`
    } else if (id === 'anomaly' && char) {
      // 변칙: 5 손실마다 발동, 현재 누적치 표시
      bonusChip = `<p class="shop-relic-bonus-chip">손실 누적 <strong>${char.relicDamageTaken}</strong>/5</p>`
    } else if (id === 'ink-quill' && enh) {
      bonusChip = `<p class="shop-relic-bonus-chip">처치 <strong>${enh.inkQuillKillCount}</strong>/5</p>`
    } else if (id === 'honesty' && enh) {
      bonusChip = `<p class="shop-relic-bonus-chip">사용 <strong>${enh.honestyHandUseCount}</strong>/5</p>`
    } else if (id === 'ambition' && enh) {
      const nextGain = enh.ambitionCurrentGain + 25
      bonusChip = `<p class="shop-relic-bonus-chip">처치 <strong>${enh.ambitionKillCount}</strong>/8 · 다음 <strong>+${nextGain}</strong>✦</p>`
    } else if (id === 'blood-writ' && enh) {
      bonusChip = `<p class="shop-relic-bonus-chip">자해 <strong>${enh.bloodWritSelfDamageAccum}</strong>/5</p>`
    } else if (id === 'coagulation' && enh) {
      bonusChip = `<p class="shop-relic-bonus-chip">자해 <strong>${enh.coagulationSelfDamageAccum}</strong>/2</p>`
    } else if (id === 'blood-sigil' && enh) {
      bonusChip = `<p class="shop-relic-bonus-chip">사용 <strong>${enh.bloodSigilUseCount}</strong>/5</p>`
    } else if (id === 'wax-recycle' && enh) {
      bonusChip = `<p class="shop-relic-bonus-chip">사용 <strong>${enh.recycleWaxUseCount}</strong>/2</p>`
    } else if (id === 'trump-shot' && enh) {
      bonusChip = `<p class="shop-relic-bonus-chip">파편 <strong>${enh.trumpShotShardCount}</strong>/4</p>`
    } else if (id === 'throw-art' && enh) {
      bonusChip = `<p class="shop-relic-bonus-chip">파편 <strong>${enh.bladeShardUseCount % 20}</strong>/20 · 공격력 +<strong>${enh.throwArtBonusAtk}</strong></p>`
    } else if (id === 'pyromaniac' && enh) {
      bonusChip = `<p class="shop-relic-bonus-chip">사용 <strong>${enh.pyromaniacUseCount}</strong>/5</p>`
    } else if (id === 'burning-scarecrow' && enh) {
      bonusChip = `<p class="shop-relic-bonus-chip">실패 <strong>${enh.scarecrowNoKillCount}</strong>/3</p>`
    } else if (id === 'oil-bottle' && enh) {
      bonusChip = `<p class="shop-relic-bonus-chip">이번 턴 불씨 <strong>${enh.oilBottleTurnUses}</strong> · 피해 +<strong>${enh.oilBottleTurnUses}</strong></p>`
    }
    // 커스텀 프로필의 art(만찬 유물 등)가 있으면 기본 스프라이트 대신 사용
    const artUrl = profile?.art ?? spriteForRelic(def.id)
    return `
      <article class="relic-preview-card" aria-hidden="true">
        <div class="shop-relic-art" style="background-image: url('${artUrl}')" aria-hidden="true"></div>
        <div class="shop-relic-body">
          <h3 class="shop-relic-title">${title}</h3>
          <p class="shop-relic-effect">${this.relicEffectHtml(this.relicDynamicEffect(id, effect, true), def.spawnEffect, this.host.getSpawnWeightCtx(), true)}</p>
          ${bonusChip}
          <p class="shop-relic-flavor">${flavor}</p>
        </div>
      </article>
    `
  }

  categoryClass(cat: HandCategory): string {
    return `hand-cat-${cat}`
  }

  categoryLabel(cat: HandCategory): string {
    return cat === 'recovery' ? '회복' : cat === 'tool' ? '도구' : cat === 'control' ? '컨트롤' : '공격'
  }

  jobTagLabel(tag: JobTag): string {
    return tag === 'knight' ? '기사' : '마법사'
  }

  /** 손패 카드 1장의 상단 태그 목록(카테고리 + 직업 태그) — 도감/미리보기/상점 팩 카드가 공유한다. */
  handCardTagLabels(id: HandCardId): string[] {
    const def = getHandCardDef(id)
    return [this.categoryLabel(def.category), ...(def.jobTags ?? []).map((t) => this.jobTagLabel(t))]
  }

  /** 카드 아트 좌상단에 겹쳐 보이는 태그 뱃지 오버레이. codex-tile-tag* 스타일을 공유한다. */
  tagsOverlayHtml(tags: string[]): string {
    if (tags.length === 0) return ''
    return `<div class="codex-tile-tags" aria-hidden="true">${tags.map((t) => `<span class="codex-tile-tag">${t}</span>`).join('')}</div>`
  }

  /** Shared card face used by hover previews and the compendium. It accepts
   *  arbitrary art so field-card codex entries can follow the exact hand-card
   *  frame without scaling the original sprite data. */
  commonCardFace(opts: {
    artUrl: string
    name: string
    description: string
    extraClass?: string
    badge?: string
    /** 다중 뱃지 — badge보다 우선 적용된다. */
    badges?: string[]
    /** 아트 좌상단 오버레이 태그(카테고리/직업 등). */
    tags?: string[]
  }): string {
    const badgeList = opts.badges ?? (opts.badge ? [opts.badge] : [])
    const badgeHtml = badgeList.map(b => `<span class="common-card-badge">${b}</span>`).join('')
    const tagsOverlay = this.tagsOverlayHtml(opts.tags ?? [])
    return `
      <article class="common-card-face ${opts.extraClass ?? ''}" style="--hand-card-art: url('${opts.artUrl}'); --hand-card-back: url('${SpriteUrls.cardBack}');">
        <div class="common-card-art" aria-hidden="true">
          <img src="${opts.artUrl}" alt="" loading="lazy" />
          ${tagsOverlay}
        </div>
        <div class="common-card-body">
          <header class="common-card-title-row">
            <span class="common-card-name">${opts.name}</span>
            ${badgeHtml}
          </header>
          <p class="common-card-desc">${opts.description}</p>
        </div>
      </article>
    `
  }
  /** Hand-card convenience wrapper keeps merged-star naming in one place while
   *  still delegating the actual visual frame to commonCardFace(). */
  handCardFace(
    defId: HandCardId,
    description: string,
    merged = false,
    extraClass = '',
    badge?: string,
    /** 레시피 재료 미니 카드처럼 44px급 축소본에서는 태그 오버레이를 생략한다. */
    showTags = true
  ): string {
    const def = getHandCardDef(defId)
    // 텍스트가 시각적으로 3줄 이상이 될 때 폰트를 살짝 줄인다.
    // <br> 2개 이상이면 확실히 3줄, <br> 1개 + 긴 텍스트면 래핑으로 3줄 될 가능성이 있다.
    const brCount = (description.match(/<br\s*\/?>/gi) ?? []).length
    const strippedLen = description.replace(/<[^>]*>/g, '').length
    const longClass = (brCount >= 2 || (brCount >= 1 && strippedLen >= 25)) ? 'is-long-desc' : ''
    return this.commonCardFace({
      artUrl: spriteForHandCard(defId),
      name: `${def.name}${merged ? ' ★' : ''}`,
      description,
      extraClass: [extraClass, longClass].filter(Boolean).join(' '),
      badge,
      tags: showTags ? this.handCardTagLabels(defId) : [],
    })
  }

  /**
   * Normalized codex tile shared across the catalog tabs (enemies/traps/
   * treasures/flowers/relics/terms). One tile communicates: art → name + tag →
   * a small set of stat chips → optional one-line note + flavor. Keeps the
   * warm-gold / dark-glass visual language consistent with the rail cards and
   * the owned-relic fan.
   */
  codexTile(opts: {
    art: { kind: 'sprite'; url: string } | { kind: 'icon'; svg: string }
    name: string
    /** 단일 태그. tags가 제공되면 무시된다. */
    tag?: string
    /** 다중 태그 — 카테고리 뱃지 옆에 순서대로 표시. */
    tags?: string[]
    rarityClass?: string
    chips?: Array<{
      label?: string
      value: string
      icon?: string
      tone?: 'hp' | 'atk' | 'gold' | 'shield' | 'spore' | 'bomb' | 'flower' | 'plain'
    }>
    note?: string
    flavor?: string
    extraClass?: string
  }): string {
    const tagList = opts.tags ?? (opts.tag ? [opts.tag] : [])
    const tagsOverlay = this.tagsOverlayHtml(tagList)
    const artHtml =
      opts.art.kind === 'sprite'
        ? `<div class="codex-tile-art" style="background-image: url('${opts.art.url}');" aria-hidden="true">${tagsOverlay}</div>`
        : `<div class="codex-tile-art codex-tile-art--icon" aria-hidden="true">${opts.art.svg}${tagsOverlay}</div>`
    const chipsHtml = (opts.chips ?? [])
      .map((c) => {
        const tone = c.tone && c.tone !== 'plain' ? `is-${c.tone}` : ''
        const iconHtml = c.icon ?? ''
        // label+value를 하나의 span으로 묶어 단일 flex item으로 만든다.
        // 묶지 않으면 텍스트 노드와 desc-dyn span이 각각 별개의 flex item이 되어
        // 두 칸으로 분리되는 레이아웃 버그가 발생한다.
        const bodyHtml = `<span class="codex-chip-body">${c.label ? `<span class="codex-stat-key">${c.label}</span>` : ''}${c.value}</span>`
        return `<span class="codex-stat-chip ${tone}">${iconHtml}${bodyHtml}</span>`
      })
      .join('')
    const noteHtml = opts.note ? `<p class="codex-tile-note">${opts.note}</p>` : ''
    const flavorHtml = opts.flavor ? `<p class="codex-tile-flavor">${opts.flavor}</p>` : ''
    const chipsRow = chipsHtml ? `<div class="codex-tile-stats">${chipsHtml}</div>` : ''
    const classes = ['codex-tile', opts.rarityClass ?? '', opts.extraClass ?? ''].filter(Boolean).join(' ')
    return `
      <article class="${classes}">
        ${artHtml}
        <header class="codex-tile-head">
          <span class="codex-tile-name">${opts.name}</span>
        </header>
        ${chipsRow}
        ${noteHtml}
        ${flavorHtml}
      </article>
    `
  }

  /**
   * 강화팩으로 누적된 singleBonus/tripleBonus를 반영한 설명 문자열을 반환한다.
   * 보너스가 없으면 정적 def.description을 그대로 사용해 불필요한 재계산을 피한다.
   */
  /**
   * 손패 설명문 반환. 강화 보너스가 0이면 HandCards.ts의 원본 문자열을 그대로 사용한다.
   * 반환값은 미리보기 tooltip과 도감(renderCompendiumHand) 모두에 쓰이므로
   * 여기서 스타일을 바꾸면 두 곳 모두 반영된다. 텍스트 규칙은 HandCards.ts 주석 참고.
   */
  /** 팩 피커 effect 문자열 생성 — rollPackItems에서 호출. */
  cardEffectHtml(id: HandCardId, merged = false): string {
    return this.enhancedHandCardDescription(id, merged)
  }

  enhancedHandCardDescription(id: HandCardId, merged: boolean): string {
    const def = getHandCardDef(id)
    const enhancements = this.host.getGameState()?.enhancements
    // 화염의 서는 누적 스택 n과 현재 공격력으로 실제 피해를 동적 표시한다.
    // 공식은 HandSystem.applyBookOfFlames와 동일하게 유지: floor((0.5+0.25n)×공×mul) + (1+n)×mul.
    // 다른 ATK 카드처럼 기본은 합산 수치(__s), Shift 중엔 현재 스택 반영 수식(__d)으로 전환한다.
    if (id === 'book-of-flames') {
      const n = enhancements?.bookOfFlamesBonus ?? 0
      const atk = this.host.getGameState()?.getCharacter().damage ?? 1
      // 단일 mult=(0.5+0.25n)/가산 1+n, 트리플은 정확히 2배 — atkDmgHtml의 floor(mult×공)+가산과 같은 값.
      const dmg = merged
        ? atkDmgHtml(atk, 1 + 0.5 * n, 2 + 2 * n)
        : atkDmgHtml(atk, 0.5 + 0.25 * n, 1 + n)
      // 성장 줄도 같은 관례: 기본은 현재 공격력 기준 합산 성장량, Shift 중엔 수식.
      const growTotal = merged ? Math.floor(0.5 * atk) + 2 : Math.floor(0.25 * atk) + 1
      const growFormula = merged ? `(0.5${swordIcon()}+2)` : `(0.25${swordIcon()}+1)`
      const grow = `사용 시 영구 +<span class="desc-dyn"><span class="desc-dyn__s">${growTotal}</span><span class="desc-dyn__d">${growFormula}</span></span>`
      return `필드 선택 적 1장 ${dmg}<br>${grow}`
    }
    // 검은 양초: book-of-flames와 동일하게 blackCandleBonus를 읽어 실시간 피해 표시.
    if (id === 'black-candle') {
      const n = enhancements?.blackCandleBonus ?? 0
      return merged
        ? `자해 4 · 필드 선택 적 1장 피해 ${6 + n}<br>검은 양초 피해 +6 · 손패로 돌아옴`
        : `자해 2 · 필드 선택 적 1장 피해 ${2 + n}<br>검은 양초 피해 +2 · 손패로 돌아옴`
    }
    // 불씨: 합산 수치가 기본 표시(__s). Shift 누름 중엔 공격력 수식(__d)으로 전환.
    if (id === 'ember') {
      const atk = this.host.getGameState()?.getCharacter().damage ?? 1
      const emberBonus = merged
        ? (enhancements?.tripleBonus['ember'] ?? 0)
        : (enhancements?.singleBonus['ember'] ?? 0)
      const total = merged ? 3 * atk + 5 + emberBonus : atk + 1 + emberBonus
      const formula = merged ? `3.0${swordIcon()}+5` : `1.0${swordIcon()}+1`
      const bonusSuffix = emberBonus > 0 ? `+${emberBonus}` : ''
      return `필드 선택 적 1장 <span class="desc-dyn"><span class="desc-dyn__s">${total}피해</span><span class="desc-dyn__d">(${formula}${bonusSuffix})피해</span></span>`
    }
    // ATK 연동 공격 카드: 기본 합산 수치, Shift 수식 (DamageDisplay 매니저 사용)
    const atk = this.host.getGameState()?.getCharacter().damage ?? 1
    if (id === 'sacrifice-candle') {
      const b = merged ? (enhancements?.tripleBonus['sacrifice-candle'] ?? 0) : (enhancements?.singleBonus['sacrifice-candle'] ?? 0)
      const selfTag = merged ? '자해 5 · ' : '자해 2 · '
      const dmg = merged ? atkDmgHtml(atk, 5, 10, b) : atkDmgHtml(atk, 1.5, 3, b)
      return `${selfTag}필드 선택 적 1장 ${dmg}`
    }
    if (id === 'levatein') {
      const b = merged ? (enhancements?.tripleBonus['levatein'] ?? 0) : (enhancements?.singleBonus['levatein'] ?? 0)
      const turns = merged ? '즉시 1턴 흐름' : '즉시 2턴 흐름'
      const dmg = merged ? hpDmgHtml(0.45, 15, b) : hpDmgHtml(0.3, 10, b)
      return `${turns}<br>필드 선택 적 1장 ${dmg}`
    }
    if (id === 'firework') {
      const b = merged ? (enhancements?.tripleBonus['firework'] ?? 0) : (enhancements?.singleBonus['firework'] ?? 0)
      const dmg = merged ? atkDmgHtml(atk, 3, 10, b) : atkDmgHtml(atk, 1, 2, b)
      return `필드 랜덤 적 전체 ${dmg} 분산`
    }
    if (id === 'fire-arrow') {
      const b = merged ? (enhancements?.tripleBonus['fire-arrow'] ?? 0) : (enhancements?.singleBonus['fire-arrow'] ?? 0)
      const dmg = merged ? rangeDmgHtml(atk, 5, 3, 0, b) : rangeDmgHtml(atk, 1, 1, 3, b)
      return `전방 선택 적 1장 ${dmg}`
    }
    if (id === 'chandelier') {
      const b = merged ? (enhancements?.tripleBonus['chandelier'] ?? 0) : (enhancements?.singleBonus['chandelier'] ?? 0)
      const dmg = merged ? atkDmgHtml(atk, 1, 2, b) : atkDmgHtml(atk, 0.5, 1, b)
      return `필드 전체 적 ${dmg} · 처치 시 반복`
    }
    if (id === 'bonfire') {
      const b = merged ? (enhancements?.tripleBonus['bonfire'] ?? 0) : (enhancements?.singleBonus['bonfire'] ?? 0)
      const healVal = merged ? 5 + b : 3 + b
      const dmg = merged ? atkDmgHtml(atk, 3, 3, b) : atkDmgHtml(atk, 1, 0, b)
      return `필드 선택 적 1장 ${dmg} · 처치 시 체력 +${healVal}`
    }
    if (id === 'teapot') {
      const b = merged ? (enhancements?.tripleBonus['teapot'] ?? 0) : (enhancements?.singleBonus['teapot'] ?? 0)
      const suffix = merged ? ' × 필드 적 수 × 3' : ' × 필드 적 수'
      const dmg = merged ? atkDmgHtml(atk, 3, 0, b) : atkDmgHtml(atk, 1.5, 0, b)
      return `전방 선택 적 1장 ${dmg}${suffix}`
    }
    if (id === 'slash') {
      if (merged) return getHandCardDef(id).tripleDescription // 즉사 텍스트 그대로
      const b = enhancements?.singleBonus['slash'] ?? 0
      return `전방 선택 적 1장 ${atkDmgHtml(atk, 2, 2, b)}`
    }
    if (id === 'candle-tome') {
      if (!merged) return getHandCardDef(id).description // 단일은 정적 텍스트
      const b = enhancements?.tripleBonus['candle-tome'] ?? 0
      return `필드 전체 적 ${atkDmgHtml(atk, 1, 0, b)} · 적 수×3 방패 획득`
    }
    if (id === 'sword-and-shield') {
      const b = merged ? (enhancements?.tripleBonus['sword-and-shield'] ?? 0) : (enhancements?.singleBonus['sword-and-shield'] ?? 0)
      const shieldVal = merged ? 4 + b : 1 + b
      const dmg = merged ? atkDmgHtml(atk, 2, 3, b) : atkDmgHtml(atk, 0.5, 1, b)
      return `전방 선택 적 1장 ${dmg} · 방패 +${shieldVal}`
    }
    const bonus = merged
      ? (enhancements?.tripleBonus[id] ?? 0)
      : (enhancements?.singleBonus[id] ?? 0)
    if (bonus === 0) return merged ? def.tripleDescription : def.description
    switch (id) {
      case 'wax-drop': return merged ? `체력 +${5 + bonus}` : `체력 +${1 + bonus}`
      case 'candle':   return merged ? `방패 +${5 + bonus}` : `방패 +${1 + bonus}`
      case 'match':    return merged ? `빛 게이지 +${5 + bonus}` : `빛 게이지 +${1 + bonus}`
      case 'card':     return merged ? `콤보 게이지 +${7 + bonus}` : `콤보 게이지 +${1 + bonus}`
      case 'coin':     return merged ? `+${5 + bonus}$` : `+${1 + bonus}$`
      default:         return merged ? def.tripleDescription : def.description
    }
  }
  candleModeMeta(mode: CandleMode): { label: string; effect: string; icon: string } {
    switch (mode) {
      case 'max-health':
        return { label: '체력', effect: '최대 체력 +5', icon: heartIcon() }
      case 'attack':
        return { label: '공격', effect: '공격력 +1', icon: swordIcon() }
      case 'ember':
        return { label: '불씨', effect: '불씨 한도 +2', icon: flameIcon() }
      case 'draw':
        return { label: '손패', effect: '손패 최대 +2', icon: pouchIcon() }
    }
  }

  /**
   * ATK 연동 레시피의 효과 설명을 desc-dyn HTML로 반환한다.
   * 기본: 합산 피해 수치. Shift: 공격력 배율 수식.
   * enemy maxHP 기반(hot-water-maxhp)은 런타임에 알 수 없으므로 정적 텍스트로 반환.
   */
  /** 조합팩 피커 effect 문자열 생성 — rollPackItems에서 호출. */
  recipeEffectHtml(r: Recipe): string {
    return this.recipeFlavorHtml(r)
  }

  recipeFlavorHtml(r: Recipe): string {
    const atk = this.host.getGameState()?.getCharacter().damage ?? 1
    const bonus = this.host.getGameState()?.enhancements.recipeBonus[r.id] ?? 0
    switch (r.effect) {
      case 'ignite-atk':      return `필드 모든 적에게 ${atkDmgHtml(atk, 0.3, 1, bonus)}`
      case 'hot-atk':         return `전방 모든 적에게 ${atkDmgHtml(atk, 0.5, 2, bonus)}`
      case 'fuse-atk':        return `전방 모든 적에게 ${atkDmgHtml(atk, 1.5, 0, bonus)}`
      case 'backfire-atk':    return `필드 모든 적에게 ${atkDmgHtml(atk, 1, 0, bonus)}`
      case 'rage-atk':        return `전방 모든 적에게 ${atkDmgHtml(atk, 1, 3, bonus)}`
      case 'flame-chain-atk': return `방패 +2 · 필드 적 전체 ${atkDmgHtml(atk, 1, 0, bonus)}`
      case 'glass-shards-atk':return `필드 랜덤 적 전체 ${atkDmgHtml(atk, 0.5, 3, bonus)} 분산`
      case 'fireworks-atk':   return `필드 랜덤 적 전체 ${atkDmgHtml(atk, 3, 3, bonus)} 분산`
      case 'banquet-atk':     return `필드 랜덤 적 ${atkDmgHtml(atk, 1, 0, bonus)} × 공격력 횟수`
      case 'hot-water-maxhp': return r.flavor  // 대상 적 최대체력 불명 → 정적 텍스트
      default:                return r.flavor
    }
  }
}
