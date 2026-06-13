/**
 * 런 시작 전 프론트엔드 흐름(로비 → 캐릭터 선택 → 난이도/룰)의 공통 계약.
 * M1은 씬 골격만 — characterId만 실제로 흐르고 difficulty/rules는 시각 스텁이다.
 * TODO(M3/M4): difficulty를 runModifiers로, rules 토글을 runCardPool/초반 손패로 연결.
 */
export type RunDifficulty = 'normal' | 'hard' | 'nightmare'

/** 흐름을 거치며 각 씬이 누적 기록하는 런 설정. */
export interface RunConfig {
  characterId: string
  difficulty: RunDifficulty
  /** 선택 룰 토글(비구속). 예: { startingHand: true, banList: false } */
  rules: Record<string, boolean>
}

/** 각 씬이 호스트(SceneManager)로부터 받는 흐름 제어 핸들. */
export interface SceneContext {
  /** 다음 씬으로 진행. */
  advance(): void
  /** 흐름 취소 → 실행 중이던 보드로 복귀. */
  cancel(): void
  /** 흐름 완료 → 최종 설정으로 런 시작. */
  complete(config: RunConfig): void
  /** 씬 간 공유되는 설정 초안. 각 씬이 자기 선택을 여기에 적는다. */
  draft: Partial<RunConfig>
}

/** 오버레이에 마운트되는 단일 화면. */
export interface Scene {
  mount(host: HTMLElement, ctx: SceneContext): void
  unmount(): void
}
