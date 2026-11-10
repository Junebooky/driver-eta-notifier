/**
 * HQ operations cards are grouped by customer rather than by driver/vehicle
 * event IDs. Keep unknown/generic customer names isolated so unrelated jobs
 * are never merged (or accidentally deleted) under "고객사".
 */
export function normalizeOperationalCustomerName(value?: string | null): string {
  return (value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('ko-KR');
}

export function isNamedOperationalCustomer(value?: string | null): boolean {
  const normalized = normalizeOperationalCustomerName(value);
  return Boolean(normalized) && !['고객사', '미지정', '미배정', '-', 'unknown', 'customer'].includes(normalized);
}

export interface OperationalCustomerRow {
  id: string;
  customerName: string;
  groupId?: string;
  eventId?: string;
}

/** Stable grouping: one large customer card containing all its driver rows. */
export function groupOperationsByCustomer<T extends OperationalCustomerRow>(
  schedules: readonly T[]
): Array<{ key: string; schedules: T[]; customerScoped: boolean }> {
  const groups = new Map<string, { key: string; schedules: T[]; customerScoped: boolean }>();
  for (const row of schedules) {
    const customerScoped = isNamedOperationalCustomer(row.customerName);
    const key = customerScoped
      ? `customer:${normalizeOperationalCustomerName(row.customerName)}`
      : `unidentified:${row.groupId || row.eventId || row.id}`;
    let group = groups.get(key);
    if (!group) {
      group = { key, schedules: [], customerScoped };
      groups.set(key, group);
    }
    group.schedules.push(row);
  }
  return [...groups.values()];
}
