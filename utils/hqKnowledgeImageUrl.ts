/** Only web images and application-owned public assets may be stored as HQ place photos. */
export function isValidFieldKnowledgeImageUrl(raw: string): boolean {
  const value = raw.trim();
  if (!value || value.length > 2048) return false;
  if (/^\/images\/[a-zA-Z0-9_./%-]+$/.test(value) && !value.includes('..')) return true;
  // A durable authenticated app URL. Never store short-lived signed URLs.
  if (value.startsWith('/api/field-knowledge/image?')) {
    const query = new URLSearchParams(value.slice('/api/field-knowledge/image?'.length));
    const path = query.get('path');
    return query.size === 1 && Boolean(path && /^vip_limousine_korea\/field-knowledge\/[A-Za-z0-9._:-]{1,100}\/[a-f0-9-]{36}\.(png|jpg|webp)$/.test(path));
  }
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && Boolean(parsed.hostname) && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}
