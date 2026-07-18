/** HTML 직접 삽입용 문자열 이스케이프(보스 인트로의 카드 이름 등에 사용). */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
}
