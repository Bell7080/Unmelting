import { describe, it, expect, vi, afterEach } from 'vitest'
import { CompanionSystem, resolveKoreanParticles } from './CompanionSystem'

describe('resolveKoreanParticles', () => {
  it('받침 유무로 은/는·이/가·을/를을 고른다', () => {
    expect(resolveKoreanParticles('나[은/는]')).toBe('나는') // 받침 없음
    expect(resolveKoreanParticles('얼굴[은/는]')).toBe('얼굴은') // ㄹ 받침
    expect(resolveKoreanParticles('불씨[을/를]')).toBe('불씨를') // 받침 없음
    expect(resolveKoreanParticles('앞[을/를]')).toBe('앞을') // 받침 있음
    expect(resolveKoreanParticles('적[이/가]')).toBe('적이') // 받침 있음
  })

  it("'으로/로'는 ㄹ 받침과 받침 없음에 '로'를, 그 외엔 '으로'를 쓴다", () => {
    expect(resolveKoreanParticles('서울[으로/로]')).toBe('서울로') // ㄹ 받침
    expect(resolveKoreanParticles('바다[으로/로]')).toBe('바다로') // 받침 없음
    expect(resolveKoreanParticles('집[으로/로]')).toBe('집으로') // ㅂ 받침
  })

  it('문장 중간의 여러 조사와 한글 외 글자를 안전하게 처리한다', () => {
    expect(resolveKoreanParticles('나[은/는] 앞[을/를] 봐')).toBe('나는 앞을 봐')
    // 앞 글자가 한글이 아니면 받침 없음으로 본다.
    expect(resolveKoreanParticles('A[은/는]')).toBe('A는')
  })

  it("'이었/였'·'이라/라'는 일반쌍 규칙(받침→앞항)을 그대로 따른다", () => {
    expect(resolveKoreanParticles('별[이었/였]다')).toBe('별이었다') // ㄹ 받침도 일반쌍은 앞항
    expect(resolveKoreanParticles('마녀[이었/였]다')).toBe('마녀였다')
    expect(resolveKoreanParticles('보물[이라/라]니')).toBe('보물이라니')
    expect(resolveKoreanParticles('마녀[이라/라]니')).toBe('마녀라니')
  })

  it("'으니/니'는 으로/로 계열: 받침 없거나 ㄹ 받침이면 '니'", () => {
    expect(resolveKoreanParticles('있[으니/니]')).toBe('있으니') // 받침
    expect(resolveKoreanParticles('왔[으니/니]')).toBe('왔으니')
    expect(resolveKoreanParticles('보내[으니/니]')).toBe('보내니') // 받침 없음
    // ㄹ 받침은 뒤항을 따른다(어간 ㄹ 탈락 표기는 작성 단계 책임).
    expect(resolveKoreanParticles('가[으니/니]')).toBe('가니')
  })
})

describe('CompanionSystem', () => {
  it('onSettle은 클릭 멈춤 대사를 내지 않고 연타 상태만 정리한다', () => {
    const c = new CompanionSystem()
    expect(c.onSettle()).toBeNull()
    c.onProfileTouch(Date.now(), { danger: false })
    expect(c.onSettle()).toBeNull()
    // 연타 상태가 정리되어 다음 터치가 과한 반응으로 이어지지 않는다.
    expect(c.onProfileTouch(Date.now() + 1, { danger: false })).not.toContain('그만')
  })

  it('첫 터치는 항상 비어있지 않은 문자열로 응답한다', () => {
    // 새 인스턴스의 첫 터치(streak 1)는 throttle을 통과한다.
    expect(new CompanionSystem().onProfileTouch(Date.now(), { danger: false })!.length).toBeGreaterThan(0)
    expect(new CompanionSystem().onProfileTouch(Date.now(), { danger: true })!.length).toBeGreaterThan(0)
  })

  it('필드 소개: 한 종류는 전체 문장, 여러 종류는 한 줄로 묶고, 빈 목록은 침묵한다', () => {
    const c = new CompanionSystem()
    // 빈 목록 → 발화 없음.
    expect(c.introduceFields([])).toBeNull()
    // 한 종류 → 비어있지 않은 소개 한 줄.
    const single = c.introduceFields(['rock'])
    expect(single && single.length).toBeGreaterThan(0)
    expect(single).not.toMatch(/[{}[\]]/)
    // 세 종류 동시 → 한 줄에 세 절을 모두 담아 스팸 없이 소개한다(사용자 핵심 요구: 동시 조우 배칭).
    const combined = c.introduceFields(['junk', 'rock', 'bush'])!
    expect(combined).toContain('바위')
    expect(combined).toContain('덤불')
    expect(combined).toContain('잡동사니')
    // 순서는 조우 순서와 무관하게 rock→bush→junk로 안정된다.
    expect(combined.indexOf('바위')).toBeLessThan(combined.indexOf('덤불'))
    expect(combined.indexOf('덤불')).toBeLessThan(combined.indexOf('잡동사니'))
    expect(combined).not.toMatch(/[{}[\]]/)
    expect(combined).not.toContain('  ') // 이중 공백 없음.
  })

  it('터치 응답 문자열에 미치환 자국({}, []) 없이 렌더된다', () => {
    const c = new CompanionSystem()
    for (let i = 0; i < 80; i++) {
      const line = c.onProfileTouch(Date.now(), { danger: false })
      if (line) expect(line).not.toMatch(/[{}[\]]/)
    }
  })

  it('상황 바크는 턴 간격을 두고 나온다(직후 턴은 침묵, 충분히 지나면 다시 가능)', () => {
    const c = new CompanionSystem()
    // 확률 통과로 처음 말한 턴을 찾는다(턴마다 시도).
    let spokeTurn = -1
    for (let turn = 0; turn < 2000 && spokeTurn < 0; turn++) {
      if (c.reactSituation('web', turn)) spokeTurn = turn
    }
    expect(spokeTurn).toBeGreaterThanOrEqual(0)
    // 바로 다음 턴은 간격 때문에 침묵.
    expect(c.reactSituation('web', spokeTurn + 1)).toBeNull()
    // 최대 간격(10턴) 이상 지나면 다시 가능(확률 통과 시).
    let later: string | null = null
    for (let turn = spokeTurn + 10; turn < spokeTurn + 400 && later === null; turn++) {
      later = c.reactSituation('web', turn)
    }
    expect(later).not.toBeNull()
  })

  it('클러치: 의지가 가득 차고 체력 위기일 때만 보통 강도 지원을 계획하고 소진된다', () => {
    const c = new CompanionSystem()
    // 의지 0 → 발동 안 함.
    expect(c.evaluateClutch({ hp: 3, maxHp: 20, hpRatio: 0.15, emberLow: false })).toBeNull()
    c.gainWillFlat(100)
    const plan = c.evaluateClutch({ hp: 3, maxHp: 20, hpRatio: 0.15, emberLow: false })
    expect(plan).not.toBeNull()
    expect(['heal', 'shield']).toContain(plan!.kind)
    // 위력은 상한 고정(보통 강도) — 폭주하지 않는다.
    expect(plan!.amount).toBeGreaterThanOrEqual(3)
    expect(plan!.amount).toBeLessThanOrEqual(12)
    expect(plan!.line.length).toBeGreaterThan(0)
    // 발동 후 의지 소진 → 다시 발동 안 함.
    expect(c.evaluateClutch({ hp: 3, maxHp: 20, hpRatio: 0.15, emberLow: false })).toBeNull()
  })

  it('클러치: 체력은 멀쩡하고 불씨만 위태로우면 성냥 클러치', () => {
    const c = new CompanionSystem()
    c.gainWillFlat(100)
    const plan = c.evaluateClutch({ hp: 18, maxHp: 20, hpRatio: 0.9, emberLow: true })
    expect(plan!.kind).toBe('ember')
  })

  it('클러치: 체력과 불씨가 안전하면 예지 손패를 직접 건네는 지원도 계획한다', () => {
    const c = new CompanionSystem()
    c.gainWillFlat(100)
    const plan = c.evaluateClutch({ hp: 18, maxHp: 20, hpRatio: 0.9, emberLow: false, supportCardId: 'chitin', supportReason: '거미줄 대비' })
    expect(plan!.kind).toBe('hand')
    expect(plan!.cardId).toBe('chitin')
  })

  it('각성은 런당 한 번뿐이고 resetForRun으로 다시 가능해진다', () => {
    const c = new CompanionSystem()
    let fired = false
    for (let i = 0; i < 2000 && !fired; i++) fired = c.tryAwaken()
    expect(fired).toBe(true)
    expect(c.tryAwaken()).toBe(false)
    c.resetForRun()
    let again = false
    for (let i = 0; i < 2000 && !again; i++) again = c.tryAwaken()
    expect(again).toBe(true)
  })

  it("적 이름의 수식어를 무시하고 핵심 키워드로 반응한다('양초 거미'→거미)", () => {
    const c = new CompanionSystem()
    // 거미 전용 풀에는 '거미' 낱말이 없는 문장도 있어, 한 줄이 아니라 여러 줄을 표집해
    // 전용 풀 선택을 확인한다(important=true로 게이트 우회, 확률 flake 방지).
    const lines: string[] = []
    for (let turn = 0; turn < 600 && lines.length < 12; turn++) {
      const line = c.reactSituation('kill', turn, 'normal', true, '양초 거미')
      if (line) lines.push(line)
    }
    expect(lines.length).toBeGreaterThan(0)
    expect(lines.some((line) => line.includes('거미'))).toBe(true)
  })

  it('유물 구매 감상평: 사치품은 전용, 미등록은 등급 폴백으로 깨끗하게 나온다', () => {
    const c = new CompanionSystem()
    const luxury = c.onBuyRelic('luxury', 'common')
    expect(luxury.length).toBeGreaterThan(0)
    expect(luxury).not.toMatch(/[{}[\]]/)
    const ring = c.onBuyRelic('annabella-ring', 'rare')
    expect(ring).toContain('반지')
    const fallback = c.onBuyRelic('unknown-relic', 'legendary')
    expect(fallback.length).toBeGreaterThan(0)
    expect(fallback).not.toMatch(/[{}[\]]/)
  })

  it('예측 대비: 권고 없거나 청소 수단 보유 시 발동 안 하고, 발동 후 간격을 둔다', () => {
    const c = new CompanionSystem()
    expect(c.evaluateWebPrediction(false, false, 100)).toBe(false) // 권고 없음
    expect(c.evaluateWebPrediction(true, true, 100)).toBe(false) // 이미 청소 수단 보유
    let firedTurn = -1
    for (let t = 200; t < 800 && firedTurn < 0; t++) {
      if (c.evaluateWebPrediction(true, false, t)) firedTurn = t
    }
    expect(firedTurn).toBeGreaterThan(0)
    // 방금 발동 → 근접 턴은 간격 때문에 발동 안 함.
    expect(c.evaluateWebPrediction(true, false, firedTurn + 1)).toBe(false)
    expect(c.predictLine('web')).not.toMatch(/[{}[\]]/)
  })

  it('예측 대비 결과 점수에 따라 predictiveWeight를 올리거나 낮춘다', () => {
    const c = new CompanionSystem()
    c.recordPredictionOutcome(1.4)
    expect(c.getLearningSnapshot().predictiveWeight).toBeGreaterThan(1)
    c.recordPredictionOutcome(0)
    expect(c.getLearningSnapshot().predictiveWeight).toBeLessThan(1.4)
  })

  it('소소한 클러치 대사가 깨끗하게 나온다(신설 ember/cleanse 포함)', () => {
    const c = new CompanionSystem()
    for (const k of ['crit', 'dodge', 'trap', 'treasure', 'ember', 'cleanse'] as const) {
      expect(c.minorClutchLine(k)).not.toMatch(/[{}[\]]/)
    }
  })

  it('직업 인사/손패 사용 한줄평이 깨끗한 문자열로 나온다', () => {
    const c = new CompanionSystem()
    expect(c.onJobSelect('knight')).not.toMatch(/[{}[\]]/)
    expect(c.onJobSelect('unknown-job').length).toBeGreaterThan(0) // 폴백
    let use: string | null = null
    for (let turn = 0; turn < 500 && use === null; turn++) use = c.onUseCard('wax', 'control', turn)
    expect(use).not.toBeNull()
    expect(use!).not.toMatch(/[{}[\]]/)
  })

  it('전용 대사가 없는 손패는 카테고리 폴백 한줄평을 깨끗하게 돌려준다', () => {
    const c = new CompanionSystem()
    let line: string | null = null
    for (let turn = 0; turn < 500 && line === null; turn++) {
      line = c.onAcquireCard('unknown-card', 'attack', turn)
    }
    expect(line).not.toBeNull()
    expect(line!).not.toMatch(/[{}[\]]/)
  })
})

describe('CompanionSystem 콜백(최근 사건 되짚기)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('최근 3턴 내 같은 적에게 맞은 뒤 처치하면 그 적을 지목한 콜백이 나온다', () => {
    const c = new CompanionSystem()
    // random=0: 발화 확률·콜백 확률(0.25)·풀 선택이 모두 결정적으로 통과한다.
    vi.spyOn(Math, 'random').mockReturnValue(0)
    c.reactSituation('hit', 10, undefined, true, '양초 거미')
    const line = c.reactSituation('kill', 12, undefined, true, '양초 거미')
    expect(line).toContain('양초 거미')
  })

  it('다른 적을 처치하거나 기억이 오래됐으면 복수 콜백이 나오지 않는다', () => {
    const c = new CompanionSystem()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    c.reactSituation('hit', 10, undefined, true, '양초 거미')
    expect(c.reactSituation('kill', 12, undefined, true, '양초 박쥐')).not.toContain('양초 박쥐가 준 만큼')
    const stale = new CompanionSystem()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    stale.reactSituation('hit', 10, undefined, true, '양초 거미')
    expect(stale.reactSituation('kill', 20, undefined, true, '양초 거미')).not.toContain('양초 거미')
  })

  it('직전 턴에 이어 또 맞으면 연속 피격 콜백이 나온다', () => {
    const c = new CompanionSystem()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    c.reactSituation('hit', 10, undefined, true)
    const line = c.reactSituation('hit', 11, undefined, true)
    expect(line).toContain('연달아')
  })

  it('최근 클러치 뒤 보물은 도와준 보람 콜백이 나오고, 새 런 리셋 후에는 나오지 않는다', () => {
    const c = new CompanionSystem()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    c.recordRecentEvent('clutch', 10)
    expect(c.reactSituation('treasure', 12, undefined, true)).toContain('보람')
    // resetForRun이 링버퍼를 비워 지난 런의 기억이 새 런으로 새지 않는다.
    c.recordRecentEvent('clutch', 10)
    c.resetForRun()
    expect(c.reactSituation('treasure', 12, undefined, true)).not.toContain('보람')
  })
})
