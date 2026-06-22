import { describe, expect, it } from 'vitest'
import { EnaPolicyNetwork, maskedSoftmax } from './EnaPolicyNetwork'
import { EnaRandom } from './EnaTrainingSimulation'

describe('EnaPolicyNetwork', () => {
  it('합법 마스킹 소프트맥스는 불법 행동 확률을 0으로 두고 합이 1이다', () => {
    const probs = maskedSoftmax([1, 2, 3, 4], [true, false, true, false])
    expect(probs[1]).toBe(0)
    expect(probs[3]).toBe(0)
    expect(probs[0] + probs[2]).toBeCloseTo(1, 6)
    expect(probs[2]).toBeGreaterThan(probs[0]) // 더 큰 로짓에 더 큰 확률
  })

  it('역전파 방향이 맞다: BC 스텝을 반복하면 교사 행동 확률이 오른다', () => {
    const net = new EnaPolicyNetwork(8, 16, 4, new EnaRandom(3))
    const x = [0.1, -0.2, 0.3, 0.4, -0.5, 0.6, 0.0, 0.2]
    const mask = [true, true, true, true]
    const target = 2
    const before = net.policy(x, mask)[target]
    for (let i = 0; i < 50; i++) net.trainBehaviorClone(x, target, mask, 1e-2)
    const after = net.policy(x, mask)[target]
    expect(after).toBeGreaterThan(before)
    expect(after).toBeGreaterThan(0.5)
  })

  it('가중치 직렬화→복원이 동일한 추론을 낸다', () => {
    const net = new EnaPolicyNetwork(12, 10, 5, new EnaRandom(7))
    const x = Array.from({ length: 12 }, (_, i) => Math.sin(i))
    const mask = [true, false, true, true, false]
    const before = net.policy(x, mask)
    const restored = EnaPolicyNetwork.fromWeights(net.toWeights())
    const after = restored.policy(x, mask)
    for (let k = 0; k < before.length; k++) expect(after[k]).toBeCloseTo(before[k], 9)
  })
})
