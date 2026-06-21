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

  it('모든 반응 진입점이 비어있지 않은 문자열을 돌려준다', () => {
    const c = new CompanionSystem()
    expect(c.onProfileTouch(Date.now(), { danger: false }).length).toBeGreaterThan(0)
    expect(c.onProfileTouch(Date.now(), { danger: true }).length).toBeGreaterThan(0)
    expect(c.onInterrupt().length).toBeGreaterThan(0)
  })

  it('템플릿 슬롯에 미치환 자국({}, []) 없이 렌더된다', () => {
    const c = new CompanionSystem()
    for (let i = 0; i < 50; i++) {
      const line = c.onProfileTouch(Date.now(), { danger: false })
      expect(line).not.toMatch(/[{}[\]]/)
    }
  })

  it('상황 바크는 한 턴에 예산만큼만(기본 1회) 나오고 턴이 바뀌면 다시 가능하다', () => {
    const c = new CompanionSystem()
    // 같은 턴에서 확률 통과할 때까지 시도 → 성공 시 그 턴 예산 소진.
    let first: string | null = null
    for (let i = 0; i < 500 && first === null; i++) first = c.reactSituation('web', 7)
    expect(first).not.toBeNull()
    // 같은 턴 재호출은 예산 소진으로 침묵.
    expect(c.reactSituation('web', 7)).toBeNull()
    // 턴이 바뀌면 다시 가능(확률 통과 시).
    let next: string | null = null
    for (let i = 0; i < 500 && next === null; i++) next = c.reactSituation('web', 8)
    expect(next).not.toBeNull()
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
