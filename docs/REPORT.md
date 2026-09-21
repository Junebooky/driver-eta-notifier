# Protocol Cockpit (driver-eta-notifier) - 모바일 UI 안정화, 온보딩 및 차량 식별 리파인 완료 보고서

> **평가 일시**: 2026년 9월 21일  
> **대상 애플리케이션**: Protocol Cockpit (의전 드라이버 전용 스마트 관제 런처 v4.8 - 보고서 미리보기 높이 고정, 모바일 dvh 최적화, 첫 방문 온보딩 팝업 및 차량 번호판 유연 매핑)  
> **프로덕션 배포 URL**: [https://driver-eta-notifier.vercel.app](https://driver-eta-notifier.vercel.app)  
> **GitHub Repository**: [https://github.com/Junebooky/driver-eta-notifier.git](https://github.com/Junebooky/driver-eta-notifier.git) (main 브랜치)  

---

## 1. 실무 핵심 과업 달성도

| 과업 항목 | 구현 상태 | 핵심 조치 및 동작 세부 사항 |
| :--- | :---: | :--- |
| **1. 단톡방 보고서 미리보기 높이 고정** | ✅ 완료 | • `ReportTemplateSelector.tsx` 내 보고서 미리보기 컨테이너에 `min-h-[130px]` 및 `text-left items-start`를 적용.<br>• 출발 보고(5행)와 도착 보고(3~4행) 간 탭 전환 시 텍스트 행 수 차이로 발생하던 컨테이너 수축/팽창을 완벽히 차단하여, 하단 액션 버튼([티맵 안내 시작], [카카오톡 공유])의 Y축 위치를 1픽셀도 흔들리지 않게 고정. |
| **2. 모바일 뷰포트 최적화 & 하단 잉여 여백 제거** | ✅ 완료 | • `app/layout.tsx` 및 `app/page.tsx`에 동적 뷰포트(`min-h-dvh`), `justify-between`, `overflow-x-hidden` 구조 적용.<br>• `<main>`에 지정되어 있던 하단 잉여 여백(`pb-24`)을 전면 제거하고 `ActionPanel.tsx`에 iOS 세이프 에어리어(`pb-[max(env(safe-area-inset-bottom),16px)]`)를 반영하여 불필요한 배경 빈 공간 스크롤 제거. |
| **3. 드라이버 첫 방문 시 온보딩 자동 팝업** | ✅ 완료 | • `localStorage`의 `cockpit_driver_onboarded` 플래그를 확인하여 신규 접속 시 `ProfileModal`을 온보딩 모드로 자동 팝업.<br>• 모달 상단에 환영 배너(`👋 환영합니다! 원활한 관제 보고를 위해 차량 식별 정보와 기사 성명을 먼저 등록해 주세요.`) 노출.<br>• [설정 저장] 완료 시 플래그를 저장하여 기본값('4호차 윤태준') 오발송을 원천 차단하고 재방문 시에는 팝업되지 않도록 제어. |
| **4. 드라이버 프로필 필드 실무 리파인 & 헤더 유연화** | ✅ 완료 | • 차량 식별 필드 레이블을 `차량 식별 정보 (호차 / 차량번호)`로 변경하고, `호차를 아직 모를 경우 차량번호만 입력하셔도 무방합니다.` 보조 가이드 및 `예: 142호 7811 또는 4호차 142호 7811` 플레이스홀더 제공.<br>• `formatReportHeader` 유틸을 신설하여 호차+번호판(`[4호차 142호 7811 윤태준]`), 번호판 단독(`[142호 7811 윤태준]`), 호차 단독(`[4호차 윤태준]`) 형태를 모두 완벽히 지원. |
| **5. 빌드 무결성 검증 및 프로덕션 배포** | ✅ 완료 | • `npm run build` TypeScript 컴파일 및 린트 에러 0건 (Turbopack 빌드 성공 in 402ms).<br>• `origin/main` 브랜치에 지정된 커밋 메시지로 푸시 완료 및 Vercel 프로덕션 배포 파이프라인 트리거. |

---

## 2. 세부 엔지니어링 구현 내역

### 1) 보고서 미리보기 높이 고정 (`components/ReportTemplateSelector.tsx`)
- **현상 및 레이아웃 시프트 원인**:
  - 출발 보고 모드(최대 5행)와 도착 보고 모드(3~4행) 전환 시 텍스트 블록의 높이가 가변적으로 수축/팽창하며, 바로 아래 위치한 핵심 액션 버튼([티맵 안내 시작], [카카오톡 공유])이 위아래로 출렁이는 누적 레이아웃 이동(CLS)이 발생함.
- **해결 방안**:
  - 미리보기 텍스트 컨테이너에 `min-h-[130px]` 및 `flex flex-col justify-start items-start text-left w-full` 스타일을 적용.
  - 3~4행의 짧은 텍스트가 표시되더라도 컨테이너 높이가 130px로 고정되어 하단 액션 버튼의 물리적 Y축 위치가 완벽히 안정화됨.

### 2) 모바일 뷰포트 최적화 및 세이프 에어리어 밀착 (`app/layout.tsx`, `app/page.tsx`, `components/ActionPanel.tsx`)
- **하단 잉여 여백 제거**:
  - `app/page.tsx`의 `<main>`에 지정되어 있던 `pb-24`(96px) 패딩을 제거하여 하단 액션 패널 아래로 불필요하게 스크롤되던 빈 배경 영역을 완전히 해소.
- **동적 뷰포트 단위(`dvh`) 도입**:
  - `app/layout.tsx`의 `html`, `body` 및 `app/page.tsx` 최상위 컨테이너에 `min-h-dvh` 및 `overflow-x-hidden`을 적용하여 주소창 수축/확장 시에도 화면에 정확히 밀착.
- **iOS 세이프 에어리어 적용**:
  - `components/ActionPanel.tsx`에 `pb-[max(env(safe-area-inset-bottom),16px)]`를 반영하여 아이폰 홈 인디케이터 바와의 간격을 확보하면서도 불필요한 바닥 여백을 최소화.

### 3) 첫 방문 드라이버 온보딩 모달 자동 팝업 (`app/page.tsx`, `components/ProfileModal.tsx`)
- **자동 팝업 제어**:
  - `app/page.tsx` 마운트 시 `localStorage.getItem('cockpit_driver_onboarded')`를 검사.
  - 최초 방문 드라이버인 경우 `isOnboarding = true` 상태와 함께 `ProfileModal`을 자동으로 열어 초기 등록 유도.
- **환영 및 온보딩 가이드 배너**:
  - `ProfileModal.tsx` 상단에 환영 배너 배치:
    * `👋 환영합니다! 원활한 관제 보고를 위해 차량 식별 정보와 기사 성명을 먼저 등록해 주세요.`
  - [설정 저장] 완료 시 `localStorage.setItem('cockpit_driver_onboarded', 'true')`를 기록하여 추후 재방문 시에는 팝업되지 않도록 영구 보존.

### 4) 실무형 차량 식별 필드 및 유연한 보고서 헤더 생성 (`components/ProfileModal.tsx`, `utils/reportGenerator.ts`, `utils/kakao.ts`)
- **프로필 모달 입력 폼 리파인**:
  - 차량 식별 정보:
    * 레이블: `차량 식별 정보 (호차 / 차량번호)`
    * 보조 가이드: `호차를 아직 모를 경우 차량번호만 입력하셔도 무방합니다.`
    * Placeholder: `예: 142호 7811 또는 4호차 142호 7811`
  - 드라이버 성명:
    * 레이블: `드라이버 성명`
    * Placeholder: `예: 윤태준`
  - 담당 승객명:
    * 레이블: `담당 승객명`
    * Placeholder: `예: SOFYAN 외 1명 (미입력 시 생략)`
- **헤더 생성 유연화 알고리즘 (`formatReportHeader`)**:
  ```typescript
  export function formatReportHeader(vehicleNo?: string, driverName?: string): string {
    const v = vehicleNo?.trim() || '';
    const d = driverName?.trim() || '';

    if (v && d) return `[${v} ${d}]`;
    if (v) return `[${v}]`;
    if (d) return `[${d}]`;
    return '[의전 드라이버]';
  }
  ```
  - **호차 + 차량번호 배정 시**: `[4호차 142호 7811 윤태준]`
  - **차량번호만 등록 시**: `[142호 7811 윤태준]`
  - **호차만 등록 시**: `[4호차 윤태준]`

---

## 3. 정량적 검증 및 빌드 결과

### 1) 헤더 포맷팅 케이스 검증
```text
✓ Case 1 (호차 + 번호판): formatReportHeader('4호차 142호 7811', '윤태준') -> [4호차 142호 7811 윤태준]
✓ Case 2 (번호판 단독): formatReportHeader('142호 7811', '윤태준')         -> [142호 7811 윤태준]
✓ Case 3 (호차 단독): formatReportHeader('4호차', '윤태준')               -> [4호차 윤태준]
```

### 2) 프로덕션 빌드 검증 (`npm run build`)
```text
> driver-eta-notifier@0.1.0 build
> next build

▲ Next.js 16.3.5 (Turbopack)
- Environments: .env.local
✓ Running next.config.ts took 12ms

  Creating an optimized production build ...
✓ Compiled successfully in 402ms
  Finished TypeScript in 837ms    ✓ Finished TypeScript in 837ms 
  Collecting page data using 9 workers in 273ms    ✓ Collecting page data using 9 workers in 273ms 
✓ Generating static pages using 9 workers (8/8) in 223ms
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
  - `components/ReportTemplateSelector.tsx`: 보고서 미리보기 박스 `min-h-[130px]` 고정 및 상단 좌측 정렬
  - `app/layout.tsx`: `html`, `body`에 `min-h-dvh` 및 `overflow-x-hidden` 적용
  - `app/page.tsx`: 모바일 `min-h-dvh` 밀착, `pb-24` 여백 제거, 온보딩 모달 자동 팝업 연동
  - `components/ActionPanel.tsx`: iOS 세이프 에어리어 패딩(`pb-[max(env(safe-area-inset-bottom),16px)]`) 적용
  - `components/ProfileModal.tsx`: 온보딩 환영 배너, 필드 레이블/보조 가이드/플레이스홀더 리파인
  - `utils/reportGenerator.ts`: `formatReportHeader` 유연 생성 로직 신설 및 적용
  - `utils/kakao.ts`: 카카오 VIP 보고서 헤더에 `formatReportHeader` 동기화
  - `docs/REPORT.md`: 과업 완료 보고서 갱신
- **Git Commit**: `feat: stabilize report preview height, improve mobile dvh, and add onboarding with plate guidelines`
- **배포 브랜치**: `origin/main` (푸시 완료)
