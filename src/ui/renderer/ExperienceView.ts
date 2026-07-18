/**
 * ExperienceView — 경험(에나 성향) 탭 오버레이 + 정산 성좌 위젯 서브뷰.
 * GameBoardRenderer에서 표시 책임만 옮겨 왔다 — 렌더러 상태를 읽지 않고
 * 성향/성장 데이터만 인자·공급자로 받는 자립 뷰라 host 참조가 없다.
 */

import type { EnaDisposition } from '@systems/EnaDisposition'
import type { EnaLearningSnapshot } from '@systems/CompanionSystem'
import { baselineConstellationAxes, experienceAxes } from '@ui/ExperienceAxes'
import { experienceIcon } from '@ui/Icons'

export class ExperienceView {
  /** HUD 경험 버튼용 — 공급자가 연결돼 있을 때만 현재 성향 데이터를 읽어 연다. */
  openFromProvider(): void {
    const data = this.experienceDataProvider?.()
    if (data) this.openExperience(data.disp, data.learning, data.growth)
  }

  /** 경험 패널이 현재 성향/성장值를 읽어올 공급자. index.ts가 동료 시스템을 연결한다. */
  private experienceDataProvider?: () => { disp: EnaDisposition; learning?: EnaLearningSnapshot; growth?: number }

  setExperienceDataProvider(fn: () => { disp: EnaDisposition; learning?: EnaLearningSnapshot; growth?: number }): void {
    this.experienceDataProvider = fn
  }

  /** 경험(성향) 패널을 연다 — 에나의 현재 성향을 불빛 성좌(레이더)로 시각화한다.
   *  disp=현재 성향, growth=표기 배율용 성장值. 점선 기준은 초보 시작 모양(baselineConstellationAxes) 고정. 읽기 전용 브라우저. */
  openExperience(disp: EnaDisposition, learning?: EnaLearningSnapshot, growth?: number): void {
    let host = document.getElementById('experience-overlay') as HTMLElement | null
    if (!host) {
      host = document.createElement('div')
      host.id = 'experience-overlay'
      host.className = 'experience-overlay'
      document.body.appendChild(host)
      host.addEventListener('click', (e) => {
        const t = e.target as HTMLElement
        if (t.dataset.experienceClose !== undefined || t === host) this.closeExperience()
      })
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && host?.classList.contains('is-open')) this.closeExperience()
      })
    }
    host.innerHTML = this.renderExperience(disp, learning, growth)
    host.classList.add('is-open')
  }

  private closeExperience(): void {
    document.getElementById('experience-overlay')?.classList.remove('is-open')
  }

  /** 성향 → 플레이어가 읽는 5개 '성좌 축'(0~1)으로 압축한다.
   *  계산·성장 단계 공통 표기 배율은 순수 모듈 ExperienceAxes로 분리 — 동작값 불변 테스트 대상. */
  private experienceAxes(disp: EnaDisposition, learning?: EnaLearningSnapshot, growth?: number): { key: string; value: number; desc: string }[] {
    return experienceAxes(disp, learning, growth)
  }

  /**
   * 성좌(레이더) SVG + 축 라벨 마크업을 만든다 — 경험 모달과 정산 화면이 공유한다.
   * axes=현재 성향 축, baseAxes=시작 점선 기준. 순수 문자열 생성(부수효과 없음).
   * deltas(%p)가 오면 오른 축 라벨에 +칩을 붙이고 그 꼭짓점을 더 밝게 맥동시킨다(정산 화면 전용).
   */
  private buildConstellation(axes: { key: string; value: number; desc: string }[], baseAxes: { key: string; value: number; desc: string }[], deltas?: number[]): { svg: string; labels: string } {
    const n = axes.length
    const cx = 50
    const cy = 50
    const R = 40
    const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n
    const pt = (i: number, v: number) => [cx + R * v * Math.cos(angle(i)), cy + R * v * Math.sin(angle(i))]
    const poly = (vals: number[]) => vals.map((v, i) => pt(i, v).map((c) => c.toFixed(2)).join(',')).join(' ')
    const ring = (level: number) => poly(axes.map(() => level))

    // 불빛 성좌 격자: 동심 링 3겹 + 중심에서 각 축으로 뻗는 살.
    const grid = [0.33, 0.66, 1].map((lv) => `<polygon class="exp-ring" points="${ring(lv)}"/>`).join('')
    const spokes = axes.map((_, i) => { const [x, y] = pt(i, 1); return `<line class="exp-spoke" x1="${cx}" y1="${cy}" x2="${x.toFixed(2)}" y2="${y.toFixed(2)}"/>` }).join('')
    // 시작 기준(성장 비교용) 점선 + 현재 성향 채움.
    const basePoly = `<polygon class="exp-base" points="${poly(baseAxes.map((a) => a.value))}"/>`
    const curPoly = `<polygon class="exp-current" points="${poly(axes.map((a) => a.value))}"/>`
    // 각 축 현재값 위치에도 경험 메인 아이콘과 같은 네 꼭짓점 반짝임을 둔다.
    const nodes = axes.map((a, i) => {
      const [x, y] = pt(i, a.value)
      const long = 2.2
      const short = 0.64
      const points = [
        [x, y - long], [x + short, y - short], [x + long, y], [x + short, y + short],
        [x, y + long], [x - short, y + short], [x - long, y], [x - short, y - short],
      ].map(([px, py]) => `${px.toFixed(2)},${py.toFixed(2)}`).join(' ')
      const risen = (deltas?.[i] ?? 0) >= 0.1
      return `<polygon class="exp-node${risen ? ' is-risen' : ''}" points="${points}"/>`
    }).join('')

    const svg = `<svg class="experience-radar" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${grid}${spokes}${basePoly}${curPoly}${nodes}</svg>`

    // 축 이름표는 HTML로 림 바깥에 배치(텍스트 왜곡 방지).
    const labels = axes.map((a, i) => {
      const lx = cx + 49 * Math.cos(angle(i))
      const ly = cy + 49 * Math.sin(angle(i))
      const pct = Math.round(a.value * 100)
      // 이번 런의 상승분(%p) 칩 — 0.1%p 미만의 미세 변화/하락은 정산 화면을 어지럽히지 않게 생략.
      const d = deltas?.[i] ?? 0
      const deltaChip = d >= 0.1 ? `<span class="exp-axis-delta">+${d.toFixed(1)}</span>` : ''
      return `<div class="exp-axis-label" style="left:${lx.toFixed(1)}%;top:${ly.toFixed(1)}%"><span class="exp-axis-name">${a.key}</span><span class="exp-axis-pct">${pct}${deltaChip}</span></div>`
    }).join('')
    return { svg, labels }
  }

  /**
   * 정산 화면용 컴팩트 성좌 — 모달 크롬 없이 육각형 + 축 라벨만 담은 작은 위젯.
   * 새싹 병아리 클리어 정산에서 "에나의 경험이 자랐다"를 실제 육각형으로 보여 준다.
   */
  renderSettlementHexagon(disp: EnaDisposition, learning?: EnaLearningSnapshot, growth?: number, prevAxisValues?: number[]): string {
    const axes = this.experienceAxes(disp, learning, growth)
    const baseAxes = baselineConstellationAxes()
    // 런 시작 시점 축 값(prevAxisValues)이 오면 "이번 모험으로 얼마나 올랐나"를 %p로 계산해
    // 오른 축 라벨에 +칩, 꼭짓점에 강조 맥동, 아래에 한 줄 요약을 붙인다.
    const deltas = prevAxisValues && prevAxisValues.length === axes.length
      ? axes.map((a, i) => (a.value - prevAxisValues[i]) * 100)
      : undefined
    const { svg, labels } = this.buildConstellation(axes, baseAxes, deltas)
    const risen = deltas
      ? axes.map((a, i) => ({ key: a.key, d: deltas[i] })).filter((r) => r.d >= 0.1)
      : []
    const growthNote = deltas
      ? `<p class="settlement-growth-note">${
          risen.length > 0
            ? `이번 모험으로 ${risen.map((r) => `${r.key} +${r.d.toFixed(1)}`).join(' · ')}`
            : '이번 모험은 마음속에 조용히 쌓였다'
        }</p>`
      : ''
    return `
      <div class="settlement-constellation experience-constellation">
        ${svg}
        ${labels}
        <div class="experience-core" aria-hidden="true"><span class="experience-core-icon">${experienceIcon()}</span><span class="experience-core-name">에나</span></div>
      </div>${growthNote}`
  }

  private renderExperience(disp: EnaDisposition, learning?: EnaLearningSnapshot, growth?: number): string {
    const axes = this.experienceAxes(disp, learning, growth)
    // 기준 점선은 초보 에나 시작 모양(ROOKIE, growth 0) 고정 — 신규/리셋 직후엔 실선과 겹치고,
    // 성장하면 실선이 점선을 넘어 자라 "시작점 대비 성장"으로 읽힌다.
    const baseAxes = baselineConstellationAxes()
    const { svg, labels } = this.buildConstellation(axes, baseAxes)

    const legend = axes.map((a, i) => {
      const pct = Math.round(a.value * 100)
      const basePct = Math.round(baseAxes[i].value * 100)
      const drift = pct - basePct
      const driftTag = drift === 0 ? '' : `<span class="exp-drift ${drift > 0 ? 'up' : 'down'}">${drift > 0 ? '+' : ''}${drift}</span>`
      return `
        <li class="exp-legend-row">
          <span class="exp-legend-name">${a.key}</span>
          <span class="exp-legend-bar"><span class="exp-legend-fill" style="width:${pct}%"></span></span>
          <span class="exp-legend-val"><span class="exp-legend-current">현재 ${pct}%</span>${driftTag}</span>
          <span class="exp-legend-desc">${a.desc} · 시작 ${basePct}% → 현재 ${pct}%</span>
        </li>`
    }).join('')

    return `
      <div class="experience-modal" role="dialog" aria-label="경험">
        <header class="experience-header">
          <h2 class="experience-title"><span class="experience-title-icon">${experienceIcon()}</span>경험</h2>
          <button class="experience-close" data-experience-close type="button" aria-label="닫기">✕</button>
        </header>
        <section class="experience-body">
          <div class="experience-constellation">
            ${svg}
            ${labels}
            <div class="experience-core" aria-hidden="true"><span class="experience-core-icon">${experienceIcon()}</span><span class="experience-core-name">에나</span></div>
          </div>
          <ul class="experience-legend">${legend}</ul>
        </section>
        <footer class="experience-footer">함께한 모험으로 빚어진 에나의 성향 · 점선은 처음 함께하던 날의 시작점, 채움은 지금의 너에게 맞춰진 모습</footer>
      </div>
    `
  }
}
