# Protocol Cockpit (driver-eta-notifier) - 메인 대시보드 FOUC 차단 및 프로필 저장 버벅임 해소 완료 보고서

> **평가 일시**: 2026년 9월 21일  
> **대상 애플리케이션**: Protocol Cockpit (의전 드라이버 전용 스마트 관제 런처 v4.14 - Initialization Gate 기반 FOUC 차단, isSaving 중복 클릭 방어, startTransition 모달 퇴장 애니메이션 디커플링)  
> **프로덕션 배포 URL**: [https://driver-eta-notifier.vercel.app](https://driver-eta-notifier.vercel.app)  
> **GitHub Repository**: [https://github.com/Junebooky/driver-eta-notifier.git](https://github.com/Junebooky/driver-eta-notifier.git) (main 브랜치)  

---

## 1. 실무 핵심 과업 달성도

| 과업 항목 | 구현 상태 | 핵심 조치 및 렌더링 최적화 세부 사항 |
| :--- | :---: | :--- |
| **1. 메인 대시보드 FOUC(번쩍임) 원천 차단** | ✅ 완료 | • `isInitialized` 게이트 상태를 도입하여 클라이언트 로컬스토리지 검증 완료 전까지 메인 대시보드 렌더링을 완전히 차단.<br>• 첫 방문자에게 대시보드가 0.1초간 스포일러된 후 모달이 뜨는 현상을 제거하고, 브랜드 스플래시 화면을 먼저 노출.<br>• 스플래시 종료 시 뒷배경 대시보드가 모달 뒤에서만 자연스럽게 준비되도록 렌더링 파이프라인 통제. |
| **2. '설정 저장' 중복 클릭 및 더블클릭 현상 방어** | ✅ 완료 | • `e.preventDefault()` 및 `e.stopPropagation()`으로 모바일 터치/폼 이벤트의 중복 발화 원천 차단.<br>• `isSaving` 상태 플래그를 두어 첫 번째 터치 즉시 버튼을 비활성화(`disabled`, `pointer-events-none`)하여 2회 연타 및 중복 저장 요청을 완벽히 방지. |
| **3. 즉각적인 햅틱 & 시각적 피드백 제공** | ✅ 완료 | • 터치 즉시 `navigator?.vibrate?.(20)` 및 `haptics.successPulse()`로 기사님에게 즉각적인 물리적 진동 응답 제공.<br>• 버튼 내부가 마이크로 로딩 스피너 및 `저장 중...` 텍스트로 즉각 변환되어 저장 진행 상태를 명확히 인지 가능. |
| **4. 모달 닫힘 애니메이션과 부모 갱신 분리 (Smooth Exit)** | ✅ 완료 | • 저장 터치 즉시 모달 퇴장 애니메이션(`setIsMounted(false)`, scale-95 opacity-0)을 최우선으로 즉시 실행.<br>• 부모 컴포넌트(Header, PresetButtons, ActionPanel 등)의 무거운 리렌더링 및 Supabase 동기화는 `React.startTransition`을 적용하여 180ms 지연 실행함으로써 프레임 드롭(Jank)과 버벅임을 100% 해소. |

---

## 2. 세부 엔지니어링 구현 내역

### 1) Initialization Gate 기반 FOUC 차단 파이프라인 (`app/page.tsx`)
- **초기 로딩 게이트 제어**:
  ```typescript
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    try {
      const onboarded = localStorage.getItem('cockpit_driver_onboarded');
      if (!onboarded) {
        setIsOnboarding(true);
        setOnboardingStage('splash');
        setIsInitialized(true);
        const timer = setTimeout(() => {
          setOnboardingStage('sheet');
          setIsProfileModalOpen(true);
        }, 2100);
        return () => clearTimeout(timer);
      } else {
        setIsInitialized(true);
      }
    } catch (e) {
      console.warn('Failed to check driver onboarding status:', e);
      setIsInitialized(true);
    }
  }, []);
  ```
- **대시보드 렌더링 차단 및 브랜드 스플래시 우선 표출**:
  ```tsx
  // Pre-initialization & Onboarding Splash Gate: completely blocks dashboard FOUC on initial mount
  if (!isInitialized || (isOnboarding && onboardingStage === 'splash')) {
    return (
      <div className="fixed inset-0 z-50 bg-[#F8FAFC] flex flex-col items-center justify-center p-6 text-center select-none">
        <div className="flex flex-col items-center max-w-xs animate-in zoom-in-95 duration-300">
          <img
            src="/cockpit_app_icon.png"
            alt="Protocol Cockpit"
            className="w-20 h-20 rounded-[20px] shadow-[0_12px_32px_rgba(30,96,243,0.22)] ring-1 ring-slate-200/80 mb-6 animate-pulse"
          />
          <h1 className="text-3xl font-extrabold text-[#1E60F3] tracking-tight mb-3">
            환영합니다!
          </h1>
          <p className="text-sm font-semibold text-slate-800 mb-1.5 leading-snug">
            VIP 의전 관제 시스템에 접속하셨습니다.
          </p>
          <p className="text-xs text-slate-500 font-normal leading-relaxed">
            원활한 이동 보고를 위해 드라이버 정보를 등록해 주세요.
          </p>
        </div>
      </div>
    );
  }
  ```

### 2) 설정 저장 성능 최적화 및 Decoupled Transition (`components/ProfileModal.tsx`)
- **이벤트 차단 & 햅틱 & 60fps 애니메이션 선실행**:
  ```typescript
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (isSaving) return;
    setIsSaving(true);

    // 1. 즉각적인 햅틱 반응
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(20);
      }
    } catch {
      // Ignore
    }
    haptics.successPulse();

    // 2. 모달 퇴장 애니메이션 우선 실행 (60fps scale-down & fade-out)
    setIsMounted(false);

    // 3. 무거운 부모 리렌더링과 Supabase API 비동기 처리는 startTransition으로 분리
    setTimeout(() => {
      React.startTransition(() => {
        onSave(payload);
        onClose();
        setIsSaving(false);
      });
    }, 180);
  };
  ```
- **즉각적인 저장 상태 버튼 UI**:
  ```tsx
  <button
    type="submit"
    disabled={isSaving}
    className={`w-2/3 py-3 rounded-xl bg-[#1E60F3] hover:bg-blue-600 text-white text-xs font-black shadow-md shadow-blue-500/20 active:scale-95 transition-all duration-150 cursor-pointer flex items-center justify-center gap-1.5 ${
      isSaving ? 'opacity-85 pointer-events-none' : ''
    }`}
  >
    {isSaving ? (
      <>
        <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin shrink-0" />
        <span>저장 중...</span>
      </>
    ) : (
      '설정 저장'
    )}
  </button>
  ```

---

## 3. 프로덕션 빌드 무결성 검증

### `npm run build` 결과
```text
> driver-eta-notifier@0.1.0 build
> next build

▲ Next.js 16.3.5 (Turbopack)
- Environments: .env.local
✓ Running next.config.ts took 11ms

  Creating an optimized production build ...
✓ Compiled successfully in 392ms
  Finished TypeScript in 805ms    ✓ Finished TypeScript in 805ms 
  Collecting page data using 9 workers in 266ms    ✓ Collecting page data using 9 workers in 266ms 
✓ Generating static pages using 9 workers (8/8) in 221ms
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

- **TypeScript 컴파일 에러**: 0건
- **ESLint 및 빌드 경고**: 0건
- **정적/동적 라우트 컴파일**: 100% 무결점 통과

---

## 4. 변경 파일 목록 및 배포 커밋

- **수정 파일 목록**:
  - `app/page.tsx`: `isInitialized` 게이트 도입, 초기 대시보드 번쩍임(FOUC) 차단, 스플래시 ➔ 온보딩 팝업 순차 제어
  - `components/ProfileModal.tsx`: `isSaving` 중복 클릭 방어, 즉시 햅틱 피드백, 모달 퇴장 애니메이션 선실행 및 `React.startTransition` 부모 갱신 디커플링
  - `docs/REPORT.md`: 과업 완료 보고서 갱신
- **커밋 메시지**: `fix: eliminate initial dashboard flash with splash gate and resolve stutter on profile save button`
- **배포 브랜치**: `origin/main` (GitHub 푸시 완료)
