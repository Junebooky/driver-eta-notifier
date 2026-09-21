# Protocol Cockpit (driver-eta-notifier) - 스플래시 온보딩, 둥근 파비콘 및 디바이스 격리 완료 보고서

> **평가 일시**: 2026년 9월 21일  
> **대상 애플리케이션**: Protocol Cockpit (의전 드라이버 전용 스마트 관제 런처 v4.9 - 스쿼클 마스크 파비콘, 2단계 마이크로 스플래시 ➔ 바텀시트 온보딩, 실시간 헤더 라이브 배지 및 디바이스 UUID 기반 Supabase 격리)  
> **프로덕션 배포 URL**: [https://driver-eta-notifier.vercel.app](https://driver-eta-notifier.vercel.app)  
> **GitHub Repository**: [https://github.com/Junebooky/driver-eta-notifier.git](https://github.com/Junebooky/driver-eta-notifier.git) (main 브랜치)  

---

## 1. 실무 핵심 과업 달성도

| 과업 항목 | 구현 상태 | 핵심 조치 및 동작 세부 사항 |
| :--- | :---: | :--- |
| **1. 파비콘 모서리 둥글림(Squircle Mask) 에셋 교체** | ✅ 완료 | • 마스터 아이콘(`cockpit_app_icon.png`)을 기반으로 약 22.5% 스쿼클 곡률과 투명 알파 채널을 적용한 `public/favicon-rounded.png`(512x512) 및 멀티사이즈(16~256px) `public/favicon.ico` 신규 생성.<br>• `app/layout.tsx`의 `metadata.icons`에 매핑하여 PC 및 브라우저 탭에서 각진 모서리 없이 유려하게 라운딩된 파비콘이 노출되도록 개선. |
| **2. 신규 사용자 입력 필드 초기화 & 플레이스홀더 분리** | ✅ 완료 | • `useDriverProfile.ts` 및 `ProfileModal.tsx`에서 신규 접속 시 기존 하드코딩 기본값(`4호차`, `윤태준` 등)을 전면 제거하고 완전한 빈 문자열(`''`)로 초기화.<br>• 차량 식별 정보, 드라이버 성명, 담당 승객명, 단톡방 필드에 명확한 `예:` 가이드 플레이스홀더를 제공하여 일일이 지우고 입력하는 피로도 해소.<br>• 첫 방문 시 주력 내비게이션 기본값을 **'티맵(tmap)'**으로 기본 활성화. |
| **3. 마이크로 스플래시 ➔ 바텀시트 2단계 온보딩** | ✅ 완료 | • 신규 드라이버 접속 시 화면 중앙에 80x80px 콕핏 마스터 앱 아이콘과 `Protocol Cockpit` 세미볼드 타이틀, 환영 안내 메시지(`👋 환영합니다!\n원활한 관제 보고를 위해 드라이버 정보를 등록해 주세요.`)가 은은한 펄스/페이드인 애니메이션과 함께 등장.<br>• 1.1초 후 하단에서 부드러운 가속도 곡선으로 올라오는 바텀시트(Bottom Sheet) 모달 형태로 자연스럽게 전이.<br>• 재방문 시에는 스플래시/모달을 전면 생략하고 메인 대시보드가 즉시 렌더링되도록 구현. |
| **4. 실시간 보고서 헤더 라이브 배지(Live Badge) 프리뷰** | ✅ 완료 | • `ProfileModal.tsx` 내부 [설정 저장] 버튼 바로 위에 실시간 조립 칩 컴포넌트 배치.<br>• 아무것도 입력하지 않았을 때는 `[차량 식별 정보와 성명을 입력해 주세요]`(뮤트 텍스트), 타이핑에 따라 `[142호 7811]`, `[142호 7811 윤태준]`, `[4호차 142호 7811 윤태준]`으로 실시간 조립되어 단톡방 머리말 형태를 직관적으로 확인 가능. |
| **5. 디바이스 UUID 기반 개별 Supabase 데이터 격리** | ✅ 완료 | • 브라우저 로컬 스토리지에 무작위 고유 식별자(`cockpit_device_uuid`)를 자동 발급(`crypto.randomUUID()`).<br>• [설정 저장] 시 `cockpit_driver_onboarded = 'true'` 기록 및 `/api/driver`를 통해 해당 UUID를 키로 Supabase 테이블에 격리 upsert.<br>• 재방문 시 백그라운드에서 디바이스 UUID 기반으로 설정을 동기화하여 다중 기사 간 설정 덮어쓰기 문제 원천 차단. |

---

## 2. 세부 엔지니어링 구현 내역

### 1) 파비콘 스쿼클 마스크 에셋 엔지니어링 (`public/favicon.ico`, `app/layout.tsx`)
- **알고리즘 및 생성 절차**:
  - 4배 슈퍼샘플링(2048x2048) 환경에서 22.5% 슈퍼타원(Squircle) 곡률 반경의 안티에일리어싱 알파 마스크를 렌더링한 후, 고품질 LANCZOS 리샘플링으로 다운스케일링.
  - 투명 배경 채널이 보존된 `favicon-rounded.png` 및 16x16, 32x32, 48x48, 64x64, 128x128, 256x256의 6개 규격을 통합한 `favicon.ico`를 생성.
- **메타데이터 매핑**:
  - `app/layout.tsx` 내 `icons.icon` 배열 1순위에 `/favicon-rounded.png`를 지정하고, 레거시 브라우저 대비 `/favicon.ico`를 2순위로 동시 매핑.

### 2) 클린 폼 초기화 및 티맵 기본값 설정 (`hooks/useDriverProfile.ts`, `components/ProfileModal.tsx`)
- **신규 사용자 상태 정제**:
  - `DEFAULT_PROFILE`:
    * `vehicleNo: ''`, `driverName: ''`, `passengerName: ''`, `targetChatRoom: ''`
    * `defaultNavi: 'tmap'` (티맵 기본 활성화)
- **가이드 플레이스홀더 제공**:
  - 차량 식별 정보: `placeholder="예: 142호 7811 또는 4호차 142호 7811"`
  - 드라이버 성명: `placeholder="예: 윤태준"`
  - 담당 승객명: `placeholder="예: SOFYAN 외 1명 (미입력 시 생략)"`
  - 고정 단톡방: `placeholder="예: VIP 의전 단톡방"`
- **헤더 태그 리파인 (`components/Header.tsx`)**:
  - 기사 정보가 비어 있을 경우 `'4호차 • 윤태준'` 대신 `'드라이버 등록'`으로 표시하여 설정 유도.

### 3) 마이크로 스플래시 ➔ 바텀시트 슬라이드업 인터랙션 (`app/page.tsx`, `components/ProfileModal.tsx`)
- **1단계: 마이크로 스플래시 (0 ~ 1.1s)**:
  - `cockpit_driver_onboarded` 미존재 시 `isOnboarding = true`, `onboardingStage = 'splash'`.
  - 정중앙 80x80px 코발트 섀도우 마스터 아이콘, `Protocol Cockpit` (슬레이트 900), 환영 메시지(슬레이트 600) 노출.
- **2단계: 바텀시트 슬라이드업 (1.1s ~)**:
  - `onboardingStage = 'sheet'`, `isProfileModalOpen = true`.
  - 모바일에서는 화면 하단에 밀착하는 바텀시트(`rounded-t-[28px]`, 상단 드래그 인디케이터 바) 형태로 전환되어 자연스럽게 입력 폼으로 유도.
- **재방문 최적화**:
  - `cockpit_driver_onboarded === 'true'`일 경우 스플래시 단계 자체를 완전히 바이패스하여 0ms 만에 콕핏 대시보드 직행.

### 4) 실시간 보고서 헤더 라이브 배지 프리뷰 (`components/ProfileModal.tsx`)
- **실시간 반응형 프리뷰 로직**:
  - 입력 필드 변경 시 즉시 상단 머리말 조합 결과 연산:
    * `vTrim`과 `dTrim`이 모두 비어 있을 때: `[차량 식별 정보와 성명을 입력해 주세요]` (회색 점선 박스, 뮤트 텍스트)
    * 차량 번호만 입력 시: `[142호 7811]` (코발트 블루 라이브 배지)
    * 성명까지 입력 시: `[142호 7811 윤태준]`
    * 호차+번호판+성명 입력 시: `[4호차 142호 7811 윤태준]`
  - 기사님이 설정 저장 전 자신의 단톡방 보고서가 어떻게 생성될지 사전 검증 가능.

### 5) 디바이스 UUID 기반 데이터 격리 및 백엔드 동기화 (`hooks/useDriverProfile.ts`, `app/page.tsx`, `app/api/driver/route.ts`)
- **UUID 자동 발급**:
  - `getOrCreateDeviceUuid()`: `localStorage`의 `cockpit_device_uuid` 확인 후 없으면 `crypto.randomUUID()` 자동 생성 및 영구 보존.
- **개별 프로필 격리 저장**:
  - 프로필 저장 시 백엔드 `/api/driver`에 `id: deviceUuid`를 전달하여 Supabase `cockpit_drivers` 테이블에 독립 레코드로 upsert.
- **백그라운드 동기화**:
  - 재방문 시 `profile.id`(= `deviceUuid`)를 기반으로 최신 데이터를 백그라운드 조회하여 로컬 상태에 무결하게 반영.

---

## 3. 정량적 검증 및 빌드 결과

### 1) 에셋 응답 상태 (HTTP Response Verification)
```text
GET /favicon-rounded.png  -> 200 OK (Content-Type: image/png, 270,618 bytes, 512x512)
GET /favicon.ico          -> 200 OK (Content-Type: image/x-icon, 118,815 bytes, Multi-size 16~256px)
GET /cockpit_app_icon.png -> 200 OK (Content-Type: image/png, 231,301 bytes, 512x512)
GET /manifest.json        -> 200 OK (Content-Type: application/json)
```

### 2) 프로덕션 빌드 검증 (`npm run build`)
```text
> driver-eta-notifier@0.1.0 build
> next build

▲ Next.js 16.3.5 (Turbopack)
- Environments: .env.local
✓ Running next.config.ts took 11ms

  Creating an optimized production build ...
✓ Compiled successfully in 385ms
  Finished TypeScript in 877ms    ✓ Finished TypeScript in 877ms 
  Collecting page data using 9 workers in 303ms    ✓ Collecting page data using 9 workers in 303ms 
✓ Generating static pages using 9 workers (8/8) in 222ms
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

---

## 4. 변경 파일 목록 및 Git 커밋

- **수정 및 생성 파일 목록**:
  - `public/favicon-rounded.png`: 22.5% 스쿼클 곡률 적용 고해상도 파비콘 에셋 (신규 생성)
  - `public/favicon.ico`: 6개 규격 멀티사이즈 스쿼클 파비콘 에셋 (교체)
  - `app/layout.tsx`: `metadata.icons`에 `/favicon-rounded.png` 및 `/favicon.ico` 매핑
  - `hooks/useDriverProfile.ts`: 빈 문자열 기본값, 티맵 기본 설정, `cockpit_device_uuid` 자동 발급 구현
  - `components/ProfileModal.tsx`: 바텀시트 레이아웃, 가이드 플레이스홀더, 실시간 헤더 라이브 배지 프리뷰 적용
  - `components/Header.tsx`: 프로필 미등록 시 동적 안내 태그 반영
  - `app/page.tsx`: 마이크로 스플래시 ➔ 바텀시트 2단계 인터랙션 및 디바이스 UUID 기반 Supabase 격리 동기화
  - `app/api/driver/route.ts`: 디바이스 UUID 기반 upsert 및 target_chat_room 처리 반영
  - `docs/REPORT.md`: 과업 완료 보고서 갱신
- **Git Commit**: `feat: add splash-to-bottomsheet onboarding, rounded favicon, and device-isolated supabase sync`
- **배포 브랜치**: `origin/main` (푸시 완료)
