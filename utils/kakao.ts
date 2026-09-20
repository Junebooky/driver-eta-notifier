declare global {
  interface Window {
    Kakao?: any;
  }
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

export async function shareViaKakaoTalk(text: string, title: string = 'Protocol Cockpit 업무 보고'): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  const isInitialized = initKakaoSDK();
  if (isInitialized && window.Kakao?.Share) {
    try {
      window.Kakao.Share.sendDefault({
        objectType: 'text',
        text: text,
        link: {
          mobileWebUrl: window.location.href,
          webUrl: window.location.href,
        },
        buttonTitle: '관제 런처 열기',
      });
      return true;
    } catch (err) {
      console.warn('Kakao Share failed, falling back to Web Share:', err);
    }
  }

  // Fallback to Native Web Share API if available
  if (navigator.share) {
    try {
      await navigator.share({
        title: title,
        text: text,
      });
      return true;
    } catch (e) {
      console.warn('Native share cancelled or failed:', e);
    }
  }

  return false;
}
