/**
 * `npm run ena:fit` — 에나 기본 성향(`SIM_FITTED`) 재피팅 CLI.
 *
 * 왜 필요한가: `CLAUDE.md`는 "보스 수치를 바꾸면 `SIM_FITTED`를 다시 피팅한다"고 적고 있지만
 * `EnaDispositionFitter`를 돌릴 수단이 없어 그 규칙이 실행될 수 없었다. 세계가 달라졌는데
 * 토대가 옛 세계 값이면 에나는 없는 게임에 맞춰 돕는다.
 *
 * 채택 규칙(`CLAUDE.md`): **held-out 시드로 이전 스냅샷과 비교해 나은 쪽만 채택한다.**
 * 그래서 이 도구는 값을 파일에 직접 쓰지 않는다 — 비교표와 붙여 넣을 블록을 찍고,
 * 채택 여부는 사람이 정한다. 자동으로 덮어쓰면 나쁜 후보가 조용히 배송된다.
 *
 * 피팅 시드와 평가 시드는 **겹치지 않는다**. 같은 시드로 맞추고 같은 시드로 재면
 * 그 시드에만 맞춘 값이 항상 이겨서 비교가 의미를 잃는다.
 */
import {
  EnaDispositionFitter,
  survivalScore,
  helpCost,
  DEFAULT_FIT_CONFIG,
} from '../rl/EnaDispositionFitter'
import { experienceCalibrationViolations } from '../ui/ExperienceAxes'
import { buildRookieFrom } from '../systems/EnaDisposition'
import {
  BASE_DISPOSITION,
  CURRENT_SIM_FITTED,
  blendSimFitted,
  defaultDisposition,
  clampDisposition,
  toSimFittedSnapshot,
  type EnaDisposition,
  type EnaSimFittedSnapshot,
} from '../systems/EnaDisposition'

/** held-out 평가 시드 — 피팅 루프가 쓰는 3000번대와 겹치지 않는 대역에서 뽑는다. */
const HELD_OUT_BASE = 90_000
const HELD_OUT_STEP = 13

interface Args {
  iterations: number
  evalSeeds: number
  heldOutSeeds: number
  lambda: number
  seed: number
  /** true면 동봉 스냅샷이 아니라 손-튜닝 기본 성향에서 처음부터 오른다(비교·진단용). */
  coldStart: boolean
}

function parseArgs(argv: string[]): Args {
  const read = (name: string, fallback: number): number => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`))
    if (!hit) return fallback
    const value = Number(hit.slice(name.length + 3))
    if (!Number.isFinite(value)) throw new Error(`--${name} 값이 숫자가 아니다: ${hit}`)
    return value
  }
  return {
    iterations: read('iterations', DEFAULT_FIT_CONFIG.iterations),
    evalSeeds: read('eval-seeds', DEFAULT_FIT_CONFIG.evalSeeds),
    heldOutSeeds: read('held-out', 300),
    lambda: read('lambda', DEFAULT_FIT_CONFIG.lambda),
    seed: read('seed', DEFAULT_FIT_CONFIG.seed),
    coldStart: argv.includes('--cold-start'),
  }
}

/** 채택 판단에 쓰는 held-out 점수 — 피팅 목적함수가 아니라 **생존 점수 그 자체**다. */
function heldOutScore(disp: EnaDisposition, seeds: number[]): number {
  return survivalScore(disp, seeds)
}

/** 붙여 넣을 수 있는 `SIM_FITTED` 블록으로 찍는다. */
function formatSnapshot(s: EnaSimFittedSnapshot): string {
  const n = (v: number) => Number(v.toFixed(3))
  const w = s.supportRoleWeights
  return [
    'const SIM_FITTED: EnaSimFittedSnapshot = {',
    `  clutchHpThreshold: ${n(s.clutchHpThreshold)},`,
    `  clutchHealVsShield: ${n(s.clutchHealVsShield)},`,
    `  clutchHealRatio: ${n(s.clutchHealRatio)},`,
    `  clutchShieldRatio: ${n(s.clutchShieldRatio)},`,
    `  clutchStrength: ${n(s.clutchStrength)},`,
    `  willGainPerDamage: ${n(s.willGainPerDamage)},`,
    `  willGainFlatBonus: ${n(s.willGainFlatBonus)},`,
    `  awakenChance: ${n(s.awakenChance)},`,
    `  predictBaseChance: ${n(s.predictBaseChance)},`,
    `  predictCooldown: ${n(s.predictCooldown)},`,
    `  minorClutchCrit: ${n(s.minorClutchCrit)},`,
    `  minorClutchDodge: ${n(s.minorClutchDodge)},`,
    `  minorClutchTreasure: ${n(s.minorClutchTreasure)},`,
    `  supportRoleWeights: { cleanup: ${n(w.cleanup)}, attack: ${n(w.attack)}, ` +
      `defense: ${n(w.defense)}, resource: ${n(w.resource)}, recovery: ${n(w.recovery)} },`,
    '}',
  ].join('\n')
}

/** 현재 스냅샷과 후보에서 실제로 달라진 노브만 뽑는다(표시 자리 반올림 기준). */
function changedKnobs(before: EnaSimFittedSnapshot, after: EnaSimFittedSnapshot): string[] {
  const lines: string[] = []
  const cmp = (label: string, a: number, b: number) => {
    if (Math.abs(a - b) < 0.001) return
    lines.push(`${label.padEnd(20)} ${a.toFixed(3)} → ${b.toFixed(3)}`)
  }
  const keys = Object.keys(before).filter((k) => k !== 'supportRoleWeights') as (keyof EnaSimFittedSnapshot)[]
  for (const k of keys) cmp(k, before[k] as number, after[k] as number)
  for (const k of Object.keys(before.supportRoleWeights) as (keyof EnaSimFittedSnapshot['supportRoleWeights'])[]) {
    cmp(`role.${k}`, before.supportRoleWeights[k], after.supportRoleWeights[k])
  }
  return lines
}

/**
 * 탐색 하한/상한에 눌러붙은 노브를 알린다. 붙어 있다는 건 목적함수가 그 축을 한 방향으로만
 * 밀고 있다는 뜻이라, 값이 아니라 **목적함수가 잘못됐다는 신호**다.
 * (`predictBaseChance`가 하한에 붙는 문제는 `EnaDisposition.ts` 주석에 기록돼 있다.)
 */
function reportPinnedKnobs(s: EnaSimFittedSnapshot): string[] {
  const pinned: string[] = []
  const check = (label: string, value: number, lo: number, hi: number) => {
    const span = hi - lo
    if (value <= lo + span * 0.02) pinned.push(`${label} → 하한 ${lo} (값 ${value.toFixed(3)})`)
    if (value >= hi - span * 0.02) pinned.push(`${label} → 상한 ${hi} (값 ${value.toFixed(3)})`)
  }
  check('clutchHpThreshold', s.clutchHpThreshold, 0.2, 0.6)
  check('clutchStrength', s.clutchStrength, 0.6, 1.6)
  check('willGainPerDamage', s.willGainPerDamage, 30, 100)
  check('willGainFlatBonus', s.willGainFlatBonus, 0, 15)
  check('awakenChance', s.awakenChance, 0.02, 0.4)
  check('predictBaseChance', s.predictBaseChance, 0.02, 0.95)
  check('predictCooldown', s.predictCooldown, 2, 20)
  return pinned
}

function main(): void {
  const args = parseArgs(process.argv.slice(2))
  const heldOut = Array.from({ length: args.heldOutSeeds }, (_, i) => HELD_OUT_BASE + i * HELD_OUT_STEP)

  console.log('에나 기본 성향 재피팅')
  console.log(
    `  피팅 ${args.iterations}회 · 피팅 시드 ${args.evalSeeds}개 · λ ${args.lambda} · 시드 ${args.seed}`
  )
  console.log(`  held-out 평가 시드 ${args.heldOutSeeds}개 (${HELD_OUT_BASE}~, 피팅 시드와 무교차)`)
  console.log(`  출발점: ${args.coldStart ? '손-튜닝 기본 성향(--cold-start)' : '현재 동봉 스냅샷'}`)
  console.log('')

  const started = Date.now()
  const result = EnaDispositionFitter.fit({
    iterations: args.iterations,
    evalSeeds: args.evalSeeds,
    lambda: args.lambda,
    seed: args.seed,
    start: args.coldStart ? clampDisposition(defaultDisposition()) : undefined,
  })
  const candidateSnapshot = toSimFittedSnapshot(result.disposition)

  // 세 후보를 **배송되는 형태**(0.5 블렌드 후 클램프)로 맞춰 같은 잣대에 올린다.
  const rows: { label: string; disp: EnaDisposition }[] = [
    { label: '기본값(피팅 없음)', disp: clampDisposition(defaultDisposition()) },
    { label: '현재 동봉 스냅샷', disp: BASE_DISPOSITION },
    { label: '이번 후보', disp: blendSimFitted(candidateSnapshot) },
  ]

  console.log('held-out 생존 점수 (높을수록 좋다 · 생존턴 + 보스×15 + 클리어 40)')
  const scores = rows.map((row) => {
    const score = heldOutScore(row.disp, heldOut)
    console.log(`  ${row.label.padEnd(18)} ${score.toFixed(2)}   (도움 비용 ${helpCost(row.disp).toFixed(2)})`)
    return score
  })
  console.log('')

  const [, currentScore, candidateScore] = scores
  const delta = candidateScore - currentScore
  const better = delta > 0

  console.log(`판정: 후보 ${candidateScore.toFixed(2)} vs 현재 ${currentScore.toFixed(2)} → ${delta >= 0 ? '+' : ''}${delta.toFixed(2)}`)
  console.log(
    better
      ? '  ▶ 후보가 held-out에서 앞선다. 아래 블록을 EnaDisposition.ts의 SIM_FITTED에 붙이고,'
      : '  ▶ 후보가 held-out에서 앞서지 못한다. **채택하지 않는다** — 현재 스냅샷을 유지한다.'
  )
  if (better) console.log('    왜 바꿨는지를 그 위 주석과 VERSION.md에 함께 남긴다.')
  console.log('')

  // 어느 노브가 실제로 움직였는지 — 스냅샷 전체를 눈으로 훑는 것보다 이게 읽힌다.
  const moved = changedKnobs(CURRENT_SIM_FITTED, candidateSnapshot)
  if (moved.length > 0) {
    console.log('바뀐 노브 (현재 → 후보):')
    for (const line of moved) console.log(`  · ${line}`)
    console.log('')
  }

  // 피터가 이미 대역 밖 후보를 잘라 내지만, 결과가 실제로 배송 가능한지 여기서 한 번 더 찍는다.
  const candidateBase = blendSimFitted(candidateSnapshot)
  const violations = experienceCalibrationViolations(candidateBase, buildRookieFrom(candidateBase))
  console.log(
    violations.length === 0
      ? '경험 탭 성좌 대역: 통과'
      : `경험 탭 성좌 대역: 위반 ${violations.length}건 — 채택 불가\n  · ${violations.join('\n  · ')}`
  )
  console.log('')

  const pinned = reportPinnedKnobs(candidateSnapshot)
  if (pinned.length > 0) {
    console.log('경고 — 탐색 경계에 눌러붙은 노브가 있다:')
    for (const line of pinned) console.log(`  · ${line}`)
    console.log('  경계에 붙는다는 건 목적함수가 그 축을 한 방향으로만 밀고 있다는 뜻이다.')
    console.log('  값을 고치기 전에 목적함수(survivalScore / helpCost)를 먼저 의심할 것.')
    console.log('')
  }

  console.log('후보 스냅샷:')
  console.log(formatSnapshot(candidateSnapshot))
  console.log('')
  console.log(`소요 ${((Date.now() - started) / 1000).toFixed(1)}초`)
}

main()
