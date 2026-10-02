import { NaviProvider } from '@/types';

export interface LocationTarget {
  name: string;
  lat: number;
  lng: number;
  address?: string;
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
    // KakaoMap: &vp=lat,lng (up to 5 waypoints)
    const viaParam = validWaypoints.slice(0, 5).length > 0
      ? validWaypoints.slice(0, 5).map((w) => `&vp=${w.lat},${w.lng}`).join('')
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

  // Naver: &v1lat=..&v1lng=..&v1name=.. up to &v5lat=..
  let naverViaParam = '';
  validWaypoints.slice(0, 5).forEach((wp, idx) => {
    const i = idx + 1;
    naverViaParam += `&v${i}lat=${wp.lat}&v${i}lng=${wp.lng}&v${i}name=${encodeURIComponent(wp.name)}`;
  });

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
 * 카카오 SDK 런타임 비동기 대기(Polling) 가드 헬퍼
 * 스크립트 마운트 지연 및 레이스 컨디션을 방지하기 위해 최대 1.5초간 window.Kakao 및 Navi 모듈의 준비를 추적
 */
export const ensureKakaoSdkReady = (timeoutMs: number = 1500, intervalMs: number = 50): Promise<boolean> => {
  if (typeof window === 'undefined') return Promise.resolve(false);

  const kakaoKey = process.env.NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY;
  const startTime = Date.now();

  return new Promise((resolve) => {
    const check = () => {
      const kakao = (window as any).Kakao;

      // SDK 객체 및 Navi 모듈이 준비된 경우
      if (kakao) {
        if (typeof kakao.isInitialized === 'function' && !kakao.isInitialized() && kakaoKey) {
          try {
            kakao.init(kakaoKey);
          } catch (e) {
            console.warn('[KakaoNavi] kakao.init failed:', e);
          }
        }
        if (typeof kakao.isInitialized === 'function' && kakao.isInitialized() && kakao.Navi) {
          resolve(true);
          return;
        }
      }

      // 제한 시간 초과 시 false 반환
      if (Date.now() - startTime >= timeoutMs) {
        console.warn('[KakaoNavi] SDK 초기화 대기 시간(1.5초) 초과');
        resolve(false);
        return;
      }

      setTimeout(check, intervalMs);
    };

    check();
  });
};

/**
  Safari / Mobile Chrome Deep Link Trigger with Pagehide / Visibilitychange Safeguard
 */
export async function launchNavigationApp(
  provider: NaviProvider,
  target: LocationTarget,
  origin?: LocationTarget,
  waypoints?: LocationTarget[]
): Promise<void> {
  if (typeof window === 'undefined') return;

  // 1. Kakao SDK Navi start with viaPoints and Polling Guard
  if (provider === 'kakao') {
    const isReady = await ensureKakaoSdkReady(1500);
    const kakao = typeof window !== 'undefined' ? (window as any).Kakao : null;

    if (isReady && kakao?.Navi?.start) {
      try {
        const validWaypoints = (waypoints || []).filter((w) => w && !isNaN(w.lat) && !isNaN(w.lng));
        kakao.Navi.start({
          name: target.name,
          x: target.lng,
          y: target.lat,
          coordType: 'wgs84',
          viaPoints: validWaypoints.slice(0, 3).map((wp) => ({
            name: wp.name,
            x: wp.lng,
            y: wp.lat,
          })),
        });
        return;
      } catch (e) {
        console.warn('Kakao.Navi.start failed, falling back', e);
      }
    }

    // 1.5초 대기 후에도 SDK가 구동되지 않을 때만 다중 경유지 네이버 지도로 안전 폴백
    const validWaypoints = (waypoints || []).filter((w) => w && !isNaN(w.lat) && !isNaN(w.lng));
    if (validWaypoints && validWaypoints.length > 0) {
      console.warn('[KakaoNavi] SDK 준비 불가로 네이버 지도로 전환 실행');
      const userAgent = navigator.userAgent || '';
      const isAndroid = /Android/i.test(userAgent);
      const { scheme } = buildDeepLink('naver', target, isAndroid, origin, waypoints);
      window.location.href = scheme;
      return;
    }
  }

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
export async function launchRoutePreview(
  provider: NaviProvider,
  origin: LocationTarget,
  destination: LocationTarget,
  waypoints?: LocationTarget[]
): Promise<void> {
  await launchNavigationApp(provider, destination, origin, waypoints);
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



