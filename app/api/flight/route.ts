import { NextRequest, NextResponse } from 'next/server';
import { FlightInfo, FlightType } from '@/types';
import {
  resolveTerminal,
  resolveDepartureDoor,
  resolveArrivalGate,
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

// Get current date in KST (Asia/Seoul) as YYYYMMDD
function getKstDateString(): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(now).replace(/[^0-9]/g, '');
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

  const searchDate = searchParams.get('searchdate') || getKstDateString();
  const cacheKey = `${type}:${flightId}:${searchDate}`;
  const now = Date.now();

  // 1. Check in-memory 2-minute cache
  if (flightCache.has(cacheKey)) {
    const cached = flightCache.get(cacheKey)!;
    if (now - cached.timestamp < CACHE_TTL_MS) {
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
    const items = data?.response?.body?.items;

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: `입력하신 편명 [${flightId}]의 ${type === 'arrival' ? '입국(도착)' : '출국(출발)'} 운항 정보를 찾을 수 없습니다. 탭(입국/출국) 또는 편명을 확인해 주세요.`,
        },
        { status: 404 }
      );
    }

    // Pick the most relevant item:
    // 1) Match searchDate (e.g. 20260921)
    // 2) Otherwise, closest upcoming or closest to current time
    const nowDate = new Date();
    let bestItem = items.find(
      (it: any) =>
        (it.scheduleDateTime && it.scheduleDateTime.startsWith(searchDate)) ||
        (it.estimatedDateTime && it.estimatedDateTime.startsWith(searchDate))
    );

    if (!bestItem) {
      // Find item with minimum time delta to now
      let minDiff = Infinity;
      items.forEach((it: any) => {
        const itemDate = parseFlightDateTime(it.estimatedDateTime || it.scheduleDateTime);
        if (itemDate) {
          const diff = Math.abs(itemDate.getTime() - nowDate.getTime());
          if (diff < minDiff) {
            minDiff = diff;
            bestItem = it;
          }
        }
      });
      if (!bestItem) bestItem = items[0];
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
    const gateNumber = bestItem.gatenumber || '';
    const carousel = bestItem.carousel || '';
    const exitNumber = bestItem.exitnumber || '';
    const arrivalLocationText = resolveArrivalGate(terminal, exitNumber, carousel);

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
      gateNumber,
      carousel,
      exitNumber,
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
