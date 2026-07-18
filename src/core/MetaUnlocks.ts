/**
 * 메타 시스템 개방 플래그 — 새싹 병아리 클리어 후 무역에서 화폐로 여는 기능들.
 * 지금은 무역 1번 탭의 임시 버튼으로 토글하며, 추후 화폐 소비 구매로 대체한다.
 * (개별 localStorage 키로 저장 — JSON 파싱 없이 단순 '1' 플래그.)
 */
export type MetaUnlockId = 'jobSelect' | 'shopReroll' | 'currency' | 'dinner' | 'quests' | 'freeCard'

const PREFIX = 'unmelting.meta.unlock.'

/** 무역 1번 탭에 노출할 개방 항목(라벨/설명). */
export const META_UNLOCKS: { id: MetaUnlockId; label: string; desc: string }[] = [
  { id: 'jobSelect', label: '직업 선택', desc: '런 시작 직업 3택' },
  { id: 'shopReroll', label: '상점 리롤', desc: '유물/카드팩 재뽑기' },
  { id: 'currency', label: '화폐 패널', desc: '메타 화폐($) HUD' },
  { id: 'dinner', label: '만찬', desc: '거점 만찬 시설' },
  { id: 'quests', label: '의뢰', desc: '거점 좌측 의뢰 시설' },
  { id: 'freeCard', label: '무료 카드', desc: '상점 무료 카드·수당' },
]

export function isMetaUnlocked(id: MetaUnlockId): boolean {
  return window.localStorage.getItem(PREFIX + id) === '1'
}

export function setMetaUnlocked(id: MetaUnlockId, on: boolean): void {
  if (on) window.localStorage.setItem(PREFIX + id, '1')
  else window.localStorage.removeItem(PREFIX + id)
}

/** 토글 후 새 상태를 반환한다. */
export function toggleMetaUnlock(id: MetaUnlockId): boolean {
  const next = !isMetaUnlocked(id)
  setMetaUnlocked(id, next)
  return next
}
