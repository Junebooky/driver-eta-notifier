# Protocol Cockpit (driver-eta-notifier) - 차량번호 텍스트 입력 복구, 휠 피커 탄성 스냅백 및 실시간 ETA 격리 완료 보고서

> **평가 일시**: 2026년 9월 21일  
> **대상 애플리케이션**: Protocol Cockpit (의전 드라이버 전용 스마트 관제 런처 v4.22 - 차량번호 자유 텍스트 입력 복구, 휠 피커 수평 정렬 및 오전/오후 롤오버, 과거 시간대 진동/바운스 스냅백, 메인 대시보드 실시간 ETA 격리 보존)  
> **프로덕션 배포 URL**: [https://driver-eta-notifier.vercel.app](https://driver-eta-notifier.vercel.app)  
> **GitHub Repository**: [https://github.com/Junebooky/driver-eta-notifier.git](https://github.com/Junebooky/driver-eta-notifier.git) (main 브랜치)  

---

## 1. 핵심 과업 달성 현황

| 과업 항목 | 구현 상태 | 핵심 조치 및 엔지니어링 구현 세부 사항 |
| :--- | :---: | :--- |
| **1. 차량번호 입력 필드 한글/문자 제한 버그 즉시 해제 (`ProfileModal.tsx`)** | ✅ 완료 | • **숫자 전용 강제 필터링 제거**: 기존 차량번호 입력 필드에 적용되어 있던 `replace(/[^0-9]/g, '')`, `inputMode="numeric"`, `pattern="[0-9]*"` 속성을 완전히 제거.<br>• **자유 텍스트 입력 복구**: 차량 식별 속성을 표준 `type="text"`로 전환하여 한글/영문/숫자/공백/특수문자('142호 7811', '서울 32가 1234' 등)가 IME 자모 조합 끊김 없이 온전히 입력 및 영구 저장되도록 복구 완료. |
| **2. 출발 시간 휠 피커 수평 일렬 정렬 & 오전/오후 연동 스크롤 (`DepartureTimePickerModal.tsx`)** | ✅ 완료 | • **수평 일렬 정밀 정렬**: 4개 열(날짜-오전/오후-시-분)의 모든 아이템 행 높이를 고정 `48px`(`h-[48px]`), 상·하단 패딩 `96px`(`pt-[96px] pb-[96px]`), 중앙 하이라이트 박스를 `top-[96px] h-[48px]`로 일치시켜 텍스트 베이스라인이 정확히 수평 일직선상에 정렬.<br>• **시간 휠 11 $\leftrightarrow$ 12 롤오버 동기화**: Hour 휠 스크롤 시 오전 11시 $\rightarrow$ 12시는 **오후 12시(정오)**로, 오후 11시 $\rightarrow$ 12시는 **오전 12시(자정 및 다음 날짜)**로 연동되고, 반대 방향 역스크롤 시에도 이전 시간대/날짜로 스마트 동기화 구현. |
| **3. 과거 시간대 방어 및 탄성 바운스 스냅백 (`DepartureTimePickerModal.tsx`)** | ✅ 완료 | • **과거 시간대 비활성화**: '오늘' 날짜 선택 시 현재 시각 이전의 시간 및 분 슬롯을 `opacity-20 pointer-events-none`으로 흐리게 비활성화 처리.<br>• **탄성 바운스 스냅백 (Rubber-band Snapback)**: 사용자가 관성으로 과거 시간 영역으로 스크롤하거나 터치할 경우, 허용하지 않고 즉시 **현재 시각 기준 가장 가까운 유효 슬롯(현재 시각 + 10분 단위 올림)으로 부드럽게 튕겨 내려오는 탄성 애니메이션** 적용.<br>• **크로스 플랫폼 촉각 피드백**: 스냅백 순간 안드로이드 진동(`navigator?.vibrate?.([20, 30, 20])`) 및 오디오/햅틱(`warningPulse`)과 함께 화면 마이크로 흔들림(Shake/Bounce) 애니메이션 격발. |
| **4. 메인 대시보드 실시간 ETA 보존 및 시뮬레이션 완전 격리 (`page.tsx`, `RouteInfoCard.tsx`)** | ✅ 완료 | • **메인 대시보드 실시간 ETA 원복**: 메인 홈 화면의 도착 시간(ETA), 소요 시간 및 카카오톡 보고 텍스트는 **무조건 '현재 시각' 기준 실시간 TMAP 데이터만 단독 표시**하도록 원천 분리.<br>• **조회 전용 시뮬레이션(Preview) 격리**: 시계 아이콘 터치 및 휠 피커 조작은 미래 소요 시간 단순 조회 전용 레이어로 동작하며, 결과는 오직 `PredictionResultSheet` 바텀시트 내부에서만 렌더링되고 시트를 닫으면 메인 대시보드는 실시간 상태를 그대로 유지. |

---

## 2. 세부 엔지니어링 구현 내역

### 1) 차량번호 필드 한글/문자 제한 완전 해제 (`components/ProfileModal.tsx`)

- **문제 원인**: 이전 커밋에서 번호판 입력을 2분할하면서 뒷자리 필드에 `replace(/[^0-9]/g, '')` 및 `inputMode="numeric"`이 강제되어 '서울 32가 1234'나 한글 번호판이 차단되는 문제 발생.
- **조치 내용**:
  - `plateNumber`를 단일 통합 `type="text"` 입력 필드로 전환하여 모든 문자열(공백, 한글, 숫자 등)을 자유롭게 입력 가능하도록 조치.
  - 호차(`hocha`) 역시 `type="text"`로 영문/숫자 자유 입력 지원.

```tsx
{/* 1. Hocha (Optional) Field */}
<div>
  <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center">
    <Car className="w-3.5 h-3.5 mr-1 text-[#1E60F3]" /> 호차 (선택)
  </label>
  <div className="relative flex items-center">
    <input
      type="text"
      value={hocha}
      onChange={handleHochaChange}
      placeholder="예: 4 (호차 없으면 공란)"
      className="w-full pl-3.5 pr-12 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-blue-600 focus:bg-white font-bold transition-colors"
    />
  </div>
</div>

{/* 2. License Plate Input Field */}
<div>
  <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center">
    <Car className="w-3.5 h-3.5 mr-1 text-[#1E60F3]" /> 차량 번호판
  </label>
  <input
    type="text"
    value={plateNumber}
    onChange={handlePlateChange}
    placeholder="예: 142호 7811 또는 서울 32가 1234"
    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-blue-600 focus:bg-white font-bold transition-colors"
  />
</div>
```

---

### 2) 휠 피커 수평 일렬 정렬 및 오전/오후 스마트 롤오버 (`components/DepartureTimePickerModal.tsx`)

- **정밀 수평 일렬 정렬 (Sub-pixel Alignment)**:
  - 컨테이너 높이 `h-[240px]`에 맞추어 상·하단 패딩을 각각 `96px`로 설정.
  - 4개 열(날짜, 오전/오후, 시, 분)의 모든 아이템 높이를 `h-[48px]`(48px)로 통일하고 중앙 하이라이트 바를 `top-[96px] h-[48px]`에 고정하여 베이스라인이 정확히 일치하도록 교정.
- **Hour 11 $\leftrightarrow$ 12 롤오버 연동**:
  - `prevHourRef`를 통해 시간의 전진/후진 방향을 실시간 감지하여:
    - 오전 11시 $\rightarrow$ 12시 전환 시: 자동으로 `오후`로 전환.
    - 오후 11시 $\rightarrow$ 12시 전환 시: 자동으로 `오전`으로 전환 및 익일(다음 날짜)로 인덱스 동기화.
    - 반대 방향 역스크롤 시에도 전일/오전/오후로 복원.

```tsx
// 3. Hour Selection / Rollover Sync Handler
const handleSelectHour = (newHour: number) => {
  const prevHour = prevHourRef.current;
  let nextPeriod = selectedPeriod;
  let nextDateIdx = selectedDateIdx;

  // Rollover 11 -> 12 (Forward)
  if (prevHour === 11 && newHour === 12) {
    if (selectedPeriod === '오전') {
      nextPeriod = '오후';
      setSelectedPeriod('오후');
      scrollColumnToIndex(periodColRef.current, 1, 'smooth');
    } else {
      nextPeriod = '오전';
      nextDateIdx = Math.min(datesList.length - 1, selectedDateIdx + 1);
      setSelectedPeriod('오전');
      setSelectedDateIdx(nextDateIdx);
      scrollColumnToIndex(periodColRef.current, 0, 'smooth');
      scrollColumnToIndex(dateColRef.current, nextDateIdx, 'smooth');
    }
  }
  // Rollover 12 -> 11 (Backward)
  else if (prevHour === 12 && newHour === 11) {
    if (selectedPeriod === '오후') {
      nextPeriod = '오전';
      setSelectedPeriod('오전');
      scrollColumnToIndex(periodColRef.current, 0, 'smooth');
    } else if (selectedDateIdx > 0) {
      nextPeriod = '오후';
      nextDateIdx = Math.max(0, selectedDateIdx - 1);
      setSelectedPeriod('오후');
      setSelectedDateIdx(nextDateIdx);
      scrollColumnToIndex(periodColRef.current, 1, 'smooth');
      scrollColumnToIndex(dateColRef.current, nextDateIdx, 'smooth');
    }
  }

  prevHourRef.current = newHour;
  setSelectedHour(newHour);
  scrollColumnToIndex(hourColRef.current, HOURS.indexOf(newHour), 'smooth');
};
```

---

### 3) 과거 시간 방어 및 탄성 스냅백 인터랙션 (`components/DepartureTimePickerModal.tsx`)

- **과거 시간 슬롯 비활성화**:
  - `isToday`인 경우, `isPeriodDisabled`, `isHourDisabled`, `isMinuteDisabled` 검사를 통해 과거 항목에 `opacity-20 pointer-events-none cursor-not-allowed` 부여.
- **탄성 스냅백 및 햅틱/진동 격발**:
  - 과거 시간대로 휠이 올려지거나 관성 스크롤된 경우, 안드로이드 진동(`navigator.vibrate([20, 30, 20])`), 햅틱 경고, 마이크로 바운스 애니메이션(`isShaking`)과 함께 현재 시각 기준 가장 가까운 유효 슬롯(10분 단위 올림)으로 부드럽게 스냅백(Spring ease-out).

```tsx
const triggerRubberBandSnapback = useCallback(() => {
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([20, 30, 20]);
    }
  } catch {}
  haptics.warningPulse();

  setIsShaking(true);
  setTimeout(() => setIsShaking(false), 400);

  const minValid = getMinAllowedDate();
  const h24 = minValid.getHours();
  const period = h24 >= 12 ? '오후' : '오전';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const minute = minValid.getMinutes();

  setSelectedDateIdx(0);
  setSelectedPeriod(period);
  setSelectedHour(h12);
  setSelectedMinute(minute);
  prevHourRef.current = h12;

  scrollColumnToIndex(dateColRef.current, 0, 'smooth');
  scrollColumnToIndex(periodColRef.current, PERIODS.indexOf(period), 'smooth');
  scrollColumnToIndex(hourColRef.current, HOURS.indexOf(h12), 'smooth');
  scrollColumnToIndex(minuteColRef.current, MINUTES.indexOf(minute), 'smooth');
}, [scrollColumnToIndex]);
```

---

### 4) 메인 대시보드 실시간 ETA 보존 및 시뮬레이션 완전 격리 (`app/page.tsx`, `components/RouteInfoCard.tsx`)

- **실시간 ETA 오염 원천 차단**:
  - `app/page.tsx`의 경로 계산 `useEffect`에서 `selectedDepartureDate` 의존성을 완전히 제거하고, 거점 변경 및 새로고침 시 **무조건 실시간 TMAP 데이터(`fetchRouteEstimate`)만 호출**하도록 원복.
  - `handleApplyPrediction`에 의해 메인 화면의 `routeEstimate`가 덮어씌워지던 로직을 제거.
  - `reportPreviewText` 역시 실시간 `routeEstimate`만을 기반으로 단톡방 메시지를 생성.
- **조회 전용 시뮬레이션 레이어로 격리**:
  - 출발 시간 선택 및 AI 예측 결과는 독립된 `simulationDepartureDate`와 `PredictionResultSheet` 바텀시트 내부에서만 렌더링.
  - 바텀시트 하단 버튼은 `[확인 (조회 완료)]`로 동작하여 시트를 닫으면 메인 대시보드가 본래의 실시간 상태를 100% 온전히 유지.

---

## 3. 프로덕션 빌드 무결성 검증

### `npm run build` 결과
```text
> driver-eta-notifier@0.1.0 build
> next build

▲ Next.js 16.3.5 (Turbopack)
- Environments: .env.local
✓ Running next.config.ts took 10ms

  Creating an optimized production build ...
✓ Compiled successfully in 255ms
  Finished TypeScript in 678ms    ✓ Finished TypeScript in 678ms 
  Collecting page data using 10 workers in 287ms    ✓ Collecting page data using 10 workers in 287ms 
✓ Generating static pages using 10 workers (9/9) in 226ms
  Finalizing page optimization in 8ms    ✓ Finalizing page optimization in 8ms 

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
  - `components/ProfileModal.tsx`: 차량 식별 입력 필드의 숫자 전용 필터링 제거 및 통합 `type="text"` 입력 필드 복구
  - `components/DepartureTimePickerModal.tsx`: 4열 고정 48px 수평 일렬 정렬, 오전/오후 롤오버 동기화, 과거 시간대 비활성화 및 햅틱/진동 탄성 바운스 스냅백 구현
  - `components/RouteInfoCard.tsx`: 미래 시뮬레이션 잔재 제거 및 100% 실시간 TMAP 데이터 표시 카드 원복
  - `components/PredictionResultSheet.tsx`: `onApplyPrediction` 옵셔널 전환 및 하단 버튼 `[확인 (조회 완료)]` 격리 반영
  - `app/page.tsx`: 실시간 경로 상태와 시뮬레이션 상태 원천 분리, 실시간 보고 텍스트 보존
  - `docs/REPORT.md`: 과업 완료 보고서 갱신
- **커밋 메시지**: `fix: restore vehicle text input, enforce past time rubber-band snapback with haptics, and isolate simulation from real-time ETA`
- **배포 브랜치**: `origin/main` (GitHub 푸시 완료)
