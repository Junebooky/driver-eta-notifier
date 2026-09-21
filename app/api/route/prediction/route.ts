import { NextRequest, NextResponse } from 'next/server';
import { calculateHaversineEstimate, formatEtaTime } from '@/utils/navigation';

export interface LocationPoint {
  name: string;
  lat: number;
  lng: number;
}

export interface PredictionTimelineItem {
  offsetMinutes: number;
  timeFormatted: string; // e.g. "15:10"
  durationMinutes: number;
  diffMinutes: number; // e.g. -1, 0, +3, +6
  status: 'fast' | 'normal' | 'slow' | 'heavy';
  label?: string; // e.g. "1시간 후", "2시간 후"
}

export interface PredictionResult {
  baseDurationMinutes: number;
  predictedDurationMinutes: number;
  predictedDistanceKm: number;
  departureTimeIso: string;
  departureTimeFormatted: string;
  arrivalTimeFormatted: string;
  trafficSummary: string;
  isMock: boolean;
  isFallback: boolean;
  timeline: PredictionTimelineItem[];
}

/**
 * Format Date to TMAP Prediction ISO 8601 string: YYYY-MM-DDTHH:mm:ss+0900
 */
function formatTmapIsoTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}+0900`;
}

/**
 * Hourly statistical traffic model for Seoul Metropolitan Road Network:
 * Simulates real-world traffic volume variations (-5% to +35%)
 */
export function getTrafficFactor(date: Date): { multiplier: number; status: 'fast' | 'normal' | 'slow' | 'heavy'; summary: string } {
  const timeDecimal = date.getHours() + date.getMinutes() / 60;

  // Late Night / Dawn (00:00 ~ 06:00): Free Flow (-5% ~ 0%)
  if (timeDecimal >= 0 && timeDecimal < 6) {
    return { multiplier: 0.95, status: 'fast', summary: '심야 원활' };
  }
  // Morning Build-up (06:00 ~ 07:30): Traffic starts (+10%)
  if (timeDecimal >= 6 && timeDecimal < 7.5) {
    return { multiplier: 1.10, status: 'normal', summary: '교통량 증가' };
  }
  // Morning Rush Peak (07:30 ~ 09:30): Commute Peak (+25% ~ +35%)
  if (timeDecimal >= 7.5 && timeDecimal <= 9.5) {
    const dist = Math.abs(timeDecimal - 8.5);
    const m = Math.round((1.35 - dist * 0.1) * 100) / 100;
    return { multiplier: m, status: 'heavy', summary: '출근 정체' };
  }
  // Morning Off-peak (09:30 ~ 11:30): Smooth (+5%)
  if (timeDecimal > 9.5 && timeDecimal < 11.5) {
    return { multiplier: 1.05, status: 'normal', summary: '원활' };
  }
  // Lunch Hour (11:30 ~ 13:00): Moderate (+15%)
  if (timeDecimal >= 11.5 && timeDecimal <= 13.0) {
    return { multiplier: 1.15, status: 'slow', summary: '점심 혼잡' };
  }
  // Afternoon Normal (13:00 ~ 17:00): Moderate (+10%)
  if (timeDecimal > 13.0 && timeDecimal < 17.0) {
    return { multiplier: 1.10, status: 'normal', summary: '보통' };
  }
  // Evening Rush Peak (17:00 ~ 20:00): Heavy Commute Peak (+25% ~ +35%)
  if (timeDecimal >= 17.0 && timeDecimal <= 20.0) {
    const dist = Math.abs(timeDecimal - 18.5);
    const m = Math.round((1.35 - dist * 0.08) * 100) / 100;
    return { multiplier: m, status: 'heavy', summary: '퇴근 정체' };
  }
  // Evening Dissipation (20:00 ~ 22:00): Easing (+8%)
  if (timeDecimal > 20.0 && timeDecimal < 22.0) {
    return { multiplier: 1.08, status: 'normal', summary: '서행 해제' };
  }
  // Night Return (22:00 ~ 24:00): Smooth (-4%)
  return { multiplier: 0.96, status: 'fast', summary: '원활 (심야)' };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const departure: LocationPoint = body.departure || {
      name: body.startName || '조선팰리스 강남',
      lat: parseFloat(body.startLat || body.startY || '37.5042'),
      lng: parseFloat(body.startLng || body.startX || '127.0425'),
    };

    const destination: LocationPoint = body.destination || {
      name: body.endName || '인천공항 T1',
      lat: parseFloat(body.endLat || body.endY || '37.4495'),
      lng: parseFloat(body.endLng || body.endX || '126.4512'),
    };

    const rawPredictionTime = body.predictionTime;
    let targetDate: Date;
    if (rawPredictionTime) {
      targetDate = new Date(rawPredictionTime);
      if (isNaN(targetDate.getTime())) {
        targetDate = new Date();
      }
    } else {
      targetDate = new Date();
    }

    const apiKey = process.env.TMAP_API_KEY;
    const useMock = process.env.NEXT_PUBLIC_USE_MOCK === 'true';
    const isMockMode = useMock || !apiKey || apiKey === 'your_tmap_api_key';

    // Baseline calculation via Haversine
    const baseEstimate = calculateHaversineEstimate(
      departure.lat,
      departure.lng,
      destination.lat,
      destination.lng
    );
    let baseDurationMinutes = baseEstimate.durationMinutes;
    let baseDistanceKm = baseEstimate.distanceKm;

    let predictedDurationMinutes = baseDurationMinutes;
    let predictedDistanceKm = baseDistanceKm;
    let trafficSummary = 'AI 통계 예측';
    let isFallback = false;

    // Attempt TMAP Routes Prediction API if available
    if (!isMockMode) {
      const tmapPredictionUrl = 'https://apis.openapi.sk.com/tmap/routes/prediction?version=1';
      const formattedIso = formatTmapIsoTime(targetDate);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      try {
        const response = await fetch(tmapPredictionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            appKey: apiKey,
          },
          body: JSON.stringify({
            routesInfo: {
              departure: {
                name: departure.name,
                lon: String(departure.lng),
                lat: String(departure.lat),
              },
              destination: {
                name: destination.name,
                lon: String(destination.lng),
                lat: String(destination.lat),
              },
              predictionType: 'departure',
              predictionTime: formattedIso,
              searchOption: '00',
            },
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json();
          const totalTimeSeconds =
            data?.features?.[0]?.properties?.totalTime ||
            data?.routesInfo?.summary?.totalTime;
          const totalDistanceMeters =
            data?.features?.[0]?.properties?.totalDistance ||
            data?.routesInfo?.summary?.totalDistance;

          if (totalTimeSeconds) {
            predictedDurationMinutes = Math.round(totalTimeSeconds / 60);
            if (totalDistanceMeters) {
              predictedDistanceKm = Math.round((totalDistanceMeters / 1000) * 10) / 10;
            }
            trafficSummary = 'TMAP 타임머신 빅데이터 반영';
          } else {
            isFallback = true;
          }
        } else {
          // 4xx, 429 Quota Exceeded, or Free Tier limit hit -> Safe Fallback
          console.warn(`TMAP Prediction API HTTP ${response.status}. Using hybrid traffic simulation.`);
          isFallback = true;
        }
      } catch (err: any) {
        clearTimeout(timeoutId);
        console.warn('TMAP Prediction API timed out or failed:', err?.message);
        isFallback = true;
      }
    } else {
      isFallback = true;
    }

    // Hybrid Statistical Fallback Model
    if (isFallback) {
      const { multiplier, summary } = getTrafficFactor(targetDate);
      predictedDurationMinutes = Math.max(10, Math.round(baseDurationMinutes * multiplier));
      trafficSummary = `AI 시간대별 통계 예측 (${summary})`;
    }

    // Build timeline comparative slots (-30m, -15m, 0m, +15m, +30m, +60m, +90m, +120m)
    const offsets = [-30, -15, 0, 15, 30, 45, 60, 90, 120];
    const timeline: PredictionTimelineItem[] = offsets.map((offset) => {
      const slotDate = new Date(targetDate.getTime() + offset * 60 * 1000);
      const factor = getTrafficFactor(slotDate);
      const slotDuration = Math.max(10, Math.round(baseDurationMinutes * factor.multiplier));
      const diffMinutes = slotDuration - predictedDurationMinutes;

      let label: string | undefined = undefined;
      if (offset === 60) label = '1시간 후';
      if (offset === 120) label = '2시간 후';

      return {
        offsetMinutes: offset,
        timeFormatted: formatEtaTime(slotDate),
        durationMinutes: slotDuration,
        diffMinutes,
        status: factor.status,
        label,
      };
    });

    const arrivalDate = new Date(targetDate.getTime() + predictedDurationMinutes * 60 * 1000);

    const result: PredictionResult = {
      baseDurationMinutes,
      predictedDurationMinutes,
      predictedDistanceKm,
      departureTimeIso: targetDate.toISOString(),
      departureTimeFormatted: formatEtaTime(targetDate),
      arrivalTimeFormatted: formatEtaTime(arrivalDate),
      trafficSummary,
      isMock: isMockMode,
      isFallback,
      timeline,
    };

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Prediction API fatal error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to calculate departure prediction' },
      { status: 500 }
    );
  }
}
