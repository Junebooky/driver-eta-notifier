# Protocol Cockpit (driver-eta-notifier) - 1차 프로젝트 종합 평가 보고서

> **평가 일시**: 2026년 9월 20일  
> **대상 애플리케이션**: Protocol Cockpit (의전 드라이버 전용 스마트 관제 런처)  
> **프로덕션 라이브 URL**: [https://driver-eta-notifier.vercel.app](https://driver-eta-notifier.vercel.app)  
> **GitHub Repository**: [https://github.com/Junebooky/driver-eta-notifier.git](https://github.com/Junebooky/driver-eta-notifier.git)  

---

## 1. 프롬프트 요구사항 달성도 평가

| 요구 항목 | 구현 상태 | 동작 세부 사항 |
| :--- | :---: | :--- |
| **드라이버별 내비 앱 선택 및 영속화** | ✅ 완료 | LocalStorage 기반으로 `4호차`, `윤태준`, `SOFYAN 외 1명`, `tmap`을 영속 저장하며 메인 헤더에서 원터치 퀵 변경 지원. |
| **3대 내비 딥링크 통합 연동** | ✅ 완료 | TMAP, 카카오내비, 네이버지도의 iOS Scheme 및 Android Intent Scheme을 완벽히 구축하고 카카오맵 2차 fallback 지원. |
| **Safari 딥링크 팝업 방어 (Safeguard)** | ✅ 완료 | `pagehide` 및 `visibilitychange` 이벤트를 수신하여 사용자가 앱으로 이동 시 스토어 이동 타임아웃(`clearTimeout`)을 자동 해제. |
| **Safari 동기 클립보드 복사 (User Gesture)** | ✅ 완료 | `useMemo` 기반 사전 연산 상태값(`reportPreviewText`)을 1초 패스트패스 클릭 핸들러 최상단에서 동기 복사하여 보안 차단 방지. |
| **VIP 거점 원터치 프리셋** | ✅ 완료 | 인천공항 T1/T2, 조선팰리스 강남, 시그니엘 서울, 인제스피디움, 하남/미사 반납지 터치 전용 대형 그리드 버튼 제공. |
| **지하 주차장 GPS 음영 대비 Fallback** | ✅ 완료 | Geolocation 수신 실패/타임아웃(4초) 시 최근 선택 거점을 출발지로 자동 우회 지정 및 관제 안심 뱃지 표시. |
| **단톡방 현장 보고 템플릿 (4종)** | ✅ 완료 | `[출발/이동]`, `[도착/하차]`, `[현장 대기]`, `[차량 반납]` 4개 모드 변경 및 실시간 미리보기 제공. |
| **경로 탐색 백엔드 API 및 Mock** | ✅ 완료 | Serverless `/api/route` 경로 계산 구축, `NEXT_PUBLIC_USE_MOCK=true` 환경 변수 기준 가상 ETA 반환. |
| **Next.js 14 Viewport 규격 준수** | ✅ 완료 | `export const viewport: Viewport` 분리 선언으로 `viewportFit: 'cover'`, `userScalable: false`, `themeColor: '#09090b'` 적용. |
| **CLI 기반 GitHub & Vercel 배포** | ✅ 완료 | 개인 계정 `Junebooky/driver-eta-notifier` GitHub 푸시 및 `junebookys-projects` Scope Vercel 라이브 배포 완료. |

---

## 2. 잘된 점 (What Went Well)

1. **Safari 보안 제약(User Activation & Deep Link Popup) 완벽 방어**:
   - 모바일 Safari 특유의 비동기 fetch 후 클립보드 접근 거부 문제를 클릭 이벤트 최상단 동기 복사 구조로 사전에 차단했습니다.
   - 앱 스킴 이동 시 사파리 "앱을 여시겠습니까?" 시스템 팝업을 수락하거나 거절하는 동안 스토어로 불필요하게 튕기는 현상을 `pagehide` / `visibilitychange` 상태 감지로 깔끔하게 해제했습니다.
2. **차량 거치대 환경 최적화 UX/UI Design**:
   - 480px 모바일 뷰포트에 맞춘 초고대비 다크 테마(Zinc-950/Blue)를 적용하고 최소 48px 이상의 대형 터치 영역을 확보하여 운전 중 거치대 조작 편의성을 크게 높였습니다.
3. **지하 주차장 GPS 수신 불가 시의 Fallback 처리**:
   - 의전 운행 특성상 지하 주차장 출차 시 GPS 수신이 멈추는 상황을 대비해 최근 거점 주소를 자동 대체하도록 설계하여 시스템 멈춤을 방지했습니다.
4. **무인 DevOps & 파이프라인 완벽화**:
   - 브라우저 조작 없이 CLI 단에서 GitHub 원격 저장소 생성/푸시 및 Vercel 개인 Scope 배포까지 100% 자동화하였습니다.

---

## 3. 미흡하거나 주의할 점 (What Needs Improvement & Edge Cases)

1. **상용 TMAP / Kakao API Key 미발급 상태**:
   - 현재는 `NEXT_PUBLIC_USE_MOCK=true` 상태로 가상 ETA(Haversine 거리 및 70분 기본 소요)가 반환됩니다. 실 정체 반영을 위해 운영 환경 변수에 실시간 `TMAP_API_KEY` 발급/등록이 필요합니다.
2. **카카오톡 JS SDK 도메인 허용 설정 필요**:
   - `Kakao.Share.sendDefault` 사용 시 카카오 개발자 센터의 [내 애플리케이션] > [플랫폼] > [Web]에 `https://driver-eta-notifier.vercel.app` 도메인이 등록되어 있어야 공유 카드가 정상 전송됩니다. 미등록 시 Web Share API 또는 클립보드 복사로 우회 동작합니다.
3. **Android 일부 커스텀 브라우저 Scheme 처리 엣지케이스**:
   - Android 인앱 브라우저(네이버 앱내 브라우저, 카카오톡 인앱 브라우저 등)에서 Intent Scheme 호출 시 브라우저 정책에 따라 외부 앱 전환이 차단될 수 있으므로 기본 Safari/Chrome 사용 권장이 필요합니다.

---

## 4. 현재 인프라 및 배포 상태 (System Status)

- **Vercel Scope**: `junebookys-projects` (Team ID: `team_THCnkhOfwf28fZnrKulChGGs`)
- **Vercel Project Name**: `driver-eta-notifier`
- **GitHub Origin**: [https://github.com/Junebooky/driver-eta-notifier.git](https://github.com/Junebooky/driver-eta-notifier.git) (main 브랜치)
- **Production Alias URL**: [https://driver-eta-notifier.vercel.app](https://driver-eta-notifier.vercel.app)
- **Direct Deployment URL**: [https://driver-eta-notifier-6eir3n4lp-junebookys-projects.vercel.app](https://driver-eta-notifier-6eir3n4lp-junebookys-projects.vercel.app)
- **빌드 상태**: ✅ `SUCCESS` (Next.js 14 App Router, Turbopack, 타입 오류 0건)
- **주요 환경 변수**: `NEXT_PUBLIC_USE_MOCK=true` (Production 주입 완료)

---

## 5. 다음 최우선 조치 제안 (Next Action Items)

1. **[우선순위 1] 운영 환경 변수 등록 및 카카오 도메인 승인**:
   - TMAP OpenAPI 포털에서 API Key 발급 후 Vercel 환경 변수에 등록 (`TMAP_API_KEY`).
   - 카카오 개발자 콘솔 플랫폼에 `https://driver-eta-notifier.vercel.app` 등록.
2. **[우선순위 2] 커스텀 거점 저장 기능**:
   - 드라이버가 6개 기본 프리셋 외에 자주 이용하는 VIP 전용 주소를 직접 등록 및 수정할 수 있는 커스텀 거점 관리 기능 추가.
3. **[우선순위 3] PWA 홈 화면 추가 가이드 (A2HS)**:
   - 스마트폰 바탕화면에 앱 아이콘으로 등록해 사용할 수 있도록 "홈 화면에 추가" 안내 Toast/모달 팝업 추가.
