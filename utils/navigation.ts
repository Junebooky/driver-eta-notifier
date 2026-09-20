import { NaviProvider } from '@/types';

export interface LocationTarget {
  name: string;
  lat: number;
  lng: number;
}

export function calculateHaversineEstimate(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number
) {
  const R = 6371; // Earth radius in km
  const dLat = ((endLat - startLat) * Math.PI) / 180;
  const dLng = ((endLng - startLng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((startLat * Math.PI) / 180) *
      Math.cos((endLat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const straightKm = R * c;

  // Detour factor 1.35x for urban road distance
  const distanceKm = Math.max(1, Math.round(straightKm * 1.35 * 10) / 10);
  const durationMinutes = Math.max(5, Math.round(distanceKm * 1.3));

  const now = new Date();
  const etaTime = new Date(now.getTime() + durationMinutes * 60 * 1000);
  const hours = String(etaTime.getHours()).padStart(2, '0');
  const minutes = String(etaTime.getMinutes()).padStart(2, '0');

  return {
    distanceKm,
    durationMinutes,
    etaFormatted: `${hours}:${minutes} (추정 ${durationMinutes}분 소요)`,
    trafficSummary: '직선거리 기반 추정치',
    isMock: false,
    isFallback: true,
    fallbackNotice: '네트워크 지연으로 추정 소요시간 표시 중',
  };
}

const STORE_URLS = {
  tmap: {
    ios: 'https://apps.apple.com/kr/app/id431204108',
    android: 'market://details?id=com.skt.tmap.ku',
    web: 'https://play.google.com/store/apps/details?id=com.skt.tmap.ku',
  },
  kakao: {
    ios: 'https://apps.apple.com/kr/app/id1057796673',
    android: 'market://details?id=com.locnall.KimGiSa',
    web: 'https://play.google.com/store/apps/details?id=com.locnall.KimGiSa',
  },
  naver: {
    ios: 'https://apps.apple.com/kr/app/id311867728',
    android: 'market://details?id=com.nhn.android.nmap',
    web: 'https://play.google.com/store/apps/details?id=com.nhn.android.nmap',
  },
};

export function buildDeepLink(provider: NaviProvider, target: LocationTarget, isAndroid: boolean): { scheme: string; fallbackUrl: string } {
  const { name, lat, lng } = target;
  const encodedName = encodeURIComponent(name);

  if (provider === 'tmap') {
    if (isAndroid) {
      return {
        scheme: `intent://route?goalname=${encodedName}&goalx=${lng}&goaly=${lat}&coordType=WGS84GEO#Intent;scheme=tmap;package=com.skt.tmap.ku;end;`,
        fallbackUrl: STORE_URLS.tmap.android,
      };
    }
    return {
      scheme: `tmap://route?goalname=${encodedName}&goalx=${lng}&goaly=${lat}&coordType=WGS84GEO`,
      fallbackUrl: STORE_URLS.tmap.ios,
    };
  }

  if (provider === 'kakao') {
    if (isAndroid) {
      return {
        scheme: `intent://navigate?name=${encodedName}&x=${lng}&y=${lat}&coord_type=wgs84#Intent;scheme=kakaonavi;package=com.locnall.KimGiSa;end;`,
        fallbackUrl: STORE_URLS.kakao.android,
      };
    }
    return {
      scheme: `kakaonavi://navigate?name=${encodedName}&x=${lng}&y=${lat}&coord_type=wgs84`,
      fallbackUrl: `kakaomap://route?ep=${lat},${lng}&by=CAR`, // Secondary scheme fallback before App Store
    };
  }

  // Naver
  if (isAndroid) {
    return {
      scheme: `intent://navigation?dlat=${lat}&dlng=${lng}&dname=${encodedName}&appname=protocol-launcher#Intent;scheme=nmap;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;package=com.nhn.android.nmap;end;`,
      fallbackUrl: STORE_URLS.naver.android,
    };
  }
  return {
    scheme: `nmap://navigation?dlat=${lat}&dlng=${lng}&dname=${encodedName}&appname=protocol-launcher`,
    fallbackUrl: STORE_URLS.naver.ios,
  };
}

/**
  Safari / Mobile Chrome Deep Link Trigger with Pagehide / Visibilitychange Safeguard
 */
export function launchNavigationApp(provider: NaviProvider, target: LocationTarget): void {
  if (typeof window === 'undefined') return;

  const userAgent = navigator.userAgent || '';
  const isAndroid = /Android/i.test(userAgent);
  const { scheme, fallbackUrl } = buildDeepLink(provider, target, isAndroid);

  let timer: NodeJS.Timeout | null = null;

  // Cleanup function to clear store redirect timer if user leaves browser (app opened) or page loses focus
  const cleanup = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    window.removeEventListener('pagehide', handleVisibilityChange);
    window.removeEventListener('visibilitychange', handleVisibilityChange);
  };

  const handleVisibilityChange = () => {
    if (document.hidden || document.visibilityState === 'hidden') {
      cleanup();
    }
  };

  // Register safeguard event listeners
  window.addEventListener('pagehide', handleVisibilityChange);
  window.addEventListener('visibilitychange', handleVisibilityChange);

  // Set timeout to fallback store if app does not open within 2.5 seconds
  timer = setTimeout(() => {
    cleanup();
    // Only redirect if document is still visible
    if (!document.hidden) {
      window.location.href = fallbackUrl;
    }
  }, 2500);

  // Launch scheme
  window.location.href = scheme;
}
