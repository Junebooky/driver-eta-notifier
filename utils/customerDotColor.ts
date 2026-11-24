/** Muted customer markers shared by dispatch lists and the future calendar.
 * Stable customer IDs take priority; names are only a fallback for unregistered clients.
 * The color is presentation-only: duplicates can happen and names remain the real identifier.
 */
export const CUSTOMER_DOT_COLORS = [
  '#71869D', // slate blue-grey
  '#56958B', // sage
  '#AA9882', // warm sand
  '#8D94AB', // lavender grey
  '#A27D85', // rose grey
  '#73949B', // teal grey
  '#9B9277', // olive grey
  '#85889B', // smoke
] as const;

export function getCustomerDotColor(customerId?: string | null, customerName?: string | null): string {
  const key = (customerId?.trim() || customerName?.trim() || 'unknown')
    .normalize('NFKC').toLocaleLowerCase('ko-KR');
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash = Math.imul(hash ^ key.charCodeAt(i), 16777619) >>> 0;
  }
  return CUSTOMER_DOT_COLORS[hash % CUSTOMER_DOT_COLORS.length];
}
