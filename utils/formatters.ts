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

/**
 * Automatically formats Korean phone numbers with hyphens on input.
 * E.g.
 * - "01063488726" -> "010-6348-8726"
 * - "01012345678" -> "010-1234-5678"
 * - "0212345678"  -> "02-1234-5678"
 * - "0319876543"  -> "031-987-6543"
 * - Progressive typing: "010" -> "010-6" -> "010-6348" -> "010-6348-8726"
 * - Preserves international format starting with '+'
 */
export function formatPhoneNumber(value: string): string {
  if (!value) return '';

  // Preserve international format if starts with '+'
  if (value.startsWith('+')) {
    return value.replace(/[^0-9+\-\s]/g, '').slice(0, 24);
  }

  // Extract digits only
  const clean = value.replace(/[^0-9]/g, '');
  const digits = clean.slice(0, 11);

  // 1. Seoul landline (02)
  if (digits.startsWith('02')) {
    if (digits.length <= 2) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
    if (digits.length <= 9) {
      return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
    }
    return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 10)}`;
  }

  // 2. Representative Toll-Free / Service numbers (15xx, 16xx, 18xx - 8 digits)
  if (/^1[568]\d{2}/.test(digits) && digits.length <= 8) {
    if (digits.length <= 4) return digits;
    return `${digits.slice(0, 4)}-${digits.slice(4, 8)}`;
  }

  // 3. Korean Mobile (010, 011, etc.) & Regional landlines (031, 051, 070, etc.)
  if (digits.length <= 3) {
    return digits;
  }
  if (digits.length <= 7) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  }
  if (digits.length <= 10) {
    // 010 numbers are always 11 digits in modern Korea, so while typing 8~10 digits, format as 010-XXXX-X...
    if (digits.startsWith('010')) {
      return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
    }
    // 10 digits for older mobile (011) or regional landlines (031, 051, etc.): 3-3-4
    if (digits.length === 10) {
      return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  // 4. Standard 11-digit mobile: 010-XXXX-XXXX
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
}

