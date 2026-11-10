import { queryServerSchedules } from '@/lib/dispatch/scheduleServerStore';
import { getKstTodayDateStr, getKstTomorrowDateStr } from '@/utils/dispatchConflictDetector';
import { verifyServerAuth } from '@/lib/auth/serverAuth';
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { ScheduleItem } from '@/data/ferrariSchedules';
import { DEFAULT_PRESET_LOCATIONS } from '@/utils/presets';

interface CopilotRequestBody {
  query: string;
  image?: string;
  mode?: 'image_analysis' | 'text_chat';
  model?: string;
  profile?: {
    vehicleNo?: string;
    driverName?: string;
    passengerName?: string;
  };
  schedules?: ScheduleItem[];
}

const GUARDRAIL_REJECTION_MESSAGE =
  '기사님, 저는 VIP 의전 관제 전담 코파일럿입니다. 일상 대화보다는 **배차 일정 브리핑, 실시간 항공편 조회, 의전 동선 안내**를 정확하게 도와드리고 있습니다. 확인이 필요하신 일정을 말씀해 주시겠습니까?';

// Out-of-domain keyword filter for rapid deterministic guardrail
const NON_DOMAIN_KEYWORDS = [
  '맛집',
  '음식',
  '밥',
  '식당',
  '메뉴',
  '날씨',
  '비와',
  '눈와',
  '기온',
  '강아지',
  '고양이',
  '유머',
  '농담',
  '재미',
  '심심',
  '주식',
  '코인',
  '영화',
  '노래',
  '게임',
  '로또',
  '정치',
  '연예',
  '심심해',
  '놀아줘',
  '사랑해',
  '결혼',
  '나이',
];

// Helper to format schedule briefing in standard 3-4 line format
function formatScheduleBriefing(item: ScheduleItem): string {
  const dateFormatted = item.dateLabel.replace('2026-', '');
  return `[${dateFormatted} 운행 브리핑]
• 픽업시각: ${item.time_display}
• 운행동선: ${item.origin_name} ➔ ${item.destination_name}
• 담당승객: ${item.passenger}
• 의전메모: ${item.notes || '특이사항 없음'}${item.flight ? ` (항공편: ${item.flight})` : ''}`;
}

// Fallback intelligence engine when GEMINI_API_KEY is not set or API error occurs
function processDeterministicFallback(
  query: string,
  profile: { vehicleNo?: string; driverName?: string; passengerName?: string },
  schedules: ScheduleItem[]
): { reply: string; type: string } {
  const normalized = query.trim().toLowerCase();

  // 1. Guardrail Check: Out-of-domain questions
  const isOutOfDomain = NON_DOMAIN_KEYWORDS.some((kw) => normalized.includes(kw));
  const hasDomainKeyword =
    normalized.includes('일정') ||
    normalized.includes('스케줄') ||
    normalized.includes('브리핑') ||
    normalized.includes('출발') ||
    normalized.includes('도착') ||
    normalized.includes('배차') ||
    normalized.includes('항공') ||
    normalized.includes('비행') ||
    normalized.includes('sq') ||
    normalized.includes('공항') ||
    normalized.includes('호텔') ||
    normalized.includes('인제') ||
    normalized.includes('조선') ||
    normalized.includes('몇시') ||
    normalized.includes('시간') ||
    normalized.includes('승객') ||
    normalized.includes('호차') ||
    normalized.includes('9.') ||
    normalized.includes('9/') ||
    normalized.includes('9월') ||
    normalized.includes('내일') ||
    normalized.includes('오늘');

  if (isOutOfDomain && !hasDomainKeyword) {
    return {
      reply: GUARDRAIL_REJECTION_MESSAGE,
      type: 'guardrail',
    };
  }

  if (/항공|비행|[a-z]{2}\s*\d{2,4}/i.test(normalized)) {
    return { reply: '항공편 메뉴에서 최신 운항 정보를 확인해 주세요. 현재 코파일럿은 실시간 항공편 조회에 연결되어 있지 않습니다.', type: 'flight' };
  }
  const target = normalized.includes('내일') ? getKstTomorrowDateStr() : getKstTodayDateStr();
  const matching = schedules.filter(s => s.date === target);
  return { reply: matching.length ? matching.map(formatScheduleBriefing).join('\n\n') : '해당 날짜에 확인된 배차가 없습니다. 스케줄 메뉴에서 확인해 주세요.', type: 'schedule' };
}

export async function POST(req: NextRequest) {
  const apiAuth = await verifyServerAuth(req);
  if (!apiAuth.ok) return NextResponse.json({ ok: false, error: apiAuth.error }, { status: apiAuth.statusCode });
  try {
    const body: CopilotRequestBody = await req.json();
    const { query, image, mode, model, profile = {}, schedules = [] } = body;

    if (!query || typeof query !== 'string' || !query.trim()) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    const driverVehicle = profile.vehicleNo || '4호차';
    const driverName = profile.driverName || '윤태준';
    const passengerName = profile.passengerName || 'DENZEL SOFYAN';

    const session = apiAuth.session!;
    const verified = await queryServerSchedules({ role: session.role === 'hq_admin' ? 'hq' : 'driver', driverId: session.driverId, statusParam: 'published' });
    if (verified.error) return NextResponse.json({ error: '배차 정보를 조회할 수 없습니다.' }, { status: 503 });
    const activeSchedules = verified.schedules;

    // Fast-path guardrail check before invoking external API
    const normalized = query.trim().toLowerCase();
    const isOutOfDomain = NON_DOMAIN_KEYWORDS.some((kw) => normalized.includes(kw));
    const hasDomainKeyword =
      normalized.includes('일정') ||
      normalized.includes('스케줄') ||
      normalized.includes('브리핑') ||
      normalized.includes('출발') ||
      normalized.includes('도착') ||
      normalized.includes('배차') ||
      normalized.includes('항공') ||
      normalized.includes('비행') ||
      normalized.includes('sq') ||
      normalized.includes('공항') ||
      normalized.includes('호텔') ||
      normalized.includes('인제') ||
      normalized.includes('조선') ||
      normalized.includes('몇시') ||
      normalized.includes('시간') ||
      normalized.includes('승객') ||
      normalized.includes('호차') ||
      normalized.includes('9.') ||
      normalized.includes('9/') ||
      normalized.includes('9월') ||
      normalized.includes('등록') ||
      normalized.includes('추가') ||
      normalized.includes('작성') ||
      normalized.includes('내일') ||
      normalized.includes('오늘') ||
      Boolean(image);

    if (isOutOfDomain && !hasDomainKeyword) {
      return NextResponse.json({
        reply: GUARDRAIL_REJECTION_MESSAGE,
        type: 'guardrail',
      });
    }

    // Dynamic Model Selection:
    // - Image Upload / Multimodal Analysis -> gemini-3.8-flash (High-tier visual reasoning)
    // - General Text Chat -> gemini-3.5-flash-lite (Ultra-fast, cost-efficient)
    const isImageMode = mode === 'image_analysis' || Boolean(image);
    const selectedModel = model || (isImageMode ? 'gemini-3.8-flash' : 'gemini-3.5-flash-lite');

    // Check for GEMINI_API_KEY
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.log(`[Gemini Live API: Fallback Triggered] No GEMINI_API_KEY detected. Executing deterministic protocol engine (model: ${selectedModel}).`);
      // Execute intelligent deterministic engine
      const result = processDeterministicFallback(query, { vehicleNo: driverVehicle, driverName, passengerName }, activeSchedules);
      return NextResponse.json({ ...result, model: selectedModel });
    }

    // Prepare System Prompt with Context Injection
    const scheduleSummary = activeSchedules
      .map(
        (s) =>
          `[${s.dateLabel}] 픽업: ${s.time_display} | 동선: ${s.origin_name} (${s.origin_address}) ➔ ${s.destination_name} (${s.destination_address}) | 승객: ${s.passenger}${s.flight ? ` | 항공편: ${s.flight}` : ''}${s.notes ? ` | 메모: ${s.notes}` : ''}`
      )
      .join('\n');

    const presetSummary = DEFAULT_PRESET_LOCATIONS
      .map((p) => `- ${p.shortName}: ${p.address}`)
      .join('\n');

    const systemPrompt = `너는 VIP 의전 드라이버를 전담 보좌하는 AI 관제 코파일럿(Protocol Copilot)이다.

[담당 기사 프로필]
• 배차 호차: ${driverVehicle}
• 기사 성함: ${driverName}
• 전담 승객: ${passengerName}

[확정 배차표 (CONFIRMED SCHEDULES)]
${scheduleSummary}

[등록 거점 프리셋 (COCKPIT PRESETS)]
${presetSummary}

[도메인 가드레일 (CRITICAL OUT-OF-DOMAIN GUARDRAIL)]
• 맛집, 날씨, 일상 대화, 유머, 일반 잡담 등 의전 운행/배차/항공과 무관한 질문(예: "여기 음식 맛있어?", "우리집 강아지 이름 맞춰봐", "오늘 날씨 어때?")이 인입될 경우, 일체의 환각(Hallucination) 없이 반드시 아래 표준 템플릿으로만 정중히 거절하고 지원 가능한 업무를 안내하라:
"${GUARDRAIL_REJECTION_MESSAGE}"

[응답 포맷 가이드라인]
1. 스케줄 브리핑 요청("9.18일 일정 브리핑해줘", "내일 몇 시 출발이야?" 등):
운전 중 한눈에 신속하게 스캔할 수 있도록 아래 3~4줄 단축 브리핑 포맷을 반드시 엄수하라:
[9월 18일 (금) 운행 브리핑]
• 픽업시각: 09:00 픽업
• 운행동선: 조선팰리스 강남 ➔ 인제 스피디움 호텔
• 담당승객: DENZEL SOFYAN 외 1명
• 의전메모: CLUB CHALLENGE 서킷 행사 이동 (인제 호텔 체크인)

2. 항공편 조회 질의("SQ612 상태 어때?", "9/17 항공편 알려줘" 등):
항공편명, 예정 착륙/출발 시각, 정시 여부, 터미널 위치(T1/T2), 영접/샌딩 동선을 명확하고 간결하게 4줄 이내로 브리핑하라.

3. 배차표 이미지 분석 요청 시:
이미지 속 일자, 시간(착륙/픽업), 동선(출발지/도착지), 담당 승객, 항공편명을 정밀 판독하여 단정하게 불릿 포인트로 요약 보고하라.

4. 답변 어조:
신속하고 정중하며 신뢰감 있는 VIP 모빌리티 관제 전문 톤(하십시오체, 단정한 불릿 포인트). 군더더기 서론이나 잡담 금지.`;

    // Construct multimodal contents if image provided
    let contents: any = query;
    if (image) {
      let mimeType = 'image/jpeg';
      let base64Data = image;
      const match = image.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
      if (match) {
        mimeType = match[1];
        base64Data = match[2];
      }
      contents = [
        {
          inlineData: {
            mimeType,
            data: base64Data,
          },
        },
        query,
      ];
    }

    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: selectedModel,
        contents,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.1,
        },
      });

      const reply = response.text?.trim() || '';
      if (!reply) {
        throw new Error('Empty response from Gemini model');
      }

      console.log(`[Gemini Live API: Success] [${selectedModel}] Response generated for query: "${query.slice(0, 35)}" (mode: ${isImageMode ? 'image_analysis' : 'text_chat'})`);

      return NextResponse.json({
        reply,
        type: 'gemini',
        model: selectedModel,
      });
    } catch (geminiError) {
      console.warn(`[Gemini Live API: Fallback Triggered] Google GenAI [${selectedModel}] call failed. Activating deterministic fallback:`, geminiError);
      const fallbackResult = processDeterministicFallback(
        query,
        { vehicleNo: driverVehicle, driverName, passengerName },
        activeSchedules
      );
      return NextResponse.json({ ...fallbackResult, model: selectedModel });
    }
  } catch (err: any) {
    console.error('Copilot API Route Error:', err);
    return NextResponse.json(
      {
        reply: GUARDRAIL_REJECTION_MESSAGE,
        type: 'error_fallback',
      },
      { status: 200 }
    );
  }
}
