import { describe, expect, it } from 'vitest'
import { EnaPolicyNetwork } from './EnaPolicyNetwork'
import { ENA_ACTION_SPACE, ENA_FEATURE_COUNT, EnaRandom } from './EnaTrainingSimulation'
import { EnaPolicyStore, createPolicyArtifact, validatePolicyArtifact, type EnaPolicyStorage } from './EnaPolicyStore'

class MemoryStorage implements EnaPolicyStorage {
  private readonly values = new Map<string, string>()
  getItem(key: string): string | null { return this.values.get(key) ?? null }
  setItem(key: string, value: string): void { this.values.set(key, value) }
  removeItem(key: string): void { this.values.delete(key) }
}

describe('EnaPolicyStore', () => {
  it('학습망을 저장하고 현재 관측 계약으로 다시 복원한다', () => {
    const storage = new MemoryStorage()
    const net = new EnaPolicyNetwork(ENA_FEATURE_COUNT, 8, ENA_ACTION_SPACE.length, new EnaRandom(5))
    const store = new EnaPolicyStore(storage)

    expect(store.save(net, '2026-06-25T00:00:00.000Z')).toBe(true)
    const loaded = store.load()

    expect(loaded).toBeDefined()
    expect(loaded?.toWeights().inDim).toBe(ENA_FEATURE_COUNT)
    expect(loaded?.toWeights().outDim).toBe(ENA_ACTION_SPACE.length)
  })

  it('오래된 차원의 artifact는 로드하지 않는다', () => {
    const net = new EnaPolicyNetwork(ENA_FEATURE_COUNT, 8, ENA_ACTION_SPACE.length, new EnaRandom(6))
    const artifact = createPolicyArtifact(net)
    artifact.featureCount = ENA_FEATURE_COUNT - 1

    expect(validatePolicyArtifact(artifact)).toBe(false)
  })

  it('손상된 저장값은 기본 정책 fallback을 위해 로드하지 않는다', () => {
    const storage = new MemoryStorage()
    storage.setItem('unmelting.ena.policy.v1', '{broken-json')
    const store = new EnaPolicyStore(storage)

    expect(store.load()).toBeUndefined()
  })

  it('저장소가 없으면 기본 정책 fallback을 위해 조용히 실패한다', () => {
    const net = new EnaPolicyNetwork(ENA_FEATURE_COUNT, 8, ENA_ACTION_SPACE.length, new EnaRandom(7))
    const store = new EnaPolicyStore(undefined)

    expect(store.isAvailable()).toBe(false)
    expect(store.save(net)).toBe(false)
    expect(store.load()).toBeUndefined()
  })
})
