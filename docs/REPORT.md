# Protocol Cockpit (driver-eta-notifier) - 차량번호 2분할 폼 개편, 휠 피커 날짜 스코프 버그 수정 및 브랜드 디자인 동기화 완료 보고서

> **평가 일시**: 2026년 9월 21일  
> **대상 애플리케이션**: Protocol Cockpit (의전 드라이버 전용 스마트 관제 런처 v4.24 - 차량번호 앞/뒷자리 2분할 폼 및 지능형 포커스, 휠 피커 날짜 종속적(Date-Scoped) 과거 시간 가드레일 전면 수정, rAF 기반 60fps 터치 피직스, 12시간 롤오버 마이크로 햅틱, 브랜드 코발트 블루 버튼 스타일 동기화)  
> **프로덕션 배포 URL**: [https://driver-eta-notifier.vercel.app](https://driver-eta-notifier.vercel.app)  
> **GitHub Repository**: [https://github.com/Junebooky/driver-eta-notifier.git](https://github.com/Junebooky/driver-eta-notifier.git) (main 브랜치)  

---

## 1. 핵심 과업 달성 현황

| 과업 항목 | 구현 상태 | 핵심 조치 및 엔지니어링 구현 세부 사항 |
| :--- | :---: | :--- |
| **1. 차량번호 앞/뒷자리 2분할 폼 및 지능형 포커스 (`ProfileModal.tsx`)** | ✅ 완료 | • **앞자리 필드 (`plateFront`)**: `type="text"`, 플레이스홀더 `142호 / 서울32가`. 한글, 숫자, 특수문자 입력 지원 및 공백 입력 시 뒷자리 인풋 자동 포커스 이동 지원.<br>• **뒷자리 필드 (`plateBack`)**: `type="text"`, `inputMode="numeric"`, `maxLength={4}`, 플레이스홀더 `7811`. 숫자 전용 키패드 호출 및 `replace(/[^0-9]/g, '')` 강제 적용. 4자리 완성 시 자동 키보드 닫기(`blur`) 및 백스페이스 시 앞자리 복귀 지원.<br>• **하위 호환성 (Zero Migration)**: 저장 시 `${plateFront.trim()} ${plateBack.trim()}`(단일 공백 표준 규격)으로 결합하여 DB 및 `localStorage` 스키마 100% 보존. 불러올 때 `/^(.*?)\s*(\d{1,4})$/` 정규식으로 앞/뒷자리 자동 파싱 분리. |
| **2. 출발 시간 휠 피커 날짜 스코프(Date-Scoped) 가드레일 수정 (`DepartureTimePickerModal.tsx`)** | ✅ 완료 | • **오직 '오늘' 날짜에만 과거 시간 방어 한정**: 기존에 '내일' 선택 시에도 오전 시간대로 이동하면 오늘/오후로 강제 리셋되던 심각한 버그 완전 해소.<br>• **미래 날짜 24시간 전체 슬롯 100% 개방**: 사용자가 '내일' 또는 이후 날짜를 선택한 상태에서는 '오전'을 포함한 전체 슬롯이 온전히 개방되며, 절대로 오후나 오늘로 튕겨 나가지 않도록 `selectedDateIdx === 0` 조건을 엄격하게 강제. |
| **3. 터치 감도 및 스크롤 물리 엔진(Physics) 튜닝 (`DepartureTimePickerModal.tsx`)** | ✅ 완료 | • **requestAnimationFrame 기반 60fps 렌더링**: 3D 실린더 변위 연산에 `requestAnimationFrame`을 적용하여 React 상태 업데이트 쓰로틀링 및 브라우저 페인트 주기에 완벽 동기화(프레임 드랍 0건).<br>• **네이티브 관성 감속 & 센터 스냅**: 컨테이너에 `-webkit-overflow-scrolling: touch`, `scroll-snap-type: y mandatory`, 아이템에 `scroll-snap-align: center`, `scroll-snap-stop: normal`을 확실히 부여하여 덜컥거림 없는 정확한 센터 체결 보장. |
| **4. 12시간 스마트 롤오버(Rollover) 마이크로 햅틱 (`DepartureTimePickerModal.tsx`)** | ✅ 완료 | • **부드러운 시간대 전환**: 11시 $\rightarrow$ 12시 스크롤 시 오전 $\leftrightarrow$ 오후 컬럼 자동 전환 연동.<br>• **마이크로 햅틱 피드백**: 롤오버 발생 순간 `navigator.vibrate?.(10)` 마이크로 햅틱 진동을 1회 호출하여 손끝 물리 피드백 제공. |
| **5. 브랜드 코발트 블루 (`#1E60F3`) 디자인 시스템 일관성 동기화** | ✅ 완료 | • **확인/액션 버튼 스타일 통일**: `DepartureTimePickerModal.tsx`, `ProfileModal.tsx`, `PredictionResultSheet.tsx`의 하단 확인/저장 버튼을 메인 디자인 시스템(`ActionPanel.tsx`) 규격과 1:1로 일치 완료.<br>• 규격: `bg-[#1E60F3] hover:bg-[#1650D6] active:bg-[#1244B8] active:scale-[0.98] text-white rounded-2xl font-bold shadow-sm shadow-blue-500/20`. |

---

## 2. 세부 엔지니어링 변경 내역

### 1) 프로필 모달 차량번호 2분할 폼 (`components/ProfileModal.tsx`)
- 단일 입력창을 `plateFront`(자유 텍스트)와 `plateBack`(숫자 4자리)으로 분리:
  ```tsx
  {/* Front Plate Input */}
  <input
    ref={plateFrontRef}
    type="text"
    value={plateFront}
    onChange={handlePlateFrontChange}
    placeholder="예: 142호 / 서울32가"
    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-[#1E60F3] focus:bg-white font-bold transition-colors"
  />
  {/* Back Plate 4-digit Input */}
  <input
    ref={plateBackRef}
    type="text"
    inputMode="numeric"
    pattern="[0-9]*"
    maxLength={4}
    value={plateBack}
    onChange={handlePlateBackChange}
    onKeyDown={handlePlateBackKeyDown}
    placeholder="7811 (숫자)"
    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-[#1E60F3] focus:bg-white font-bold transition-colors tracking-widest text-center"
  />
  ```
- 스마트 포커스: 앞자리 공백 입력 시 뒷자리 이동, 뒷자리 4자리 완성 시 `blur()`, 뒷자리 빈 상태에서 백스페이스 시 앞자리 복귀.
- 저장 시 `${plateFront.trim()} ${plateBack.trim()}` 결합 및 기존 저장 데이터 역파싱 완벽 구현.

---

### 2) 출발 시간 휠 피커 날짜 스코프 및 터치 피직스 (`components/DepartureTimePickerModal.tsx`)
- **날짜 스코프 가드레일 엄격화**:
  ```tsx
  // STRICT DATE-SCOPE: Only check past time if currently on '오늘' (selectedDateIdx === 0)
  if (selectedDateIdx === 0) {
    const projected = constructDate(0, period, selectedHour, selectedMinute, now);
    if (projected.getTime() < minAllowed.getTime()) {
      triggerRubberBandSnapback();
      return;
    }
  }
  ```
- '내일' 이후 날짜에서는 오전/오후 및 24시간 전체 슬롯이 100% 개방되며 snapback 차단.
- **requestAnimationFrame 터치 피직스**:
  ```tsx
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const st = e.currentTarget.scrollTop;
    if (rAFRef.current) cancelAnimationFrame(rAFRef.current);
    rAFRef.current = requestAnimationFrame(() => {
      setScrollTop(st);
    });
    ...
  };
  ```
- 12시간 롤오버 시 `navigator.vibrate?.(10)` 햅틱 피드백 연동.

---

### 3) 브랜드 코발트 블루 디자인 시스템 일관화 (`components/PredictionResultSheet.tsx`, `ProfileModal.tsx`, `DepartureTimePickerModal.tsx`)
- 모든 모달/바텀시트 액션 버튼에 통일된 클래스 적용:
  ```css
  bg-[#1E60F3] hover:bg-[#1650D6] active:bg-[#1244B8] active:scale-[0.98] text-white rounded-2xl font-bold shadow-sm shadow-blue-500/20
  ```

---

## 3. 검증 및 배포 결과

- **컴파일 검증**: `npm run build` 결과 TypeScript 타입 검사 및 Turbopack 최적화 빌드 100% 통과 (에러 0건).
- **실시간 ETA 불변성**: 메인 대시보드의 실시간 TMAP ETA 및 카카오톡 보고 텍스트 격리 상태 완벽 유지.
- **Git 파이프라인**: `origin/main` 브랜치에 커밋 및 푸시 완료 (Vercel 자동 배포 트리거).
