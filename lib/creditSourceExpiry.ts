/** Original source deadline: equality is expired, shared by preview readers only. */
export function isOriginalCreditExpired(expiresAt: string, now: Date) {
  return Date.parse(expiresAt) <= now.getTime();
}
