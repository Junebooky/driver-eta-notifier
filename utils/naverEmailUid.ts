/**
 * A live NAVER mail's UI ID is "naver-<positive IMAP UID>".
 * Validate the entire input to prevent accidentally fetching another message.
 */
export function parseNaverEmailUid(id: unknown): number | null {
  if (typeof id !== 'string') return null;
  const match = /^naver-([1-9][0-9]*)$/.exec(id);
  if (!match) return null;
  const uid = Number(match[1]);
  return Number.isSafeInteger(uid) && uid > 0 && uid <= 4_294_967_295 ? uid : null;
}
