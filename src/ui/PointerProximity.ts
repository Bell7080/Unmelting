/** 사각형 주변까지 포함해 포인터가 가까이 왔는지 판정할 때 필요한 최소 경계값. */
export interface PointerRectBounds {
  left: number
  right: number
  top: number
  bottom: number
}

/** 포인터와 사각형 사이의 최단 거리. 사각형 안에 있으면 0이다. */
export function pointerDistanceToRect(
  clientX: number,
  clientY: number,
  rect: PointerRectBounds
): number {
  const dx = Math.max(rect.left - clientX, 0, clientX - rect.right)
  const dy = Math.max(rect.top - clientY, 0, clientY - rect.bottom)
  return Math.hypot(dx, dy)
}

/**
 * 포인터가 카드 안이나 지정한 여백 안에 들어왔는지 판정한다.
 * DOM에 의존하지 않는 순수 함수라 레일 hover 안내와 거리 테스트가 같은 기준을 공유한다.
 */
export function isPointerNearRect(
  clientX: number,
  clientY: number,
  rect: PointerRectBounds,
  margin: number
): boolean {
  return pointerDistanceToRect(clientX, clientY, rect) <= margin
}
