import { NextRequest, NextResponse } from 'next/server';
import { FlightInfo, FlightType } from '@/types';
import {
  resolveTerminal,
  resolveDepartureDoor,
  resolveArrivalGate,
  resolveArrivalCrossValidation,
  cleanExitCode,
  getCurbsideGate,
  computeFlightStatusText,
  getFlightLocationPreset,
  parseFlightDateTime,
  formatFlightTime,
} from '@/utils/flightMapping';

interface FlightCacheEntry {
  flight: FlightInfo;
  timestamp: number;
}

// 2-minute in-memory cache to protect 500 daily quota and avoid API key exposure
const flightCache = new Map<string, FlightCacheEntry>();
const CACHE_TTL_MS = 2 * 60 * 1000; // 120 seconds

function getKstDate(offsetDays = 0): { yyyymmdd: string; formatted: string } {
  const now = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  const formatter = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(now);
  const y = parts.find((p) => p.type === 'year')?.value || '';
  const m = parts.find((p) => p.type === 'month')?.value || '';
  const d = parts.find((p) => p.type === 'day')?.value || '';
  return {
    yyyymmdd: `${y}${m}${d}`,
    formatted: `${y}-${m}-${d}`,
  };
}

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

function isStaleFlight(item: any, nowMs: number): boolean {
  const dtStr = item.estimatedDateTime || item.scheduleDateTime;
  const itemDate = parseFlightDateTime(dtStr);
  if (!itemDate) return false;

  const diffFromNow = nowMs - itemDate.getTime(); // positive if past
  const remark = (item.remark || '').trim();
  const isCompletedRemark = ['도착', '출발', '결항', '탑승마감'].some((r) => remark.includes(r));

  // If arrival/departure is 2 hours or more in the past AND status is completed (or > 3.5 hours in past)
  if (diffFromNow >= TWO_HOURS_MS && (isCompletedRemark || diffFromNow >= 3.5 * 60 * 60 * 1000)) {
    return true;
  }
  return false;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const rawType = searchParams.get('type')?.toLowerCase();
  const type: FlightType = rawType === 'departure' ? 'departure' : 'arrival';

  const rawFlightId = searchParams.get('flightId') || searchParams.get('flight_id') || '';
  const flightId = rawFlightId.replace(/\s+/g, '').toUpperCase();

  if (!flightId || flightId.length < 3) {
    return NextResponse.json(
      { success: false, message: '정확한 항공편명을 입력해 주세요. (예: KE012, OZ202)' },
      { status: 400 }
    );
  }

  const today = getKstDate(0);
  const tomorrow = getKstDate(1);
  const searchDate = searchParams.get('searchdate') || today.yyyymmdd;
  const cacheKey = `${type}:${flightId}:${searchDate}`;
  const nowMs = Date.now();

  // 1. Check in-memory 2-minute cache
  if (flightCache.has(cacheKey)) {
    const cached = flightCache.get(cacheKey)!;
    if (nowMs - cached.timestamp < CACHE_TTL_MS) {
      return NextResponse.json({
        success: true,
        flight: cached.flight,
        cached: true,
      });
    }
  }

  const apiKey =
    process.env.INCHEON_AIRPORT_API_KEY ||
    '2e742b6be9c16575a39a70e09f1c8035fc4498e7b5aea5d58daed5b544d5c066';

  const endpoint =
    type === 'departure'
      ? 'https://apis.data.go.kr/B551177/StatusOfPassengerFlightsDeOdp/getPassengerDeparturesDeOdp'
      : 'https://apis.data.go.kr/B551177/StatusOfPassengerFlightsDeOdp/getPassengerArrivalsDeOdp';

  const queryUrl = `${endpoint}?serviceKey=${encodeURIComponent(apiKey)}&type=json&flight_id=${encodeURIComponent(
    flightId
  )}&numOfRows=20`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4500);

    const res = await fetch(queryUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return NextResponse.json(
        { success: false, message: `공항공사 API 응답 오류 (${res.status})` },
        { status: 502 }
      );
    }

    const data = await res.json();
    let items = data?.response?.body?.items;

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: `입력하신 편명 [${flightId}]의 ${type === 'arrival' ? '입국(도착)' : '출국(출발)'} 운항 정보를 찾을 수 없습니다. 탭(입국/출국) 또는 편명을 확인해 주세요.`,
        },
        { status: 404 }
      );
    }

    // 2. Smart Time Window & Tomorrow (+1 day) Lookahead Pipeline
    // Filter items for today
    const todayItems = items.filter(
      (it: any) =>
        (it.scheduleDateTime && it.scheduleDateTime.startsWith(today.yyyymmdd)) ||
        (it.estimatedDateTime && it.estimatedDateTime.startsWith(today.yyyymmdd))
    );

    // Active (non-stale) flights today
    const activeTodayItems = todayItems.filter((it: any) => !isStaleFlight(it, nowMs));

    let bestItem: any = null;
    let isTomorrow = false;
    let flightDate = today.formatted;

    if (activeTodayItems.length > 0) {
      // Pick active flight today closest to now
      let minDiff = Infinity;
      activeTodayItems.forEach((it: any) => {
        const itemDate = parseFlightDateTime(it.estimatedDateTime || it.scheduleDateTime);
        if (itemDate) {
          const diff = Math.abs(itemDate.getTime() - nowMs);
          if (diff < minDiff) {
            minDiff = diff;
            bestItem = it;
          }
        }
      });
      if (!bestItem) bestItem = activeTodayItems[0];
      isTomorrow = false;
      flightDate = today.formatted;
    } else {
      // Lookahead to tomorrow (+1 day)!
      let tomorrowItems = items.filter(
        (it: any) =>
          (it.scheduleDateTime && it.scheduleDateTime.startsWith(tomorrow.yyyymmdd)) ||
          (it.estimatedDateTime && it.estimatedDateTime.startsWith(tomorrow.yyyymmdd))
      );

      // If tomorrow items not in current batch, fetch tomorrow explicitly from airport API
      if (tomorrowItems.length === 0) {
        try {
          const tomorrowQueryUrl = `${endpoint}?serviceKey=${encodeURIComponent(
            apiKey
          )}&type=json&flight_id=${encodeURIComponent(flightId)}&searchdate=${tomorrow.yyyymmdd}&numOfRows=10`;
          const tomorrowRes = await fetch(tomorrowQueryUrl, {
            method: 'GET',
            headers: { Accept: 'application/json' },
          });
          if (tomorrowRes.ok) {
            const tomorrowData = await tomorrowRes.json();
            const tomorrowBatch = tomorrowData?.response?.body?.items;
            if (Array.isArray(tomorrowBatch) && tomorrowBatch.length > 0) {
              tomorrowItems = tomorrowBatch;
            }
          }
        } catch (e) {
          console.warn('Tomorrow lookahead fetch failed:', e);
        }
      }

      if (tomorrowItems.length > 0) {
        bestItem = tomorrowItems[0];
        isTomorrow = true;
        flightDate = tomorrow.formatted;
      } else {
        // Fallback: closest future item among all items
        const futureItems = items.filter((it: any) => {
          const d = parseFlightDateTime(it.estimatedDateTime || it.scheduleDateTime);
          return d && d.getTime() > nowMs;
        });
        if (futureItems.length > 0) {
          bestItem = futureItems[0];
          const itemDtStr = bestItem.estimatedDateTime || bestItem.scheduleDateTime || '';
          if (itemDtStr.startsWith(tomorrow.yyyymmdd)) {
            isTomorrow = true;
            flightDate = tomorrow.formatted;
          } else {
            isTomorrow = false;
            flightDate = itemDtStr.slice(0, 4) + '-' + itemDtStr.slice(4, 6) + '-' + itemDtStr.slice(6, 8);
          }
        } else {
          // Last fallback to most recent item
          bestItem = items[items.length - 1] || items[0];
          isTomorrow = false;
          flightDate = today.formatted;
        }
      }
    }

    // Mappings
    const airline = bestItem.airline || '항공사';
    const airport = bestItem.airport || (type === 'arrival' ? '출발지' : '도착지');
    const airportCode = bestItem.airportCode || '';
    const terminalId = bestItem.terminalid || '';
    const { terminal, isT2 } = resolveTerminal(terminalId, flightId);

    const scheduleTimeFormatted = formatFlightTime(bestItem.scheduleDateTime);
    const estimatedTimeFormatted = formatFlightTime(bestItem.estimatedDateTime || bestItem.scheduleDateTime);

    const { statusText, diffMinutes } = computeFlightStatusText(
      type,
      bestItem.scheduleDateTime,
      bestItem.estimatedDateTime
    );

    // Departure specific mapping
    const checkinRange = bestItem.chkinrange || '';
    const { departureLocationText, suggestedDoor } = resolveDepartureDoor(
      terminal,
      isT2,
      flightId,
      checkinRange
    );

    // Arrival specific mapping
    const rawGate = bestItem.gatenumber ? String(bestItem.gatenumber).trim() : '';
    const rawCarousel = bestItem.carousel ? String(bestItem.carousel).trim() : '';
    const rawExitNumber = bestItem.exitnumber ? String(bestItem.exitnumber).trim() : '';

    // Flight arrival timing check:
    // Real Incheon Airport baggage carousel and exit gate allocations occur 1-2 hours before landing.
    // For tomorrow's lookahead (+1 day) or distant future flights where remark/gate is unassigned,
    // any leftover/static API carousel/exit values are strictly suppressed to null.
    const isUnassignedTiming = isTomorrow || (!bestItem.remark && !rawGate);

    const carousel = (isUnassignedTiming || !rawCarousel || rawCarousel === 'null') ? null : rawCarousel;
    const cleanExit = (isUnassignedTiming || !rawExitNumber || rawExitNumber === 'null') ? null : (cleanExitCode(rawExitNumber) || null);
    const exitNumber = cleanExit;
    const exit = cleanExit;

    const arrivalResolution = resolveArrivalCrossValidation(terminal, cleanExit, carousel);
    const curbsideGate = cleanExit ? (getCurbsideGate(terminal, cleanExit) || null) : null;
    const recommendedParking = arrivalResolution.recommendedParking;
    const arrivalLocationText = resolveArrivalGate(terminal, cleanExit, carousel);

    const targetPreset = getFlightLocationPreset(terminal, type);

    const flightInfo: FlightInfo = {
      flightId,
      airline,
      type,
      airport,
      airportCode,
      scheduleTimeFormatted,
      estimatedTimeFormatted,
      statusText,
      diffMinutes,
      terminal,
      terminalId: isT2 ? 'P03' : 'P01',
      isTomorrow,
      flightDate,
      gateNumber: rawGate || null,
      carousel,
      exit,
      exitNumber,
      curbsideGate,
      recommendedParking,
      arrivalLocationText,
      checkinRange,
      suggestedDoor,
      departureLocationText,
      targetPreset,
    };

    // Save to in-memory cache for 2 minutes
    flightCache.set(cacheKey, {
      flight: flightInfo,
      timestamp: Date.now(),
    });

    return NextResponse.json({
      success: true,
      flight: flightInfo,
      cached: false,
    });
  } catch (error: any) {
    console.error('Failed to query Incheon Airport API:', error);
    return NextResponse.json(
      { success: false, message: '공항공사 서버와의 통신에 실패했습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 500 }
    );
  }
}
