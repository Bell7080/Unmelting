/**
 * EnaPolicyStore - 학습된 에나 정책망 가중치를 런타임 저장소와 연결한다.
 *
 * 사전학습/플레이어별 미세조정 결과를 JSON으로 저장해 두고, 게임 부팅 시 같은 계약의
 * EnaPolicyNetwork로 복원한다. localStorage가 없는 테스트/도구 환경은 주입형 storage를 사용한다.
 */

import { ENA_ACTION_SPACE, ENA_FEATURE_COUNT } from './EnaTrainingSimulation'
import { EnaPolicyNetwork, type EnaPolicyWeights } from './EnaPolicyNetwork'

export const ENA_POLICY_STORAGE_KEY = 'unmelting.ena.policy.v1'

/** localStorage와 테스트 더블이 공유하는 최소 저장소 계약. */
export interface EnaPolicyStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface EnaStoredPolicyArtifact {
  version: 1
  /** 저장 당시 관측/행동 계약을 함께 넣어 오래된 가중치를 안전하게 거른다. */
  featureCount: number
  actionCount: number
  createdAt: string
  weights: EnaPolicyWeights
}

/** 현재 실행 환경에서 localStorage를 쓸 수 있으면 반환한다. SSR/테스트에서는 undefined. */
export function browserPolicyStorage(): EnaPolicyStorage | undefined {
  if (typeof globalThis === 'undefined') return undefined
  const candidate = (globalThis as { localStorage?: EnaPolicyStorage }).localStorage
  return candidate
}

/** 학습망을 현재 관측/행동 계약이 포함된 artifact로 감싼다. */
export function createPolicyArtifact(network: EnaPolicyNetwork, createdAt: string = new Date().toISOString()): EnaStoredPolicyArtifact {
  return {
    version: 1,
    featureCount: ENA_FEATURE_COUNT,
    actionCount: ENA_ACTION_SPACE.length,
    createdAt,
    weights: network.toWeights(),
  }
}

/** artifact가 현재 코드의 feature/action 차원과 맞는지 확인해 깨진 추론을 막는다. */
export function validatePolicyArtifact(artifact: EnaStoredPolicyArtifact): boolean {
  return (
    artifact.version === 1 &&
    artifact.featureCount === ENA_FEATURE_COUNT &&
    artifact.actionCount === ENA_ACTION_SPACE.length &&
    artifact.weights.inDim === ENA_FEATURE_COUNT &&
    artifact.weights.outDim === ENA_ACTION_SPACE.length
  )
}

export class EnaPolicyStore {
  constructor(
    private readonly storage: EnaPolicyStorage | undefined = browserPolicyStorage(),
    private readonly key: string = ENA_POLICY_STORAGE_KEY
  ) {}

  /** localStorage 접근이 막힌 환경에서도 게임이 멈추지 않도록 저장 가능 여부를 명시적으로 노출한다. */
  isAvailable(): boolean {
    return this.storage !== undefined
  }

  /** 현재 정책망을 저장한다. 저장소가 없으면 false로 알리고 호출부가 기본 정책을 쓰게 한다. */
  save(network: EnaPolicyNetwork, createdAt?: string): boolean {
    if (!this.storage) return false
    const artifact = createPolicyArtifact(network, createdAt)
    this.storage.setItem(this.key, JSON.stringify(artifact))
    return true
  }

  /** 저장된 정책망을 복원한다. 계약 불일치/파싱 실패는 기본 정책 fallback을 위해 undefined로 처리한다. */
  load(): EnaPolicyNetwork | undefined {
    if (!this.storage) return undefined
    const raw = this.storage.getItem(this.key)
    if (!raw) return undefined
    let artifact: EnaStoredPolicyArtifact
    try {
      artifact = JSON.parse(raw) as EnaStoredPolicyArtifact
    } catch {
      // 손상된 저장값은 런타임 에나를 멈추지 않고 기본 정책 fallback으로 넘긴다.
      return undefined
    }
    if (!validatePolicyArtifact(artifact)) return undefined
    return EnaPolicyNetwork.fromWeights(artifact.weights)
  }

  /** 관측 계약이 바뀌었거나 디버그 초기화가 필요할 때 저장된 정책을 제거한다. */
  clear(): void {
    this.storage?.removeItem(this.key)
  }
}
