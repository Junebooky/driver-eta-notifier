import {
  normalizeDateToIso,
  normalizeTimeHHmm,
  parseKstDateTimeToMs,
  shiftIsoDate,
} from './dispatchConflictDetector';

export interface FleetWindow {
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
}

export interface ResolvedFleetAvailabilityWindows {
  valid: boolean;
  windows: FleetWindow[];
  provisionalDates: string[];
  error?: string;
  notice?: string;
}

/**
 * Resolves UI availability query intervals without inventing saved booking times.
 * When endTime is missing or equals startTime on a single-stop day, probes conservatively
 * until 23:59 of the endDate so operators can still view genuinely free vehicles while
 * keeping publish-time validation strict.
 */
export function resolveFleetAvailabilityWindows(
  windows: FleetWindow[]
): ResolvedFleetAvailabilityWindows {
  if (!windows.length) {
    return {
      valid: false,
      windows: [],
      provisionalDates: [],
      error: '조회할 운행 일정의 날짜를 확인해 주세요.',
    };
  }

  const resolved: FleetWindow[] = [];
  const provisionalDates: string[] = [];

  for (const win of windows) {
    const startDate = normalizeDateToIso(win.startDate);
    const endDate = normalizeDateToIso(win.endDate || win.startDate);
    if (!startDate || !endDate) {
      return {
        valid: false,
        windows: [],
        provisionalDates: [],
        error: '유효한 운행 시작·종료 날짜를 확인해 주세요.',
      };
    }
    if (endDate < startDate) {
      return {
        valid: false,
        windows: [],
        provisionalDates: [],
        error: `종료 날짜(${endDate})는 시작 날짜(${startDate}) 이후여야 합니다.`,
      };
    }

    const rawStart = (win.startTime || '').trim();
    const rawEnd = (win.endTime || '').trim();
    const parsedStart = rawStart ? normalizeTimeHHmm(rawStart) : '';
    const parsedEnd = rawEnd ? normalizeTimeHHmm(rawEnd) : '';

    if (rawStart && !parsedStart) {
      return {
        valid: false,
        windows: [],
        provisionalDates: [],
        error: `${startDate}: 시작 시간(${rawStart}) 형식을 확인해 주세요.`,
      };
    }
    if (rawEnd && !parsedEnd) {
      return {
        valid: false,
        windows: [],
        provisionalDates: [],
        error: `${endDate}: 종료 시간(${rawEnd}) 형식을 확인해 주세요.`,
      };
    }

    if (parsedStart && parsedEnd) {
      const startMs = parseKstDateTimeToMs(startDate, parsedStart);
      const endMs = parseKstDateTimeToMs(endDate, parsedEnd);
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
        return {
          valid: false,
          windows: [],
          provisionalDates: [],
          error: '실제 시작·종료 날짜와 시간을 확인해 주세요.',
        };
      }
      if (endMs < startMs) {
        return {
          valid: false,
          windows: [],
          provisionalDates: [],
          error: `${startDate}: 종료 시간(${parsedEnd})이 시작 시간(${parsedStart})보다 빠릅니다.`,
        };
      }
      if (endMs > startMs) {
        resolved.push({ startDate, startTime: parsedStart, endDate, endTime: parsedEnd });
        continue;
      }
      // Single-stop day where start === end (e.g. airport pickup without explicit end time yet):
      // probe conservatively until end-of-day (23:59) so free vehicles can be inspected safely.
      provisionalDates.push(startDate);
      if (parsedStart === '23:59') {
        resolved.push({
          startDate,
          startTime: parsedStart,
          endDate: shiftIsoDate(endDate, 1),
          endTime: '00:59',
        });
      } else {
        resolved.push({ startDate, startTime: parsedStart, endDate, endTime: '23:59' });
      }
      continue;
    }

    // Missing startTime and/or endTime: probe conservatively for conflict safety without fabricating saved times.
    provisionalDates.push(startDate);
    if (!parsedStart && parsedEnd) {
      if (startDate === endDate && parsedEnd === '00:00') {
        resolved.push({ startDate, startTime: '00:00', endDate, endTime: '23:59' });
      } else {
        resolved.push({ startDate, startTime: '00:00', endDate, endTime: parsedEnd });
      }
      continue;
    }

    const probeStart = parsedStart || '00:00';
    if (probeStart === '23:59') {
      resolved.push({
        startDate,
        startTime: probeStart,
        endDate: shiftIsoDate(endDate, 1),
        endTime: '00:59',
      });
    } else {
      resolved.push({ startDate, startTime: probeStart, endDate, endTime: '23:59' });
    }
  }

  const uniqueProvisional = [...new Set(provisionalDates)];
  const notice = uniqueProvisional.length > 0
    ? `종료 시간 미확정 일정(${uniqueProvisional.join(', ')})은 당일 23:59까지 종일 기준으로 가용 차량을 조회했습니다. 배차 확정 전 실제 종료 시간을 입력해 주세요.`
    : undefined;

  return {
    valid: true,
    windows: resolved,
    provisionalDates: uniqueProvisional,
    notice,
  };
}
