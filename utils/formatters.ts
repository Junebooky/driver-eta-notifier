/**
 * Utility formatters and text sanitizers for Protocol Cockpit
 */

/**
 * Removes extraneous English bracketed text behind Korean spot names.
 * E.g., "레스케이프 호텔 명동 (L'ESCAPE HOTEL MYEONGDONG)" -> "레스케이프 호텔 명동"
 */
export function sanitizePlaceName(name: string): string {
  if (!name) return '';
  if (/[가-힣]/.test(name)) {
    return name.replace(/\s*\([A-Za-z0-9\s'.,\/-]+\)/g, '').trim();
  }
  return name.trim();
}
