import type { FlightInfo, FlightType } from '@/types';
import { resolveTerminal } from './flightMapping';

export interface EmailFlightHintInfo {
  code: string;
  airportLabel: string;
  terminalLabel: string;
  timeLabel?: string;
  routeLabel?: string;
  exitOrDoorLabel?: string;
  summaryText: string;
  source: 'live' | 'schedule_rule';
  isLiveApi: boolean;
}

const VALID_FLIGHT_RE = /^([A-Z]{2}|[A-Z]\d|\d[A-Z])\d{1,4}$/;
const GMP_INTL_PARTNERS = new Set(['HND', 'NRT', 'KIX', 'SHA', 'PVG', 'PEK', 'PKX', 'TSA', 'TPE', 'HKG']);
const GMP_DOM_PARTNERS = new Set(['CJU', 'PUS', 'USN', 'KWJ', 'RSU', 'MWX', 'YNY']);
const GMP_REGIONAL_AIRLINE_RE = /^(?:KE21\d{2}|OZ10\d{2}|JL9\d{1,2}|NH86\d|NH87\d|BR15\d|CI26\d|FM82\d|MU5\d{2}|CZ3\d{2})$/;

const IATA_CITY_KO: Record<string, string> = {
  HND: '도쿄(하네다)',
  NRT: '도쿄(나리타)',
  KIX: '오사카',
  LAX: '로스앤젤레스',
  JFK: '뉴욕',
  SFO: '샌프란시스코',
  HNL: '호놀룰루',
  SEA: '시애틀',
  ORD: '시카고',
  SIN: '싱가포르',
  HKG: '홍콩',
  TPE: '타이베이',
  TSA: '타이베이(송산)',
  SHA: '상하이(홍차오)',
  PVG: '상하이(푸동)',
  PEK: '베이징',
  PKX: '베이징(다싱)',
  BKK: '방콕',
  CDG: '파리',
  LHR: '런던',
  FRA: '프랑크푸르트',
  CJU: '제주',
  PUS: '부산',
};

export function normalizeFlightCode(raw?: string | null): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[\s-]/g, '').toUpperCase();
  if (!cleaned || !VALID_FLIGHT_RE.test(cleaned)) return null;
  return cleaned;
}

function shortAirportName(name?: string, kind?: 'ICN' | 'GMP'): string {
  if (kind === 'GMP' || /김포/.test(name || '')) return '김포공항';
  if (kind === 'ICN' || /인천/.test(name || '')) return '인천공항';
  return (name || '공항').replace('국제공항', '공항');
}

export function formatLiveFlightHint(flight: FlightInfo): EmailFlightHintInfo {
  const code = normalizeFlightCode(flight.flightId) || flight.flightId;
  const airportLabel = shortAirportName(flight.airportName, flight.airportKind);
  const terminalLabel = flight.terminal || '터미널 확인';
  const clock = flight.estimatedTimeFormatted || flight.scheduleTimeFormatted;
  const action = flight.type === 'departure' ? '출발' : '도착';

  let timeLabel: string | undefined;
  if (clock && clock !== '--:--') {
    if (flight.diffMinutes >= 10) {
      timeLabel = `${clock} ${action}(+${flight.diffMinutes}분)`;
    } else if (flight.diffMinutes <= -5) {
      timeLabel = `${clock} ${action}(${flight.diffMinutes}분)`;
    } else {
      timeLabel = `${clock} ${action}`;
    }
  }

  const partner = flight.airport?.trim();
  const routeLabel = partner
    ? `${partner}${flight.type === 'departure' ? '행' : '발'}`
    : undefined;

  const exitOrDoorLabel = flight.type === 'arrival'
    ? (flight.exit ? `${flight.exit}출구` : undefined)
    : (flight.suggestedDoor && flight.suggestedDoor !== '현장 확인' ? flight.suggestedDoor : undefined);

  const summaryParts = [
    `${airportLabel} ${terminalLabel}`,
    timeLabel,
    routeLabel,
    exitOrDoorLabel,
  ].filter(Boolean);

  return {
    code,
    airportLabel,
    terminalLabel,
    timeLabel,
    routeLabel,
    exitOrDoorLabel,
    summaryText: summaryParts.join(' · '),
    source: 'live',
    isLiveApi: !flight.isMock,
  };
}

export function buildFallbackFlightHint(params: {
  flightNumber?: string | null;
  date?: string | null;
  originAirport?: string | null;
  destinationAirport?: string | null;
  role?: 'arrival' | 'departure' | 'connection' | 'unknown';
  scheduledArrival?: string | null;
  scheduledDeparture?: string | null;
}): EmailFlightHintInfo | null {
  const code = normalizeFlightCode(params.flightNumber);
  if (!code) return null;

  const origin = params.originAirport?.trim().toUpperCase();
  const destination = params.destinationAirport?.trim().toUpperCase();
  const isDeparture = params.role === 'departure' || (origin === 'ICN' || origin === 'GMP');
  const queryType: FlightType = isDeparture ? 'departure' : 'arrival';
  const partnerCode = queryType === 'arrival' ? origin : destination;
  const localAirportCode = queryType === 'arrival' ? destination : origin;

  let airportLabel = '인천공항';
  let terminalLabel = resolveTerminal(undefined, code, params.date).terminal;

  if (localAirportCode === 'GMP') {
    airportLabel = '김포공항';
    if (partnerCode && GMP_DOM_PARTNERS.has(partnerCode)) {
      terminalLabel = '국내선';
    } else {
      terminalLabel = '국제선';
    }
  } else if (localAirportCode === 'PUS') {
    airportLabel = '김해공항';
    terminalLabel = partnerCode && GMP_DOM_PARTNERS.has(partnerCode) ? '국내선' : '국제선';
  } else if (localAirportCode === 'CJU') {
    airportLabel = '제주공항';
    terminalLabel = '여객터미널';
  } else if (!localAirportCode && partnerCode && GMP_INTL_PARTNERS.has(partnerCode) && GMP_REGIONAL_AIRLINE_RE.test(code)) {
    airportLabel = '김포공항';
    terminalLabel = '국제선';
  }

  const clock = queryType === 'arrival' ? params.scheduledArrival : params.scheduledDeparture;
  const timeLabel = clock && /^\d{2}:\d{2}$/.test(clock.trim())
    ? `${clock.trim()} ${queryType === 'departure' ? '출발' : '도착'}`
    : undefined;
  const routeCity = partnerCode ? (IATA_CITY_KO[partnerCode] || partnerCode) : undefined;
  const routeLabel = routeCity
    ? `${routeCity}${queryType === 'departure' ? '행' : '발'}`
    : undefined;

  const summaryParts = [
    `${airportLabel} ${terminalLabel}`,
    timeLabel,
    routeLabel,
  ].filter(Boolean);

  return {
    code,
    airportLabel,
    terminalLabel,
    timeLabel,
    routeLabel,
    summaryText: summaryParts.join(' · '),
    source: 'schedule_rule',
    isLiveApi: false,
  };
}
