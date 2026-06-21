import { describe, it, expect } from 'vitest'
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
})

describe('CompanionSystem', () => {
  it('터치 전에는 onSettle이 null, 터치 후에는 마무리 대사를 돌려준다', () => {
    const c = new CompanionSystem()
    expect(c.onSettle()).toBeNull()
    c.onProfileTouch(Date.now(), { danger: false })
    expect(typeof c.onSettle()).toBe('string')
    // 정산했으니 다시 null.
    expect(c.onSettle()).toBeNull()
  })

  it('첫 터치는 항상 비어있지 않은 문자열로 응답한다', () => {
    // 새 인스턴스의 첫 터치(streak 1)는 throttle을 통과한다.
    expect(new CompanionSystem().onProfileTouch(Date.now(), { danger: false })!.length).toBeGreaterThan(0)
    expect(new CompanionSystem().onProfileTouch(Date.now(), { danger: true })!.length).toBeGreaterThan(0)
  })

  it('연타 throttle: 빠른 연타는 일부만 응답한다(전부 응답하지 않음)', () => {
    const c = new CompanionSystem()
    let voiced = 0
    const now = Date.now()
    for (let i = 0; i < 60; i++) if (c.onProfileTouch(now, { danger: false })) voiced += 1
    // 60연타 중 일부만 — 첫 한두 번 + 낮은 확률. 전부(60) 응답하지 않는다.
    expect(voiced).toBeLessThan(30)
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
