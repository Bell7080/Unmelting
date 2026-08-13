/**
 * Tooltip — 게임 전역 공용 툴팁 박스. 브라우저 기본 title= 대신 이 창구를 쓰면
 * 검은 배경 + 얇은 금빛 발광 테두리의 통일된 박스로 뜬다.
 *
 * 사용법: 엘리먼트에 `data-tooltip="문구"`만 달면 된다. 표시/위치/줄바꿈은 이 모듈이
 * document 위임 리스너 하나로 전부 처리한다(호출부마다 따로 붙이지 않는다).
 *
 * 줄바꿈 규칙: 마침표(.)로 끝나는 문장 경계에서만 줄을 나눈다. 그 외에는 박스가
 * 내용 폭만큼 늘어나（width: max-content）중간에 꺾이지 않는다 — 짧은 한 문구가
 * 어색하게 두 줄로 접히는 것을 막는다. 여러 문장(출처 목록 등)을 보여줄 때는
 * 각 문장 끝에 마침표를 찍어 넘기면 자동으로 한 줄씩 쌓인다.
 */
import { escapeHtml } from '@ui/renderer/Html'

const STYLE_ID = 'ui-tooltip-styles'
const HOST_ID = 'ui-tooltip-host'

/** 마침표 뒤 공백 경계에서만 쪼갠다 — 그 외 텍스트는 한 줄로 둔다. */
function formatTooltipHtml(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  const sentences = trimmed.split(/(?<=\.)\s+/).filter(Boolean)
  return sentences.map(escapeHtml).join('<br>')
}

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
#${HOST_ID} { position: fixed; inset: 0; z-index: 10650; pointer-events: none; }
.ui-tooltip {
  position: fixed;
  width: max-content;
  max-width: min(320px, 88vw);
  padding: 8px 14px;
  border-radius: 12px;
  background: rgba(8, 6, 6, 0.94);
  border: 1px solid rgba(255, 205, 112, 0.55);
  box-shadow: 0 0 10px rgba(255, 205, 112, 0.32), 0 10px 22px rgba(0, 0, 0, 0.55);
  color: rgba(255, 236, 188, 0.96);
  font: 700 16px/1.45 'OkDanDan', Georgia, serif;
  letter-spacing: 0.01em;
  text-align: center;
  white-space: normal;
  opacity: 0;
  transform: translateY(2px);
  transition: opacity 0.12s ease, transform 0.12s ease;
}
.ui-tooltip.is-in { opacity: 1; transform: translateY(0); }
`
  document.head.appendChild(style)
}

function ensureHost(): HTMLElement {
  let host = document.getElementById(HOST_ID)
  if (!host) {
    host = document.createElement('div')
    host.id = HOST_ID
    document.body.appendChild(host)
  }
  return host
}

function positionBox(box: HTMLElement, anchor: DOMRect): void {
  const bw = box.offsetWidth
  const bh = box.offsetHeight
  let left = anchor.left + anchor.width / 2 - bw / 2
  let top = anchor.top - bh - 10
  left = Math.max(8, Math.min(left, window.innerWidth - bw - 8))
  if (top < 8) top = anchor.bottom + 10
  box.style.left = `${left}px`
  box.style.top = `${top}px`
}

/** 지금 툴팁이 붙어 있는 요소. 이 요소가 DOM에서 사라지면 mouseout이 영영 오지 않으므로
 *  (재렌더로 통째 교체되는 오버레이가 그렇다) 아래 감시자가 대신 툴팁을 걷는다. */
let anchor: HTMLElement | null = null
let anchorObserver: MutationObserver | null = null

/** 앵커가 DOM에서 빠지는 순간을 잡는다 — 툴팁이 떠 있는 동안에만 돌고 끝나면 끊는다. */
function watchAnchorRemoval(): void {
  anchorObserver ??= new MutationObserver(() => {
    if (anchor && !anchor.isConnected) hideTooltip()
  })
  anchorObserver.observe(document.body, { childList: true, subtree: true })
}

function showTooltip(target: HTMLElement, text: string): void {
  const html = formatTooltipHtml(text)
  if (!html) return
  const host = ensureHost()
  host.innerHTML = `<div class="ui-tooltip" role="tooltip">${html}</div>`
  const box = host.firstElementChild as HTMLElement
  positionBox(box, target.getBoundingClientRect())
  requestAnimationFrame(() => box.classList.add('is-in'))
  anchor = target
  watchAnchorRemoval()
}

function hideTooltip(): void {
  const host = document.getElementById(HOST_ID)
  if (host) host.innerHTML = ''
  anchor = null
  anchorObserver?.disconnect()
}

/**
 * 툴팁을 지금 즉시 접는다. 앵커가 **DOM에는 남아 있는데 화면에서만 사라지는** 경우
 * (오버레이가 is-open 클래스만 떼고 닫힐 때)는 mouseout도 제거 감시도 오지 않으므로,
 * 그런 닫기 경로가 직접 불러 준다.
 */
export function hideGlobalTooltip(): void {
  hideTooltip()
}

/** 부팅 시 1회 호출 — document 위임으로 [data-tooltip] 엘리먼트 전체를 커버한다. */
export function initGlobalTooltips(): void {
  injectStyles()
  document.addEventListener('mouseover', (e) => {
    const el = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-tooltip]')
    if (el) showTooltip(el, el.dataset.tooltip ?? '')
  })
  document.addEventListener('mouseout', (e) => {
    const el = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-tooltip]')
    if (!el) return
    const related = e.relatedTarget as Node | null
    if (related && el.contains(related)) return // 같은 요소 안에서의 이동은 무시(깜빡임 방지)
    hideTooltip()
  })
  // 스크롤/리사이즈 중엔 낡은 위치로 붙어 있는 것보다 접는 편이 낫다.
  window.addEventListener('scroll', hideTooltip, true)
  window.addEventListener('resize', hideTooltip)
}
