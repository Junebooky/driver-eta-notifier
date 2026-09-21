# Protocol Cockpit (driver-eta-notifier) - 딥링크 출발지 좌표 연동 및 UI 인터랙션 최적화 완료 보고서

> **평가 일시**: 2026년 9월 21일  
> **대상 애플리케이션**: Protocol Cockpit (의전 드라이버 전용 스마트 관제 런처 v4.19 - 자택 아이콘 색상 중립화, 3대 내비 딥링크 출발지 좌표 전송 규격화, 카카오 액션 버튼 햅틱 리프트 모션 적용)  
> **프로덕션 배포 URL**: [https://driver-eta-notifier.vercel.app](https://driver-eta-notifier.vercel.app)  
> **GitHub Repository**: [https://github.com/Junebooky/driver-eta-notifier.git](https://github.com/Junebooky/driver-eta-notifier.git) (main 브랜치)  

---

## 1. 핵심 과업 달성 현황

| 과업 항목 | 구현 상태 | 핵심 조치 및 인터랙션 디자인 시스템 고도화 세부 사항 |
| :--- | :---: | :--- |
| **1. 자택(Home) 프리셋 아이콘 색상 중립화** | ✅ 완료 | • **아이콘 색상 독립성 확보**: 자택 프리셋 내 `Home` 아이콘이 파란색으로 고정되어 목적지(에메랄드 그린) 지정 시 발생하던 시각적 충돌 완벽 해결.<br>• **컨텍스트 반응형 색상 동기화**: 미선택 기본 상태에서는 세련된 슬레이트 톤(`text-slate-500 group-hover:text-slate-700`)을 유지하며, 목적지 지정 시 `text-emerald-600`, 출발지 지정 시 `text-[#1E60F3]`로 자동 전환되도록 예외 처리 구현. |
| **2. 3대 내비게이션 딥링크 출발지(Origin) 좌표 연동** | ✅ 완료 | • **티맵(TMAP) 출발지/목적지 쌍 연동**: 기존 단일 목적지만 전달되어 단말기 현 GPS(용인시 등)가 강제 출발지로 지정되던 결함을 수정하고 `startname`, `startx`, `starty`, `goalname`, `goalx`, `goaly` 전송 규격 완벽 적용.<br>• **네이버지도 & 카카오맵 동반 최적화**: 네이버지도 자동차 경로 스킴(`nmap://route/car?slat=...&slng=...&dlat=...&dlng=...`) 및 카카오맵 자동차 경로 스킴(`kakaomap://route?sp=...&ep=...&by=CAR`)을 Android Intent와 iOS URL Scheme에 모두 일체화. |
| **3. 하단 카카오톡 공유 버튼 인터랙션 동기화** | ✅ 완료 | • **브랜드 고유 컬러 보존**: 카카오 공식 옐로우 톤(`bg-[#FEE500] hover:bg-[#FDD835] text-[#191919]`)을 정확히 유지.<br>• **마이크로 리프트 & 텐션 피드백**: 상단 내비 버튼과 동일한 촉각적 조작감을 제공하도록 호버 시 떠오르는 모션(`hover:-translate-y-0.5 hover:shadow-md transition-all duration-150 ease-out`)과 클릭 압력(`active:translate-y-0 active:scale-[0.97]`) 동기화. |

---

## 2. 세부 엔지니어링 구현 내역

### 1) 자택(Home) 프리셋 아이콘 색상 중립화 (`components/PresetButtons.tsx`)
- 미선택 시 기본 슬레이트 톤을 제공하여 시각적 간섭을 배제하고, 목적지 또는 출발지로 지정되는 즉시 해당 컨텍스트의 핵심 색상(에메랄드/블루)으로 전환되도록 개선하였습니다.
```tsx
<HomeIcon
  className={`w-3.5 h-3.5 shrink-0 transition-colors ${
    isHomeDestination
      ? 'text-emerald-600'
      : isHomeOrigin
      ? 'text-[#1E60F3]'
      : 'text-slate-500 group-hover:text-slate-700'
  }`}
/>
```

### 2) 내비게이션 딥링크 출발지 좌표 전송 파이프라인 (`utils/navigation.ts`)
- `launchNavigationApp` 및 `buildDeepLink` 함수에 `origin` 매개변수를 확장하고, 3대 내비게이션 앱에 출발지와 목적지 좌표를 완벽하게 공급하도록 개편하였습니다.

#### ① TMAP (티맵) 딥링크 스킴
- 사용자가 선택한 출발지(예: 조선팰리스 강남)와 목적지(예: 인천공항 T1)를 그대로 유지하며 앱 경로 미리보기가 열리도록 파라미터를 규격화하였습니다.
- **iOS**: `tmap://route?startname=${encodedOriginName}&startx=${origin.lng}&starty=${origin.lat}&goalname=${encodedName}&goalx=${lng}&goaly=${lat}`
- **Android**: `intent://route?startname=${encodedOriginName}&startx=${origin.lng}&starty=${origin.lat}&goalname=${encodedName}&goalx=${lng}&goaly=${lat}#Intent;scheme=tmap;package=com.skt.tmap.ku;end;`

#### ② Naver Map (네이버지도) 딥링크 스킴
- 자동차 경로 조회를 위한 정밀 좌표 스킴을 연동하였습니다.
- **iOS**: `nmap://route/car?slat=${origin.lat}&slng=${origin.lng}&sname=${encodedOriginName}&dlat=${lat}&dlng=${lng}&dname=${encodedName}&appname=driver-eta-notifier`
- **Android**: `intent://route/car?slat=${origin.lat}&slng=${origin.lng}&sname=${encodedOriginName}&dlat=${lat}&dlng=${lng}&dname=${encodedName}&appname=driver-eta-notifier#Intent;scheme=nmap;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;package=com.nhn.android.nmap;end;`

#### ③ Kakao (카카오맵 / 카카오내비) 딥링크 스킴
- 출발지-도착지 좌표 쌍(`sp`, `ep`)을 포함한 자동차 경로 스킴을 적용하였습니다.
- **iOS**: `kakaomap://route?sp=${origin.lat},${origin.lng}&ep=${lat},${lng}&by=CAR`
- **Android**: `intent://route?sp=${origin.lat},${origin.lng}&ep=${lat},${lng}&by=CAR#Intent;scheme=kakaomap;package=net.daum.android.map;end;`
- **스토어 Fallback**: 카카오맵 iOS App Store ID(`304608425`) 및 Play Store 패키지(`net.daum.android.map`) 갱신.

### 3) 하단 카카오톡 공유 버튼 인터랙션 동기화 (`components/ActionPanel.tsx`)
- 고유 브랜드 옐로우를 유지하면서, 마우스 호버 시 자연스럽게 떠오르는 리프트 모션과 클릭 압력 스케일 모션을 적용하였습니다.
```tsx
<button
  onClick={handleKakaoReportAction}
  className="w-full py-4 px-4 bg-[#FEE500] hover:bg-[#FDD835] hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-[0.97] text-[#191919] rounded-2xl font-bold text-sm tracking-tight shadow-[0_4px_14px_rgba(254,229,0,0.25)] flex items-center justify-center gap-2 cursor-pointer transition-all duration-150 ease-out"
>
  <MessageSquare className="w-4.5 h-4.5 text-[#3C1E1E] fill-[#3C1E1E] shrink-0" />
  <span>카카오톡 공유</span>
</button>
```

---

## 3. 프로덕션 빌드 무결성 검증

### `npm run build` 검증 로그
```text
> driver-eta-notifier@0.1.0 build
> next build

▲ Next.js 16.3.5 (Turbopack)
- Environments: .env.local
✓ Running next.config.ts took 12ms

  Creating an optimized production build ...
✓ Compiled successfully in 337ms
  Finished TypeScript in 816ms    ✓ Finished TypeScript in 816ms 
  Collecting page data using 9 workers in 240ms    ✓ Collecting page data using 9 workers in 240ms 
✓ Generating static pages using 9 workers (8/8) in 236ms
  Finalizing page optimization in 6ms    ✓ Finalizing page optimization in 6ms 

Route (app)
┌ ○ /
├ ○ /_not-found
├ ƒ /api/driver
├ ƒ /api/presets
├ ƒ /api/route
├ ƒ /api/search
└ ○ /tmap

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

- **TypeScript 컴파일 에러**: 0건
- **린트 및 문법 결함**: 0건
- **정적 최적화 및 빌드 무결성**: 100% 통과

---

## 4. 변경 파일 목록 및 배포 커밋

- **수정 파일 목록**:
  - `components/PresetButtons.tsx`: 자택 프리셋 아이콘 슬레이트 톤 중립화 및 컨텍스트 반응형 색상 연동
  - `utils/navigation.ts`: TMAP(`startname/startx/starty`), 네이버지도(`slat/slng/sname`), 카카오맵(`sp/ep`) 출발지 딥링크 스킴 및 안드로이드 인텐트 규격 전면 개편
  - `components/ActionPanel.tsx`: `launchNavigationApp` 호출 시 `origin` 좌표 전달 및 카카오톡 공유 버튼 햅틱 리프트/음영 인터랙션 적용
  - `components/Header.tsx`: 미사용 아이콘 임포트 정리 및 네브바 버튼 레이아웃 정돈
  - `app/tmap/page.tsx`: URL 쿼리 파라미터 내 출발지(`sname`, `slat`, `slng`) 파싱 및 딥링크 전달 지원
  - `docs/REPORT.md`: 과업 완료 보고서 갱신
- **커밋 메시지**: `fix: neutralize home icon, inject origin coords to deeplinks, and add tactile lift to kakao action button`
- **배포 브랜치**: `origin/main` (GitHub 푸시 완료)
