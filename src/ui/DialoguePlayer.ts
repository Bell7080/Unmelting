/**
 * DialoguePlayer — 게임 내 모든 대사에 사용하는 클릭-스킵 로직.
 *
 * 규칙: 모든 대사(보스 인트로/페이지 전환/이벤트 NPC/컷신)는 이 함수를 통한다.
 * - 타이핑 중 클릭 → 즉시 완성 (holdMs 관계없이)
 * - 380ms 최소 보존 후 클릭 → 다음 줄 진행
 * - holdMs 경과 → 자동 진행 (미입력 시 텍스트 길이 기반으로 자동 계산)
 * - gap > 0 이면 bubble.dismiss() 후 해당 ms 대기 (보스 대사 사이 숨)
 */

import type { SpeechBubble } from '@ui/SpeechBubble'

export async function playDialogueLine(
  bubble: SpeechBubble,
  otherBubble: SpeechBubble | null,
  text: string,
  holdMs?: number,
  gap = 0,
): Promise<void> {
  otherBubble?.dismiss()
  bubble.show(text, 0)

  const fallbackMs = holdMs ?? (1100 + [...text].length * 70)

  await new Promise<void>((resolve) => {
    let done = false
    let minReady = false
    const minTimer = window.setTimeout(() => { minReady = true }, 380)
    const finish = (): void => {
      if (done) return
      done = true
      window.clearTimeout(minTimer)
      window.clearTimeout(fallback)
      document.removeEventListener('mousedown', onClick, true)
      resolve()
    }
    const onClick = (): void => {
      if (bubble.isTyping) { bubble.completeTyping(); return }
      if (!minReady) return
      finish()
    }
    const fallback = window.setTimeout(finish, fallbackMs)
    document.addEventListener('mousedown', onClick, true)
  })

  if (gap > 0) {
    bubble.dismiss()
    await new Promise((r) => window.setTimeout(r, gap))
  }
}
