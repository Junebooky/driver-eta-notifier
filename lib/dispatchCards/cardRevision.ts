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
