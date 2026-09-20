declare global {
  interface Window {
    Kakao?: any;
  }
}

export interface KakaoFeedShareParams {
  destinationName: string;
  originName: string;
  durationMinutes: number;
  etaFormatted: string;
  targetLat?: number;
  targetLng?: number;
  rawText?: string;
}

export function initKakaoSDK(): boolean {
  if (typeof window === 'undefined') return false;

  const kakaoKey = process.env.NEXT_PUBLIC_KAKAO_JS_KEY || process.env.NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY;
  if (!kakaoKey || kakaoKey === 'your_kakao_js_key') {
    return false;
  }

  try {
    if (window.Kakao) {
      if (!window.Kakao.isInitialized()) {
        window.Kakao.init(kakaoKey);
      }
      return window.Kakao.isInitialized();
    }
  } catch (e) {
    console.warn('Kakao SDK hydration safe init failed:', e);
  }

  return false;
}

/**
 * VIP Protocol Feed Template KakaoTalk Share with Multi-tier Fallback Chain
 * 1. Kakao SDK Feed Template (Kakao.Share.sendDefault)
 * 2. Native Web Share API (navigator.share)
 * 3. Clipboard Text Copy (handled by caller if this returns false)
 */
export async function shareViaKakaoTalk(
  params: KakaoFeedShareParams | string
): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  let title = 'VIP 의전 업무 보고';
  let description = '';
  let fullText = '';
  let destinationName = '목적지';
  let originName = '출발지';
  let durationMinutes = 70;
  let etaFormatted = '도착 예정';
  let targetLat = 37.4495;
  let targetLng = 126.4512;

  if (typeof params === 'string') {
    fullText = params;
    description = params;
  } else {
    destinationName = params.destinationName || '목적지';
    originName = params.originName || '출발지';
    durationMinutes = params.durationMinutes || 70;
    etaFormatted = params.etaFormatted || '도착 예정';
    targetLat = params.targetLat ?? 37.4495;
    targetLng = params.targetLng ?? 126.4512;

    title = `[VIP 의전 운행 안내] ${destinationName}`;
    description = `출발지: ${originName}\n예상 소요시간: 약 ${durationMinutes}분\n도착 예정시각: ${etaFormatted} (실시간 교통 반영)`;
    fullText =
      params.rawText ||
      `${title}\n\n${description}\n\n티맵 경로: https://driver-eta-notifier.vercel.app/tmap?name=${encodeURIComponent(
        destinationName
      )}&lat=${targetLat}&lng=${targetLng}\n웹 관제: https://driver-eta-notifier.vercel.app`;
  }

  const cockpitUrl = 'https://driver-eta-notifier.vercel.app';
  const tmapRedirectUrl = `${cockpitUrl}/tmap?name=${encodeURIComponent(
    destinationName
  )}&lat=${targetLat}&lng=${targetLng}`;

  // 1. Primary: Kakao SDK Feed Template
  const isInitialized = initKakaoSDK();
  if (isInitialized && window.Kakao?.Share) {
    try {
      window.Kakao.Share.sendDefault({
        objectType: 'feed',
        content: {
          title: title,
          description: description,
          imageUrl: `${cockpitUrl}/icon.png`,
          link: {
            mobileWebUrl: cockpitUrl,
            webUrl: cockpitUrl,
          },
        },
        buttons: [
          {
            title: '티맵 경로 확인',
            link: {
              mobileWebUrl: tmapRedirectUrl,
              webUrl: tmapRedirectUrl,
            },
          },
          {
            title: '웹 관제 상황실',
            link: {
              mobileWebUrl: cockpitUrl,
              webUrl: cockpitUrl,
            },
          },
        ],
      });
      return true;
    } catch (err) {
      console.warn('Kakao Feed Share failed, falling back to Web Share API:', err);
    }
  }

  // 2. Secondary Fallback: Native Web Share API
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({
        title: title,
        text: fullText,
        url: cockpitUrl,
      });
      return true;
    } catch (e) {
      console.warn('Native Web Share cancelled or failed:', e);
    }
  }

  // 3. Returns false to trigger tertiary fallback (Clipboard copy in UI)
  return false;
}
