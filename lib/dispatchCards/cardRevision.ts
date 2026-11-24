/**
 * A driver's approved card identity or portrait photo changed after a stored
 * image was rendered. Old static image files must not be offered as current.
 *
 * A missing timestamp means legacy cards remain current until the first edit.
 */
export function isDispatchCardAssetStale(
  revisionAt: unknown,
  assetCreatedAt: unknown,
): boolean {
  if (typeof revisionAt !== 'string' || !revisionAt.trim()) return false;
  const revision = Date.parse(revisionAt);
  if (!Number.isFinite(revision)) return false;
  if (typeof assetCreatedAt !== 'string' || !assetCreatedAt.trim()) return true;
  const created = Date.parse(assetCreatedAt);
  return !Number.isFinite(created) || created < revision;
}

export function shouldRebuildDriverCards(
  identityChanged: boolean,
  portraitChanged: boolean,
): boolean {
  return identityChanged || portraitChanged;
}

/**
 * Only cards produced by the shared canvas builder are distributable.
 * Legacy manually uploaded card files stay in history, never auto-display.
 * Both builder paths write "dispatch_{plate}_{pc|mobile}.webp".
 */
export function isGeneratedDispatchCardFileName(name: unknown): boolean {
  return typeof name === 'string' &&
    /^dispatch_[\p{L}\p{N}_-]+_(?:pc|mobile)\.webp$/u.test(name);
}
