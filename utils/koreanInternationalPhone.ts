/**
 * International contact format for Korean mobile phones.
 *
 * Domestic: 010-6348-8726
 * Abroad:   +82-10-6348-8726 (the domestic trunk 0 is omitted).
 *
 * This helper is intentionally separate from the general domestic formatter,
 * because other app screens still accept landlines and non-Korean numbers.
 */
export const KOREA_MOBILE_PREFIX = '+82-';

/** Called as an admin types or pastes a phone number. */
export function formatKoreanMobileInternationalInput(value: string): string {
  const text = value.trim();
  if (!text) return '';

  // Preserve a genuine foreign international number instead of replacing its country code.
  if (text.startsWith('+') && !text.startsWith('+82')) {
    return text.replace(/[^\d+\-\s]/g, '').slice(0, 26);
  }

  const hasCountryCode = text.startsWith('+82') || /^82(?:\D|10)/.test(text);
  let digits = text.replace(/\D/g, '');
  if (hasCountryCode) digits = digits.slice(2);

  // During entry, preserve "0" and "01" until the user finishes typing "010".
  if (digits.startsWith('010')) digits = digits.slice(1);
  if (!digits) return KOREA_MOBILE_PREFIX;
  // Existing non-mobile numbers should retain their domestic format instead.
  if (digits.length >= 3 && digits.startsWith('0') && !digits.startsWith('010')) {
    return text;
  }

  digits = digits.slice(0, 10);
  if (digits.length <= 2) return KOREA_MOBILE_PREFIX + digits;
  if (digits.length <= 6) return KOREA_MOBILE_PREFIX + digits.slice(0, 2) + '-' + digits.slice(2);
  return KOREA_MOBILE_PREFIX + digits.slice(0, 2) + '-' + digits.slice(2, 6) + '-' + digits.slice(6);
}

/** Returns a complete internationally formatted 010 number, or null while incomplete. */
export function normalizeKoreanMobileNumber(value: string): string | null {
  const formatted = formatKoreanMobileInternationalInput(value);
  return /^\+82-10-\d{4}-\d{4}$/.test(formatted) ? formatted : null;
}

/** Existing domestic records are presented internationally without rewriting every DB row. */
export function formatKoreanMobileForDisplay(value: string): string {
  return normalizeKoreanMobileNumber(value) || value;
}

/** Safe dial URI with no display punctuation; for international 010 uses +8210... */
export function getDialablePhoneHref(value: string): string {
  const complete = normalizeKoreanMobileNumber(value);
  const raw = complete || value;
  const digits = raw.replace(/[^\d+]/g, '');
  return digits && /\d/.test(digits) ? 'tel:' + digits : '';
}
