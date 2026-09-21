# Protocol Cockpit (driver-eta-notifier) - AI 소요 시간 예측 바텀시트 리디자인 및 3D 실린더 휠 피커 구현 완료 보고서

> **평가 일시**: 2026년 9월 21일  
> **대상 애플리케이션**: Protocol Cockpit (의전 드라이버 전용 스마트 관제 런처 v4.23 - AI 예측 바텀시트 수평 프로그레스 바 타임라인 리디자인, 휠 피커 배열 필터링 버그 수정 및 3D 실린더 드럼 볼록렌즈 인터랙션)  
> **프로덕션 배포 URL**: [https://driver-eta-notifier.vercel.app](https://driver-eta-notifier.vercel.app)  
> **GitHub Repository**: [https://github.com/Junebooky/driver-eta-notifier.git](https://github.com/Junebooky/driver-eta-notifier.git) (main 브랜치)  

---

## 1. 핵심 과업 달성 현황

| 과업 항목 | 구현 상태 | 핵심 조치 및 엔지니어링 구현 세부 사항 |
| :--- | :---: | :--- |
| **1. AI 소요 시간 예측 바텀시트 전면 리디자인 (`PredictionResultSheet.tsx`)** | ✅ 완료 | • **세로 막대 그래프 폐기 및 수평 타임라인 행 전환**: 기존 가로축 세로 막대 그래프를 완전히 제거하고, 상용 내비 레퍼런스와 1:1 일치하는 **'세로 타임라인 행(Horizontal Progress Bar List)'** 구조로 전환.<br>• **네이티브 Ai 멀티컬러 링 심볼**: 상단 좌측에 시안-퍼플-핑크 그라데이션 원형 링과 볼드 "Ai" 타이포 결합 심볼 구현.<br>• **타이포그래피 및 액션**: 대형 소요 시간 타이포(`1시간 33분 걸려요` - 볼드 일렉트릭 블루 `#1E60F3` + 짙은 차콜 `#1E293B`) 및 아웃라인 알약형 `[시간변경]` 버튼 배치.<br>• **슬라이더 트랙 & 수직 점선 가이드라인**: 상단 기준 행에 파란 슬라이더 노브(`w-4 h-4 bg-[#1E60F3] ring-4 ring-blue-100`)와 시트 하단까지 관통하는 **수직 점선 가이드라인(`border-l border-dashed border-blue-400/60`)**, 좌측 틴트 배경(`bg-blue-50/25`) 구성.<br>• **시간대별 주행 상태 게이지 및 편차 배지**: 연회색 레일 위에 에메랄드 그린(`bg-[#00C853]`, 정체 시 오렌지/레드) 게이지 바 및 우측 상단 편차 수치(`-7분`, `-12분`, `-17분`, `-20분`) 볼드 텍스트 렌더링. |
| **2. 출발 시간 휠 피커 데이터 배열 버그 수정 (`DepartureTimePickerModal.tsx`)** | ✅ 완료 | • **단순 CSS 숨김 금지 및 배열 소스 레벨 필터링**: '오늘' 날짜 선택 시 데이터 소스 배열(Array) 자체에서 지난 시간대 옵션을 원천 제외.<br>• **오전/오후 밀림 버그 원천 차단**: 현재 시각이 오후(12시 이후)인 경우 오전/오후 컬럼을 `['오후']` 단일 요소 배열로 동적 갱신하여 `selectedIndex`를 0으로 고정, 컨테이너 `scrollTop`을 0으로 초기화하여 하이라이트 박스(`top: 96px, h: 48px`) 정중앙에 정확히 안착.<br>• **아이템 높이 및 오프셋 정합성 보장**: 상하단 패딩(`96px`)과 `ITEM_HEIGHT`(48px) 계산 공식이 동적 배열 길이에 맞추어 완벽 동기화. |
| **3. 티맵 스타일 3D 볼록렌즈(Cylinder Drum) 인터랙션 구현 (`DepartureTimePickerModal.tsx`)** | ✅ 완료 | • **3D 원근 뷰포트(Perspective) 구축**: 4개 컬럼 스크롤 컨테이너에 `perspective: 1000px; transform-style: preserve-3d;` 설정 및 상·하단 그라데이션 마스크(`from-white via-white/85 to-transparent`) 배치.<br>• **중앙 거리(Delta) 기반 동적 변위 계산**: 스크롤 오프셋과 아이템 중심 간의 수직 거리(`delta = (itemCenter - scrollTop) / ITEM_HEIGHT`)를 실시간 계산하여 인라인 3D 스타일 바인딩.<br>• **변환 매개변수 정밀 매핑**: X축 회전각(`rotateX: delta * -20deg`, 최대 ±50deg), Z축 깊이(`translateZ: 5px ~ -48px`), 스케일(`scale: 1.05 ~ 0.82`), 투명도(`opacity: 1.0 ~ 0.12`)를 적용하여 입체적인 원통 렌즈 롤링 효과 연출.<br>• **성능 최적화**: `will-change: transform, opacity` 및 `scroll-snap-type: y mandatory` 결합. |
| **4. 메인 대시보드 실시간 ETA 격리 및 빌드 무결성** | ✅ 완료 | • **실시간 ETA 불변성 유지**: 메인 화면 소요 시간(ETA), 도착 예정 시각, 카카오톡 보고 텍스트는 오직 '현재 시각' 기준 실시간 TMAP 데이터만 단독 유지.<br>• **컴파일 에러 0건**: `npm run build`를 통해 TypeScript 정적 타입 검사 및 Turbopack 빌드 무결성 완벽 통과. |

---

## 2. 세부 엔지니어링 구현 내역

### 1) AI 소요 시간 예측 바텀시트 (`components/PredictionResultSheet.tsx`) 전면 리디자인

- **기존 세로 막대형 차트 제거**: 가로축 기준의 막대 그래프를 완전히 폐기하고, 5개 대표 시간대(기준 출발 시각, +30분, +60분 `1시간 후`, +90분, +120분 `2시간 후`)의 수평 게이지 행 리스트로 전환.
- **네이티브 Ai 심볼 및 헤더**:
  ```tsx
  {/* Native Ai Multi-Color Gradient Ring Symbol */}
  <div className="w-6 h-6 rounded-full p-[1.5px] bg-gradient-to-tr from-cyan-400 via-purple-500 to-pink-500 flex items-center justify-center shadow-xs shrink-0">
    <div className="w-full h-full rounded-full bg-white flex items-center justify-center">
      <span className="text-[10px] font-black text-slate-800 tracking-tighter leading-none">
        Ai
      </span>
    </div>
  </div>
  ```
- **수평 프로그레스 바 및 수직 점선 가이드라인**:
  - 첫 번째 행(기준 출발 시각)의 슬라이더 위치(80%)를 기준으로 파란 조절 노브(`w-4 h-4 bg-[#1E60F3] ring-4 ring-blue-100`) 배치.
  - 노브 중심에서 바닥까지 관통하는 `border-l border-dashed border-blue-400/60` 수직 점선 가이드라인 렌더링.
  - 노브 좌측 전체에 `bg-blue-50/25` 은은한 틴트 배경을 깔아 기준 축 시각화.
  - 각 하위 행에는 연회색 베이스 레일(`h-1.5 bg-slate-100`) 위에 초록 게이지 바(`h-1.5 bg-[#00C853]`)와 우측 상단 절약 편차 텍스트(`-7분`, `-12분`, `-17분`, `-20분`)를 배치.
  - 행 터치 시 활성 슬롯이 동적으로 전환되어 상단 소요 시간 및 출발 시각 타이틀이 실시간 반응.

---

### 2) 출발 시간 휠 피커 데이터 배열 필터링 (`components/DepartureTimePickerModal.tsx`)

- **문제 원인**: 오늘 날짜에서 지난 시간(오전 등)을 단순 CSS 스타일 숨김 처리하여 빈 공간이 발생하고 '오후'가 선택 박스 하단으로 밀려나는 정렬 오류 발생.
- **조치 내용**:
  ```tsx
  // Periods: If today & already afternoon, only ['오후'] is supplied
  const availablePeriods: Array<'오전' | '오후'> = useMemo(() => {
    if (isToday && isNowAfternoon) {
      return ['오후'];
    }
    return ALL_PERIODS;
  }, [isToday, isNowAfternoon]);
  ```
  - 배열 자체가 1개 요소(`['오후']`)로 축소되므로, `selectedIndex = 0` 및 `scrollTop = 0`에서 선택 하이라이트 박스(`top: 96px, h: 48px`) 중앙에 오차 없이 정확히 안착.

---

### 3) 티맵 스타일 3D 볼록렌즈(Cylinder Drum) 인터랙션 (`components/DepartureTimePickerModal.tsx`)

- `CylinderColumn` 컴포넌트를 통해 4개 컬럼 전체에 3D 실린더 롤링 적용:
  ```tsx
  // Calculate relative distance from current scroll center
  const itemCenter = idx * ITEM_HEIGHT;
  const distance = itemCenter - scrollTop;
  const delta = distance / ITEM_HEIGHT;
  const clampedDelta = Math.max(-2.5, Math.min(2.5, delta));

  // 3D Parameters:
  const rotateX = clampedDelta * -20;
  const translateZ = Math.max(-48, 5 - Math.abs(clampedDelta) * 22);
  const scale = Math.max(0.82, 1.05 - Math.abs(clampedDelta) * 0.12);
  const opacity = Math.max(0.12, Math.min(1, 1 - Math.abs(clampedDelta) * 0.52));
  ```
- 원근감 뷰포트(`perspective: 1000px`, `transformStyle: preserve-3d`)와 상하단 그라데이션 마스크 결합으로 볼록렌즈 입체 깊이감 완성.
- 과거 시간대 방어(스냅백, 진동 `[20, 30, 20]`, 햅틱, 흔들림) 정상 가동.

---

## 3. 검증 결과

- **빌드 검증**: `npm run build` 결과 TypeScript 정적 타입 검사 100% 통과, 9개 정적/동적 라우트 컴파일 완료.
- **실시간 ETA 불변성**: 메인 대시보드 상태와 시뮬레이션 레이어 완벽 분리 유지.
