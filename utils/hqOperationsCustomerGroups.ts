/**
 * HQ operations cards are grouped by customer rather than by driver/vehicle
 * event IDs. Keep unknown/generic customer names isolated so unrelated jobs
 * are never merged (or accidentally deleted) under "고객사", while collapsing
 * split multi-day seed/unidentified runs from the same event/date window into
 * one consolidated card.
 */
export function normalizeOperationalCustomerName(value?: string | null): string {
  return (value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('ko-KR');
}

export function isNamedOperationalCustomer(value?: string | null): boolean {
  const normalized = normalizeOperationalCustomerName(value);
  return (
    Boolean(normalized) &&
    !['고객사', '고객사 미확정', '미확정', '미지정', '미배정', 'unassigned', '-', 'unknown', 'customer'].includes(normalized)
  );
}

export function isGenericOperationalEventName(value?: string | null): boolean {
  const normalized = normalizeOperationalCustomerName(value);
  return (
    !normalized ||
    ['vip 의전 행사', '전체 배차 현황', '행사', '일반 행사', '미지정', '-'].includes(normalized)
  );
}

export function parseIsoDateToUtcDay(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utcMs = Date.UTC(year, month - 1, day);
  const check = new Date(utcMs);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return Math.floor(utcMs / 86_400_000);
}

export interface OperationalCustomerRow {
  id: string;
  customerId?: string;
  customerName: string;
  eventName?: string;
  startDate?: string;
  endDate?: string;
  groupId?: string;
  eventId?: string;
}

/** Stable grouping: one large customer/event card containing all its driver rows. */
export function groupOperationsByCustomer<T extends OperationalCustomerRow>(
  schedules: readonly T[]
): Array<{ key: string; schedules: T[]; customerScoped: boolean }> {
  type GroupBucket = {
    key: string;
    schedules: T[];
    customerScoped: boolean;
    firstIndex: number;
  };
  type DateClusterEntry = {
    row: T;
    index: number;
    startDay: number;
    endDay: number;
    startDate: string;
  };

  const groups = new Map<string, GroupBucket>();
  const customerIdToKey = new Map<string, string>();
  const dateClusterBuckets = new Map<string, DateClusterEntry[]>();

  schedules.forEach((row, index) => {
    const customerScoped = isNamedOperationalCustomer(row.customerName);
    if (customerScoped) {
      const cleanCustomerId = row.customerId?.trim() || '';
      const mappedKey = cleanCustomerId ? customerIdToKey.get(cleanCustomerId) : undefined;
      const key = mappedKey || `customer:${normalizeOperationalCustomerName(row.customerName)}`;
      if (cleanCustomerId && !mappedKey) {
        customerIdToKey.set(cleanCustomerId, key);
      }
      let group = groups.get(key);
      if (!group) {
        group = { key, schedules: [], customerScoped: true, firstIndex: index };
        groups.set(key, group);
      }
      group.schedules.push(row);
      return;
    }

    const cleanGroupId = row.groupId?.trim() || '';
    if (cleanGroupId) {
      const key = `unidentified:${cleanGroupId}`;
      let group = groups.get(key);
      if (!group) {
        group = { key, schedules: [], customerScoped: false, firstIndex: index };
        groups.set(key, group);
      }
      group.schedules.push(row);
      return;
    }

    if (!isGenericOperationalEventName(row.eventName)) {
      const key = `unidentified-event:${normalizeOperationalCustomerName(row.eventName)}`;
      let group = groups.get(key);
      if (!group) {
        group = { key, schedules: [], customerScoped: false, firstIndex: index };
        groups.set(key, group);
      }
      group.schedules.push(row);
      return;
    }

    const cleanEventId = row.eventId?.trim() || '';
    if (cleanEventId) {
      const key = `unidentified:${cleanEventId}`;
      let group = groups.get(key);
      if (!group) {
        group = { key, schedules: [], customerScoped: false, firstIndex: index };
        groups.set(key, group);
      }
      group.schedules.push(row);
      return;
    }

    const startDay = parseIsoDateToUtcDay(row.startDate);
    if (startDay !== null) {
      const endDay = Math.max(startDay, parseIsoDateToUtcDay(row.endDate) ?? startDay);
      const normEvent = normalizeOperationalCustomerName(row.eventName) || 'event';
      let bucket = dateClusterBuckets.get(normEvent);
      if (!bucket) {
        bucket = [];
        dateClusterBuckets.set(normEvent, bucket);
      }
      bucket.push({
        row,
        index,
        startDay,
        endDay,
        startDate: row.startDate!.trim(),
      });
      return;
    }

    const key = `unidentified:${row.id}`;
    let group = groups.get(key);
    if (!group) {
      group = { key, schedules: [], customerScoped: false, firstIndex: index };
      groups.set(key, group);
    }
    group.schedules.push(row);
  });

  const allBuckets: GroupBucket[] = [...groups.values()];

  for (const [normEvent, entries] of dateClusterBuckets.entries()) {
    const sorted = [...entries].sort(
      (a, b) => a.startDay - b.startDay || a.endDay - b.endDay || a.index - b.index
    );
    const clusters: Array<{
      clusterStartDate: string;
      maxEndDay: number;
      members: DateClusterEntry[];
    }> = [];

    for (const entry of sorted) {
      const current = clusters[clusters.length - 1];
      if (current && entry.startDay <= current.maxEndDay + 1) {
        current.maxEndDay = Math.max(current.maxEndDay, entry.endDay);
        current.members.push(entry);
      } else {
        clusters.push({
          clusterStartDate: entry.startDate,
          maxEndDay: entry.endDay,
          members: [entry],
        });
      }
    }

    for (const cluster of clusters) {
      const inOriginalOrder = [...cluster.members].sort((a, b) => a.index - b.index);
      allBuckets.push({
        key: `unidentified-cluster:${normEvent}:${cluster.clusterStartDate}`,
        schedules: inOriginalOrder.map(m => m.row),
        customerScoped: false,
        firstIndex: inOriginalOrder[0].index,
      });
    }
  }

  allBuckets.sort((a, b) => a.firstIndex - b.firstIndex);
  return allBuckets.map(({ key, schedules: groupSchedules, customerScoped }) => ({
    key,
    schedules: groupSchedules,
    customerScoped,
  }));
}
