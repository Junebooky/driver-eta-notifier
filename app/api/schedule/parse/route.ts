import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { supabaseAdmin } from '@/lib/supabase/server';
import { searchTmapPoi, ResolvedPlaceLocation } from '@/services/tmapService';

interface ParseScheduleRequestBody {
  imageBase64: string;
  profile: {
    vehicleNo: string;
    driverName: string;
    nameCandidates?: string[];
    plateNo?: string;
    plateLast4?: string;
    mobile?: string;
    passengerName?: string;
  };
}

interface ParsedScheduleRaw {
  date: string;
  pickup_time: string;
  dropoff_time?: string | null;
  origin_name: string;
  destination_name: string;
  passenger_name?: string | null;
  flight_no?: string | null;
  notes?: string | null;
  origin_address?: string | null;
  origin_lat?: number;
  origin_lng?: number;
  destination_address?: string | null;
  destination_lat?: number;
  destination_lng?: number;
}

interface ResolvedLocation {
  name: string;
  address: string | null;
  lat: number;
  lng: number;
}

// 1. Preset matching helper
function resolvePresetCoordinates(
  name: string,
  presets: Array<{ name: string; address: string; lat: number; lng: number }>
): { name: string; address: string; lat: number; lng: number } | null {
  if (!name) return null;

  const norm = name.replace(/\s+/g, '').toLowerCase();

  // 1. Exact or contains match in DB presets
  for (const p of presets) {
    const pNorm = p.name.replace(/\s+/g, '').toLowerCase();
    if (norm.includes(pNorm) || pNorm.includes(norm)) {
      return { name: p.name, address: p.address, lat: p.lat, lng: p.lng };
    }
  }

  // 2. Keyword heuristic mapping
  if (norm.includes('인천') || norm.includes('icn') || norm.includes('공항')) {
    if (norm.includes('t2') || norm.includes('2터미널') || norm.includes('제2')) {
      const match = presets.find((p) => p.name.includes('T2'));
      if (match) return { name: match.name, address: match.address, lat: match.lat, lng: match.lng };
    }
    const match = presets.find((p) => p.name.includes('T1'));
    if (match) return { name: match.name, address: match.address, lat: match.lat, lng: match.lng };
  }

  if (norm.includes('조선') || norm.includes('팰리스') || norm.includes('josun')) {
    const match = presets.find((p) => p.name.includes('조선팰리스'));
    if (match) return { name: match.name, address: match.address, lat: match.lat, lng: match.lng };
  }

  if (norm.includes('시그니엘') || norm.includes('signiel') || norm.includes('롯데타워')) {
    const match = presets.find((p) => p.name.includes('시그니엘'));
    if (match) return { name: match.name, address: match.address, lat: match.lat, lng: match.lng };
  }

  if (norm.includes('패독') || norm.includes('피트') || norm.includes('paddock') || norm.includes('pit')) {
    const match = presets.find((p) => p.name.includes('패독') || p.name.includes('피트'));
    if (match) return { name: match.name, address: match.address, lat: match.lat, lng: match.lng };
  }

  if (norm.includes('인제') || norm.includes('speedium') || norm.includes('서킷')) {
    const match = presets.find((p) => p.name.includes('인제스피디움 호텔'));
    if (match) return { name: match.name, address: match.address, lat: match.lat, lng: match.lng };
  }

  if (norm.includes('반납') || norm.includes('하남') || norm.includes('미사')) {
    const match = presets.find((p) => p.name.includes('반납'));
    if (match) return { name: match.name, address: match.address, lat: match.lat, lng: match.lng };
  }

  return null;
}

/**
 * 3단계 정밀 주소 확정 파이프라인
 * 1순위: DB/로컬 마스터 프리셋 대조
 * 2순위: 비고란(notes / remark) 도로명/영문 주소 정규식 추출
 * 3순위: TMAP 통합 POI 검색 API 자동 호출 및 좌표 취득
 */
async function resolveScheduleLocation(
  placeName: string,
  notes: string | null | undefined,
  presets: Array<{ name: string; address: string; lat: number; lng: number }>,
  cache: Map<string, ResolvedPlaceLocation | null>
): Promise<ResolvedLocation> {
  const cleanName = (placeName || '').trim();
  if (!cleanName) {
    return { name: '', address: null, lat: 37.5042, lng: 127.0425 };
  }

  // [1순위] 로컬/DB 마스터 프리셋(cockpit_presets) 명칭 대조
  const presetMatch = resolvePresetCoordinates(cleanName, presets);
  if (presetMatch && presetMatch.address && presetMatch.address.trim().length > 0) {
    return {
      name: presetMatch.name || cleanName,
      address: presetMatch.address,
      lat: presetMatch.lat,
      lng: presetMatch.lng,
    };
  }

  // [2순위] 비고란(notes / remark)에 기재된 영문/한글 주소 확인
  let remarkAddress: string | null = null;
  if (notes) {
    // 한글 주소 패턴 매칭 (시/도 + 구/군 + 로/길 + 번지)
    const krMatch = notes.match(
      /(?:서울(?:특별시)?|인천(?:광역시)?|경기(?:도)?|강원(?:특별자치도|도)?|충(?:청)?(?:북|남)(?:도)?|전(?:라)?(?:북|남)(?:도)?|경(?:상)?(?:북|남)(?:도)?|제주(?:특별자치도)?|세종(?:특별자치시)?|부산(?:광역시)?|대구(?:광역시)?|광주(?:광역시)?|대전(?:광역시)?|울산(?:광역시)?)[가-힣0-9\s,.-]+(?:로|길|동|읍|면|가)\s*[\d-]+(?:번지)?/i
    );
    // 영문 도로명 주소 패턴 매칭 (예: 854 Nonhyeon-ro, Gangnam-gu, Seoul)
    const enMatch = notes.match(
      /\b\d+[\w\s,.-]+(?:ro|gil|daero|street|road|st|ave|avenue|blvd)[\w\s,.-]*/i
    );

    if (krMatch) {
      remarkAddress = krMatch[0].trim();
    } else if (enMatch) {
      remarkAddress = enMatch[0].trim();
    }
  }

  // [3순위] 여전히 정규 도로명 주소가 없다면 searchTmapPoi(placeName) 호출하여 도로명 주소와 위경도 좌표 취득
  let poiResult: ResolvedPlaceLocation | null = null;
  if (cache.has(cleanName)) {
    poiResult = cache.get(cleanName)!;
  } else {
    poiResult = await searchTmapPoi(cleanName);
    // 만약 거점명으로 검색되지 않고 2순위 비고란 주소가 존재한다면 비고 주소로도 POI 재검색 시도
    if (!poiResult && remarkAddress) {
      poiResult = await searchTmapPoi(remarkAddress);
    }
    cache.set(cleanName, poiResult);
  }

  if (poiResult) {
    return {
      name: cleanName,
      address: poiResult.roadAddress || remarkAddress || null,
      lat: poiResult.lat,
      lng: poiResult.lng,
    };
  }

  // 2순위에서 주소를 추출했으나 TMAP 검색이 불가했던 경우
  if (remarkAddress) {
    return {
      name: cleanName,
      address: remarkAddress,
      lat: presetMatch?.lat || 37.5042,
      lng: presetMatch?.lng || 127.0425,
    };
  }

  // 최종 폴백: 프리셋 기본 좌표 (강남 테헤란로 등)
  return {
    name: presetMatch?.name || cleanName,
    address: presetMatch?.address || null,
    lat: presetMatch?.lat || 37.5042,
    lng: presetMatch?.lng || 127.0425,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body: ParseScheduleRequestBody = await req.json();
    const { imageBase64, profile } = body;

    if (!imageBase64) {
      return NextResponse.json(
        { success: false, error: '배차표 이미지(imageBase64)가 제공되지 않았습니다.' },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'GEMINI_API_KEY 환경변수가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    // 1. Profile and 3-Anchor Preparation
    const rawVehicleNo = profile?.vehicleNo || '4호차';
    const hochaMatch = rawVehicleNo.match(/(\d+호차)/);
    const targetVehicleNo = hochaMatch ? hochaMatch[1] : '4호차';

    const driverName = profile?.driverName || '윤태준';
    const nameCandidates = profile?.nameCandidates && profile.nameCandidates.length > 0
      ? profile.nameCandidates
      : [driverName, 'Yoon Tae Jun', 'Tae Jun Yoon', 'Taejun Yoon'];

    const plateNo = profile?.plateNo || '142호 7811';
    const plateLast4 = profile?.plateLast4 || plateNo.replace(/[^0-9]/g, '').slice(-4) || '7811';
    const rawMobile = profile?.mobile || '010-6348-8726';
    const mobileClean = rawMobile.replace(/[^0-9]/g, '');

    // 2. Extract Base64 Image Payload
    let mimeType = 'image/jpeg';
    let base64Data = imageBase64;
    const match = imageBase64.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
    if (match) {
      mimeType = match[1];
      base64Data = match[2];
    }

    // 3. Gemini 3.8 Flash Multimodal System Prompt & 3-Anchor Guardrails
    const systemPrompt = `당신은 대한민국 최고 수준의 VIP 의전 관제 시스템 전담 배차표 OCR 파싱 AI입니다.
업로드된 배차표(이미지, 엑셀 캡처, 일정표 문서)를 정밀 분석하여, 지정된 기사 본인의 배차 일정만 100% 엄격하게 발췌(Filter & Extract)하십시오.

[현재 기사 식별 3중 앵커 (ANCHORS)]
1. 기사명 후보군 (한글 및 영문 DRIVER NAME):
   ${nameCandidates.join(', ')}
2. 차량 번호 (CAR REG NO):
   - 전체 번호판: "${plateNo}"
   - 번호판 뒷 4자리: "${plateLast4}"
3. 기사 연락처 (DRIVER MOBILE):
   - 공식 번호: "${rawMobile}" (숫자만: "${mobileClean}")
4. 기본 담당 호차: "${targetVehicleNo}"
5. 기본 담당 승객: "${profile?.passengerName || 'VIP 고객님'}"

[엄격한 3중 앵커 필터링 가드레일 (CRITICAL GUARDRAIL)]
• 배차표에는 여러 호차(1호차, 2호차, 3호차, 4호차, 5호차 등)와 수많은 기사의 배차 일정이 혼재되어 있습니다.
• 다음 조건 중 2개 이상 일치하거나, 차량번호 뒷4자리("${plateLast4}") 또는 영문/한글 기사명이 명확히 일치하는 행만 발췌하십시오:
  (1) 표의 기사명 열이 기사명 후보군 중 하나와 일치하는가? (대소문자/공백 무시)
  (2) 표의 차량번호 열에 "${plateLast4}" 또는 "${plateNo}"가 포함되어 있는가?
  (3) 표의 연락처 열에 기사 휴대폰 번호("${rawMobile}" 또는 "${mobileClean}")가 일치하는가?
• 타 호차, 타 기사의 일정은 단 1건도 결과에 포함하지 마십시오 (엄격한 세션 격리).
• 만약 현재 기사와 일치하는 배차 일정이 표 안에 전혀 없다면, schedules 배열에 빈 배열([])을 반환하십시오.

[출력 데이터 형식 요건]
- date: YYYY-MM-DD 형식 (연도가 없으면 2026년 기준, 예: 2026-09-17)
- pickup_time: HH:mm 형식 (24시간제, 예: 09:50)
- dropoff_time: HH:mm 형식 (목적지 도착 또는 종료 시각, 미기재 시 null)
- origin_name: 출발지 또는 대기장소 (예: 인천공항 T1, 조선팰리스 강남 등)
- destination_name: 목적지 (예: 조선팰리스 강남, 인제스피디움 호텔, 인천공항 T1 등)
- passenger_name: 승객 성명 (배차표에 미기재 시 "${profile?.passengerName || 'VIP 고객님'}" 사용)
- flight_no: 항공편명 (예: SQ 612, 없으면 null)
- notes: 특이사항, 세션 내용, 터미널 정보 등

반드시 아래 JSON 스키마 구조로만 정확하게 출력하십시오. markdown 코드블록을 사용하지 마십시오.
{
  "success": true,
  "matchedDriver": "${driverName} (${targetVehicleNo})",
  "schedules": [
    {
      "date": "2026-09-17",
      "pickup_time": "09:50",
      "dropoff_time": null,
      "origin_name": "인천공항 T1",
      "destination_name": "조선팰리스 강남",
      "passenger_name": "DENZEL SOFYAN 외 1명",
      "flight_no": "SQ 612",
      "notes": "CLUB CHALLENGE VIP 영접 • T1 입국장 피켓 대기"
    }
  ]
}`;

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [
        {
          inlineData: {
            mimeType,
            data: base64Data,
          },
        },
        '배차표 이미지를 분석하여 3중 앵커 조건에 부합하는 본인 배차 일정만 정밀 발췌해줘.',
      ],
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.1,
        responseMimeType: 'application/json',
      },
    });

    const responseText = response.text?.trim() || '';
    if (!responseText) {
      throw new Error('Gemini 3.8 Flash did not return any response text');
    }

    // 4. Safe JSON Parsing
    let parsedResult: { success: boolean; matchedDriver: string; schedules: ParsedScheduleRaw[] };
    try {
      const cleanJson = responseText
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();
      parsedResult = JSON.parse(cleanJson);
    } catch (parseErr) {
      console.error('Failed to parse Gemini JSON output:', responseText, parseErr);
      return NextResponse.json(
        {
          success: false,
          error: 'AI 응답을 JSON으로 파싱하지 못했습니다.',
          raw: responseText,
        },
        { status: 502 }
      );
    }

    const rawSchedules = Array.isArray(parsedResult.schedules) ? parsedResult.schedules : [];

    // 5. Fetch DB Master Presets for Precise Coordinate Mapping
    const { data: dbPresets } = await supabaseAdmin
      .from('presets')
      .select('name, address, lat, lng');

    const activePresets = dbPresets || [];

    // 6. Ensure Driver Exists in cockpit.drivers (satisfies foreign key constraint)
    const driverPayload: any = {
      vehicle_no: targetVehicleNo,
      car_number: plateNo,
      driver_name: driverName,
      phone: rawMobile,
      default_navi: 'tmap',
    };
    if (profile?.passengerName) {
      driverPayload.passenger_name = profile.passengerName;
    }

    await supabaseAdmin
      .from('drivers')
      .upsert(driverPayload, { onConflict: 'vehicle_no' });

    // 7. Supabase DB Upsert Pipeline
    // Check existing schedules for this vehicle to update without causing duplicates
    const { data: existingSchedules } = await supabaseAdmin
      .from('schedules')
      .select('id, date, pickup_time')
      .eq('vehicle_no', targetVehicleNo);

    const existingMap = new Map<string, string>();
    if (existingSchedules) {
      for (const ex of existingSchedules) {
        // key by date + pickup_time (HH:mm)
        const timeKey = (ex.pickup_time || '').slice(0, 5);
        existingMap.set(`${ex.date}_${timeKey}`, ex.id);
      }
    }

    // 7. 3단계 주소 확정 파이프라인 (Promise.all 병렬 처리 & 캐싱)
    const poiCache = new Map<string, ResolvedPlaceLocation | null>();

    const enrichedSchedules = await Promise.all(
      rawSchedules.map(async (s) => {
        // 출발지(origin) 3단계 주소/좌표 확정
        const originLoc = await resolveScheduleLocation(
          s.origin_name,
          s.notes,
          activePresets,
          poiCache
        );

        // 도착지(destination) 3단계 주소/좌표 확정
        const destLoc = await resolveScheduleLocation(
          s.destination_name,
          s.notes,
          activePresets,
          poiCache
        );

        return {
          ...s,
          origin_name: originLoc.name || s.origin_name,
          origin_address: originLoc.address,
          origin_lat: originLoc.lat,
          origin_lng: originLoc.lng,
          destination_name: destLoc.name || s.destination_name,
          destination_address: destLoc.address,
          destination_lat: destLoc.lat,
          destination_lng: destLoc.lng,
        };
      })
    );

    const upsertRows = enrichedSchedules.map((s) => {
      // Detect airport departure sending vs airport arrival pickup
      const isAirportDest =
        (s.destination_name && (s.destination_name.includes('공항') || s.destination_name.toLowerCase().includes('airport'))) ||
        (s.destination_address && (s.destination_address.includes('공항') || s.destination_address.toLowerCase().includes('airport')));

      const hasDepartureNotes = Boolean(s.notes && /DEPARTURE|출국|샌딩|센딩/i.test(s.notes));
      const isDeparture = isAirportDest || hasDepartureNotes;

      const isAirportOrigin =
        (s.origin_name && (s.origin_name.includes('공항') || s.origin_name.toLowerCase().includes('airport'))) ||
        (s.origin_address && (s.origin_address.includes('공항') || s.origin_address.toLowerCase().includes('airport')));

      const hasArrivalNotes = Boolean(s.notes && /ARRIVAL|입국|영접/i.test(s.notes));
      const isArrival = isAirportOrigin || hasArrivalNotes;

      // Departure is always "픽업", Arrival with flight is "착륙"
      let timeSuffix = '픽업';
      if (isArrival && s.flight_no) {
        timeSuffix = '착륙';
      } else if (isDeparture) {
        timeSuffix = '픽업';
      } else if (s.flight_no && !isDeparture) {
        timeSuffix = '착륙';
      } else {
        timeSuffix = '픽업';
      }

      const pickupTimeFormatted = s.pickup_time.length === 5 ? `${s.pickup_time}:00` : s.pickup_time;
      const timeDisplay = `${s.pickup_time} ${timeSuffix}`;
      const timeKey = s.pickup_time.slice(0, 5);
      const existingId = existingMap.get(`${s.date}_${timeKey}`);

      const row: any = {
        vehicle_no: targetVehicleNo,
        date: s.date,
        pickup_time: pickupTimeFormatted,
        time_display: timeDisplay,
        flight_type: isDeparture ? 'departure' : 'arrival',
        origin: s.origin_name,
        origin_address: s.origin_address || null,
        origin_lat: s.origin_lat,
        origin_lng: s.origin_lng,
        destination: s.destination_name,
        destination_address: s.destination_address || null,
        destination_lat: s.destination_lat,
        destination_lng: s.destination_lng,
        passenger_name: s.passenger_name || profile?.passengerName || 'VIP 고객님',
        flight_number: s.flight_no || null,
        protocol_notes: s.notes || null,
        status: 'scheduled',
        updated_at: new Date().toISOString(),
      };

      if (existingId) {
        row.id = existingId;
      }

      return row;
    });

    let insertedCount = 0;
    if (upsertRows.length > 0) {
      const { data: upsertData, error: upsertError } = await supabaseAdmin
        .from('schedules')
        .upsert(upsertRows)
        .select();

      if (upsertError) {
        console.warn('Supabase schedule upsert warning:', upsertError);
      } else {
        insertedCount = upsertData?.length || upsertRows.length;
      }
    }

    // 8. Generate Protocol Chauffeur AI Assistant Briefing (Zero Developer Jargon)
    const formatBriefingDate = (dateStr: string): string => {
      try {
        const d = new Date(dateStr + 'T00:00:00+09:00');
        if (isNaN(d.getTime())) return dateStr;
        const m = d.getMonth() + 1;
        const day = d.getDate();
        const days = ['일', '월', '화', '수', '목', '금', '토'];
        return `${m}월 ${day}일(${days[d.getDay()]})`;
      } catch {
        return dateStr;
      }
    };

    const scheduleItemsFormatted = enrichedSchedules
      .slice(0, 6)
      .map((s) => {
        const dateLabel = formatBriefingDate(s.date);
        const flightPart = s.flight_no ? ` (항공편: ${s.flight_no})` : '';
        return `• ${dateLabel} ${s.pickup_time}\n  출발: ${s.origin_name}\n  도착: ${s.destination_name}\n  승객: ${s.passenger_name || profile?.passengerName || 'VIP 승객'}${flightPart}`;
      })
      .join('\n\n');

    const summary = enrichedSchedules.length > 0
      ? `📋 배차 일정 동기화 완료
${driverName} 기사님(${targetVehicleNo} · ${plateNo})의 의전 일정 총 ${enrichedSchedules.length}건이 정리되었습니다.

${scheduleItemsFormatted}`.trim()
      : `기사님, 배차표에서 ${driverName} 기사님(${targetVehicleNo} · ${plateNo})의 배차 일정이 발견되지 않았습니다. 프로필 정보나 배차표 이미지를 다시 한번 확인해 주시기 바랍니다.`;

    return NextResponse.json({
      success: true,
      matchedDriver: parsedResult.matchedDriver || `${driverName} (${targetVehicleNo})`,
      count: insertedCount,
      schedules: enrichedSchedules,
      summary,
    });
  } catch (err: any) {
    console.error('Error in /api/schedule/parse:', err);
    return NextResponse.json(
      {
        success: false,
        error: err?.message || '배차표 이미지 파싱 중 오류가 발생했습니다.',
      },
      { status: 500 }
    );
  }
}
