/**
 * 371차원 에나 정책을 재학습하고, 괴물꽃 3축을 가린 구 관측 한계와 동일 망을 비교한다.
 * 결과 JSON은 재현 가능한 사전학습 산출물이며 Markdown은 밸런스/근사 감사 기록이다.
 */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createPolicyArtifact } from '../rl/EnaPolicyStore'
import { EnaTrainer, policyFromNetwork } from '../rl/EnaTrainer'
import { maskMonsterFlowerObservation, type EnaPolicy } from '../rl/EnaTrainingSimulation'

const TRAIN_CONFIG = {
  hidden: 64,
  bcEpisodes: 600,
  bcEpochs: 4,
  rlEpisodes: 600,
  seed: 371,
} as const

// 고정 평가 시드는 정책 간 차이만 남기며 이후 재생성 결과도 직접 비교할 수 있게 한다.
const EVAL_SEEDS = Array.from({ length: 240 }, (_, index) => 20_000 + index * 17)
const trained = EnaTrainer.train(TRAIN_CONFIG)
const fullPolicy = policyFromNetwork(trained.network, true)
const blindPolicy: EnaPolicy = (observation, rng) => fullPolicy({
  ...observation,
  features: maskMonsterFlowerObservation(observation.features),
}, rng)
const full = EnaTrainer.evaluateMonsterFlowers(fullPolicy, EVAL_SEEDS)
const blind = EnaTrainer.evaluateMonsterFlowers(blindPolicy, EVAL_SEEDS)

const root = resolve(process.cwd())
const artifact = createPolicyArtifact(trained.network, '2026-08-03T00:00:00.000Z')
writeFileSync(resolve(root, 'src/data/ena-pretrained-policy.json'), `${JSON.stringify(artifact)}\n`)

const pct = (value: number): string => `${(value * 100).toFixed(1)}%`
const report = `# Ena 371 사전학습 및 시뮬레이션 근사 감사

## 재현 설정

- 관측: 371 / 행동: 27 / hidden: ${TRAIN_CONFIG.hidden}
- BC: ${TRAIN_CONFIG.bcEpisodes} episodes × ${TRAIN_CONFIG.bcEpochs} epochs
- RL: ${TRAIN_CONFIG.rlEpisodes} episodes
- seed: ${TRAIN_CONFIG.seed} / evaluation seeds: ${EVAL_SEEDS.length}

## 괴물꽃 관측 비교

| 정책 | 평균 생존 턴 | 괴물꽃 제거 우선순위 | 괴물꽃 처치/생성 | 생존 P50 | 생존 P90 |
|---|---:|---:|---:|---:|---:|
| 371 전체 관측 | ${full.averageTurns.toFixed(2)} | ${pct(full.monsterPriorityRate)} | ${full.monsterDefeated}/${full.monsterSpawned} | ${full.monsterSurvivalP50} | ${full.monsterSurvivalP90} |
| 괴물꽃 3축 차단(구 관측 한계) | ${blind.averageTurns.toFixed(2)} | ${pct(blind.monsterPriorityRate)} | ${blind.monsterDefeated}/${blind.monsterSpawned} | ${blind.monsterSurvivalP50} | ${blind.monsterSurvivalP90} |

## 근사 감사 결과

- **수정 완료 — 보물 보상:** 임의 35% 드롭·15% 화폐·20% 방패 근사를 제거하고, 실제 폭별 드롭 범위와 보물 전용 풀을 사용한다.
- **수정 완료 — 보물 변동성:** 일반 상자 50% 소멸/10% 미믹화와 황금 상자 50% 소멸을 반영한다.
- **수정 완료 — 선공:** 가짜 +1 피해 근사를 제거하고 실제처럼 적 페이즈를 플레이어 행동 전에 한 번 실행한다.
- **수정 완료 — 레일 중력:** 매 턴 전역 하강하던 근사를 제거하고, 런타임처럼 해결된 빈칸만 압축·리필한다.
- **유지 — 보물 카드 내용:** 드롭 장수와 풀은 실제와 같지만 개별 카드 효과를 즉시 전부 실행하지 않고 손패 의사결정으로 넘긴다.

> 이 파일은 \`npm run ena:pretrain\`으로 정책 JSON과 함께 재생성한다.
`
writeFileSync(resolve(root, 'Ena_Pretraining_Report.md'), report)

process.stdout.write(`${report}\n정책 저장: src/data/ena-pretrained-policy.json\n`)
