/**
 * Server submissions must not be confused with another trip on the same date.
 * The booking ID can be added AFTER a daily (unassigned) report was submitted.
 */
export interface DrivingLogLookup {
  id: string;
  rawDate: string;
  bookingId?: string | null;
}

export function selectDrivingLogForHydration<T extends DrivingLogLookup>(
  logs: readonly T[],
  context: {
    date: string;
    submissionId?: string | null;
    bookingId?: string | null;
    localStatus: 'draft' | 'submitted';
  },
): T | undefined {
  const onDate = logs.filter(row => row.rawDate === context.date);
  const byId = context.submissionId
    ? onDate.find(row => row.id === context.submissionId)
    : undefined;
  // Never revive the wrong booking if an explicit booking context was selected.
  if (byId) return context.bookingId && byId.bookingId !== context.bookingId ? undefined : byId;
  // An already submitted report whose original row disappeared must never
  // silently switch to a different report from the same date.
  if (context.localStatus === 'submitted') return undefined;
  if (context.bookingId) return onDate.find(row => row.bookingId === context.bookingId);
  const unlinked = onDate.filter(row => !row.bookingId);
  return unlinked.length === 1 ? unlinked[0] : undefined;
}

/** Auto-linking must not discard the originally unassigned local daily report. */
export function belongsToDrivingLogDraftScope(
  stored: {
    reportId?: string;
    rawDate?: string;
    driverId?: string;
    bookingId?: string | null;
    status?: string;
  },
  context: {
    reportId: string;
    rawDate: string;
    driverId: string;
    bookingId?: string | null;
  },
): boolean {
  if (stored.reportId !== context.reportId ||
    stored.rawDate !== context.rawDate ||
    stored.driverId !== context.driverId) return false;
  if ((stored.bookingId || null) === (context.bookingId || null)) return true;
  // A daily log can acquire a booking ID only after a successful HQ submission.
  return !context.bookingId &&
    context.reportId.includes('_daily_') &&
    stored.status === 'submitted' &&
    typeof stored.bookingId === 'string' &&
    stored.bookingId.length > 0;
}
