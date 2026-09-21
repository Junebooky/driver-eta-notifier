# Protocol Cockpit (driver-eta-notifier) - 휠 피커 마그네틱 데드존 락 및 과거 시간 탄성 리바운드/암묵적 변조 근절 완료 보고서

> **평가 일시**: 2026년 9월 21일  
> **대상 애플리케이션**: Protocol Cockpit (의전 드라이버 전용 스마트 관제 런처 v4.26 - 출발 시간 휠 피커 4개 컬럼 Snap-to-Zero 마그네틱 데드존 락, 정수 픽셀 클램핑, 오늘 오후 기준 '오전' 실시간 탄성 리바운드 강제 스냅백, Pre-disabled 시각적 딤 처리, 암묵적 데이터 변조 완전 근절 및 SSOT 원칙 준수)  
> **프로덕션 배포 URL**: [https://driver-eta-notifier.vercel.app](https://driver-eta-notifier.vercel.app)  
> **GitHub Repository**: [https://github.com/Junebooky/driver-eta-notifier.git](https://github.com/Junebooky/driver-eta-notifier.git) (main 브랜치)  

---

## 1. 핵심 과업 달성 현황

| 과업 항목 | 구현 상태 | 핵심 조치 및 엔지니어링 구현 세부 사항 |
| :--- | :---: | :--- |
| **1. 4개 컬럼 완벽 수평 인라인 정렬 (마그네틱 데드존 락)** | ✅ 완료 | • **Snap-to-Zero Deadzone (`absDelta <= 0.15`)**: 중앙 선택 윈도우($\pm 7\text{px}$) 진입 시 3D 변위 연산의 소수점 오차를 무시하고 `rotateX = 0deg`, `translateZ = 24px`, `scale = 1.16`, `opacity = 1.0`으로 수학적 영점에 강제 고정하여 컬럼 간 미세 수평 뒤틀림 완벽 해소.<br>• **정수 픽셀 마그네틱 클램핑 (`Math.round`)**: 스크롤 정지 시 `scrollTop`을 `targetIndex * ITEM_HEIGHT`의 정확한 정수 배수로 일괄 재정렬하여 4개 컬럼의 베이스라인이 단 1px의 오차도 없이 수평 일직선을 유지하도록 보장.<br>• **중앙 하이라이트 글래스 바 일체화**: `top: 96px`, `h-[48px]` 수평 하이라이트 바 내부에서 모든 텍스트가 정확히 상하 수직 중앙(`flex items-center justify-center`)에 안착. |
| **2. 과거 시간 실시간 탄성 리바운드 (Elastic Snap-back)** | ✅ 완료 | • **오전 중앙 안착 원천 불허**: '오늘' 날짜에서 현재 시각이 오후인 상태로 '오전' 영역으로 스크롤할 경우, 중앙 윈도우에 머물지 못하도록 즉각 **'오후' 위치(`index = 1`, `scrollTop = ITEM_HEIGHT`)로 강제 탄성 리바운드**.<br>• **촉각 경고 피드백**: 실시간 리바운드 격발 시 `navigator.vibrate?.([30, 40, 30])` 햅틱 경고를 발생시켜 선택 불가능함을 물리적으로 통지. |
| **3. Pre-disabled 시각적 딤(Dim) 큐 처리** | ✅ 완료 | • **사전 비활성화 시각화**: 오늘 기준 이미 지나간 시간대(오전 전체, 현재 시각 이전의 시/분)는 텍스트를 `#CBD5E1` (`opacity: 0.35` / `0.15`) 상태로 딤 처리 및 `pointer-events-none` 적용하여 선택 불가 상태를 명확히 안내. |
| **4. 암묵적 데이터 변조(Silent Mutation) 완전 근절 (SSOT)** | ✅ 완료 | • **단일 진실 공급원 준수**: 확인 버튼 클릭 시 화면의 '오전' 값을 몰래 '오후'로 덮어쓰던 암묵적 변조 로직을 100% 제거.<br>• **동기화 보장**: 사용자가 눈으로 보고 확인한 화면 텍스트 그대로 최종 제출 데이터가 되도록 보장하며, 비정상 과거 시간대 체류 시 유효 시간대로 시각적 스냅백 후 유효 값만 제출. |
| **5. 빌드 무결성 및 메인 실시간 ETA 격리** | ✅ 완료 | • `npm run build` TypeScript 정적 타입 검사 100% 통과 (컴파일 에러 0건).<br>• 메인 대시보드의 실시간 TMAP ETA 및 카카오톡 보고 텍스트 격리 상태 완벽 유지. |

---

## 2. 세부 엔지니어링 변경 내역

### 1) Snap-to-Zero 마그네틱 데드존 락 & 정수 픽셀 클램핑 (`components/DepartureTimePickerModal.tsx`)
- 미세한 서브픽셀 회전 오차를 제거하고 4개 컬럼의 텍스트 베이스라인을 일직선으로 결합:
  ```tsx
  // [태스크 1] Snap-to-Zero Deadzone (absDelta <= 0.15)
  if (absDelta <= 0.15) {
    rotateX = 0;
    translateZ = 24; // 전면 돌출 기준 높이
    scale = 1.16;
    opacity = 1.0;
  }
  ```
- 스크롤 종료 시 정수 배수 위치로 마그네틱 스냅:
  ```tsx
  const finalIndex = Math.round(st / ITEM_HEIGHT);
  const clamped = Math.max(0, Math.min(items.length - 1, finalIndex));
  const targetScroll = clamped * ITEM_HEIGHT;

  if (colRef.current && Math.abs(colRef.current.scrollTop - targetScroll) > 0.5) {
    colRef.current.scrollTo({ top: targetScroll, behavior: 'smooth' });
  }
  updateTransforms(targetScroll);
  ```

---

### 2) 과거 시간 실시간 탄성 리바운드 & Pre-disabled 딤 처리
- '오늘' 오후에 '오전' 선택 시 중앙 안착을 불허하고 '오후'로 즉각 강제 스냅백:
  ```tsx
  const handleSelectPeriodIdx = (idx: number) => {
    const period = periodsList[idx] || '오후';

    // [태스크 2] Real-time Elastic Rebound when selecting '오전' during today's afternoon
    if (selectedDateIdx === 0 && isNowAfternoon && period === '오전') {
      if (periodColRef.current) {
        periodColRef.current.scrollTo({ top: 1 * ITEM_HEIGHT, behavior: 'smooth' });
      }
      setSelectedPeriod('오후');
      triggerRubberBandSnapback();
      return;
    }
    ...
  };
  ```
- 이미 지난 슬롯에 대한 사전 딤 처리(`isItemDisabled`):
  ```tsx
  isItemDisabled={(_, idx) => isPeriodDisabled(periodsList[idx])}
  isItemDisabled={(_, idx) => isHourDisabled(hoursList[idx])}
  isItemDisabled={(_, idx) => isMinuteDisabled(minutesList[idx])}
  ```

---

### 3) 암묵적 변조 근절 (Single Source of Truth)
- 확인 버튼 클릭 시 화면 상태와 제출 데이터의 100% 일치 보장:
  ```tsx
  const handleConfirm = () => {
    const target = constructDate(
      datesList[selectedDateIdx].offsetDays,
      selectedPeriod,
      selectedHour,
      selectedMinute,
      new Date()
    );

    // 과거 시점인 경우 암묵적 변조 없이 실시간 리바운드 실행
    if (selectedDateIdx === 0 && target.getTime() < minAllowed.getTime()) {
      triggerRubberBandSnapback();
      return;
    }

    haptics.successPulse();
    onConfirm(target);
  };
  ```

---

## 3. 검증 및 배포 결과

- **컴파일 검증**: `npm run build` 결과 TypeScript 정적 타입 검사 및 Turbopack 최적화 빌드 100% 통과 (에러 0건).
- **실시간 ETA 불변성**: 메인 대시보드 상태와 시뮬레이션 레이어 완벽 분리 유지.
- **Git 파이프라인**: `origin/main` 브랜치에 커밋 및 원격 저장소(`origin/main`) 푸시 완료 (Vercel 자동 배포 트리거 완료).
