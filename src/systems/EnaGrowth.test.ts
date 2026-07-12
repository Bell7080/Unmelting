import { afterEach, describe, expect, it, vi } from 'vitest'
import { CompanionSystem } from './CompanionSystem'
import {
  BASE_DISPOSITION,
  ROOKIE_DISPOSITION,
  ENA_RUN_XP_TUNING,
  ENA_RUN_DRAMA_TUNING,
  cloneDisposition,
  computeEnaGrowth,
  computeRunAdventureXp,
  computeRunDramaScore,
  isGrowthJumpRun,
  growthAnchorDisposition,
  loadDisposition,
  saveDisposition,
  type EnaRunDramaSignals,
} from './EnaDisposition'
import {
  EnaAutonomousLearner,
  ENA_SELF_LEARNING_STORAGE_KEY,
  LEGACY_XP_PER_RUN,
  deriveRunExperienceKeys,
  countNovelCardUses,
} from '../rl/EnaAutonomousLearner'
import type { EnaPlayLogEntry } from '../rl/EnaEffectProbe'
import { RELIC_DEFINITIONS, type RelicId } from '../data/Relics'

/** 테스트용 인메모리 저장소(learner용 최소 계약). */
function makeStorage(store: Map<string, string>) {
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
}

/** 테스트용 인메모리 localStorage 스텁. */
function installLocalStorage(): Map<string, string> {
  const store = new Map<string, string>()
  ;(globalThis as { localStorage?: unknown }).localStorage = makeStorage(store)
  return store
}

/** 고전이 담긴 드라마 신호(점프 문턱을 넘는 조합). */
const HARD_FOUGHT: EnaRunDramaSignals = {
  lowHpMoments: 4, // 위기감 6점(캡 8)
  effectiveClutches: 2, // 도움 실효 6점(캡 8)
  comebackDepth: 0.5, // 고전 3점
}

describe('에나 성장 곡선(computeEnaGrowth, 모험 xp 기반)', () => {
  it('xp 0·유대 0은 growth 0(=ROOKIE 앵커)이다', () => {
    expect(computeEnaGrowth({ adventureXp: 0, bond: 0 })).toBe(0)
    expect(growthAnchorDisposition(0)).toEqual(ROOKIE_DISPOSITION)
    expect(growthAnchorDisposition(1)).toEqual(cloneDisposition(BASE_DISPOSITION))
  })

  it('xp와 유대 각각에 대해 단조 증가하고 0~1을 벗어나지 않는다', () => {
    let prev = -1
    for (const xp of [0, 20, 80, 200, 500, 1500]) {
      const g = computeEnaGrowth({ adventureXp: xp, bond: 0.2 })
      expect(g).toBeGreaterThan(prev)
      prev = g
    }
    expect(computeEnaGrowth({ adventureXp: 200, bond: 0.8 })).toBeGreaterThan(
      computeEnaGrowth({ adventureXp: 200, bond: 0.1 })
    )
    expect(computeEnaGrowth({ adventureXp: -50, bond: -1 })).toBe(0)
    expect(computeEnaGrowth({ adventureXp: 1e9, bond: 99 })).toBeLessThanOrEqual(1)
  })

  it('자살런 10회로는 성장이 미미하다(런 횟수가 아니라 모험량이 기준)', () => {
    let xp = 0
    for (let i = 0; i < 10; i++) {
      xp += computeRunAdventureXp({ floorReached: 5, decisions: 3, progressTurns: 5 })
    }
    expect(computeEnaGrowth({ adventureXp: xp, bond: 0 })).toBeLessThan(0.15)
  })

  it('30층 도달 런은 자살런 대비 뚜렷한 상승을 준다', () => {
    const suicide = computeRunAdventureXp({ floorReached: 5, decisions: 3, progressTurns: 5 })
    const deep = computeRunAdventureXp({ floorReached: 30, decisions: 40, progressTurns: 30 })
    const dSuicide = computeEnaGrowth({ adventureXp: suicide, bond: 0 })
    const dDeep = computeEnaGrowth({ adventureXp: deep, bond: 0 })
    expect(dDeep).toBeGreaterThanOrEqual(0.04) // 눈에 띄는 상승
    expect(dDeep).toBeGreaterThan(dSuicide * 3) // 자살런과 확연히 구분
  })

  it('얕은 초반 런은 매판 1~2%p 언저리의 소폭 성장이다', () => {
    const shallow = computeRunAdventureXp({ floorReached: 12, decisions: 10, progressTurns: 12 })
    const delta = computeEnaGrowth({ adventureXp: shallow, bond: 0 })
    expect(delta).toBeGreaterThanOrEqual(0.01)
    expect(delta).toBeLessThanOrEqual(0.035)
  })

  it('깊은 런을 지속하면 베테랑 근방(0.7+)에 도달한다', () => {
    let xp = 0
    for (let i = 0; i < 20; i++) {
      xp += computeRunAdventureXp({ floorReached: 30 + i * 3, decisions: 40, progressTurns: 30 + i * 3 })
    }
    expect(computeEnaGrowth({ adventureXp: xp, bond: 0.9 })).toBeGreaterThanOrEqual(0.7)
  })
})

describe('모험 xp 4축 합산과 축별 상한', () => {
  it('한 축만 파서는(행동 반복) 일반 런 상한 근처에도 못 간다', () => {
    const grind = computeRunAdventureXp({ floorReached: 5, decisions: 10000, progressTurns: 10000 })
    // base 2 + 층 5 + 결정 축 캡 8 + 시간 축 캡 8 = 23 — 층 등반 없이는 낮다.
    expect(grind).toBe(
      ENA_RUN_XP_TUNING.perRunBase + 5 + ENA_RUN_XP_TUNING.decisionAxisCap + ENA_RUN_XP_TUNING.playtimeAxisCap
    )
    expect(grind).toBeLessThan(ENA_RUN_XP_TUNING.normalRunXpCap)
  })

  it('점프 없는 런의 xp는 normalRunXpCap을 넘지 않는다(첫 경험 가산 제외)', () => {
    const xp = computeRunAdventureXp({ floorReached: 100, cleared: true, decisions: 999, progressTurns: 100 })
    expect(xp).toBe(ENA_RUN_XP_TUNING.normalRunXpCap)
  })

  it('첫 경험 가산은 카테고리별 값으로 붙고 런당 상한이 있다', () => {
    const base = computeRunAdventureXp({ floorReached: 31 })
    const withFirsts = computeRunAdventureXp({
      floorReached: 31,
      firstExperiences: ['boss-kill:30', 'altar', 'rare-relic'],
    })
    expect(withFirsts - base).toBe(5 + 4 + 5)
    const allFirsts = computeRunAdventureXp({
      floorReached: 31,
      firstExperiences: ['boss-kill:30', 'boss-kill:60', 'rare-relic', 'altar', 'starlight', 'card-unlock'],
    })
    expect(allFirsts - base).toBe(ENA_RUN_XP_TUNING.firstExperienceRunCap)
  })
})

describe('드라마 점수와 성장 점프 게이트', () => {
  it('계열별 캡 — 한 계열만으로는 점프 문턱(12)에 못 닿는다', () => {
    expect(computeRunDramaScore({ lowHpMoments: 100 })).toBe(ENA_RUN_DRAMA_TUNING.peril.cap)
    expect(computeRunDramaScore({ novelCardsUsed: 100 })).toBe(ENA_RUN_DRAMA_TUNING.novelty.cap)
    expect(ENA_RUN_DRAMA_TUNING.peril.cap).toBeLessThan(ENA_RUN_DRAMA_TUNING.jumpThreshold)
  })

  it('싱거운 첫 보스 격파(무피해 속전)는 점프가 없다 — 첫 경험 소량 xp만', () => {
    const bland = { floorReached: 31, previousBestFloor: 0, drama: {} }
    expect(isGrowthJumpRun(bland)).toBe(false)
    const xp = computeRunAdventureXp({ ...bland, firstExperiences: ['boss-kill:30'] })
    expect(xp).toBeLessThan(ENA_RUN_XP_TUNING.normalRunXpCap + ENA_RUN_XP_TUNING.firstExperienceRunCap + 1)
  })

  it('이전에 본 보스라도 유의미한 고전 끝의 격파면 점프가 열린다', () => {
    const rematch = { floorReached: 35, previousBestFloor: 45, drama: HARD_FOUGHT }
    expect(computeRunDramaScore(HARD_FOUGHT)).toBeGreaterThanOrEqual(ENA_RUN_DRAMA_TUNING.jumpThreshold)
    expect(isGrowthJumpRun(rematch)).toBe(true)
    const xp = computeRunAdventureXp(rematch)
    const noJump = computeRunAdventureXp({ ...rematch, drama: {} })
    expect(xp).toBeGreaterThan(noJump)
    expect(xp).toBeLessThanOrEqual(ENA_RUN_XP_TUNING.jumpRunXpCap)
  })

  it('기록 대폭 경신도 드라마 문턱을 넘어야 점프다(자격만으로는 부족)', () => {
    const record = { floorReached: 25, previousBestFloor: 10 } // 보스 층 미도달, +15층 경신
    expect(isGrowthJumpRun({ ...record, drama: {} })).toBe(false)
    expect(isGrowthJumpRun({ ...record, drama: HARD_FOUGHT })).toBe(true)
    // 자격 자체가 없으면(경신 폭 부족·보스 미도달) 드라마가 높아도 점프는 없다.
    expect(isGrowthJumpRun({ floorReached: 15, previousBestFloor: 10, drama: HARD_FOUGHT })).toBe(false)
  })

  it('점프 xp는 초반 기준 5~10%p급 상승에 해당한다', () => {
    const xp = computeRunAdventureXp({ floorReached: 35, previousBestFloor: 45, drama: HARD_FOUGHT })
    const delta = computeEnaGrowth({ adventureXp: xp, bond: 0 })
    expect(delta).toBeGreaterThanOrEqual(0.05)
    expect(delta).toBeLessThanOrEqual(0.1)
  })
})

describe('ROOKIE_DISPOSITION (미숙하지만 가끔은 나서는 동반자)', () => {
  it('소소한 클러치/각성은 BASE의 ~55% 수준 — 최소한의 안정감은 주되 앞지르지 않음', () => {
    for (const k of Object.keys(ROOKIE_DISPOSITION.minorClutchChance) as Array<
      keyof typeof ROOKIE_DISPOSITION.minorClutchChance
    >) {
      const ratio = ROOKIE_DISPOSITION.minorClutchChance[k] / BASE_DISPOSITION.minorClutchChance[k]
      expect(ratio).toBeGreaterThanOrEqual(0.45)
      expect(ratio).toBeLessThanOrEqual(0.65)
    }
    expect(ROOKIE_DISPOSITION.awakenChance).toBeCloseTo(BASE_DISPOSITION.awakenChance * 0.55, 5)
    // 예지 보급은 낮되 0은 아니다.
    expect(ROOKIE_DISPOSITION.predictBaseChance).toBeGreaterThanOrEqual(0.1)
    expect(ROOKIE_DISPOSITION.predictBaseChance).toBeLessThan(BASE_DISPOSITION.predictBaseChance)
    // 큰 클러치도 드물지만 발동 가능(충전 계수가 하한이 아님).
    expect(ROOKIE_DISPOSITION.willGainPerDamage).toBeGreaterThan(30)
    expect(ROOKIE_DISPOSITION.willGainPerDamage).toBeLessThan(BASE_DISPOSITION.willGainPerDamage)
  })

  it('대사 노브는 초보라도 BASE와 같다(입만 있는 동반자)', () => {
    expect(ROOKIE_DISPOSITION.situationChance).toEqual(BASE_DISPOSITION.situationChance)
    expect(ROOKIE_DISPOSITION.lootCommentChance).toBe(BASE_DISPOSITION.lootCommentChance)
    expect(ROOKIE_DISPOSITION.minTurnGapBase).toBe(BASE_DISPOSITION.minTurnGapBase)
  })
})

describe('성장 앵커 평균회귀(adaptToOutcome)', () => {
  it('growth 0에서 사망이 반복돼도 ROOKIE 하한에 눌러붙지 않는다(사망 상향이 앵커 회귀와 균형)', () => {
    const c = new CompanionSystem(cloneDisposition(ROOKIE_DISPOSITION), 0)
    for (let i = 0; i < 40; i++) c.adaptToOutcome({ died: true, floorReached: 8 })
    const d = c.getDisposition()
    expect(d.minorClutchChance.trap).toBeGreaterThan(ROOKIE_DISPOSITION.minorClutchChance.trap)
    expect(d.willGainPerDamage).toBeGreaterThan(ROOKIE_DISPOSITION.willGainPerDamage)
    // 반대로 베테랑 토대(BASE)까지 튀지도 않는다 — 초보 구간의 완만한 개인화만 허용.
    expect(d.predictBaseChance).toBeLessThan(BASE_DISPOSITION.predictBaseChance)
  })

  it('성장이 축적되면(setGrowth) 같은 결과 반복에도 성향이 BASE 방향으로 상향 회귀한다', () => {
    const c = new CompanionSystem(cloneDisposition(ROOKIE_DISPOSITION), 0)
    for (let i = 0; i < 10; i++) c.adaptToOutcome({ died: false, floorReached: 30 })
    const rookiePhase = cloneDisposition(c.getDisposition())
    c.setGrowth(1) // 모험 xp/유대 축적으로 베테랑 도달 가정
    for (let i = 0; i < 10; i++) c.adaptToOutcome({ died: false, floorReached: 30 })
    const veteranPhase = c.getDisposition()
    expect(veteranPhase.predictBaseChance).toBeGreaterThan(rookiePhase.predictBaseChance)
    expect(veteranPhase.willGainPerDamage).toBeGreaterThan(rookiePhase.willGainPerDamage)
    expect(veteranPhase.minorClutchChance.dodge).toBeGreaterThan(rookiePhase.minorClutchChance.dodge)
  })

  it('growth 조회 API를 노출한다(추후 경험 탭 연동용)', () => {
    const c = new CompanionSystem(cloneDisposition(ROOKIE_DISPOSITION), 0.3)
    expect(c.getGrowth()).toBe(0.3)
    c.setGrowth(2) // 범위 밖 입력은 0~1로 가둔다
    expect(c.getGrowth()).toBe(1)
  })
})

describe('미숙(놓친 개입) 대사 성장 연동', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('growth가 낮으면 미숙 대사가 더 자주, 높으면 원래 빈도(0.45)로 나온다', () => {
    // 0.45 <= 0.5 < 0.70 구간의 난수로 초보/베테랑 확률 차이를 결정적으로 가른다.
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const rookie = new CompanionSystem(cloneDisposition(ROOKIE_DISPOSITION), 0)
    expect(rookie.missedPotentialLine('web', 50)).not.toBeNull()
    const veteran = new CompanionSystem(cloneDisposition(BASE_DISPOSITION), 1)
    expect(veteran.missedPotentialLine('web', 50)).toBeNull()
  })

  it('턴 간격 게이트는 성장과 무관하게 유지된다', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01)
    const rookie = new CompanionSystem(cloneDisposition(ROOKIE_DISPOSITION), 0)
    expect(rookie.missedPotentialLine('web', 50)).not.toBeNull()
    // 직전 발화 직후에는 초보라도 연속으로 내지 않는다.
    expect(rookie.missedPotentialLine('web', 51)).toBeNull()
  })
})

describe('신규 폴백/기존 저장 호환', () => {
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage
  })

  it('기존 저장본 보유 플레이어는 growth와 무관하게 저장값 그대로 로드된다(급격한 하향 금지)', () => {
    installLocalStorage()
    const d = cloneDisposition(BASE_DISPOSITION)
    d.predictBaseChance = 0.7
    d.minorClutchChance.trap = 0.3
    saveDisposition(d)
    const loaded = loadDisposition(undefined, 0) // 신규 폴백이 ROOKIE여도 저장본이 우선
    expect(loaded.predictBaseChance).toBeCloseTo(0.7)
    expect(loaded.minorClutchChance.trap).toBeCloseTo(0.3)
  })

  it('저장본이 없으면 fallbackGrowth 앵커에서 시작한다', () => {
    installLocalStorage()
    expect(loadDisposition(undefined, 0)).toEqual(ROOKIE_DISPOSITION)
    const mid = loadDisposition(undefined, 0.5)
    expect(mid.predictBaseChance).toBeGreaterThan(ROOKIE_DISPOSITION.predictBaseChance)
    expect(mid.predictBaseChance).toBeLessThan(BASE_DISPOSITION.predictBaseChance)
  })
})

describe('모험 xp 영속(EnaAutonomousLearner)', () => {
  it('accrueAdventureXp는 xp/최고 기록/첫 경험 집합을 저장하고, 같은 첫 경험은 두 번 계상하지 않는다', () => {
    const store = new Map<string, string>()
    const learner = new EnaAutonomousLearner(makeStorage(store))
    const first = learner.accrueAdventureXp({
      floorReached: 31,
      cleared: false,
      decisions: 20,
      progressTurns: 31,
      experienceKeys: ['boss-kill:30', 'altar'],
    })
    const second = learner.accrueAdventureXp({
      floorReached: 31,
      cleared: false,
      decisions: 20,
      progressTurns: 31,
      experienceKeys: ['boss-kill:30', 'altar'],
    })
    expect(first - second).toBe(5 + 4) // 두 번째 런에서는 첫 경험 가산이 빠진다
    expect(learner.loadAdventureXp()).toBe(first + second)
    // 최고 기록이 저장돼 같은 층 재도달은 기록 경신 자격이 없다.
    const saved = JSON.parse(store.get(ENA_SELF_LEARNING_STORAGE_KEY)!) as { bestFloor?: number }
    expect(saved.bestFloor).toBe(31)
  })

  it('구 저장본(totalRuns만 있음)은 보수 계수로 1회 이전된다', () => {
    const store = new Map<string, string>()
    store.set(
      ENA_SELF_LEARNING_STORAGE_KEY,
      JSON.stringify({ version: 1, updatedAt: '', reflections: [], totalRuns: 10 })
    )
    const learner = new EnaAutonomousLearner(makeStorage(store))
    expect(learner.loadAdventureXp()).toBe(10 * LEGACY_XP_PER_RUN)
    // 첫 적립에서 이전값 위에 이어 쌓고 확정 저장된다.
    const gained = learner.accrueAdventureXp({ floorReached: 10, cleared: false })
    expect(learner.loadAdventureXp()).toBe(10 * LEGACY_XP_PER_RUN + gained)
    expect(new EnaAutonomousLearner(undefined).loadAdventureXp()).toBe(0)
  })
})

describe('첫 경험/새 시도 신호 도출', () => {
  it('deriveRunExperienceKeys — 층/클리어/구매 로그에서 첫 경험 후보를 만든다', () => {
    const rareRelicId = (Object.keys(RELIC_DEFINITIONS) as RelicId[]).find(
      (id) => RELIC_DEFINITIONS[id].rarity !== 'common'
    )!
    const keys = deriveRunExperienceKeys({
      floorReached: 35,
      cleared: false,
      shopPurchases: [`relic:${rareRelicId}`, 'pick:unlock-pack'],
    })
    expect(keys).toContain('boss-kill:30')
    expect(keys).toContain('altar')
    expect(keys).toContain('rare-relic')
    expect(keys).toContain('card-unlock')
    expect(keys).not.toContain('boss-kill:60')
    expect(keys).not.toContain('starlight')
    // 커먼 유물만 산 얕은 런은 발견 후보가 없다.
    const commonId = (Object.keys(RELIC_DEFINITIONS) as RelicId[]).find(
      (id) => RELIC_DEFINITIONS[id].rarity === 'common'
    )!
    expect(
      deriveRunExperienceKeys({ floorReached: 8, cleared: false, shopPurchases: [`relic:${commonId}`] })
    ).toEqual([])
  })

  it('countNovelCardUses — 과거 런에 없던 카드를 이번 런에 2회 이상 썼을 때만 센다', () => {
    const entry = (used: Record<string, number>): EnaPlayLogEntry => ({
      runId: 'r',
      turnReached: 10,
      survived: false,
      usedHandCards: used as EnaPlayLogEntry['usedHandCards'],
      shopPurchases: [],
    })
    const past = entry({ ember: 5 })
    expect(countNovelCardUses([past, entry({ ember: 3, wax: 2 })])).toBe(1) // wax 첫 사용+유의미
    expect(countNovelCardUses([past, entry({ ember: 3, wax: 1 })])).toBe(0) // 한 번 실험은 제외
    expect(countNovelCardUses([past, entry({ ember: 9 })])).toBe(0) // 반복 사용은 새 시도가 아님
    expect(countNovelCardUses([entry({ ember: 2 })])).toBe(1) // 첫 런의 주력 카드도 첫 시도
  })
})
