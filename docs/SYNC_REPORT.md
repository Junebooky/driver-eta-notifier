# Project Sync Report: Protocol Cockpit (driver-eta-notifier)

> **Date**: 2026-09-20  
> **Repository**: [https://github.com/Junebooky/driver-eta-notifier.git](https://github.com/Junebooky/driver-eta-notifier.git)  
> **Production Live URL**: [https://driver-eta-notifier.vercel.app](https://driver-eta-notifier.vercel.app)  

---

## 1. Executive Summary (작업 요약)

- **핵심 목표**: VIP 의전 드라이버 전용 스마트 관제 런처 (Protocol Cockpit) 모바일 웹 구축, 3대 내비게이션(TMAP, 카카오내비, 네이버지도) 딥링크 통합 및 원터치 단톡방 보고 시스템 완성.
- **주요 해결 과제 및 구현 내역**:
  - **드라이버 프로필 영속화**: LocalStorage 기반 4호차 / 윤태준 기사 / SOYFAN 외 1명 승객 / 주력 내비게이션 설정 및 상단 퀵 스위처 제공.
  - **Safari User Activation 대응**: 버튼 클릭 이벤트 핸들러 최상단에서 동기적으로 `navigator.clipboard.writeText()`를 실행하여 사파리 클립보드 차단 방지.
  - **Safari 딥링크 팝업 안전장치**: `pagehide` 및 `visibilitychange` 이벤트 수신기로 앱 스킴 호출 후 백그라운드 전환 시 스토어 자동 이동 타이머(`clearTimeout`)를 해제.
  - **지하 주차장 GPS Fallback**: GPS 타임아웃/오류 시 최근 거점(조선팰리스 강남 등)으로 출발지를 우회 설정.
  - **TMAP Route API & Mock Backend**: `/api/route` 백엔드 구축 및 `NEXT_PUBLIC_USE_MOCK=true` 모의 경로 ETA 계산 지원.
  - **자동 배포 및 GitHub 연동**: GitHub `Junebooky/driver-eta-notifier` 메인 브랜치 푸시 및 Vercel 개인 Scope(`junebookys-projects`) 프로덕션 라이브 배포 완료.

---

## 2. Project File Tree (전체 디렉토리 구조)

```text
driver-eta-notifier/
├── .env.example
├── .env.local
├── .gitignore
├── AGENTS.md
├── CLAUDE.md
├── README.md
├── eslint.config.mjs
├── next.config.ts
├── package-lock.json
├── package.json
├── postcss.config.mjs
├── tsconfig.json
├── app/
│   ├── api/
│   │   └── route/
│   │       └── route.ts
│   ├── favicon.ico
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── ActionPanel.tsx
│   ├── Header.tsx
│   ├── PresetButtons.tsx
│   ├── ProfileModal.tsx
│   ├── ReportTemplateSelector.tsx
│   ├── RouteInfoCard.tsx
│   └── Toast.tsx
├── docs/
│   └── SYNC_REPORT.md
├── hooks/
│   ├── useDriverProfile.ts
│   └── useLocation.ts
├── public/
│   ├── file.svg
│   ├── globe.svg
│   ├── manifest.json
│   ├── next.svg
│   ├── vercel.svg
│   └── window.svg
├── types/
│   └── index.ts
└── utils/
    ├── kakao.ts
    ├── navigation.ts
    ├── presets.ts
    └── reportGenerator.ts
```

---

## 3. Code Changes & Implementations (수정/생성된 코드 상세)

### 3.1 Next.js Layout & Viewport (`app/layout.tsx`)
```typescript
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import Script from 'next/script';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Protocol Cockpit | VIP 의전 드라이버 스마트 관제 런처',
  description: 'VIP 의전 드라이버를 위한 최소 동선 스마트 관제 런처. TMAP, 카카오내비, 네이버지도 딥링크 및 원터치 단톡방 업무 보고 시스템',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Protocol Cockpit',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#09090b',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className="dark h-full bg-zinc-950 text-zinc-100">
      <body className={`${inter.className} min-h-full flex flex-col bg-zinc-950 antialiased select-none`}>
        {children}
        <Script
          src="https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
```

### 3.2 Deep Link & Safari Safeguard Engine (`utils/navigation.ts`)
```typescript
import { NaviProvider } from '@/types';

export interface LocationTarget {
  name: string;
  lat: number;
  lng: number;
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
      fallbackUrl: `kakaomap://route?ep=${lat},${lng}&by=CAR`,
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

export function launchNavigationApp(provider: NaviProvider, target: LocationTarget): void {
  if (typeof window === 'undefined') return;

  const userAgent = navigator.userAgent || '';
  const isAndroid = /Android/i.test(userAgent);
  const { scheme, fallbackUrl } = buildDeepLink(provider, target, isAndroid);

  let timer: NodeJS.Timeout | null = null;

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

  window.addEventListener('pagehide', handleVisibilityChange);
  window.addEventListener('visibilitychange', handleVisibilityChange);

  timer = setTimeout(() => {
    cleanup();
    if (!document.hidden) {
      window.location.href = fallbackUrl;
    }
  }, 2500);

  window.location.href = scheme;
}
```

### 3.3 Synchronous Report Generator (`utils/reportGenerator.ts`)
```typescript
import { DriverProfile, LocationPreset, ReportMode } from '@/types';

export interface GenerateReportParams {
  profile: DriverProfile;
  origin?: LocationPreset | string;
  destination: LocationPreset | string;
  etaFormatted?: string;
  mode: ReportMode;
}

export function generateReportText({
  profile,
  origin,
  destination,
  etaFormatted = '약 70분 후',
  mode,
}: GenerateReportParams): string {
  const vehicle = profile.vehicleNo || '4호차';
  const passenger = profile.passengerName || 'SOYFAN 외 1명';
  
  const destName = typeof destination === 'string' ? destination : destination.shortName;
  const originName = typeof origin === 'string' ? origin : origin ? origin.shortName : '현 위치';

  switch (mode) {
    case 'DEPARTURE':
      return `[출발/이동] ${vehicle} ${originName} to ${destName} 출발 / ${passenger} 승차 / ETA ${etaFormatted}`;
    case 'ARRIVED':
      return `[도착/하차] ${vehicle} ${destName} 도착 / ${passenger} 하차 완료`;
    case 'WAITING':
      return `[현장 대기] ${vehicle} ${destName} 도착 / 로비 대기 중`;
    case 'RETURN':
      return `[차량 반납] ${vehicle} 차량 반납 완료 특이사항 없음`;
    default:
      return `[업무보고] ${vehicle} ${destName} 이동 중`;
  }
}
```

### 3.4 Action Panel (`components/ActionPanel.tsx`)
```typescript
'use client';

import React from 'react';
import { NaviProvider, LocationPreset } from '@/types';
import { launchNavigationApp } from '@/utils/navigation';
import { shareViaKakaoTalk } from '@/utils/kakao';
import { Zap, Share2, Navigation } from 'lucide-react';

interface ActionPanelProps {
  defaultNavi: NaviProvider;
  destination: LocationPreset;
  reportText: string;
  onShowToast: (message: string) => void;
}

const NAVI_DISPLAY_NAMES: Record<NaviProvider, string> = {
  tmap: '티맵 (TMAP)',
  kakao: '카카오내비',
  naver: '네이버지도',
};

export const ActionPanel: React.FC<ActionPanelProps> = ({
  defaultNavi,
  destination,
  reportText,
  onShowToast,
}) => {
  const handleFastPassAction = () => {
    let copySuccess = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(reportText);
        copySuccess = true;
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = reportText;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        copySuccess = true;
      }
    } catch (err) {
      console.warn('Clipboard write failed:', err);
    }

    if (copySuccess) {
      onShowToast(`📋 보고문구 복사 완료! [${NAVI_DISPLAY_NAMES[defaultNavi]}] 실행 중...`);
    } else {
      onShowToast(`[${NAVI_DISPLAY_NAMES[defaultNavi]}] 앱 실행 중...`);
    }

    launchNavigationApp(defaultNavi, {
      name: destination.name,
      lat: destination.lat,
      lng: destination.lng,
    });
  };

  const handleKakaoShareAction = async () => {
    onShowToast('카카오톡 전송 창을 호출하는 중...');
    const shared = await shareViaKakaoTalk(reportText, 'VIP 의전 업무 보고');
    if (!shared) {
      try {
        await navigator.clipboard.writeText(reportText);
        onShowToast('📋 클립보드 복사 완료! 카카오톡 단톡방에 붙여넣으세요.');
      } catch (e) {
        onShowToast('카카오톡 전송에 실패했습니다.');
      }
    }
  };

  return (
    <div className="w-full space-y-3 pt-1">
      <button
        onClick={handleFastPassAction}
        className="w-full py-4 px-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:to-indigo-600 active:scale-[0.98] text-white rounded-2xl font-black text-base tracking-tight shadow-xl shadow-blue-900/50 flex items-center justify-center space-x-2 border border-blue-400/30 transition-all group"
      >
        <Zap className="w-5 h-5 text-yellow-300 fill-yellow-300 animate-bounce" />
        <span>1초 패스트패스 (보고복사 + {NAVI_DISPLAY_NAMES[defaultNavi]} 직행)</span>
        <Navigation className="w-4 h-4 ml-1 group-hover:translate-x-0.5 transition-transform" />
      </button>

      <button
        onClick={handleKakaoShareAction}
        className="w-full py-3.5 px-4 bg-amber-400 hover:bg-amber-300 active:scale-[0.98] text-amber-950 rounded-2xl font-extrabold text-sm tracking-tight shadow-lg shadow-amber-900/20 flex items-center justify-center space-x-2 border border-amber-300 transition-all"
      >
        <Share2 className="w-4 h-4 text-amber-950" />
        <span>카카오톡 단톡방 보고 공유</span>
      </button>
    </div>
  );
};
```

---

## 4. Environment & Deployment Status (배포 및 환경 상태)

### 4.1 활성화된 환경 변수 키 목록
- `NEXT_PUBLIC_USE_MOCK`: `true` (프로덕션 주입 완료)
- `TMAP_API_KEY`: *(선택 사항 - 부재 시 가상 모의 ETA로 자동 Fallback)*
- `NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY`: *(선택 사항 - 부재 시 Native Web Share / 클립보드 복사로 자동 Fallback)*

### 4.2 Vercel 프로덕션 배포 상태
- **Vercel Scope**: `junebookys-projects` (Team ID: `team_THCnkhOfwf28fZnrKulChGGs`)
- **Vercel Project Name**: `driver-eta-notifier`
- **GitHub Origin**: `https://github.com/Junebooky/driver-eta-notifier.git` (main 브랜치)
- **Production Alias URL**: [https://driver-eta-notifier.vercel.app](https://driver-eta-notifier.vercel.app)
- **Direct Deployment URL**: [https://driver-eta-notifier-6eir3n4lp-junebookys-projects.vercel.app](https://driver-eta-notifier-6eir3n4lp-junebookys-projects.vercel.app)
- **Build Status**: ✅ `SUCCESS` (Next.js 14 App Router, Turbopack, Zero Errors)

---

## 5. Known Issues & Next Steps (잔여 과제 및 제안)

### 5.1 잠재적 검토 항목
- **실제 TMAP API Key 발급 및 주입**: 실시간 교통 상황(정체/원활)을 직접 반영하려면 Vercel 환경 변수에 `TMAP_API_KEY`를 추가 주입할 수 있습니다.
- **Kakao JS SDK 도메인 등록**: 카카오 공유 팝업 창 사용 시 카카오 개발자 콘솔에서 `https://driver-eta-notifier.vercel.app` 도메인을 등록해야 메시지 카드가 정상 노출됩니다.

### 5.2 권장 다음 단계
1. **커스텀 거점 추가 기능**: 자주 이동하는 VIP 거점을 드라이버가 직접 등록/삭제할 수 있는 UI 구현.
2. **다크 모드 고대비 테마 커스텀**: 야간 운전 시 눈부심 방지를 위한 초고대비 OLED 완전 블랙 테마 토글 제공.
3. **PWA 홈 화면 추가 안내 Toast**: 웹 앱 최초 접속 시 사파리/크롬 "홈 화면에 추가" 팝업 가이드 노출.
