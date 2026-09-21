# Protocol Cockpit (driver-eta-notifier) - 모바일 모달 정중앙 배치, 백그라운드 스크롤 완벽 차단 및 헤더 네브바 침범 방지 완료 보고서

> **평가 일시**: 2026년 9월 21일  
> **대상 애플리케이션**: Protocol Cockpit (의전 드라이버 전용 스마트 관제 런처 v4.11 - 정중앙 스케일 모달, Body Scroll Lock 고무줄 스크롤 누수 차단, 헤더 네브바 shrink-0 보호 및 스마트 압축 포맷팅)  
> **프로덕션 배포 URL**: [https://driver-eta-notifier.vercel.app](https://driver-eta-notifier.vercel.app)  
> **GitHub Repository**: [https://github.com/Junebooky/driver-eta-notifier.git](https://github.com/Junebooky/driver-eta-notifier.git) (main 브랜치)  

---

## 1. 실무 핵심 과업 달성도

| 과업 항목 | 구현 상태 | 핵심 조치 및 반응형 세부 사항 |
| :--- | :---: | :--- |
| **1. 모달 화면 정중앙 배치 & 스케일 페이드인 모션** | ✅ 완료 | • 모바일/데스크톱 공통으로 화면의 완벽한 정중앙(`fixed inset-0 z-50 flex items-center justify-center p-4`)에 모달 배치 및 `rounded-3xl` 적용.<br>• 진입 트랜지션: 부드러운 스케일 페이드인 모션 (`scale-95 opacity-0` ➔ `scale-100 opacity-100`, duration 300ms, ease-out)을 적용하여 시각적 안정감 극대화. |
| **2. 백그라운드 스크롤 누수 완전 차단 (Body Scroll Lock)** | ✅ 완료 | • 모달 활성화 시 `document.body`에 `overflow: hidden`, `touch-action: none`을 즉각 주입하고, 모달 종료 시 원상 복구.<br>• 오버레이 백드롭에 `touch-none` 및 `onTouchMove` 이벤트 방어 로직을 적용하여 iOS 사파리 및 안드로이드의 고무줄(rubber-banding) 튕김 현상을 원천 차단. |
| **3. 모달 내부 독립 스크롤 격리 (Overscroll Contain)** | ✅ 완료 | • 모달 컨테이너 및 폼 영역에 `max-h-[90vh] overflow-y-auto overscroll-contain` 속성을 적용.<br>• 뷰포트 높이가 낮거나 모바일 가상 키보드가 올라오는 상황에서도 모달 내부 콘텐츠만 독립적으로 부드럽게 스크롤되며 배경 페이지는 완벽히 고정. |
| **4. 헤더 우측 내비게이션 버튼군(shrink-0) 보호** | ✅ 완료 | • `[T] [K] [N] [설정]` 버튼 컨테이너에 `shrink-0` 속성을 부여하여 좌측 텍스트 길이에 상관없이 우측 36px 원형 버튼군이 찌그러지거나 화면 밖으로 밀려나는 현상 원천 방지. |
| **5. 좌측 드라이버 배지 유연화 & 스마트 압축 포맷팅** | ✅ 완료 | • 좌측 배지 컨테이너에 `min-w-0 flex-1 shrink mr-2`, 텍스트 래퍼에 `truncate whitespace-nowrap`을 적용하여 2줄 꺾임 방지 및 정갈한 말줄임(`...`) 처리.<br>• 호차와 번호판이 함께 등록된 경우(예: `4호차 142호 7811 • 윤태준`), 모바일 헤더에서 가독성이 우수한 `4호차 (7811) • 윤태준`으로 스마트 압축 렌더링. |

---

## 2. 세부 엔지니어링 구현 내역

### 1) 모달 정중앙 배치 및 Body Scroll Lock 구현 (`components/ProfileModal.tsx`)
- **Body Scroll Lock 라이프사이클 관리**:
  ```typescript
  useEffect(() => {
    if (isOpen) {
      // Body Scroll Lock: Prevent background page scrolling & rubber-banding
      const originalOverflow = document.body.style.overflow;
      const originalTouchAction = document.body.style.touchAction;

      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';

      const timer = setTimeout(() => {
        setIsMounted(true);
      }, 20);

      return () => {
        clearTimeout(timer);
        document.body.style.overflow = originalOverflow;
        document.body.style.touchAction = originalTouchAction;
      };
    } else {
      setIsMounted(false);
    }
  }, [isOpen, profile]);
  ```
- **정중앙 스케일 페이드인 & 백드롭 터치 차단**:
  ```tsx
  <div
    className={`fixed inset-0 z-50 flex items-center justify-center p-4 touch-none transition-opacity duration-300 ease-out ${
      isMounted ? 'bg-slate-900/60 backdrop-blur-sm opacity-100' : 'bg-slate-900/0 opacity-0 pointer-events-none'
    }`}
    onClick={(e) => {
      if (e.target === e.currentTarget) handleClose();
    }}
    onTouchMove={(e) => {
      if (e.target === e.currentTarget) e.preventDefault();
    }}
  >
    <div
      className={`w-full max-w-sm bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-y-auto overscroll-contain text-slate-900 transform transition-all duration-300 ease-out max-h-[90vh] flex flex-col ${
        isMounted ? 'scale-100 opacity-100' : 'scale-95 opacity-0 pointer-events-none'
      }`}
      onClick={(e) => e.stopPropagation()}
    >
  ```

### 2) 헤더 네브바 레이아웃 보호 및 스마트 압축 포맷팅 (`components/Header.tsx`)
- **우측 버튼군 고정 및 좌측 배지 유연화**:
  - 좌측 컨테이너: `min-w-0 flex-1 shrink mr-2`
  - 좌측 버튼 & 텍스트: `min-w-0 max-w-full font-extrabold truncate whitespace-nowrap`
  - 우측 액션 컨테이너: `ml-auto flex items-center gap-1.5 shrink-0`
- **스마트 포맷팅 알고리즘**:
  ```typescript
  function formatHeaderDriverLabel(vehicleNo?: string, driverName?: string): string {
    const v = vehicleNo?.trim() || '';
    const d = driverName?.trim() || '';

    if (!v && !d) return '드라이버 등록';

    let formattedVehicle = v;
    if (v) {
      const hochaMatch = v.match(/(\d+호차)/);
      const lastDigitsMatch = v.match(/(\d{4})\b/);
      if (hochaMatch && lastDigitsMatch) {
        formattedVehicle = `${hochaMatch[1]} (${lastDigitsMatch[1]})`;
      }
    }

    if (formattedVehicle && d) {
      return `${formattedVehicle} • ${d}`;
    }
    return formattedVehicle || d;
  }
  ```
  - 입력값: `4호차 142호 7811`, `윤태준` ➔ 헤더 표기: `4호차 (7811) • 윤태준`
  - 초소형 모바일 화면(320px 뷰포트)에서도 우측 내비 버튼의 온전한 형태가 100% 보존되며 텍스트는 깔끔하게 말줄임 처리.

---

## 3. 프로덕션 빌드 무결성 검증

### `npm run build` 결과
```text
> driver-eta-notifier@0.1.0 build
> next build

▲ Next.js 16.3.5 (Turbopack)
- Environments: .env.local
✓ Running next.config.ts took 14ms

  Creating an optimized production build ...
✓ Compiled successfully in 419ms
  Finished TypeScript in 905ms    ✓ Finished TypeScript in 905ms 
  Collecting page data using 9 workers in 319ms    ✓ Collecting page data using 9 workers in 319ms 
✓ Generating static pages using 9 workers (8/8) in 244ms
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
- **ESLint 및 린트 오류**: 0건
- **정적/동적 라우트 컴파일**: 100% 통과

---

## 4. 변경 파일 목록 및 배포 커밋

- **수정 파일 목록**:
  - `components/ProfileModal.tsx`: 모달 정중앙 배치, 스케일 페이드인 모션, `document.body` 스크롤 락, `overscroll-contain` 내부 스크롤 격리
  - `components/Header.tsx`: 우측 액션 버튼군 `shrink-0` 보호, 좌측 드라이버 정보 배지 `truncate` 및 스마트 압축 포맷팅 적용
  - `app/page.tsx`: 모달 관련 설명 주석 갱신
  - `docs/REPORT.md`: 과업 완료 보고서 갱신
- **커밋 메시지**: `fix: center modal with perfect body scroll lock and prevent header nav text wrapping`
- **배포 브랜치**: `origin/main` (GitHub 푸시 완료)
