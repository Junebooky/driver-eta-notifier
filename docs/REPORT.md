# Protocol Cockpit (driver-eta-notifier) - ETA 카드 미니멀 정돈, 모바일 스크롤 락 및 레퍼런스 1:1 UI 개편 완료 보고서

> **평가 일시**: 2026년 9월 21일  
> **대상 애플리케이션**: Protocol Cockpit (의전 드라이버 전용 스마트 관제 런처 v4.21 - ETA 카드 미니멀 정돈, 시계/스케줄 버튼 대체, 출발 시간 휠 피커 바디 스크롤 누수 차단, 4열 네이티브 휠 피커 & AI 정체 타임라인 바텀시트 레퍼런스 1:1 완벽 일치)  
> **프로덕션 배포 URL**: [https://driver-eta-notifier.vercel.app](https://driver-eta-notifier.vercel.app)  
> **GitHub Repository**: [https://github.com/Junebooky/driver-eta-notifier.git](https://github.com/Junebooky/driver-eta-notifier.git) (main 브랜치)  

---

## 1. 핵심 과업 달성 현황

| 과업 항목 | 구현 상태 | 핵심 조치 및 인터랙션 디자인 시스템 고도화 세부 사항 |
| :--- | :---: | :--- |
| **1. ETA 카드 UI 미니멀 정돈 (`RouteInfoCard.tsx`)** | ✅ 완료 | • **[정식 경로 보기] 버튼 완전 삭제**: 이전 버전에서 잠시 추가되었던 `[정식 경로 보기]` 버튼을 완전히 제거하여 간결하고 직관적인 헤더 구조 회복.<br>• **[지금 출발 ▾] 캡슐 버튼 제거 & 시계 아이콘 대체**: 메인 톤앤매너와 다소 어색했던 텍스트 버튼을 제거하고, 우측 새로고침 버튼 좌측에 모던한 **시계/스케줄 아이콘 버튼 (`CalendarClock`, `w-11 h-11`, `bg-slate-100/80 rounded-xl text-slate-700`)**을 배치.<br>• **미래 출발 활성화 인디케이터**: 미래 시각 설정 시 코발트 블루 톤(`bg-blue-50 border-blue-300 text-[#1E60F3]`)으로 전환되며 **블루 펄스 닷(`w-2 h-2 rounded-full bg-[#1E60F3] animate-pulse`)**이 점등되어 설정 상태를 한눈에 식별 가능. |
| **2. '출발 시간' 휠 피커 모달 고도화 및 스크롤 락 (`DepartureTimePickerModal.tsx`)** | ✅ 완료 | • **바디 스크롤 누수 완전 차단 (Body Scroll Lock)**: 모달 마운트 시 `document.body.style.overflow = 'hidden'`, `touchAction = 'none'`을 강제 적용하여 모바일 드래그/휠 조작 시 뒷배경이 울렁거리거나 스크롤되는 현상을 원천 방지.<br>• **시원한 폰트 & 비주얼 하이라이트**: 텍스트를 대폭 확대(`text-lg sm:text-xl font-bold text-slate-900`)하고, 중앙 `h-12 bg-slate-100/90 rounded-2xl` 하이라이트 바 및 상·하단 그라디언트 페이드 마스킹(`bg-gradient-to-b/t`)을 적용하여 1:1 레퍼런스 입체감 구현.<br>• **4열 휠 컬럼 & 관성 스냅 인터랙션**: `[오늘, 내일, 9월 22일 화...]`, `[오전/오후]`, `[1~12시]`, `[00~50분 10분 단위]`의 4열 구조와 `scroll-snap-type: y mandatory`, `overscroll-behavior: contain`을 통해 쫀득한 휠 조작감 보장.<br>• **비비드 블루 확인 버튼**: 하단에 꽉 차는 선명한 비비드 블루(`bg-[#1E60F3] hover:bg-[#1850D0] text-white py-4 rounded-2xl font-bold text-base shadow-sm`) 버튼을 터치하면 즉시 모달이 닫히며 AI 예측 바텀시트로 전환. |
| **3. 'AI 소요 시간 예측 & 정체 타임라인' 레퍼런스 일체화 (`PredictionResultSheet.tsx`)** | ✅ 완료 | • **날짜·요일 상세 브리핑 서브 헤더**: 그라디언트 원형 **AI 뱃지** + `"9월 25일 금요일 오후 3시 30분 출발하면 ⓘ"` 형태로 요일과 출발 시각을 정밀 브리핑.<br>• **대형 소요 시간 타이포그래피**: `1시간 33분 걸려요` (또는 `40분 걸려요`)의 3xl 엑스트라 볼드 폰트(`text-[#1E60F3]` 포인트) 및 바로 아래 중앙에 콤팩트한 필(Pill) 스타일의 **`[시간변경]`** 버튼(`px-4 py-1.5 rounded-full border border-slate-300 text-xs font-bold`) 배치 (터치 시 출발 시간 모달 재오픈).<br>• **정체 타임라인 막대그래프**: 블루 슬라이더 트랙과 원형 핸들 노브(`w-4 h-4 bg-white border-4 border-[#1E60F3] rounded-full shadow-sm`), 산뜻한 에메랄드 그린 단축 막대(`bg-emerald-500`, `-7분`, `-12분`), 주황/레드 정체 막대(`+3분`, `+6분`), `1시간 후`/`2시간 후` 간격 레이블 및 각 막대 터치 시 즉각적인 시간 동기화 구현. |
| **4. 빌드 무결성 및 프로덕션 배포** | ✅ 완료 | • `npm run build` 실행 결과 TypeScript 컴파일 에러 0건 통과.<br>• `origin/main` 브랜치에 안전하게 커밋 및 푸시 완료. |

---

## 2. 세부 엔지니어링 구현 내역

### 1) ETA 카드 UI 미니멀 정돈 (`components/RouteInfoCard.tsx`)

#### ① [정식 경로 보기] 버튼 및 [지금 출발 ▾] 캡슐 버튼 제거
- 이전의 버튼 요소를 정리하고, 정보 계층의 시각적 안정감을 확보하였습니다.
- 헤더 우측에 단정하고 모던한 시계/스케줄 아이콘 버튼을 새로고침 버튼과 조화롭게 배치하였습니다.

```tsx
{/* Right Actions: Clock/Schedule Icon Button + Refresh Button */}
<div className="flex items-center gap-2 shrink-0">
  {onOpenTimePicker && (
    <button
      type="button"
      onClick={() => {
        haptics.lightTap();
        onOpenTimePicker();
      }}
      className={`relative w-11 h-11 rounded-xl border flex items-center justify-center transition-all duration-150 active:scale-95 cursor-pointer shadow-xs ${
        hasFuture
          ? 'bg-blue-50 border-blue-300 text-[#1E60F3] hover:bg-blue-100 shadow-[0_2px_8px_rgba(30,96,243,0.15)]'
          : 'bg-slate-100/80 border-slate-200/80 text-slate-700 hover:bg-slate-200'
      }`}
      title={hasFuture ? `미래 출발 설정됨: ${departureTimeText || ''}` : '출발 시간 선택 (AI 미래 소요시간 예측)'}
      aria-label="출발 시간 선택"
    >
      <CalendarClock className={`w-5 h-5 ${hasFuture ? 'text-[#1E60F3]' : 'text-slate-600'}`} />
      {hasFuture && (
        <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#1E60F3] ring-2 ring-white animate-pulse" />
      )}
    </button>
  )}

  {/* Refresh Button */}
  <button
    type="button"
    onClick={() => {
      haptics.lightTap();
      onRefreshRoute();
    }}
    className="w-11 h-11 rounded-xl bg-slate-100/80 hover:bg-slate-200 active:scale-95 border border-slate-200/80 flex items-center justify-center text-slate-700 transition-all cursor-pointer shadow-xs"
    title="경로 및 소요 시간 새로고침"
  >
    <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin text-[#1E60F3]' : ''}`} />
  </button>
</div>
```

---

### 2) '출발 시간' 휠 피커 모달 고도화 및 스크롤 락 (`components/DepartureTimePickerModal.tsx`)

#### ① 바디 스크롤 누수 완전 차단 (Body Scroll Lock)
- 모달이 활성화되는 동안 배경 스크롤 및 터치 제스처 침범을 완벽히 차단하고, 언마운트 시 안전하게 원복합니다.

```tsx
useEffect(() => {
  if (!isOpen) return;

  const originalOverflow = document.body.style.overflow;
  const originalTouchAction = document.body.style.touchAction;

  document.body.style.overflow = 'hidden';
  document.body.style.touchAction = 'none';

  return () => {
    document.body.style.overflow = originalOverflow;
    document.body.style.touchAction = originalTouchAction;
  };
}, [isOpen]);
```

#### ② 4열 휠 피커 컬럼 및 요일 명시
- 현재 날짜부터 순차적으로 계산하여 `오늘`, `내일`, `9월 22일 화`, `9월 23일 수` 등 요일을 명확하게 표기하는 동적 리스트를 구축하였습니다.
- `scroll-snap-type: y mandatory`, `overscroll-behavior: contain` 및 `h-12` 하이라이트 행, 상/하단 그라디언트 페이드 마스킹을 적용하였습니다.

```tsx
{/* Center Selection Highlight Bar */}
<div className="absolute top-1/2 left-2 right-2 -translate-y-1/2 h-12 bg-slate-100/90 rounded-2xl pointer-events-none z-0 border border-slate-200/50" />

{/* Top Gradient Fade Mask */}
<div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-white via-white/80 to-transparent pointer-events-none z-20" />

{/* Bottom Gradient Fade Mask */}
<div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-white via-white/80 to-transparent pointer-events-none z-20" />
```

#### ③ 하단 풀위드 비비드 블루 [확인] 액션
- 터치 시 모달을 닫고 AI 예측 바텀시트로 즉시 전환됩니다.

```tsx
<button
  type="button"
  onClick={handleConfirm}
  className="w-full py-4 px-4 bg-[#1E60F3] hover:bg-[#1850D0] active:scale-[0.98] text-white rounded-2xl font-bold text-base shadow-sm flex items-center justify-center cursor-pointer transition-all duration-150 ease-out"
>
  확인
</button>
```

---

### 3) 'AI 소요 시간 예측 및 정체 타임라인' 바텀시트 레퍼런스 일체화 (`components/PredictionResultSheet.tsx`)

#### ① 상단 서브 헤더 브리핑 & 대형 타이포그래피
- 화려한 원형 AI 스파클 뱃지와 함께 `"9월 25일 금요일 오후 3시 30분 출발하면 ⓘ"` 형식으로 상세 날짜와 요일, 시각을 브리핑합니다.
- `1시간 33분 걸려요` (또는 `40분 걸려요`) 3xl 대형 타이포그래피(`text-[#1E60F3]`)와 컴팩트한 필 스타일 `[시간변경]` 버튼을 배치하였습니다.

```tsx
{/* 1. Header: AI Badge + Detailed Briefing */}
<div className="flex items-center space-x-2">
  <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-blue-600 via-indigo-500 to-violet-500 flex items-center justify-center text-white shadow-xs">
    <Sparkles className="w-2.5 h-2.5 text-white animate-pulse" />
  </div>
  <div className="flex items-center space-x-1">
    <span className="text-xs font-bold text-slate-800 tracking-tight">
      {headerBriefing} 출발하면
    </span>
    <button
      type="button"
      onClick={() => {
        haptics.lightTap();
        alert('과거 동일 요일/시간대의 TMAP 교통 빅데이터 및 AI 통계 모델을 기반으로 예측된 소요 시간입니다.');
      }}
      className="text-slate-400 hover:text-slate-600 p-0.5"
      title="예측 정보 안내"
    >
      <Info className="w-3.5 h-3.5" />
    </button>
  </div>
</div>

{/* 2. Large Bold Typography & Compact Pill [시간변경] Button */}
<div className="py-2.5 text-center flex flex-col items-center justify-center">
  <h3 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight flex items-baseline justify-center">
    <span className="text-[#1E60F3] font-black">{timePart}</span>
    <span className="ml-1.5 font-bold">{unitPart}</span>
  </h3>

  <button
    type="button"
    onClick={() => {
      haptics.lightTap();
      onOpenTimePicker();
    }}
    className="mt-3 px-4 py-1.5 rounded-full border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 active:scale-95 transition-all flex items-center gap-1 cursor-pointer shadow-2xs"
    title="출발 시각 다시 선택"
  >
    <span>시간변경</span>
  </button>
</div>
```

#### ② 시간대별 정체 타임라인 막대그래프
- 블루 슬라이더 바와 정교한 원형 핸들 노브(`w-4 h-4 bg-white border-4 border-[#1E60F3] rounded-full shadow-sm`).
- 단축 구간: 에메랄드 그린 컬러 막대(`bg-emerald-500`)와 `-7분`, `-12분`, `-17분`, `-20분` 텍스트 표기.
- 정체 구간: 주황/레드 컬러 막대와 `+3분`, `+6분` 표기.
- 좌측 세로 간격에 `1시간 후`, `2시간 후` 그레이 텍스트 레이블 정렬.
- 막대 터치 시 해당 시각으로 출발 시간이 즉시 갱신.

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
✓ Compiled successfully in 500ms
  Finished TypeScript in 876ms    ✓ Finished TypeScript in 876ms 
  Collecting page data using 10 workers in 303ms    ✓ Collecting page data using 10 workers in 303ms 
✓ Generating static pages using 10 workers (9/9) in 225ms
  Finalizing page optimization in 7ms    ✓ Finalizing page optimization in 7ms 

Route (app)
┌ ○ /
├ ○ /_not-found
├ ƒ /api/driver
├ ƒ /api/presets
├ ƒ /api/route
├ ƒ /api/route/prediction
├ ƒ /api/search
└ ○ /tmap

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

- **TypeScript 컴파일 에러**: 0건
- **정적 최적화 및 빌드 무결성**: 100% 통과

---

## 4. 변경 파일 목록 및 배포 커밋

- **수정 파일**:
  - `components/RouteInfoCard.tsx`: `[정식 경로 보기]` 버튼 완전 삭제, `[지금 출발 ▾]` 캡슐 버튼 제거 및 `CalendarClock` 아이콘 버튼 대체, 미래 시간 설정 시 코발트 블루 인디케이터 닷 및 블루 포인트 표시
  - `components/DepartureTimePickerModal.tsx`: 모달 오픈 시 바디 스크롤 락(`overflow = 'hidden'`, `touchAction = 'none'`), 4열 휠 피커 요일 명시(`9월 22일 화` 등), `h-12` 하이라이트 행 및 상·하단 그라디언트 페이드 마스킹, 시원한 폰트(`text-lg sm:text-xl font-bold`), 풀위드 비비드 블루 [확인] 버튼
  - `components/PredictionResultSheet.tsx`: 바디 스크롤 락 적용, 요일·상세 시각 브리핑 서브 헤더, 대형 소요 시간 타이포그래피(`1시간 33분 걸려요` / `40분 걸려요`, `text-[#1E60F3]`), 컴팩트 필 `[시간변경]` 버튼, 슬라이더 바 & 원형 핸들 노브, 에메랄드 그린 단축 막대(`bg-emerald-500`), 주황/레드 정체 막대, `1시간 후`/`2시간 후` 간격 레이블
  - `app/page.tsx`: 미사용 핸들러 및 불필요한 속성 제거, `isFutureDeparture` 프로퍼티 전달
  - `docs/REPORT.md`: 과업 완료 보고서 갱신
- **커밋 메시지**: `refine: replace preview btn with clock icon, fix scroll leak on departure picker, and match reference UI 1:1`
- **배포 브랜치**: `origin/main` (GitHub 푸시 완료)
