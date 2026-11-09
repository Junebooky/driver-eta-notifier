/**
 * Flight numbers saved by HQ may be a single code ("SQ 612") or a
 * comma/slash-separated list ("KE2104, NH867"). Each lookup must receive
 * exactly one flight code; never pass a whole list to the live flight API.
 * Keep labels verbatim so schedule notes (e.g. arrival time) are not lost.
 */
export type DriverFlightEntry = { label: string; code: string | null };

const FLIGHT_CODE = /\b(?:[A-Z][A-Z0-9]{1,2}|[0-9][A-Z])\s*-?\s*\d{1,4}[A-Z]?\b/i;

export function parseDriverFlightEntries(raw?: string | null): DriverFlightEntry[] {
  if (!raw?.trim()) return [];
  // Slash is a separator only when EVERY segment contains a flight code.
  // This preserves dates and notes such as "KE2104 (11/09)".
  const parts = raw.split(/[,，;\n]+/).flatMap(part => {
    const candidate = part.split(/\s*\/\s*/).map(value => value.trim()).filter(Boolean);
    return candidate.length > 1 && candidate.every(value => FLIGHT_CODE.test(value))
      ? candidate
      : [part.trim()];
  }).filter(Boolean);
  const seen = new Set<string>();
  const result: DriverFlightEntry[] = [];
  for (const label of parts) {
    const match = label.match(FLIGHT_CODE);
    const code = match ? match[0].replace(/[\s-]/g, '').toUpperCase() : null;
    const key = code || 'unknown:' + label.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ label, code });
  }
  return result;
}
