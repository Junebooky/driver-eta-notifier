import { NaviProvider } from '@/types';

export interface LocationTarget {
  name: string;
  lat: number;
  lng: number;
}

export function formatEtaTime(date: Date): string {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function getEtaString(durationMinutes: number, fromDate: Date = new Date()): string {
  const etaDate = new Date(fromDate.getTime() + durationMinutes * 60 * 1000);
  return formatEtaTime(etaDate);
}

export function calculateHaversineEstimate(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
  waypoints?: Array<{ lat: number; lng: number }>
) {
  const R = 6371; // Earth radius in km
  const calcLeg = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  let straightKm = 0;
  const validWaypoints = (waypoints || []).filter((w) => w && !isNaN(w.lat) && !isNaN(w.lng));

  if (validWaypoints.length > 0) {
    let prevLat = startLat;
    let prevLng = startLng;
    for (const wp of validWaypoints) {
      straightKm += calcLeg(prevLat, prevLng, wp.lat, wp.lng);
      prevLat = wp.lat;
      prevLng = wp.lng;
    }
    straightKm += calcLeg(prevLat, prevLng, endLat, endLng);
  } else {
    straightKm = calcLeg(startLat, startLng, endLat, endLng);
  }

  // Detour factor 1.35x for urban road distance
  const distanceKm = Math.max(1, Math.round(straightKm * 1.35 * 10) / 10);
  const durationMinutes = Math.max(5, Math.round(distanceKm * 1.3));

  const now = new Date();
  const etaFormatted = getEtaString(durationMinutes, now);

  return {
    distanceKm,
    durationMinutes,
    etaFormatted,
    trafficSummary: '직선거리 기반 추정치',
    isMock: false,
    isFallback: true,
  };
}

const STORE_URLS = {
  tmap: {
    ios: 'https://apps.apple.com/kr/app/id431204108',
    android: 'market://details?id=com.skt.tmap.ku',
    web: 'https://play.google.com/store/apps/details?id=com.skt.tmap.ku',
  },
  kakao: {
    ios: 'https://apps.apple.com/kr/app/id304608425',
    android: 'market://details?id=net.daum.android.map',
    web: 'https://play.google.com/store/apps/details?id=net.daum.android.map',
  },
  naver: {
    ios: 'https://apps.apple.com/kr/app/id311867728',
    android: 'market://details?id=com.nhn.android.nmap',
    web: 'https://play.google.com/store/apps/details?id=com.nhn.android.nmap',
  },
};

export function buildDeepLink(
  provider: NaviProvider,
  target: LocationTarget,
  isAndroid: boolean,
  origin?: LocationTarget,
  waypoints?: LocationTarget[]
): { scheme: string; fallbackUrl: string } {
  const { name, lat, lng } = target;
  const encodedName = encodeURIComponent(name);
  const validWaypoints = (waypoints || []).filter((w) => w && !isNaN(w.lat) && !isNaN(w.lng));

  if (provider === 'tmap') {
    // TMAP passList: 'lng,lat_lng,lat'
    const passList = validWaypoints.length > 0
      ? validWaypoints.map((w) => `${w.lng},${w.lat}`).join('_')
      : '';
    const passListParam = passList ? `&passList=${encodeURIComponent(passList)}` : '';

    if (origin) {
      const encodedOriginName = encodeURIComponent(origin.name);
      if (isAndroid) {
        return {
          scheme: `intent://route?startname=${encodedOriginName}&startx=${origin.lng}&starty=${origin.lat}&goalname=${encodedName}&goalx=${lng}&goaly=${lat}${passListParam}#Intent;scheme=tmap;package=com.skt.tmap.ku;end;`,
          fallbackUrl: STORE_URLS.tmap.android,
        };
      }
      return {
        scheme: `tmap://route?startname=${encodedOriginName}&startx=${origin.lng}&starty=${origin.lat}&goalname=${encodedName}&goalx=${lng}&goaly=${lat}${passListParam}`,
        fallbackUrl: STORE_URLS.tmap.ios,
      };
    }

    if (isAndroid) {
      return {
        scheme: `intent://route?goalname=${encodedName}&goalx=${lng}&goaly=${lat}&coordType=WGS84GEO${passListParam}#Intent;scheme=tmap;package=com.skt.tmap.ku;end;`,
        fallbackUrl: STORE_URLS.tmap.android,
      };
    }
    return {
      scheme: `tmap://route?goalname=${encodedName}&goalx=${lng}&goaly=${lat}&coordType=WGS84GEO${passListParam}`,
      fallbackUrl: STORE_URLS.tmap.ios,
    };
  }

  if (provider === 'kakao') {
    // KakaoMap: &vp=lat,lng
    const viaParam = validWaypoints.length > 0
      ? validWaypoints.map((w) => `&vp=${w.lat},${w.lng}`).join('')
      : '';

    if (origin) {
      if (isAndroid) {
        return {
          scheme: `intent://route?sp=${origin.lat},${origin.lng}&ep=${lat},${lng}${viaParam}&by=CAR#Intent;scheme=kakaomap;package=net.daum.android.map;end;`,
          fallbackUrl: STORE_URLS.kakao.android,
        };
      }
      return {
        scheme: `kakaomap://route?sp=${origin.lat},${origin.lng}&ep=${lat},${lng}${viaParam}&by=CAR`,
        fallbackUrl: STORE_URLS.kakao.ios,
      };
    }

    if (isAndroid) {
      return {
        scheme: `intent://route?ep=${lat},${lng}${viaParam}&by=CAR#Intent;scheme=kakaomap;package=net.daum.android.map;end;`,
        fallbackUrl: STORE_URLS.kakao.android,
      };
    }
    return {
      scheme: `kakaomap://route?ep=${lat},${lng}${viaParam}&by=CAR`,
      fallbackUrl: STORE_URLS.kakao.ios,
    };
  }

  // Naver: &v1lat=..&v1lng=..&v2lat=..&v2lng=..
  let naverViaParam = '';
  if (validWaypoints[0]) {
    naverViaParam += `&v1lat=${validWaypoints[0].lat}&v1lng=${validWaypoints[0].lng}&v1name=${encodeURIComponent(validWaypoints[0].name)}`;
  }
  if (validWaypoints[1]) {
    naverViaParam += `&v2lat=${validWaypoints[1].lat}&v2lng=${validWaypoints[1].lng}&v2name=${encodeURIComponent(validWaypoints[1].name)}`;
  }

  if (origin) {
    const encodedOriginName = encodeURIComponent(origin.name);
    if (isAndroid) {
      return {
        scheme: `intent://route/car?slat=${origin.lat}&slng=${origin.lng}&sname=${encodedOriginName}&dlat=${lat}&dlng=${lng}&dname=${encodedName}${naverViaParam}&appname=driver-eta-notifier#Intent;scheme=nmap;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;package=com.nhn.android.nmap;end;`,
        fallbackUrl: STORE_URLS.naver.android,
      };
    }
    return {
      scheme: `nmap://route/car?slat=${origin.lat}&slng=${origin.lng}&sname=${encodedOriginName}&dlat=${lat}&dlng=${lng}&dname=${encodedName}${naverViaParam}&appname=driver-eta-notifier`,
      fallbackUrl: STORE_URLS.naver.ios,
    };
  }

  if (isAndroid) {
    return {
      scheme: `intent://route/car?dlat=${lat}&dlng=${lng}&dname=${encodedName}${naverViaParam}&appname=driver-eta-notifier#Intent;scheme=nmap;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;package=com.nhn.android.nmap;end;`,
      fallbackUrl: STORE_URLS.naver.android,
    };
  }
  return {
    scheme: `nmap://route/car?dlat=${lat}&dlng=${lng}&dname=${encodedName}${naverViaParam}&appname=driver-eta-notifier`,
    fallbackUrl: STORE_URLS.naver.ios,
  };
}

/**
  Safari / Mobile Chrome Deep Link Trigger with Pagehide / Visibilitychange Safeguard
 */
export function launchNavigationApp(
  provider: NaviProvider,
  target: LocationTarget,
  origin?: LocationTarget,
  waypoints?: LocationTarget[]
): void {
  if (typeof window === 'undefined') return;

  const userAgent = navigator.userAgent || '';
  const isAndroid = /Android/i.test(userAgent);
  const { scheme, fallbackUrl } = buildDeepLink(provider, target, isAndroid, origin, waypoints);

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

/**
 * 정식 경로 보기 (Route Preview):
 * 지정된 출발지와 목적지 좌표를 모두 전달하여 내비 앱에서 전체 경로와 교통 흐름을 브리핑받을 수 있도록 호출합니다.
 */
export function launchRoutePreview(
  provider: NaviProvider,
  origin: LocationTarget,
  destination: LocationTarget,
  waypoints?: LocationTarget[]
): void {
  launchNavigationApp(provider, destination, origin, waypoints);
}

/**
 * 홈 네브바 롱프레스 전용: 목적지와 무관하게 각 내비 앱의 초기 메인화면을 실행합니다.
 */
export function openNaviAppMain(navi: 'tmap' | 'kakao' | 'naver') {
  if (typeof window === 'undefined') return;

  const isAndroid = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);
  let schemeUrl = '';

  if (navi === 'tmap') {
    schemeUrl = isAndroid
      ? 'intent:#Intent;package=com.skt.tmap.ku;end;'
      : 'tmap://';
  } else if (navi === 'kakao') {
    // kakaonavi://를 완전히 제거하고 통합 카카오맵 메인 실행으로 통일
    schemeUrl = isAndroid
      ? 'intent:#Intent;package=net.daum.android.map;end;'
      : 'kakaomap://';
  } else if (navi === 'naver') {
    schemeUrl = isAndroid
      ? 'intent:#Intent;package=com.nhn.android.nmap;end;'
      : 'nmap://action/default';
  }

  if (schemeUrl) {
    window.location.href = schemeUrl;
  }
}



