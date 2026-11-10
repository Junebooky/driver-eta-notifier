/** Only web images and application-owned public assets may be stored as HQ place photos. */
export function isValidFieldKnowledgeImageUrl(raw: string): boolean {
  const value = raw.trim();
  if (!value || value.length > 2048) return false;
  if (/^\/images\/[a-zA-Z0-9_./%-]+$/.test(value) && !value.includes('..')) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && Boolean(parsed.hostname) && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}
