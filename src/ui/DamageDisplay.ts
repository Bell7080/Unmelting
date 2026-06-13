/**
 * DamageDisplay — ATK/HP 배율 피해 공식을 desc-dyn HTML로 변환하는 매니저.
 *
 * 규칙:
 * - __s (기본): 현재 공격력 기반 합산 피해 수치
 * - __d (Shift): 배율 수식 (예: 1.5검+3)
 * - 모든 소수점은 Math.floor 처리
 * - 강화팩 bonus는 합산 피해 및 수식 뒤에 +N 형태로 표시
 */

import { swordIcon, heartIcon } from './Icons'

/** 배율 숫자를 "1.5", "3.0" 형식으로 포맷한다 (정수이면 .0 강제). */
function fmtMult(n: number): string {
  return Number.isInteger(n) ? `${n}.0` : String(n)
}

/** addend를 "+3", "-1", "" 형식으로 반환한다. */
function fmtAdd(n: number): string {
  if (n > 0) return `+${n}`
  if (n < 0) return `${n}`
  return ''
}

/**
 * ATK 배율 피해 span 반환.
 * @example atkDmgHtml(3, 1.5, 3, 0) → "6피해" / "(1.5검+3)피해"
 */
export function atkDmgHtml(atk: number, mult: number, addend = 0, bonus = 0): string {
  const total = Math.floor(mult * atk) + addend + bonus
  const bonusSuffix = bonus > 0 ? `+${bonus}` : ''
  return [
    `<span class="desc-dyn">`,
    `<span class="desc-dyn__s">${total}피해</span>`,
    `<span class="desc-dyn__d">(${fmtMult(mult)}${swordIcon()}${fmtAdd(addend)}${bonusSuffix})피해</span>`,
    `</span>`,
  ].join('')
}

/**
 * 최대 체력 배율 피해 span 반환 (레바테인 전용).
 * @example hpDmgHtml(100, 0.3, 10, 0) → "40피해" / "(0.3♥+10)피해"
 */
export function hpDmgHtml(maxHp: number, mult: number, addend = 0, bonus = 0): string {
  const total = Math.floor(mult * maxHp) + addend + bonus
  const bonusSuffix = bonus > 0 ? `+${bonus}` : ''
  return [
    `<span class="desc-dyn">`,
    `<span class="desc-dyn__s">${total}피해</span>`,
    `<span class="desc-dyn__d">(${String(mult)}${heartIcon()}${fmtAdd(addend)}${bonusSuffix})피해</span>`,
    `</span>`,
  ].join('')
}

/**
 * 범위 피해 span 반환 — 최솟값 고정, 최댓값은 ATK 배율 (불화살 전용).
 * @example rangeDmgHtml(3, 1, 1.0, 3, 0) → "1~6피해" / "1~(1.0검+3)피해"
 */
export function rangeDmgHtml(
  atk: number,
  fixedMin: number,
  mult: number,
  addend = 0,
  bonus = 0,
): string {
  const maxTotal = Math.floor(mult * atk) + addend + bonus
  const bonusSuffix = bonus > 0 ? `+${bonus}` : ''
  return [
    `<span class="desc-dyn">`,
    `<span class="desc-dyn__s">${fixedMin}~${maxTotal}피해</span>`,
    `<span class="desc-dyn__d">${fixedMin}~(${fmtMult(mult)}${swordIcon()}${fmtAdd(addend)}${bonusSuffix})피해</span>`,
    `</span>`,
  ].join('')
}
