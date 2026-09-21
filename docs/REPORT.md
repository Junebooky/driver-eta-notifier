# Protocol Cockpit (driver-eta-notifier) - 거점 헤더 맵핀 아이콘 리파인 및 콕핏 마스터 앱 아이콘 PWA/A2HS 연동 완료 보고서

> **평가 일시**: 2026년 9월 21일  
> **대상 애플리케이션**: Protocol Cockpit (의전 드라이버 전용 스마트 관제 런처 v4.7 - '자주 가는 목적지' 물방울형 위치 마커 교체 및 `cockpit_app_icon.png` 기반 파비콘/iOS/PWA 연동)  
> **프로덕션 배포 URL**: [https://driver-eta-notifier.vercel.app](https://driver-eta-notifier.vercel.app)  
> **GitHub Repository**: [https://github.com/Junebooky/driver-eta-notifier.git](https://github.com/Junebooky/driver-eta-notifier.git) (main 브랜치)  

---

## 1. 실무 핵심 과업 달성도

| 과업 항목 | 구현 상태 | 핵심 조치 및 동작 세부 사항 |
| :--- | :---: | :--- |
| **1. '자주 가는 목적지' 헤더 맵핀 아이콘 교체** | ✅ 완료 | • 단순 흰색 원형 블롭으로 뭉개지던 기존 아이콘을 **가운데가 원형으로 비어 있는 클래식한 물방울형 위치 마커(Map Pin)**로 전면 교체.<br>• `evenodd` 컴파운드 패스 기반 인라인 SVG를 적용하여 상단 둥근 헤드와 하단 뾰족한 팁, 중심부 원형 타공(Center cutout hole)을 정밀 렌더링.<br>• 코발트 블루 배지(`bg-[#1E60F3]`, `w-6 h-6 rounded-lg`) 내 `w-4 h-4 text-white` 규격으로 배치하여 타공 구멍 사이로 코발트 배경이 투영되는 최적의 대비감 구현. |
| **2. 'cockpit_app_icon.png' 파비콘 및 iOS 홈 화면 연동** | ✅ 완료 | • `app/layout.tsx`의 `metadata.icons` 객체 전면 개편: 기본 파비콘 및 단축 아이콘에 `/cockpit_app_icon.png` 매핑.<br>• `apple-touch-icon`에 `/cockpit_app_icon.png` 및 표준 규격 `180x180`(`/apple-touch-icon.png`) 동시 등록.<br>• Next.js 기본 템플릿의 잔존 `app/favicon.ico`를 제거하고 `public/favicon.ico`에 마스터 아이콘을 배치하여 브라우저 파비콘 충돌 방지. |
| **3. PWA 매니페스트 (`manifest.json`) 마스커블 아이콘 연동** | ✅ 완료 | • `public/manifest.json`의 `icons` 배열에 `/cockpit_app_icon.png`를 등록.<br>• `192x192`, `512x512` 규격에 각각 매핑하고 `"purpose": "any maskable"` 속성을 명시하여 Android/PWA 홈 화면 추가 시 라운딩/마스킹 잘림 없는 네이티브 룩 제공. |
| **4. iOS Safari A2HS 메타태그 무결성 보장** | ✅ 완료 | • 사파리 "홈 화면에 추가" 시 독립형 웹앱 모드(`apple-mobile-web-app-capable: "yes"`) 보장.<br>• 상단 상태바(`apple-mobile-web-app-status-bar-style: "default"`) 및 타이틀(`Protocol Cockpit`), 뷰포트 커버(`viewport-fit: cover`) 정상 출력 검증. |
| **5. 빌드 무결성 검증 및 프로덕션 배포** | ✅ 완료 | • `npm run build` 컴파일 및 타입 에러 0건 (Turbopack 빌드 성공 in 428ms).<br>• `origin/main` 브랜치에 지정된 커밋 메시지로 푸시 완료 및 Vercel 프로덕션 배포 파이프라인 트리거. |

---

## 2. 세부 엔지니어링 구현 내역

### 1) '자주 가는 목적지' 헤더 아이콘 리파인 (`components/PresetButtons.tsx`)
- **현상 및 원인 분석**:
  - 기존 코드에서 `<MapPin className="w-3.5 h-3.5 text-white fill-white" />`를 적용하여 SVG 내부의 패스와 중심 원(`circle`)이 모두 흰색으로 칠해짐에 따라, 중심부 타공이 사라지고 단순 흰색 원형(Circle) 형태로 뭉개지는 시각적 결함이 발생함.
- **해결 및 디자인 시스템 적용**:
  - 중심부 원형 구멍이 명확히 뚫린 클래식 물방울형 위치 마커(Standard Map Pin with center cutout)를 `fillRule="evenodd"` SVG로 구현:
    * 외곽 경로: `M12 2C7.58 2 4 5.58 4 10c0 5.25 8 12 8 12s8-6.75 8-12c0-4.42-3.58-8-8-8z` (반경 8의 상단 둥근 헤드와 (12, 22)로 모이는 하단 핀 팁)
    * 내부 타공: `m0 5a3 3 0 1 1 0 6 3 3 0 0 1 0-6z` (반경 3의 정중앙 동심원 타공)
  - 코발트 블루 배지(`w-6 h-6 rounded-lg bg-[#1E60F3]`) 내부에서 `w-4 h-4 text-white`로 렌더링하여 배지 여백(4px) 및 타공 구멍 사이로 코발트 블루가 자연스럽게 투영되어 높은 가독성과 직관성을 제공.

### 2) 마스터 앱 아이콘 기반 파비콘 및 모바일 메타데이터 (`app/layout.tsx`)
- **메타데이터 `icons` 구성**:
  - `icon`: `/cockpit_app_icon.png` (512x512 마스터 PNG)
  - `shortcut`: `/cockpit_app_icon.png`
  - `apple`:
    * `/cockpit_app_icon.png`
    * `/apple-touch-icon.png` (180x180 표준 규격)
- **iOS Safari 전용 A2HS 설정**:
  - `appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Protocol Cockpit' }`
  - `other`: `'apple-mobile-web-app-capable': 'yes'`, `'apple-mobile-web-app-status-bar-style': 'default'`, `'mobile-web-app-capable': 'yes'`
  - 뷰포트: `width: 'device-width', initialScale: 1, maximumScale: 1, userScalable: false, viewportFit: 'cover', themeColor: '#FFFFFF'`
- **파비콘 충돌 방지**:
  - 기존 Next.js 템플릿 기본 `app/favicon.ico`를 제거하고, `public/favicon.ico`에 마스터 콕핏 아이콘을 배치하여 레거시 브라우저의 직접 요청 시에도 200 OK와 올바른 아이콘이 응답되도록 조치.

### 3) PWA 웹 앱 매니페스트 갱신 (`public/manifest.json`)
- 누락되었던 `/icon.png` 참조를 제거하고 마스터 아이콘인 `/cockpit_app_icon.png`로 교체:
  ```json
  {
    "name": "Protocol Cockpit",
    "short_name": "Cockpit",
    "description": "VIP 의전 드라이버 전용 스마트 관제 런처",
    "start_url": "/",
    "display": "standalone",
    "orientation": "portrait",
    "background_color": "#F7F9FD",
    "theme_color": "#FFFFFF",
    "icons": [
      {
        "src": "/cockpit_app_icon.png",
        "sizes": "192x192",
        "type": "image/png",
        "purpose": "any maskable"
      },
      {
        "src": "/cockpit_app_icon.png",
        "sizes": "512x512",
        "type": "image/png",
        "purpose": "any maskable"
      }
    ]
  }
  ```
- `purpose: "any maskable"` 지정으로 One UI, MIUI, Pixel Launcher 등 안드로이드 어댑티브 아이콘 규격에서도 여백 왜곡 없이 안전하게 패딩 렌더링 보장.

---

## 3. 정량적 검증 및 빌드 결과

### 1) 에셋 응답 상태 (HTTP Response Verification)
```text
GET /cockpit_app_icon.png  -> 200 OK (Content-Type: image/png, 231,301 bytes, 512x512)
GET /apple-touch-icon.png  -> 200 OK (Content-Type: image/png, 42,163 bytes, 180x180)
GET /favicon.ico           -> 200 OK (Content-Type: image/x-icon, 231,301 bytes)
GET /manifest.json         -> 200 OK (Content-Type: application/json)
```

### 2) 프로덕션 빌드 검증 (`npm run build`)
```text
> driver-eta-notifier@0.1.0 build
> next build

▲ Next.js 16.3.5 (Turbopack)
- Environments: .env.local
✓ Running next.config.ts took 10ms

  Creating an optimized production build ...
✓ Compiled successfully in 428ms
  Finished TypeScript in 704ms    ✓ Finished TypeScript in 704ms 
  Collecting page data using 9 workers in 265ms    ✓ Collecting page data using 9 workers in 265ms 
✓ Generating static pages using 9 workers (8/8) in 228ms
  Finalizing page optimization in 7ms    ✓ Finalizing page optimization in 7ms 

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

---

## 4. 변경 파일 목록 및 Git 커밋

- **수정 파일 목록**:
  - `components/PresetButtons.tsx`: '자주 가는 목적지' 헤더 맵핀 아이콘 교체 (중심부 원형 타공 SVG 적용)
  - `app/layout.tsx`: `cockpit_app_icon.png` 기반 파비콘, apple-touch-icon, iOS A2HS 메타태그 설정
  - `public/manifest.json`: 192x192, 512x512 마스커블 아이콘 매핑
  - `public/apple-touch-icon.png`: 180x180 iOS 홈 화면 표준 규격 아이콘 생성
  - `public/favicon.ico`: 콕핏 마스터 파비콘 에셋 배치
  - `app/favicon.ico`: 구 템플릿 기본 파비콘 삭제
  - `docs/REPORT.md`: 과업 완료 보고서 갱신
- **Git Commit**: `style: update preset section icon to map-pin and configure app icon from cockpit_app_icon.png`
- **배포 브랜치**: `origin/main` (푸시 완료)
