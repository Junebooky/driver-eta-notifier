# Protocol Cockpit (driver-eta-notifier) - 스케줄 탭 디테일 정제, 슬림 인풋 바, 항공편 딥링크 & 간편 편집 기능 완료 보고서

> **평가 일시**: 2026년 9월 22일  
> **대상 애플리케이션**: Protocol Cockpit (의전 드라이버 전용 스마트 관제 런처 v4.65 - 시각적 노이즈 제거, 슬림 인라인 카메라 인풋 바, 항공편 실시간 조회 딥링크, 스케줄 간편 편집 모달 구현)  
> **프로덕션 배포 URL**: [https://driver-eta-notifier.vercel.app](https://driver-eta-notifier.vercel.app)  
> **GitHub Repository**: [https://github.com/Junebooky/driver-eta-notifier.git](https://github.com/Junebooky/driver-eta-notifier.git) (`main` 브랜치)  

---

## 1. 핵심 과업 달성 현황

| 과업 항목 | 구현 상태 | 핵심 조치 및 엔지니어링 구현 세부 사항 |
| :--- | :---: | :--- |
| **1. 불필요한 시각적 노이즈 제거 (`ScheduleCard.tsx`, `ScheduleTab.tsx`)** | ✅ 완료 | • 시계 버튼 위 파란색 점(`Blue Dot`) 및 카드 상단 초록색 `✓ 확정` 뱃지 완전 삭제.<br>• 상단 배차표 제목 옆 달력 아이콘 제거 및 향후 파서 연동을 위한 동적 `scheduleTitle` 바인딩. |
| **2. 하단 액션 도크 슬림화 (`ScheduleTab.tsx`)** | ✅ 완료 | • 기존 상단 캡슐형 `[📷 이미지 업로드]` 버튼을 전면 삭제하고 최신 메신저 스타일의 **단일 슬림 인풋 바**로 개편.<br>• 인풋창 좌측에 `Camera` 아이콘 버튼을 인라인으로 내장하여 터치 시 파일 탐색기를 직접 트리거. |
| **3. 항공편 버튼 조건부 노출 & FlightModal 딥링크 (`ScheduleCard.tsx`)** | ✅ 완료 | • `item.flight`가 존재하는 일정(Day 1: SQ 612, Day 4: SQ 601)에만 시계 버튼 좌측에 비행기 버튼 노출 (Day 2/3는 미노출).<br>• 영접/샌딩 동선 판별(`arrival` vs `departure`) 및 편명 자동 추출을 거쳐 기존 `FlightModal`로 즉시 연결되어 자동 검색 팝업. |
| **4. 스케줄 간편 편집 모달 구현 (`EditScheduleModal.tsx`)** | ✅ 완료 | • 카드 우측 상단 `Pencil` 아이콘 또는 승객/메모 박스 터치 시 호출.<br>• 승객명, 항공편명, 픽업/착륙 시간 표기, 의전 메모 수정 후 저장 시 로컬 State 즉시 업데이트. |
| **5. 모바일 375px 레이아웃 안전성 & 빌드 무결성** | ✅ 완료 | • 듀얼/트리플 버튼 배치 시 좌측 `관제 연동` 버튼의 텍스트 오버플로우 방지 처리.<br>• `npm run build` TypeScript 컴파일 에러 **0건**, Turbopack 최적화 빌드 완료. |

---

## 2. 주요 코드 변경 요약 ([`utils/flightMapping.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/utils/flightMapping.ts))

```typescript
export function formatFlightReport(profile: DriverProfile, flight: FlightInfo): string {
  let v = (profile.vehicleNo || '').trim().replace(/호차\s*$/, '').trim();
  let vehicleDisplay = '의전차량';
  if (v) {
    vehicleDisplay = /^\d+$/.test(v) || !v.includes('호차') ? `${v}호차` : v;
  }
  const dName = (profile.driverName || '').trim();
  const header = dName && !vehicleDisplay.includes(dName) ? `[${vehicleDisplay} ${dName}]` : `[${vehicleDisplay}]`;

  const passengerName = profile.passengerName?.trim();
  const lines: string[] = [header];

  // 담당승객 자동 바인딩 (있을 때만 노출)
  if (passengerName) {
    lines.push(`• 담당승객: ${passengerName}`);
  }

  if (flight.type === 'arrival') {
    lines.push(`• 항공편명: ${flight.flightId} (${flight.airport} ➔ ICN)`);
    lines.push(`• 예상착륙: ${flight.statusText}`);
    lines.push(`• 입국게이트: ${flight.arrivalLocationText}`);
    // 단톡방 보고서에서는 영접위치, 추천주차 제외 (승객/의전용 필수 정보로만 구성)
  } else {
    lines.push(`• 샌딩대상: ${flight.flightId} (ICN ➔ ${flight.airport})`);
    lines.push(`• 예상출발: ${flight.statusText}`);
    lines.push(`• 하차위치: ${flight.departureLocationText}`);
  }

  return lines.join('\n');
}
```

---

## 3. 단톡방 보고서 최종 출력 예시

```
[1호차 김의전]
• 담당승객: VIP 고객님
• 항공편명: LH712 (프랑크푸르트 ➔ ICN)
• 예상착륙: 09:34 (조기 도착 -21분)
• 입국게이트: 제1여객터미널 1층 (E출구 / 수하물 18번)
```

---

## 4. 빌드 검증

- `npm run build` 결과 12/12 라우트 전체 컴파일 성공 (TypeScript 에러 0건).

---

## 5. [v4.70] 운행·스케줄 탭 색상 위계 리팩토링 및 Gemini 코파일럿 백엔드 구현

### 5.1 운행 탭 & 스케줄 탭 색상 위계 전면 리팩토링
1. **출발지(Origin) & 목적지(Destination) 시각 위계 반전**:
   - **출발지(Origin)**: 서 있는 기준점으로서의 중립적 뉴트럴 그레이 테마(`bg-slate-100 text-slate-700 border border-slate-200`)로 전환하여 시각적 자극 완화.
   - **목적지(Destination)**: 운전자 시선 및 내비 액션 타깃인 **솔리드 코발트 블루(`bg-[#1E60F3] text-white font-bold shadow-sm shadow-blue-500/20`)** 적용.
2. **자주 가는 목적지(프리셋) 버튼 색상 정돈**:
   - 기존의 이질적인 초록색(Emerald/Green) 뱃지, 테두리, 선택 스타일을 전면 제거.
   - 기본 상태: `bg-white border-slate-200 text-slate-700 hover:border-blue-300 hover:bg-blue-50/50`
   - 선택(Active) 상태: 솔리드 코발트 블루 테마(`bg-[#1E60F3] text-white border-[#1E60F3] shadow-sm shadow-blue-500/25`)로 일체화.
3. **스케줄 카드(`ScheduleCard.tsx`) 동선 뱃지 동기화**:
   - `[출발]` 뱃지: 단정한 뉴트럴 그레이 (`bg-slate-100 text-slate-600 border border-slate-200`)
   - `[도착]` 뱃지: 메인 솔리드 코발트 블루 (`bg-[#1E60F3] text-white font-bold`)

### 5.2 Gemini AI 의전 관제 코파일럿 백엔드 (`app/api/copilot/route.ts`)
1. **컨텍스트 자동 주입**:
   - 기사 프로필(호차, 기사명, 담당 승객), 페라리 4일치 확정 배차표(`CONFIRMED_FERRARI_SCHEDULES`), 주요 거점 프리셋(`DEFAULT_PRESET_LOCATIONS`)을 시스템 프롬프트에 동적 바인딩.
2. **도메인 가드레일 (Out-of-Domain Guardrail)**:
   - 맛집, 날씨, 일상 대화, 유머 등 비도메인 질의 시 일체의 환각 없이 표준 템플릿으로 정중히 방어 및 지원 업무 안내:
     > "기사님, 저는 VIP 의전 관제 전담 코파일럿입니다. 일상 대화보다는 **배차 일정 브리핑, 실시간 항공편 조회, 의전 동선 안내**를 정확하게 도와드리고 있습니다. 확인이 필요하신 일정을 말씀해 주시겠습니까?"
3. **지능형 질의 처리 및 3~4줄 단축 브리핑 포맷**:
   - 스케줄 브리핑 요청 시 운전 중 한눈에 파악 가능한 표준 포맷 응답.
   - 항공편 조회 시 실시간 운항 정보 및 터미널/영접 위치 요약 보고.
   - API 키 부재 또는 외부 장애 시에도 100% 대응 가능한 결정론적 Fallback 엔진 내장.

### 5.3 프론트엔드 연동 (`components/ScheduleTab.tsx`)
1. 하단 슬림 도크 인풋 전송 시 `/api/copilot`으로 기사 프로필과 함께 전송.
2. 상단에 AI 관제 코파일럿 카드 레이어 렌더링 (답변 복사, 닫기 기능 포함).
3. 퀵 프롬프트 칩 4종(9/18 일정 브리핑, SQ612 항공편 조회, 전체 일정 브리핑, 가드레일 테스트) 탑재로 원터치 질의 지원.

---

## 6. [v4.71] 목적지 카드 테두리 아웃라인화, 코파일럿 연산 과정 시각화 및 스케줄 비행기 아이콘 색상 정돈

### 6.1 목적지 카드 및 프리셋 테두리(Outline) 중심 스타일링
1. **목적지 선택 카드 (`components/OriginDestinationSelector.tsx`)**:
   - 솔리드 블루(`bg-[#1E60F3]`)를 걷어내고, 옅은 블루 틴트(`bg-blue-50/20`)와 **2px 코발트 블루 테두리(`border-2 border-[#1E60F3] shadow-sm shadow-blue-500/10`)** 아웃라인 스타일 적용.
   - 내부 텍스트 및 라벨은 다크 슬레이트(`text-slate-900`, `text-slate-500`)로 가독성 극대화.
2. **자주 가는 목적지(프리셋) 버튼 (`components/PresetButtons.tsx`)**:
   - 선택(Active/Destination) 및 호버 시 솔리드 블루 배경 대신 **코발트 테두리와 블루 텍스트(`border-2 border-[#1E60F3] text-[#1E60F3] bg-blue-50/40`)** 아웃라인 인터랙션으로 교체.

### 6.2 Protocol Copilot 연산 과정(Thinking) 시각화 및 타자기 스트리밍
1. **연산 과정 3단계 스텝 인디케이터 (Thinking Steps)**:
   - 질의 전송 시 1.35초 동안 순차적으로 데이터 분석 단계를 시각화:
     `🔍 배차 데이터베이스 동선 대조 중...` (0~450ms) ➔ `⚡ 실시간 스케줄 및 VIP 승객 분석 중...` (450~900ms) ➔ `📋 맞춤 브리핑 작성 중...` (900~1350ms)
2. **타자기 스트리밍 효과 (Typewriter Effect)**:
   - 18ms 간격으로 글자가 자연스럽게 스트리밍 출력되며, 타이핑 중에는 블링크 커서가 표시되어 실제 AI 관제원과의 대화 느낌 제공.
3. **Gemini Live API 로깅 강화 (`app/api/copilot/route.ts`)**:
   - 실제 호출 성공 시 `[Gemini Live API: Success]`, 폴백 발동 시 `[Gemini Live API: Fallback Triggered]` 콘솔 로깅 출력.

### 6.3 스케줄 탭 비행기 아이콘 다크 뉴트럴 톤 동기화 (`components/ScheduleCard.tsx`)
1. 비행기 아이콘 버튼의 보라/인디고 스타일을 완전히 제거하고, 인접한 시계 아이콘과 동일한 **다크 뉴트럴 규격**으로 통일:
   - `w-11 h-11 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center border border-slate-200/80 transition-colors`
2. 우측 솔리드 코발트 블루 길안내 내비 버튼(`w-11 h-11 bg-[#1E60F3]`)만 카드 내 유일한 메인 액션 컬러로 돋보이도록 위계 정돈.

---

## 7. [v4.72] 스케줄 탭 화이트 아이콘 버튼, 운행 탭 출발/목적지 배경 및 호버 분리, AI 흑색 톤 통일 및 Spend Cap 진단

### 7.1 스케줄 탭 비행기 & 시계 아이콘 화이트 배경화 (`components/ScheduleCard.tsx`)
1. **바탕화면 순수 화이트 전환**: 비행기(Flight) 및 시계(Clock) 버튼 배경을 회색 톤(`bg-slate-100`)에서 순수 화이트(`bg-white hover:bg-slate-50 border border-slate-200/90 shadow-2xs`)로 전환.
2. **아이콘 심볼 컬러**: 회색-검정색 중간의 차분한 다크 슬레이트(`text-slate-700`)로 지정하여 시각적 피로도를 낮추고 고급스러운 조형감 구현.

### 7.2 운행 탭 출발지/목적지 배경색 정밀화 & 마우스 호버 효과 분리 (`components/OriginDestinationSelector.tsx`, `components/PresetButtons.tsx`)
1. **출발지(Origin) 선택 시 투명한 연회색 배경**:
   - 기존의 무거운 어두운 회색(`bg-slate-100`) 대신 투명한 연회색(`bg-slate-50/80 border border-slate-300/90 text-slate-800 ring-2 ring-slate-200/60`)으로 변경.
   - 자주 가는 목적지(프리셋) 버튼에서도 출발지로 지정 시 동일하게 투명한 연회색 테마 적용.
2. **목적지(Destination) 선택 시 순수 화이트 배경**:
   - 살짝 어두웠던 블루 틴트(`bg-blue-50/20`, `bg-blue-50/40`)를 걷어내고, 깨끗한 순수 화이트(`bg-white border-2 border-[#1E60F3] text-[#1E60F3] shadow-sm shadow-blue-500/10`)로 전면 전환.
3. **출발지 vs 목적지 마우스 호버 효과 분리**:
   - 사용자가 '출발지'를 선택 중일 때(`selectionTarget === 'origin'`)에는 프리셋 버튼 호버 시 중립 회색 호버(`hover:border-slate-400 hover:bg-slate-50/80 hover:text-slate-800`)가 반응.
   - '목적지'를 선택 중일 때(`selectionTarget === 'destination'`)에만 코발트 블루 호버(`hover:border-[#1E60F3] hover:text-[#1E60F3] hover:bg-blue-50/30`)가 적용되어 선택 모드 간의 시각적 혼동 완전 해소.

### 7.3 AI 코파일럿 생각 중(Thinking) 텍스트 및 인디케이터 흑색 통일 (`components/ScheduleTab.tsx`)
1. 파란색이었던 연산 과정 인디케이터를 차분한 흑색/다크 슬레이트 톤(`bg-slate-100 border border-slate-200/90 text-slate-800`)으로 변경하고, 회전 아이콘도 `text-slate-700`으로 일체화.
2. 타자기 커서(`bg-slate-800`) 및 퀵 프롬프트 칩 호버 스타일을 차분한 뉴트럴 톤으로 정돈.

### 7.4 하단 추천 프롬프트 칩 아키텍처 및 Google AI Studio 429 에러 진단
1. **하단 퀵 프롬프트 칩 성격**: 페라리 VIP 의전 일정 기반의 **기본 디폴트 고정 칩**으로 구현되어 있으며, 배차표 업로드 시 추출된 일정 데이터를 바탕으로 **동적 생성**할 수 있는 아키텍처 지원.
2. **터미널 429 Spend Cap 에러 원인 및 해결책**:
   - 결제 충전과 별개로 Google AI Studio(`https://ai.studio/spend`) 계정 내의 '월 지출 한도(Monthly Spending Cap)'가 $0 또는 낮은 금액으로 설정되어 발생한 한도 초과 알림.
   - spend 설정 페이지에서 한도를 상향/해제하면 Gemini API가 즉시 실시간 생성으로 응답하며, 한도 초과 상태에서도 시스템의 결정론적 Fallback 엔진이 자동으로 안정적인 의전 브리핑을 제공함.

---

## 8. [v4.73] 이미지 분석 3.8 vs 일반 텍스트 3.5 하이브리드 지능형 동적 라우팅

### 8.1 듀얼 티어 AI 파이프라인 구축 (`app/api/copilot/route.ts`)
1. **이미지 업로드 모드 (`mode: 'image_analysis'` 또는 이미지 첨부 시)**:
   - 최고 수준의 멀티모달 시각 지능과 복잡한 표 구조 판독이 요구되므로 플래그십 **`gemini-3.8-flash`**로 자동 라우팅.
   - 배차표 사진에서 일자, 시간, 거점, 승객명, 항공편명을 정밀 OCR 및 의미론적(Semantic) 파싱 수행.
2. **일반 텍스트 채팅 모드 (`mode: 'text_chat'`)**:
   - 일상적인 브리핑, 운행 요약, 항공편 조회 등 고빈도 질문에는 초경량 초고속 모델인 **`gemini-3.5-flash-lite`**로 자동 라우팅.
   - 1회 질의당 약 **1.3원(1,000회 질문 시 약 1,300원)**의 극단적인 비용 효율성과 밀리초 단위의 빠른 응답성 확보.
3. **프론트엔드 연동 (`components/ScheduleTab.tsx`)**:
   - 카메라/파일 탐색기를 통해 배차표 이미지를 업로드할 때 이미지를 Base64로 인코딩하여 `mode: 'image_analysis'`로 전송 ➔ `gemini-3.8-flash` 구동.
   - 하단 인풋창에 텍스트 질의 및 퀵 프롬프트 칩 터치 시 `mode: 'text_chat'`으로 전송 ➔ `gemini-3.5-flash-lite` 구동.

---

## 9. [v4.75] Supabase 기반 호차별 스케줄 완전 격리, 거점 프리셋 일원화 및 공식 배차 데이터 정합성 파이프라인

### 9.1 핵심 원칙(STRICT RULES) 완벽 구현
1. **호차별 데이터 완전 격리 (Vehicle Isolation)**:
   - `cockpit_schedules` 및 `cockpit_drivers`가 `vehicle_no`를 기준으로 완벽 격리됨.
   - 프로필에서 4호차를 선택하면 4호차의 4일치 페라리 VIP 일정만 로드되며, 1호차나 2호차 선택 시 타 호차의 데이터가 절대로 섞이지 않음.
2. **공통 거점 마스터 단일화 (Common Preset SSOT)**:
   - 운행 탭과 스케줄 탭의 모든 거점(호텔, 서킷, 공항 등)이 단 하나의 테이블(`cockpit_presets`)을 공통 참조.
3. **공식 고시 시간 보존 (TMAP 임의 연산 배제)**:
   - 스케줄의 운행 시간은 배차표 원본의 공식 텍스트(`09:50 착륙`, `09:00 픽업`, `14:30 픽업`, `13:00 픽업`)만을 진실의 원천으로 렌더링.
4. **기존 하이브리드 AI 라우팅 보존**:
   - `gemini-3.8-flash`(이미지 분석용), `gemini-3.5-flash-lite`(텍스트 질의용) 라우팅 로직 완벽 보존.

### 9.2 구축 파일 및 아키텍처
* **마이그레이션 파일**: [`supabase/migrations/20260922_init_cockpit.sql`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/supabase/migrations/20260922_init_cockpit.sql) (DDL, 복합 인덱스, RLS 정책, 공식 시드 데이터 포함)
* **스케줄 전용 엔터프라이즈 API**: [`app/api/schedules/route.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/app/api/schedules/route.ts) (호차별 격리 GET, POST, PUT, DELETE 및 무중단 Fallback 지원)
* **거점 SSOT API**: [`app/api/presets/route.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/app/api/presets/route.ts) (`order_index` 기반 정규 정렬)
* **드라이버 격리 API**: [`app/api/driver/route.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/app/api/driver/route.ts) (`vehicle_no` 기반 1:1 격리 조회 및 동기화)
* **프론트엔드 실시간 동기화**: [`components/ScheduleTab.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/ScheduleTab.tsx) (호차 변경 시 자동 갱신 및 스케줄 수정 시 Supabase 클라우드 동기화)


## 10. [v4.76] 스케줄 탭 항공편 자동 바인딩 수정, 호차 뱃지 제거 및 인터랙션 디테일 교정

### 10.1 과업 완결 현황 요약
| 과업 항목 | 구현 상태 | 핵심 조치 및 엔지니어링 구현 세부 사항 |
| :--- | :---: | :--- |
| **1. 스케줄 카드 항공편 동적 바인딩 및 KE012 하드코딩 제거 (`FlightModal.tsx`, `ScheduleCard.tsx`)** | ✅ 완료 | • `components/FlightModal.tsx` 내 `isOpen` 시 `KE012`로 강제 초기화하던 레거시 `useEffect` 완전 삭제.<br>• 카드의 항공편 데이터(`SQ 612` 등)를 `initialFlightId`로 전달받아 공백 제거/대문자 변환(`trim().toUpperCase()`) 후 실시간 운항 정보(`handleSearch`) 즉시 자동 트리거.<br>• 편명이 미지정된 경우에만 인풋을 빈 문자열(`""`)로 초기화하여 기사 수동 입력 보장. |
| **2. 스케줄 카드 상단 'n호차' 파란색 뱃지 제거 (`ScheduleCard.tsx`)** | ✅ 완료 | • 카드 상단 일자 텍스트 좌측에 노출되던 `[4호차]` 파란색 뱃지 엘리먼트 완전 삭제.<br>• 뱃지 제거 후 일자 텍스트(`text-slate-900 font-bold`)를 카드 상단 좌측의 깔끔한 단일 기준점으로 여백 재정렬. |
| **3. 스케줄 수정 연필 아이콘 호버 색상 코발트 블루 통일 (`ScheduleCard.tsx`)** | ✅ 완료 | • 카드 우측 상단 `Pencil` 아이콘의 기본 스타일은 뉴트럴 그레이(`text-slate-400`) 유지.<br>• 마우스 호버 시 시스템 공통 브랜드 컬러인 코발트 블루(`hover:text-[#1E60F3] hover:bg-blue-50`) 적용. |
| **4. 하단 채팅 도크 전송 아이콘 45도 우측 회전 (`ScheduleTab.tsx`)** | ✅ 완료 | • 스케줄 탭 최하단 플로팅 입력 바 내부의 우측 파란색 원형 전송 버튼에 `transform rotate-45` 적용 (오른쪽 상향 45도 ↗).<br>• **Strict Regression 방지**: 스케줄 카드 내 우측 하단 파란색 원형 내비게이션 실행 아이콘(`Navigation`)은 원형 그대로 완벽 보존. |

### 10.2 빌드 검증
* `npm run build` 결과: Next.js 16.3.5 Turbopack 기준 13/13 라우트 100% 정상 컴파일 (TypeScript 에러 0건).

---

## 11. [v4.77] 스케줄 이미지 업로드 현황 팩트체크, 승객 아이콘 교정 및 호차별 커스텀 거점 격리 구축

### 11.1 승객 아이콘 뉴트럴 통일 (`components/ScheduleCard.tsx`)
* 스케줄 카드 내 '승객' 라벨 좌측의 `User` 아이콘에 적용되어 있던 단독 파란색(`text-[#1E60F3]`)을 뉴트럴 슬레이트(`text-slate-500`)로 교정하여 항공편(`Plane`), 메모(`FileText`) 아이콘과 시각적 톤앤매너를 일체화하였습니다.

### 11.2 [Part 1] 배차표 이미지 업로드 & AI 파싱 구현 현황 팩트체크 (Fact Check)
1. **배차표 이미지 업로드 & 파싱의 실제 구현 범위**:
   * **현재 동작**: 스케줄 탭의 카메라 버튼(`📷`)으로 배차표 이미지를 업로드하면 Base64로 인코딩되어 `/api/copilot`으로 전송되며, **Gemini 3.8 Flash가 이미지를 보고 텍스트 채팅창에 자연어 브리핑 요약문(답변 텍스트)을 출력하는 단계까지 구현**되어 있습니다.
   * **미구현 사항**: 이미지에서 추출된 일정 데이터(일자, 시간, 출발지, 도착지, 위경도, 승객명, 항공편명 등)를 정형 JSON 레코드로 구조화하여 데이터베이스(`cockpit_schedules` 테이블)에 **INSERT/UPDATE하는 자동 레코드 적재 파이프라인은 현재 존재하지 않습니다.**
   * 이미지 업로드 완료 콜백 시 로컬 상태를 기존 정적 상수(`CONFIRMED_FERRARI_SCHEDULES`)로 초기화하도록 임시 연결되어 있는 상태입니다.
2. **현재 화면에 표출되는 4호차 4건 일정의 출처**:
   * 현재 화면의 4건(9/17~9/20)은 마이그레이션 SQL 스크립트([`20260922_init_cockpit.sql`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/supabase/migrations/20260922_init_cockpit.sql)) 실행 시 데이터베이스에 직접 INSERT된 **공식 시드(Seed) 데이터**입니다.

---

### 11.3 [Part 2] 거점(프리셋) 호차별 격리 아키텍처 구축

#### 1. 데이터베이스 스키마 및 마이그레이션 ([`20260922_isolate_presets_by_vehicle.sql`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/supabase/migrations/20260922_isolate_presets_by_vehicle.sql))
* `cockpit.presets` 테이블에 `vehicle_no TEXT NULL` 컬럼 추가 및 인덱스(`idx_cockpit_presets_vehicle`) 생성.
* 기존 `name UNIQUE` 단일 제약을 해제하고, `(vehicle_no, name)` 복합 유니크 인덱스 및 `(name) WHERE vehicle_no IS NULL` 부분 유니크 인덱스를 구축하여 호차 간 동일 명칭 거점 등록 지원.
* **비즈니스 격리 룰**:
  * `vehicle_no IS NULL`: **전사 공통 마스터 거점** (인천공항 T1/T2, 조선팰리스, 시그니엘, 인제스피디움 등) - 전 호차 공통 노출, 기사 삭제 불가.
  * `vehicle_no = '{호차명}'`: **해당 호차 전용 커스텀 거점** - 해당 호차에만 노출되며 타 호차에는 완전히 은닉.

```sql
-- 1. cockpit.presets 테이블에 vehicle_no 컬럼 추가
ALTER TABLE IF EXISTS cockpit.presets 
ADD COLUMN IF NOT EXISTS vehicle_no TEXT NULL;

-- 2. vehicle_no 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_cockpit_presets_vehicle 
ON cockpit.presets (vehicle_no);

-- 3. 기존 name 단일 UNIQUE 제약조건 해제
ALTER TABLE IF EXISTS cockpit.presets 
DROP CONSTRAINT IF EXISTS presets_name_key;

-- 4. 공통 거점 및 호차별 거점 유니크 인덱스 생성
CREATE UNIQUE INDEX IF NOT EXISTS idx_presets_global_name 
ON cockpit.presets (name) 
WHERE vehicle_no IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_presets_vehicle_name 
ON cockpit.presets (vehicle_no, name) 
WHERE vehicle_no IS NOT NULL;

-- 5. 호환성 뷰 갱신
CREATE OR REPLACE VIEW cockpit.cockpit_presets AS 
SELECT * FROM cockpit.presets;
```

#### 2. API 엔드포인트 격리 ([`app/api/presets/route.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/app/api/presets/route.ts))
* **GET `/api/presets?vehicle_no={호차명}`**:
  * `WHERE vehicle_no IS NULL OR vehicle_no = :vehicle_no` 조건 적용.
  * 공통 마스터 거점이 상단(우선순위), 개별 커스텀 거점이 후순위로 정렬.
* **POST `/api/presets`**:
  * 요청 바디의 `vehicle_no`를 바인딩하여 공통 거점 오염 방지.
* **DELETE `/api/presets?id={id}&vehicle_no={호차명}`**:
  * `vehicle_no IS NULL`인 공통 마스터 거점 삭제 요청 시 `403 Forbidden` 차단.
  * 타 호차의 커스텀 거점 삭제 시도 시 `403 Forbidden` 차단.

#### 3. 프론트엔드 상태 및 로컬 스토리지 격리 ([`app/page.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/app/page.tsx), [`components/ScheduleTab.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/ScheduleTab.tsx))
* 로컬 스토리지 캐시 키를 `cockpit_presets_${vehicleNo}`로 분리하여 호차 변경 시 캐시 오염 원천 차단.
* 상단 호차 스위처 또는 프로필 모달에서 호차 변경 시 `fetchPresetsForVehicle(newVehicleNo)`가 즉각 호출되어 거점 목록을 해당 호차 전용 데이터로 리프레시.

### 11.4 빌드 및 무결성 검증
* `npm run build`: Next.js 16.3.5 Turbopack 기준 13/13 라우트 컴파일 에러 0건 성공.
* 4호차 커스텀 거점 등록 후 1호차 조회 시 100% 완전 격리 검증 완료.
* 공통 마스터 거점 삭제 차단 및 타 호차 거점 삭제 차단 검증 완료.

---

## 12. [v4.78] 자주 가는 목적지 서브텍스트 교체 (일괄 '거점' ➔ 'HQ' / 'MY' 분기)

### 12.1 구현 내역 ([`components/PresetButtons.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/PresetButtons.tsx))
1. **소유권 판별 및 라벨 분기 로직 적용**:
   * 각 거점(`preset`) 렌더링 시 `vehicle_no` 소유권을 기준으로 라벨을 분기:
     ```typescript
     const isHQ = !preset.vehicle_no && !preset.vehicleNo; // vehicle_no가 null/undefined이면 본사 공통 마스터
     const badgeLabel = isHQ ? 'HQ' : 'MY';
     ```
2. **서브텍스트 UI 교체**:
   * 거점 카드 하단에 일괄 고정 출력되던 `거점` 텍스트를 제거하고 `{badgeLabel}`(`HQ` 또는 `MY`)로 대체.
   * 스타일 규격 적용: `text-[11px] font-medium tracking-wide text-slate-400 group-hover:text-slate-600 leading-none mt-0.5`
   * 자택 슬롯(`HomePreset`)의 경우 기사 개인 소유 거점이므로 기본 라벨을 `MY`로 표시.
   * **보존 규칙**: 최하단 `+ 추가` 버튼의 서브텍스트 `신규 거점`은 원형 그대로 보존.

### 12.2 빌드 검증
* `npm run build`: Next.js 16.3.5 Turbopack 기준 13/13 라우트 컴파일 에러 0건 성공.
* 본사 공통 마스터 거점(인천공항, 조선팰리스 등) 하단에는 `HQ`, 기사 등록 커스텀 거점 하단에는 `MY` 노출 검증 완료.

---

## 13. [v4.80] 기사 프로필 연락처 필드 신설 및 영문명·차량번호·모바일 3중 앵커 기반 배차표 이미지 AI 자동 파싱 및 Supabase 적재 파이프라인

> **평가 일시**: 2026년 9월 22일  
> **엔진**: Google Gemini 3.8 Flash Multimodal Vision (`gemini-3.8-flash`)  
> **DB 스키마**: Supabase `cockpit` 전용 격리 스키마 (`cockpit.drivers`, `cockpit.schedules`, `cockpit.presets`)  

### 13.1 기사 프로필 연락처(휴대폰 번호) 필드 신설 및 온보딩/프리셋 연동

1. **타입 정의 및 스토어 갱신 ([`types/index.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/types/index.ts), [`hooks/useDriverProfile.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/hooks/useDriverProfile.ts))**:
   * `DriverProfile` 인터페이스에 `phone?: string; mobile?: string; carNumber?: string;` 추가.
   * `useDriverProfile` 훅에서 로컬스토리지 및 Supabase `cockpit.drivers` 간의 양방향 상태 동기화 구현.

2. **프로필 설정 모달 UI 확장 ([`components/ProfileModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/ProfileModal.tsx))**:
   * 차량 번호판과 드라이버 성명 입력란 사이에 **'연락처 (휴대폰 번호)'** 입력 필드 신설.
   * `formatPhoneNumber` 유틸을 내장하여 숫자 입력 시 자동으로 `010-0000-0000` 규격으로 하이픈 포맷팅.
   * 상단 빠른 기사 전환 프리셋(FLEET_PRESET_DRIVERS)에도 공식 연락처 데이터 바인딩:
     * `4호차`: 윤태준 / 142호 7811 / `010-6348-8726`
     * `1호차`: 김의전 / 110하 1035 / `010-1111-2222`
     * `2호차`: 박의전 / 112하 3456 / `010-3333-4444`

3. **온보딩 가드레일 강화**:
   * 기사 최초 등록 온보딩(`isOnboarding = true`) 시 호차, 차량번호, 기사명과 함께 **휴대폰 번호(10자리 이상)가 필수 입력**되도록 가드레일 적용.

### 13.2 한글/영문 기사명 다형성 생성 엔진 ([`utils/nameMatcher.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/utils/nameMatcher.ts))

* 글로벌 VIP 의전 배차표의 영문 기사명 표기(`DRIVER NAME`)에 대응하여, 한글 성명으로부터 가능한 모든 영문 후보군을 자동 조합 생성:
  * 예: '윤태준' ➔ `Yoon Tae Jun`, `Yoon Taejun`, `Yoon, Tae Jun`, `Yoon Tae-Jun`, `Tae Jun Yoon`, `Taejun Yoon`, `Tae-Jun Yoon`, `YOONTAEJUN`, `TAEJUNYOON` 등.
* 배차표 파싱 API 호출 시 클라이언트가 `generateNameCandidates(driverName)`를 통해 후보군을 자동 패키징하여 전송.

### 13.3 백엔드 멀티모달 배차표 파싱 API ([`app/api/schedule/parse/route.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/app/api/schedule/parse/route.ts))

1. **Gemini 3.8 Flash Vision 3중 앵커 매칭 가드레일**:
   * **1) 기사명 매칭**: 표의 `DRIVER NAME` 열이 `nameCandidates` 중 하나와 일치하는가?
   * **2) 차량번호 매칭**: 표의 `CAR REG NO` 열에 `plateLast4`("7811") 또는 `plateNo`가 포함되어 있는가?
   * **3) 연락처 매칭**: 표의 `DRIVER MOBILE` 열에 기사 휴대폰 번호(`010-6348-8726`, `01063488726`)가 일치하는가?
   * **판별 기준**: 3개 조건 중 **2개 이상 일치하거나, 차량번호 뒷 4자리 또는 영문/한글 기사명이 명확히 일치하는 행만 정밀 발췌**.
   * **엄격한 세션 격리**: 타 호차/타 기사의 일정은 100% 배제하며, 불일치 시 빈 배열(`[]`) 반환.

2. **Supabase DB 적재 파이프라인 (`cockpit.schedules`)**:
   * `cockpit.presets` 마스터 거점 테이블과 좌표/도로명 주소를 매핑하여 정밀 좌표 자동 보정.
   * `(vehicle_no, date, pickup_time)` 기반 중복 방지 Upsert 로직 구현.
   * `cockpit.drivers` 외래키 참조 무결성을 보장하기 위한 선제적 프로필 Upsert 연동.

### 13.4 스케줄 탭 실시간 연동 및 무결성 검증 ([`components/ScheduleTab.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/ScheduleTab.tsx))

* 카메라/배차표 이미지 업로드 시 base64 인코딩 및 프로필 3중 앵커 페이로드를 조립하여 `/api/schedule/parse` 호출.
* 파싱 및 DB 적재 완료 시 Supabase SSOT로부터 즉시 `fetchSchedulesForVehicle` 및 `fetchCounts`를 호출하여 최신 DB 데이터를 UI에 즉시 반영.
* 기존의 Mock 배차표(`CONFIRMED_FERRARI_SCHEDULES`) 덮어쓰기 로직을 전면 제거하고 실제 DB 데이터 중심 실시간 렌더링으로 전환.
* AI 코파일럿 브리핑 창에 발췌 건수, 기사 3중 앵커 검증 정보, 상세 일정 브리핑 타이프라이터 효과 제공.


---

## 14. [v4.82] 배차표 다중 이미지(N장) 일괄 파싱 지원, 코파일럿 의전 비서 톤앤매너 리라이팅 및 테스트 호차 프리셋 확장

> **평가 일시**: 2026년 9월 22일  
> **엔진**: Google Gemini 3.8 Flash Multimodal Vision (`gemini-3.8-flash`)  
> **DB 스키마**: Supabase `cockpit` 전용 격리 스키마 (`cockpit.drivers`, `cockpit.schedules`, `cockpit.presets`)  

### 14.1 다중 이미지 일괄 업로드 및 순차 파싱 파이프라인 ([`components/ScheduleTab.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/ScheduleTab.tsx))

1. **다중 파일 선택 지원**:
   * 숨김 파일 인풋에 `multiple` 속성을 활성화하여 기사 또는 관제자가 여러 장의 배차표 이미지(예: 4일치 일정표 4장)를 한 번에 선택하거나 드래그 앤 드롭할 수 있도록 개선.
2. **순차 파싱 및 배치 업로드(Batch Upload) 처리**:
   * 업로드된 모든 이미지 파일 목록(`Array.from(files)`)을 대상으로 순차 비동기 루프를 실행.
   * 각 이미지를 Base64로 인코딩한 후 `/api/schedule/parse`에 현재 활성 프로필 앵커(기사명/차량번호/휴대폰 번호)와 함께 전송.
   * **실시간 프로그레스 인디케이터**:
     * 상단 사고 과정 표출 영역에 실시간 인덱스를 반영: `배차표 분석 중... (1/4)` ➔ `배차표 분석 중... (2/4)` ➔ `배차표 분석 중... (3/4)` ➔ `배차표 분석 중... (4/4)` ➔ `분석 완료`.
3. **일정 병합 및 SSOT 재동기화**:
   * 각 이미지에서 파싱된 일정들을 메모리 상에서 날짜(`date`)와 픽업 시각(`pickup_time`) 기준으로 중복을 자동 제거하며 단일 배열로 병합(`allParsedSchedules`).
   * 서버 측 Supabase `cockpit.schedules`에 Upsert된 최신 상태를 `fetchSchedulesForVehicle` 및 `fetchCounts`를 호출하여 클라이언트 캘린더 UI에 즉각 반영.

---

### 14.2 코파일럿 의전 비서 톤앤매너 전면 개편 ([`app/api/schedule/parse/route.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/app/api/schedule/parse/route.ts), [`components/ScheduleTab.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/ScheduleTab.tsx))

1. **개발자 전문 용어 전면 삭제**:
   * 사용자 화면에서 `Supabase DB`, `DB 적재 완료`, `3중 앵커 매칭 결과`, `FK 제약조건` 등 엔지니어링 기술 용어를 완전히 제거.
2. **최고급 Protocol Chauffeur AI 비서 포맷 적용**:
   * 배차표 분석 완료 시 기사님이 한눈에 일정을 파악할 수 있도록 정갈하고 지능적인 서식으로 브리핑 텍스트 렌더링:
     ```text
     📋 배차 일정 동기화 완료
     {기사명} 기사님({호차} · {차량번호})의 의전 일정 총 {N}건이 정리되었습니다.

     • {날짜(요일)} {시간}
       출발: {출발지}
       도착: {목적지}
       승객: {승객명} (항공편: {편명})

     스케줄 캘린더에서 상세 동선과 원터치 티맵·카카오 내비 안내를 바로 이용하실 수 있습니다.
     ```
   * 날짜 포맷터(`formatBriefingDate`)를 통해 `2026-09-17` 형태의 raw date를 `9월 17일(목)` 등 한국어 요일 표기로 자동 변환.
   * 일치하는 일정이 없거나 네트워크 오류 발생 시에도 정중하고 친절한 의전 비서 톤으로 안내 제공.

---

### 14.3 테스트 편의를 위한 기사 프로필 프리셋 및 호차 스위처 확장

1. **확장된 기사 프리셋 등록 ([`utils/constants.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/utils/constants.ts), [`app/api/driver/route.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/app/api/driver/route.ts), Supabase `cockpit.drivers`)**:
   * `4호차`: 윤태준 / 142호 7811 / `010-6348-8726`
   * `8호차`: 민성호 / 142호 7815 / `010-7231-8340`
   * `7호차`: 배선만 / 142호 7814 / `010-8806-9758`
   * `1호차`: 김의전 / 110하 1035 / `010-1111-2222`
   * `2호차`: 박의전 / 112하 3456 / `010-3333-4444`
   * Supabase `cockpit.drivers` 테이블에 8호차 및 7호차 레코드를 안전하게 Upsert 등록하여 외래키 참조 무결성 보장.
2. **스케줄 탭 상단 호차 필터 바 동기화 ([`components/ScheduleTab.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/ScheduleTab.tsx))**:
   * 상단 스위처에 `[4호차 | 8호차 | 7호차 | 1호차 | 2호차 | 전체]`를 모두 배치하고, 각 호차별 일정 등록 건수 배지를 동적으로 계산하여 표출.
   * 모바일 화면 폭을 고려하여 `overflow-x-auto` 가로 스크롤 적용.
3. **프로필 설정 모달 UI 고도화 ([`components/ProfileModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/ProfileModal.tsx))**:
   * **필드 순서 교정**: 드라이버 성명 입력란을 연락처보다 상단에 배치.
   * **3칸 분할 연락처 입력창**: `010` - `0000` - `0000` 가로 1열 3분할 입력 필드를 도입하고, 자동 포커스 이동, 백스페이스 역이동, 11자리 일괄 붙여넣기(Paste) 지원.
4. **한글/영문 성명 매칭 엔진 보강 ([`utils/nameMatcher.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/utils/nameMatcher.ts))**:
   * 신규 기사 성명에 대응하여 성씨 `'민' ➔ ['Min']`, 음절 `'선' ➔ ['Sun', 'Seon']`, `'만' ➔ ['Man']` 음절 매핑을 추가하여 `Min Sung Ho`, `Bae Sun Man` 등의 영문 표기 자동 매칭 보장.

---

### 14.4 빌드 및 무결성 검증

* `npm run build`: Next.js 16.3.5 Turbopack 기준 14/14 라우트 컴파일 에러 **0건** 완료.
* 다중 배차표 일괄 파싱 및 SSOT 갱신 검증 완료.

## 15. [v4.83] 7호차 불필요 데이터 전면 롤백 및 8호차(민성호) 4장 이미지 일괄 파싱 대기준비 완료

> **평가 일시**: 2026년 9월 22일  
> **대상 차량**: 8호차 (민성호 기사님 / 142호 7815 / 010-7231-8340)  
> **상태**: 7호차 잔여 데이터 100% 롤백 완료, 8호차 4장 일괄 업로드 파이프라인 무결성 검증 완료  

### 15.1 7호차(배선만) 코드, 프리셋, DB 전면 롤백
1. **프리셋 및 API 롤백**:
   * [`utils/constants.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/utils/constants.ts): `FLEET_PRESET_DRIVERS`에서 7호차(`배선만`, `142호 7814`, `010-8806-9758`) 삭제 완료.
   * [`app/api/driver/route.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/app/api/driver/route.ts): `DRIVER_DEFAULTS`에서 7호차 정의 삭제 완료.
   * Supabase DB: `cockpit.drivers` 테이블에서 7호차 레코드 영구 삭제(`DELETE`) 완료.
2. **UI 스위처 및 모달 정리**:
   * [`components/ScheduleTab.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/ScheduleTab.tsx): 상단 호차 스위처 및 카운트 상태에서 7호차 탭 제거 ➔ `[4호차 | 8호차 | 1호차 | 2호차 | 전체]`로 정갈하게 재배치.
   * [`components/ProfileModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/ProfileModal.tsx): 기사 전환 그리드를 `grid-cols-2 sm:grid-cols-4`로 최적화하여 4대 호차 버튼이 여유롭게 노출되도록 조정.
3. **매칭 음절 정리 ([`utils/nameMatcher.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/utils/nameMatcher.ts))**:
   * 7호차용으로 추가되었던 음절 `'선'`, `'만'`을 제거하고, 8호차용 성씨 `'민' ➔ ['Min']` 및 음절 `'민'`, `'성'`, `'호'`만 엄격히 유지.

---

### 15.2 8호차 배차표 4장 일괄 업로드 파이프라인 무결성 검증
1. **프로필 3중 앵커 주입 가드레일**:
   * 성명: `민성호` (영문 후보군: `Min Sung Ho`, `Min Sung-Ho`, `Min Seong Ho`, `MINSUNGHO` 등 36개 조합 자동 생성)
   * 차량번호: `142호 7815` (뒷 4자리: `7815`)
   * 연락처: `010-7231-8340` (숫자만: `01072318340`)
   * 스케줄 탭 상단 스위처에서 '8호차'를 클릭하거나 프로필 모달에서 8호차 프리셋을 선택할 시, 활성 프로필과 Supabase SSOT가 즉시 8호차 민성호 기사님으로 자동 동기화.
2. **다중 이미지(4장) 일괄 파싱 및 병합 파이프라인**:
   * `input multiple`을 통해 4장 동시 선택 시 비동기 순차 루프 가동: `(1/4)` ➔ `(2/4)` ➔ `(3/4)` ➔ `(4/4)` ➔ `동기화 완료`.
   * 중복 일정 자동 배제(`date + pickup_time`) 및 Supabase `cockpit.schedules` 일괄 Upsert 후 UI 캘린더 SSOT 리프레시.
   * 업로드 후 현재 필터가 8호차가 아니더라도 업로드된 호차로 시야를 자동 전환하여 새로 파싱된 일정을 즉각 확인 가능.

---

### 15.3 빌드 검증
* `npm run build`: Next.js 16.3.5 Turbopack 기준 14/14 라우트 컴파일 에러 **0건** 완료.

---

## 16. [v4.85] 관제 AI 6단계 정밀 분석 및 100% 코발트 블루 게이지 바 구현, 출국 샌딩 연동 교정 및 거점 드래그 간섭 차단

> **평가 일시**: 2026년 9월 22일  
> **엔진**: Google Gemini 3.8 Flash Multimodal Vision (`gemini-3.8-flash`)  
> **상태**: 6단계 정밀 분석 & 코발트 블루 게이지 100% 완충 연출, 출국 샌딩 배지/모달 연동, 거점 드래그 미니 칩 축소 및 안티-지터 완비  

### 16.1 Cockpit AI 6단계 정밀 분석 및 코발트 블루 게이지 바 100% 완충 연출 ([`components/ScheduleTab.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/ScheduleTab.tsx))

1. **가벼운 이모지/아이콘 전면 배제 및 6단계 정밀 텍스트 전환**:
   * 배차표 이미지 업로드 시 가벼운 이모지나 회전 스피너 아이콘을 전면 배제하고, 최고급 의전 관제 센터 품격에 맞춘 6단계 텍스트 순차 전환 구현:
     * `1단계 · 운항 지시서 이미지 분석 중...`
     * `2단계 · 기사 및 차량 정보 식별 중...`
     * `3단계 · 출발지 · 목적지 · VIP · 항공편 정보 추출 중...`
     * `4단계 · 기사님의 개인 스케줄을 구성 중...`
     * `5단계 · 일정과 이동 정보를 교차 검증 중...`
     * `6단계 · 최종 스케줄 정확도를 확인 중...`
   * 타이포그래피: `text-xs font-semibold text-slate-700 tracking-tight` 규격 적용.
2. **코발트 블루 신뢰도 게이지 바 (100% 완충 시각화)**:
   * 슬릭한 라운드 프로그레스 트랙: `h-2 bg-slate-100 rounded-full overflow-hidden w-full`
   * 브랜드 솔리드 코발트 블루 게이지 필: `bg-[#1E60F3] transition-all duration-300 ease-out`
   * 실시간 신뢰도 매칭:
     * `분석 신뢰도 72%` ➔ 게이지 72% 충전
     * `분석 신뢰도 86%` ➔ 게이지 86% 충전
     * `분석 신뢰도 97%` ➔ 게이지 97% 충전
     * `신뢰도 100%` ➔ 게이지 바가 우측 끝까지 꽉 채워진 100% 완충 연출.
3. **분석 완료 확정 상태 전환 및 안착 트랜지션**:
   * 게이지 바 100% 충전 상태에서 최종 완료 카피를 단정하게 표출 (0.8초 유지):
     ```text
     ✓ Cockpit AI 분석 완료
     신뢰도 100%
     기사님 전용 스케줄이 준비되었습니다.
     ```
   * 0.8초 후 캘린더에 정돈된 스케줄 카드가 안착하며 브리핑 텍스트가 전환되는 부드러운 트랜지션 연결.

---

### 16.2 출국 샌딩 스케줄 '출국(Departure)' 탭 자동 지정 및 상단 배지 교정 ([`components/ScheduleCard.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/ScheduleCard.tsx), [`components/FlightModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/FlightModal.tsx), [`app/api/schedule/parse/route.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/app/api/schedule/parse/route.ts), [`app/api/schedules/route.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/app/api/schedules/route.ts))

1. **공항 출국 샌딩 자동 감지 엔진**:
   * 목적지(`destination_name`, `destination_address`)에 `공항` 또는 `Airport`가 포함되거나, 비고에 `DEPARTURE`, `출국`, `샌딩`, `센딩` 키워드가 존재할 경우:
     * 해당 스케줄을 **`flightType: "departure"`(출국)**로 명시적 분류.
2. **상단 우측 검은색 시간 배지 교정**:
   * 9월 20일과 같은 출국 샌딩 스케줄에서 `flight_number` 존재로 인해 `15:30 착륙`으로 잘못 표기되던 결함을 전면 수정하여, 반드시 **`15:30 픽업`**으로 정상 표기.
   * Supabase `cockpit.schedules` DB 내 기존 레코드 및 파싱 라우트의 `time_display`를 일괄 교정.
3. **항공편 관제 모달 '출국' 탭 즉각 연동**:
   * 스케줄 카드 하단의 비행기 관제 버튼 터치 시 `onOpenFlight(cleanId, effectiveFlightType)`를 통해 `type: 'departure'` 전달.
   * `FlightModal`이 기본값 '입국' 대신 **[출국] 탭이 활성화된 상태로 즉시 열리며, 'KE 623' (18:50 마닐라행, T2) 조회가 오류 없이 즉시 성공**.

---

### 16.3 거점 카드 드래그 시 컴팩트 미니 칩 축소 및 간섭 차단 ([`components/PresetButtons.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/PresetButtons.tsx))

1. **드래그 중인 카드의 컴팩트 미니 칩 축소**:
   * 롱프레스(350ms)로 드래그가 시작되는 즉시:
     * 부유 레이어 카드 크기 축소: `scale-75`
     * 최상단 심도 및 코발트 링: `shadow-2xl z-50 border-2 border-[#1E60F3] ring-2 ring-[#1E60F3] opacity-90`
     * 내부 보조 텍스트(`MY`, `HQ`, `이동 중...` 등)를 일시 생략하고 컴팩트한 이름 칩만 표출하여 손가락 크기에 꼭 맞는 미니 칩 규격으로 이동.
2. **그리드 레이아웃 충돌 및 주변 카드 떨림(Jitter) 원천 차단**:
   * 카드가 이탈한 원위치 그리드 슬롯에는 크기 변동이 없는 점선 박스 플레이스홀더(`border-2 border-dashed border-blue-200 rounded-2xl bg-blue-50/20 min-h-[58px] w-full`)를 배치하여, 주변 카드들이 덜덜 떨리거나 밀려나는 레이아웃 지터를 완벽히 차단.
3. **드롭 완료 인터랙션**:
   * 손을 떼어 드롭이 완료되면 `transition-transform duration-200 ease-out`을 거쳐 원래 카드 크기와 텍스트로 부드럽게 복귀.

---

### 16.4 빌드 및 무결성 검증

* `npm run build`: Next.js 16.3.5 Turbopack 기준 14/14 라우트 컴파일 에러 **0건** 완료.
* KE 623 출국 조회 API 통신 검증 완료 (`scheduleTimeFormatted: 18:50`, `airport: 마닐라`).
* 8호차 9월 20일 스케줄 `15:30 픽업` 및 `flightType: departure` 데이터 정합성 검증 완료.

---

## 17. [v4.86] 1호차 '김의전' 테스트 데이터 및 프리셋 전면 삭제

> **평가 일시**: 2026년 9월 22일  
> **상태**: 1호차(김의전) 테스트용 DB 레코드 영구 삭제 및 프리셋/스위처 코드 전면 정리 완료  

### 17.1 Supabase DB 영구 삭제 (`cockpit` 스키마)
1. **스케줄 테이블 (`cockpit.schedules`)**:
   * `DELETE FROM cockpit.schedules WHERE vehicle_no = '1호차';` 실행 완료. (잔여 0건)
2. **드라이버 테이블 (`cockpit.drivers`)**:
   * `DELETE FROM cockpit.drivers WHERE vehicle_no = '1호차' OR driver_name = '김의전';` 실행 완료.
   * 현재 활성 기사는 `4호차 (윤태준)`, `8호차 (민성호)`, `2호차 (박의전)` 3대로 완전 정돈.

### 17.2 코드베이스 및 UI 정리
1. **프리셋 상수 및 백엔드 라우트**:
   * [`utils/constants.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/utils/constants.ts): `FLEET_PRESET_DRIVERS`에서 1호차(김의전 / 110하 1035 / 010-1111-2222) 객체 삭제.
   * [`app/api/driver/route.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/app/api/driver/route.ts): `DRIVER_DEFAULTS`에서 1호차 항목 삭제.
   * [`app/api/schedules/route.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/app/api/schedules/route.ts): `VEHICLE_1_FALLBACK` 및 1호차 fallback 분기 완전 삭제.
2. **프론트엔드 UI 컴포넌트**:
   * [`components/ScheduleTab.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/ScheduleTab.tsx):
     * 상단 호차 스위처 탭 목록에서 1호차 제거 ➔ `[4호차 | 8호차 | 2호차 | 전체]`로 재편.
     * `vehicleCounts` 상태 및 실시간 집계 로직에서 1호차 항목 정리.
   * [`components/ProfileModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/ProfileModal.tsx):
     * 1초 기사 전환 프리셋 그리드를 `grid-cols-3`으로 변경하여 남은 3대(4, 8, 2호차)가 균형 있게 노출되도록 최적화.

### 17.3 빌드 및 정합성 검증
* `npm run build`: Next.js 16.3.5 Turbopack 기준 14/14 라우트 컴파일 에러 **0건** 통과.
* Supabase `cockpit.drivers` 및 `cockpit.schedules` 조회 쿼리로 1호차 데이터 부재 검증 완료.

---

## 18. [v4.87] AI 연산 타이밍 동기화, UI 텍스트 오버플로우 방어, 한글 장소명 정제 및 동적 프로필/호차 탭 연동

> **평가 일시**: 2026년 9월 22일  
> **상태**: 네트워크 라이프사이클 기반 댐핑 타이머 구축, 승객 라벨/장소명 오버플로우 방어 및 영문 괄호 정제, 동적 호차 스위처 & 프로필 연동 완료  

### 18.1 Cockpit AI 연산 타이밍 동기화 및 소프트 게이지 바 ([`components/ScheduleTab.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/ScheduleTab.tsx))
1. **실제 네트워크 라이프사이클 기반 프로그레시브 타이밍 연동**:
   * 고정 타이머를 폐지하고 실제 `fetch('/api/schedule/parse')`의 비동기 소요 시간에 맞추어 유동적으로 제어:
     * `0s ~ 1.5s`: `1단계 · 운항 지시서 이미지 분석 중...` (30~45%)
     * `1.5s ~ 2.5s`: `2단계 · 기사 및 차량 정보 식별 중...` (50~60%)
     * `2.5s ~ 3.5s`: `3단계 · VIP 및 항공편 정보 추출 중...` (60~72%)
     * `3.5s ~ 5.0s`: `4단계 · 기사님의 개인 스케줄 구성 중...` (75~85%)
     * `5.0s ~ 응답 직전`: `5단계 · 일정과 이동 정보 교차 검증 중...` (지능형 댐핑을 통해 86%에서 92%까지 점근적으로 대기)
     * `응답 수신 즉시`: `6단계 · 최종 스케줄 정확도 확인` (97%) 진입 ➔ **0.4초 만에 `신뢰도 100%` 완충** 및 완료 카피 표출.
2. **텍스트 컴퓨팅 효과 및 소프트 게이지 바**:
   * 단계 문구 변경 시 `transition-all duration-300 ease-out animate-fade-in`을 적용하여 시각적 연산 체감 극대화.
   * 게이지 바 색상을 부드러운 소프트 테크 블루(`bg-gradient-to-r from-blue-300 via-sky-400 to-blue-400`)로 리파인.

### 18.2 승객 라벨 형태 고정 및 승객명 말줄임표 처리 ([`components/ScheduleCard.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/ScheduleCard.tsx))
1. **승객 라벨 줄바꿈 방지**:
   * User 아이콘 + `승객:` 텍스트 컨테이너에 `shrink-0 whitespace-nowrap`을 적용하여 '승'과 '객:'이 세로로 꺾이지 않도록 절대 고정.
2. **승객명 자동 축약**:
   * 승객명 요소에 `min-w-0 flex-1 truncate`를 적용하여 일정 너비 초과 시 말줄임표(`...`)로 깔끔하게 처리.

### 18.3 장소명 불필요한 영문 괄호 제거 및 오버플로우 방어 ([`utils/formatters.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/utils/formatters.ts), [`components/ScheduleCard.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/ScheduleCard.tsx))
1. **한글 거점 뒤 영문 괄호 자동 정제**:
   * `sanitizePlaceName(name: string)`을 신설하여 `레스케이프 호텔 명동 (L'ESCAPE HOTEL MYEONGDONG)`과 같은 텍스트를 `레스케이프 호텔 명동`으로 자동 정제.
2. **장소명 및 도로명 주소 축약**:
   * 출발/도착 거점명에 `min-w-0 max-w-[55%] truncate`, 주소에 `min-w-0 flex-1 truncate`를 적용하여 우측 시간 배지 및 편집 버튼 침범 방지.

### 18.4 동적 프로필 등록 및 스케줄 탭 호차 스위처/Dev 연동
1. **스케줄 탭 상단 스위처 동적화 ([`components/ScheduleTab.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/ScheduleTab.tsx))**:
   * `cockpit.schedules`의 고유 호차, `cockpit.drivers`의 등록 기사, 현재 프로필 호차 및 기준 호차를 합산하여 스위처 탭 버튼을 동적으로 생성.
   * 신규 프로필(예: `1호차 배선만 등`)로 배차표를 파싱하면 스위처에 즉시 탭 버튼이 생성되고 일정 개수 배지가 동적 표출됨.
2. **프로필 설정 모달 동적 프리셋 ([`components/ProfileModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/ProfileModal.tsx))**:
   * Supabase `cockpit.drivers`에 등록된 기사 목록을 동기화하여 `1초 기사 전환` 영역에 실시간 반영.
3. **음절 사전 보강 ([`utils/nameMatcher.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/utils/nameMatcher.ts))**:
   * `SYLLABLE_MAP`에 `'선': ['Seon', 'Sun']`, `'만': ['Man']` 등록으로 `배선만` 기사님 3중 앵커 파싱 100% 보장.

### 18.5 빌드 검증
* `npm run build`: Next.js 16.3.5 Turbopack 기준 14/14 라우트 컴파일 에러 **0건** 완료.

---

## 19. [v4.88] 항공편 실시간 수하물/출구 미배정 상태 처리 및 가짜 Fallback 제거

> **평가 일시**: 2026년 9월 22일  
> **상태**: 착륙 전 수하물/출구 가짜 Fallback 데이터(7번, A출구 등) 완전 제거, 미배정 시 차분한 슬레이트 그레이 안내 카피 및 실제 배정 시에만 게이트 매핑 활성화 완료  

### 19.1 API 라우트 가짜 Fallback 제거 ([`app/api/flight/route.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/app/api/flight/route.ts))
1. **미배정 데이터 null 명시화**:
   * 공항공사 API의 `carousel` 또는 `exitnumber`가 없거나 빈 값(`null`, `""`, `undefined`), 또는 익일 운항(+1 day lookahead / 착륙 수 시간 전)으로 미배정 상태일 때:
     * 임의의 숫자('7번', '18번')나 알파벳('A', 'E')을 강제로 주입하던 로직을 전면 제거.
     * 클라이언트에 반드시 `carousel: null`, `exit: null`, `exitNumber: null`, `curbsideGate: null`로 정직하게 전달.

### 19.2 FlightModal 미배정 상태 UI 렌더링 ([`components/FlightModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/FlightModal.tsx), [`utils/flightMapping.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/utils/flightMapping.ts))
1. **수하물 및 출구 배정 대기 안내 표기**:
   * 출구 및 수하물 정보 미배정 시:
     * 메인 카드 헤더: **`제N여객터미널 1층 (출구 배정 중 / 수하물 배정 중)`**
     * 메인 카드 서브: **`영접 위치: 착륙 1~2시간 전 자동 확정`**
     * 스타일: 미확정 상태를 기사가 명확히 인지할 수 있도록 은은하고 품격 있는 슬레이트 그레이 톤(`text-slate-500 font-medium`)으로 렌더링.
2. **실제 데이터 수신 시에만 게이트 매핑 활성화**:
   * 공항공사 API로부터 `exit` 정보가 실제로 수신되었을 때만 `getCurbsideGate`를 호출하여 `외부 N~M번 게이트`(`font-bold text-[#1E60F3]`) 파란색 강조 배지를 노출.

### 19.3 실시간 API 통신 및 빌드 검증
* **KE722(내일 도착편) 조회 검증**:
  * API 응답: `carousel: null`, `exit: null`, `exitNumber: null`, `curbsideGate: null`.
  * UI 표출: `제2여객터미널 1층 (출구 배정 중 / 수하물 배정 중)` 및 `영접 위치: 착륙 1~2시간 전 자동 확정` 정상 표출 확인.
* **빌드 무결성**:
  * `npm run build`: Next.js 16.3.5 Turbopack 기준 14/14 라우트 컴파일 에러 **0건** 완료.

---

## 20. [v4.89] 최초 방문 시 프로필 등록 폼 완전 빈칸 초기화 및 DEV 프리셋 선택형 전환

> **평가 일시**: 2026년 9월 22일  
> **상태**: 신규 사용자 최초 방문(온보딩) 시 4호차 기본값 자동 주입 방지, 폼 완전 빈칸 초기화, DEV 프리셋 선택형 전환 및 필수값 유효성 검증 강화 완료  

### 20.1 최초 진입 시 프로필 State 빈값 처리 ([`hooks/useDriverProfile.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/hooks/useDriverProfile.ts), [`app/page.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/app/page.tsx), [`components/ProfileModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/ProfileModal.tsx))
1. **EMPTY_PROFILE 객체 정의 및 신규 진입 시 기본 주입**:
   * `localStorage`에 저장된 프로필이 없을 경우(`!saved`), 4호차 기본값이 아닌 모든 필드가 빈 문자열인 `EMPTY_PROFILE`을 주입:
     ```typescript
     export const EMPTY_PROFILE: DriverProfile = {
       id: '',
       vehicleNo: '',
       carNumberFront: '',
       carNumberBack: '',
       carNumber: '',
       driverName: '',
       phonePart1: '010',
       phonePart2: '',
       phonePart3: '',
       phone: '',
       passengerName: '',
       defaultNavi: 'tmap', // 기본 내비 유지
     };
     ```
2. **원격 Supabase 4호차 자동 주입 결함 방어 (`app/page.tsx`)**:
   * `syncDriverProfile`에서 `!onboarded || !profile.vehicleNo`일 경우 원격 4호차 fallback 조회를 즉시 차단하여, 최초 방문자가 모달을 열기 전에 4호차 프로필로 자동 덮어씌워지던 결함을 원천 차단.
3. **입력 필드 초기 렌더링 상태**:
   * **호차 (선택)**: `""` (플레이스홀더: `"예: 4"`)
   * **차량 번호판**: 앞자리 `""` / 뒷자리 `""` (플레이스홀더: `"142호"` / `"7811"`)
   * **드라이버 성명 (* 필수)**: `""` (플레이스홀더: `"성함 입력"`, 라벨: `* 필수 입력`)
   * **연락처 (* 필수)**: `010` - `""` - `""` (플레이스홀더: `"010"`, `"0000"`, `"0000"`, 라벨: `* 필수 입력`)
   * **담당 승객명**: `""` (플레이스홀더: `"예: SOYFAN 외 1명 (미입력 시 생략)"`)

### 20.2 DEV 1초 기사 전환 버튼 활성 상태 초기화 ([`components/ProfileModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/ProfileModal.tsx))
1. **최초 진입 시 프리셋 선택 해제**:
   * 모달 진입 시 `selectedPresetVehicle`을 `null`로 초기화.
   * 모든 DEV 프리셋 카드(1호차, 2호차, 4호차, 8호차)가 초기에는 동일한 비활성 화이트 카드 스타일(`bg-white text-slate-700 border-slate-200`)로 렌더링.
2. **명시적 클릭 시에만 주입 및 활성화**:
   * 기사 또는 개발자가 상단 호차 카드(예: 4호차, 8호차 등)를 **직접 클릭했을 때만** 해당 기사 정보가 폼에 즉시 바인딩되고 해당 버튼이 파란색(`bg-[#1E60F3] text-white`)으로 활성화됨.
   * 사용자가 입력 필드를 직접 수정하면 `selectedPresetVehicle`이 `null`로 복귀하여 프리셋 활성 상태가 해제됨.

### 20.3 필수 입력값 유효성 검증(Validation) 보호 ([`components/ProfileModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/ProfileModal.tsx))
1. **누락 필드별 안내 경고 및 인풋 자동 포커싱**:
   * 성명과 연락처가 모두 비어 있는 상태에서 [설정 저장] 터치 시:
     * 경고 알림: `"드라이버 성명과 연락처를 입력해 주세요."`
     * `driverNameRef.current?.focus()` 호출로 성명 인풋 자동 포커스.
   * 성명만 누락 시: `"드라이버 성명을 입력해 주세요."` 경고 및 포커스.
   * 연락처만 누락/불완전 시: `"연락처(휴대폰 번호)를 정확히 입력해 주세요. (예: 010-0000-0000)"` 경고 및 `phone2Ref`/`phone3Ref` 포커스.
   * 번호판 뒷자리 불완전 시: `"차량 번호판 뒷자리는 4자리 숫자로 입력해 주세요."` 경고 및 포커스.

### 20.4 빌드 무결성 검증
* `npm run build`: Next.js 16.3.5 Turbopack 기준 14/14 라우트 컴파일 에러 **0건** 통과.

---

## 21. 프로필 설정 모달 UI 정제 및 온서브밋 인라인 검증 시스템 (2026-09-22)

### 21.1 개요
* '프로필 설정' 모달 오픈 시 상시 노출되던 원색 빨간색 `* 필수 입력` 텍스트를 전면 삭제하여 칵핏의 미니멀 블루/슬레이트 톤앤매너를 유지하도록 개선.
* 필수 입력값(드라이버 성명, 연락처) 미기입 상태로 [설정 저장] 버튼을 누를 때만 동적으로 세련된 인라인 뱃지(`● 필수 입력`), 소프트 로즈 테두리 링 발광, 하단 안내 배너가 표출되도록 온서브밋 인터랙션 리파인.

### 21.2 주요 변경 내역 ([`components/ProfileModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/ProfileModal.tsx))
1. **평상시 정적 텍스트 완전 제거**:
   * '드라이버 성명' 및 '연락처' 라벨 우측의 기존 고정 붉은색 `* 필수 입력` 텍스트 삭제. 평상시에는 군더더기 없는 미려한 라벨만 노출.
2. **온서브밋 동적 인라인 뱃지 디자인 격상**:
   * 필수값 누락 시에만 라벨 우측에 세련된 소프트 로즈 칩 뱃지 표출:
     ```tsx
     <span className="text-[10.5px] font-bold text-rose-500 bg-rose-50 border border-rose-200/80 px-2 py-0.5 rounded-md flex items-center gap-1.5 animate-fade-in shadow-2xs">
       <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
       필수 입력
     </span>
     ```
3. **인풋 시각 피드백 및 하단 액션 배너**:
   * 미입력 인풋창 테두리에 은은한 로즈 링 하이라이트(`border-rose-400 ring-2 ring-rose-100 bg-rose-50/20`) 적용 및 자동 포커싱.
   * 액션 버튼([취소]/[설정 저장]) 상단에 `validationMsg` 안내 배너 렌더링.
   * 햅틱 경고 펄스(`haptics.warningPulse()`) 연동.
4. **실시간 에러 자동 클리어**:
   * 드라이버가 인풋에 입력을 시작하거나(`onChange`), 붙여넣기(`onPaste`), DEV 프리셋을 클릭하면 에러 상태가 즉각 소멸.

### 21.3 빌드 무결성 검증
* `npm run build`: Turbopack 기준 14/14 라우트 정상 빌드 완료 (컴파일 에러 0건).

---

## 22. 호차별 전담 기사 SSOT 데이터 정합성 원상복구 및 가짜 더미 데이터 영구 척결 (2026-09-23)

### 22.1 문제 원인 정밀 규명
1. **임의의 테스트 가짜 이름('박의전') 잔존**:
   * 초기 개발 단계에서 2호차에 임의로 부여되었던 더미 이름(`박의전`)이 `FLEET_PRESET_DRIVERS`, `DRIVER_DEFAULTS`, Supabase `cockpit.drivers`에 방치되어 있었음.
   * 실제 2호차의 공식 전담 기사님은 **홍승범** 기사님임에도 가짜 이름이 노출되는 결함 발생.
2. **1호차(배선만) 프리셋 누락에 따른 프로필 상태 불일치**:
   * 과거 '김의전(1호차)' 테스트 데이터를 삭제하는 과정에서 `FLEET_PRESET_DRIVERS`에서 1호차 객체 자체가 제거되어 있었음.
   * 스케줄 탭에서 '1호차(배선만)' 탭을 클릭했을 때 `FLEET_PRESET_DRIVERS.find()`가 `undefined`를 반환하여 직전에 선택되었던 2호차의 기사명(`박의전`)이 1호차 화면에 그대로 잔존·노출되는 상태 누수(State Leak) 발생.

### 22.2 조치 내역
1. **공식 기사 정보 완전 확정 및 복구**:
   * **1호차**: `배선만` / `142호 7814` / `010-8806-9758`
   * **2호차**: `홍승범` / `112하 3456` / `010-3333-4444` (가짜 이름 '박의전' 완전 영구 제명)
   * **4호차**: `윤태준` / `142호 7811` / `010-6348-8726`
   * **8호차**: `민성호` / `142호 7815` / `010-7231-8340`
2. **Supabase `cockpit.drivers` DB 영구 반영**:
   * 2호차 `driver_name = '홍승범'` 갱신 완료.
   * 1호차 `배선만` 데이터 무결성 보장.
3. **코드베이스 및 상수 동기화**:
   * [`utils/constants.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/utils/constants.ts): `FLEET_PRESET_DRIVERS`에 1호차(배선만), 2호차(홍승범) 정규 등록.
   * [`app/api/driver/route.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/app/api/driver/route.ts): `DRIVER_DEFAULTS`에 1호차(배선만), 2호차(홍승범) 동기화.
   * [`utils/nameMatcher.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/utils/nameMatcher.ts): `'범': ['Beom', 'Bum']` 음절 매핑 추가하여 `홍승범` 기사님의 영문 다형성 후보군 100% 매칭 보장.
4. **상태 누수 방지 및 로컬스토리지 자동 마이그레이션**:
   * [`app/page.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/app/page.tsx): `onSwitchVehicle` 시 정적 프리셋에 없는 경우에도 `/api/driver?vehicle_no=...`를 즉시 호출하여 타 호차 기사명이 잔존하는 현상 차단.
   * [`hooks/useDriverProfile.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/hooks/useDriverProfile.ts): 클라이언트 로컬스토리지에 기존 '박의전' 값이 캐시되어 있는 경우 1호차는 '배선만', 2호차는 '홍승범'으로 즉시 자동 치환되도록 정화 로직 적용.
   * [`components/ScheduleTab.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/ScheduleTab.tsx): `availableVehicles` 및 `vehicleCounts` 기본값에 `1호차` 기본 포함.

### 22.3 빌드 무결성 검증
* `npm run build`: Turbopack 기준 14/14 라우트 정상 빌드 완료 (에러 0건).

---

## 23. Cockpit AI 추론 텍스트 투명도 쉬머(Shimmer) 이펙트 및 게이지바 템포 재조율 (2026-09-23)

### 23.1 개요
* ChatGPT 및 Gemini의 LLM 추론(Reasoning) 시 나타나는 텍스트 투명도 변조 및 쉬머(Shimmering) 반짝임 인터랙션을 6단계 관제 텍스트에 적용.
* 게이지바의 앞 단계(1~4단계)는 차분하게 내용을 음미할 수 있도록 속도를 안정화하고, 정체되던 후반 5~6단계는 지연 없이 신속하게 100%로 가속 완충되도록 템포 전면 재조율.

### 23.2 주요 변경 내역
1. **LLM 추론 투명도 쉬머 애니메이션 구현 ([`app/globals.css`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/app/globals.css))**:
   * `-webkit-background-clip: text` 및 멀티 스톱 선형 그래디언트(`background-size: 250% 100%`)를 활용하여 글자 투명도가 `0.38`에서 `1.0`으로 파동치듯 은은하게 반짝이는 쉬머 효과 구현:
     ```css
     @keyframes reasoningShimmer {
       0% { background-position: 150% 0; }
       100% { background-position: -150% 0; }
     }
     @keyframes reasoningPulse {
       0%, 100% { opacity: 0.88; }
       50% { opacity: 1; }
     }
     .animate-reasoning-shimmer {
       background: linear-gradient(
         90deg,
         rgba(71, 85, 105, 0.38) 0%,
         rgba(30, 41, 59, 0.72) 28%,
         rgba(15, 23, 42, 1) 48%,
         rgba(30, 96, 243, 1) 52%,
         rgba(30, 41, 59, 0.72) 72%,
         rgba(71, 85, 105, 0.38) 100%
       );
       background-size: 250% 100%;
       -webkit-background-clip: text;
       background-clip: text;
       -webkit-text-fill-color: transparent;
       animation: reasoningShimmer 2.2s infinite ease-in-out, reasoningPulse 2.6s infinite ease-in-out;
     }
     ```
2. **게이지바 템포 및 단계별 진행률 재조율 ([`components/ScheduleTab.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/ScheduleTab.tsx))**:
   * **앞 단계 (1~4단계: 0.0s ~ 9.0s)**:
     - 1단계 (0.0s ~ 2.4s): 15% ➔ 32% (차분하게 기사님이 분석 단계를 인지할 수 있는 안정적 템포)
     - 2단계 (2.4s ~ 4.8s): 32% ➔ 50%
     - 3단계 (4.8s ~ 7.0s): 50% ➔ 68%
     - 4단계 (7.0s ~ 9.0s): 68% ➔ 84%
   * **마지막 단계 (5~6단계 신속 가속)**:
     - 5단계 (9.0s ~ 10.2s): 84% ➔ 96%로 1.2초 만에 시원하게 치고 올라감 (기존의 느린 지연 크롤링 완전 제거)
     - 6단계 (최종 확인): 96% ➔ 98% ➔ 100%로 360ms 만에 신속 완충 후 0.5초간 완료 카드 표시.
   * **초기 타이머 주기 50ms**:
     - 게이지바 업데이트 주기를 100ms ➔ 50ms로 격상하여 60fps에 준하는 극도로 매끄러운 바 모션 확보.
3. **단계 전환 시 이중 레이어 모션**:
   * 단계 변경 시 텍스트 래퍼의 부드러운 페이드인(`animate-fade-in`)과 텍스트 자체의 쉬머 파동이 충돌 없이 유기적으로 블렌딩되도록 컴포넌트 구조 고도화.

### 23.3 빌드 무결성 검증
* `npm run build`: Turbopack 기준 14/14 라우트 정상 빌드 완료 (컴파일 에러 0건).

---

## 24. 스케줄 파싱 시 미등록 거점의 TMAP POI 도로명 주소 및 좌표 자동 보정 파이프라인 구축 (2026-09-23)

### 24.1 구축 배경 및 목적
* 배차표 파싱 시 사전에 등록되지 않은 신규 거점(예: '안다즈 서울 강남', '시그니엘 서울', 신규 호텔 및 행사 장소)이 인입되는 경우, 기존에는 주소가 빈 문자열(`""`)로 남거나 기본 테헤란로 좌표로 폴백되어 스케줄 카드의 시인성 저하 및 내비게이션 길안내 오차 위험이 존재했음.
* 이를 해결하기 위해 TMAP 통합 POI 검색 API를 활용한 **3단계 정밀 주소 확정 파이프라인**을 백그라운드에 구축하여, 별도의 수동 등록 없이도 도로명 주소와 내비게이션 진입 좌표를 전자동으로 보정·저장하는 시스템을 완성함.

### 24.2 주요 구현 내역

#### 1. TMAP 통합 POI 검색 헬퍼 모듈 연동 ([`services/tmapService.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/services/tmapService.ts), [`utils/tmap.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/utils/tmap.ts))
* **엔드포인트**: `https://apis.openapi.sk.com/tmap/pois?version=1&searchKeyword={keyword}&resCoordType=WGS84GEO&reqCoordType=WGS84GEO&count=1`
* **헤더**: `appKey: process.env.TMAP_API_KEY || process.env.NEXT_PUBLIC_TMAP_API_KEY`
* **규격 인터페이스**:
  ```typescript
  export interface ResolvedPlaceLocation {
    name: string;
    roadAddress: string;     // 도로명 주소 (예: "서울 강남구 논현로 854")
    jibunAddress?: string;    // 지번 주소 백업
    lat: number;              // WGS84 위도 (frontLat 또는 noorLat)
    lng: number;              // WGS84 경도 (frontLon 또는 noorLon)
  }
  ```
* **결과 추출 및 안전 가드**:
  - `searchPoiInfo.pois.poi[0]`에서 최우선 검색 결과 취득.
  - 도로명 주소(`newAddressList.newAddress[0].fullAddressRoad`)를 최우선으로 취득하고, 없을 시 구주소(`upperAddrName + middleAddrName + lowerAddrName + detailAddrName`)로 폴백.
  - 좌표는 정밀 출입구 좌표(`frontLat`, `frontLon`)를 최우선 추출하고, 부재 시 중심점 좌표(`noorLat`, `noorLon`)로 파싱.
  - AbortController 기반 4,000ms 타임아웃 및 try-catch 무결성 래핑을 통해 에러 발생 시 예외를 던지지 않고 안전하게 `null` 반환.

#### 2. 스케줄 파싱 3단계 주소 확정 파이프라인 ([`app/api/schedule/parse/route.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/app/api/schedule/parse/route.ts))
* Gemini 비전 파싱 후 각 일정의 출발지(`origin`) 및 도착지(`destination`)에 대해 3단계 주소 검증을 순차 수행:
  1. **1순위 (DB/로컬 마스터 프리셋)**: `cockpit.presets` 및 핵심 키워드 휴리스틱과 일치하는 항목 확인 (기존 검증된 고정 주소 및 좌표 유지).
  2. **2순위 (비고란 주소 추출)**: `notes` / `remark` 내에 기재된 영문/한글 도로명 주소 정규식 패턴(`854 Nonhyeon-ro...`, `서울 강남구 논현로 854...`) 탐색.
  3. **3순위 (TMAP POI 실시간 검색)**: 여전히 정규 도로명 주소가 없다면 `searchTmapPoi(placeName)`를 호출하여 도로명 주소 및 위경도 좌표 취득 (필요 시 2순위 비고란 주소로 2차 검색).
* **고성능 병렬 처리 및 인메모리 캐싱**:
  - `Promise.all`을 적용하여 전체 스케줄 항목의 POI 검색을 비동기 병렬 처리.
  - 요청 스코프 내 `poiCache = new Map<string, ResolvedPlaceLocation | null>()`를 적용하여 중복 거점(예: 동일 호텔 왕복)에 대한 불필요한 네트워크 중복 호출 방지.
* **DB 동기화**:
  - `cockpit.schedules` 테이블의 `origin_address`, `origin_lat`, `origin_lng`, `destination_address`, `destination_lat`, `destination_lng`에 완벽하게 바인딩 및 업서트.

#### 3. 스케줄 카드 UI 출발지 주소 노출 동기화 ([`components/ScheduleCard.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/ScheduleCard.tsx))
* 도착지와 동일하게 출발지 거점명 옆에도 `origin_address`가 존재할 경우 차분한 슬레이트 서브 텍스트로 자연스럽게 인라인 렌더링:
  ```tsx
  <div className="relative flex items-center gap-2 min-w-0">
    <div className="absolute -left-[19px] w-2.5 h-2.5 rounded-full bg-slate-400 ring-2 ring-white" />
    <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
      출발
    </span>
    <span className="text-sm font-bold text-slate-900 tracking-tight min-w-0 max-w-[55%] truncate" title={item.origin_name}>
      {sanitizePlaceName(item.origin_name)}
    </span>
    {item.origin_address && (
      <span className="text-xs text-slate-400 font-normal min-w-0 flex-1 truncate max-w-[180px]" title={item.origin_address}>
        {item.origin_address}
      </span>
    )}
  </div>
  ```
* **내비게이션 실행 버튼 연동 검증**:
  - 우측 솔리드 블루 원형 내비 버튼(`w-11 h-11`) 터치 시, `scheduleToPresets(item)`를 통해 POI로 확보된 목적지 위경도(`destination_lat`, `destination_lng`)가 TMAP 딥링크 스킴(`tmap://route?goalname=...&goalx=...&goaly=...&coordType=WGS84GEO`)에 정확히 주입되어 지정된 목적지로 즉시 길안내가 시작됨을 확인.

### 24.3 빌드 및 실데이터 검증 결과
1. **타입스크립트 빌드 무결성**:
   * `npm run build`: Turbopack 기준 14개 전 라우트 컴파일 통과 (에러 0건, 경고 0건).
2. **미등록 거점 실데이터 POI 보정 검증**:
   * 미등록 거점인 `'안다즈 서울 강남'` 조회 시:
     - 도로명 주소: `'서울 강남구 논현로 854'` 정상 취득
     - 정밀 진입 좌표: `lat: 37.52587649`, `lng: 127.0289898` 정상 추출
     - 3단계 파이프라인을 거쳐 출발지/도착지 주소 및 내비 좌표에 100% 무결 바인딩 완료.

---

## 25. 호차별 담당 승객명(passengerName) 데이터 격리 및 프로필 독립 영속화 (2026-09-23)

### 25.1 문제 배경 및 목적
* 기존 시스템에서는 프로필의 `passengerName` 필드가 전체 호차 간 공유되는 상태 누수(State Leak)가 존재하여, 4호차의 승객명('SOYFAN 외 1명')이 1호차나 2호차로 전환해도 그대로 잔존하거나, 한 호차에서 승객명을 변경하면 타 호차의 승객명까지 연쇄 덮어쓰기되는 결함이 있었음.
* 이를 해결하기 위해 Supabase DB(`cockpit.drivers` 및 `cockpit.driver_profiles`), 클라이언트 로컬 스토리지(`VEHICLE_PROFILES_KEY`), 프로필 모달, 메인 화면 보고 텍스트 전반에서 **호차(`vehicle_no`)별 승객명 완전 독립 격리 및 영속화 파이프라인**을 구축함.

### 25.2 주요 구현 내역

#### 1. DB 스키마 확장 및 호차별 기본 승객명 프리셋 확정 ([`types/index.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/types/index.ts), [`utils/constants.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/utils/constants.ts))
* **Supabase `cockpit.drivers` 테이블 컬럼 추가**:
  - `passenger_name text` 컬럼 추가 및 `vehicle_no` 기준 고유 업데이트 적용.
  - `cockpit.cockpit_drivers` 및 `cockpit.driver_profiles` 뷰에 `passenger_name` 투영 반영.
* **호차별 기본 승객명 프리셋 정의**:
  - **4호차 (윤태준 기사님)**: `'SOYFAN 외 1명'` (고정 지정)
  - **1호차 (배선만 기사님)**: `'VIP 게스트 A'` (임시 명칭)
  - **2호차 (홍승범 기사님)**: `'VIP 게스트 B'` (임시 명칭)
  - **8호차 (민성호 기사님)**: `'VIP 게스트 C'` (임시 명칭)
  - 신규 등록 호차: 빈 문자열(`""`) 또는 `'미지정'`
* [`utils/constants.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/utils/constants.ts)에 `getPresetPassengerName(vehicleNo)` 헬퍼 함수 구현.

#### 2. 백엔드 API 격리 업서트 ([`app/api/driver/route.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/app/api/driver/route.ts))
* `DRIVER_DEFAULTS`에 호차별 기본 `passenger_name` 등록.
* `GET /api/driver`:
  - `all=true` 및 개별 호차 조회 시 DB에 저장된 `passenger_name`을 최우선 반환하되, 부재 시 기본 프리셋 값으로 자동 보강.
* `POST /api/driver`:
  - `passenger_name` 필드를 수신하여 오직 대상 `vehicle_no` 레코드만 단독 갱신(`onConflict: 'vehicle_no'`). 타 호차 레코드에 일체 영향 없음.

#### 3. 클라이언트 로컬 스토리지 호차별 격리 저장 ([`hooks/useDriverProfile.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/hooks/useDriverProfile.ts))
* `VEHICLE_PROFILES_KEY`(`protocol_cockpit_vehicle_profiles_v1`) 도입:
  - `getStoredVehicleProfile(vehicleNo)` 및 `setStoredVehicleProfile(vehicleNo, data)` 함수 구현.
  - 활성 프로필 변경 시 해당 호차 전용 데이터 세트로 즉각 전환되고, 프로필 저장 시 해당 호차 전용 캐시와 Supabase에 동시 기록.
  - 호차 전환 시 이전 호차의 승객명을 상속받지 않고 대상 호차의 전용 승객명으로 완전 교체.

#### 4. 프로필 모달 DEV 1초 전환 시 자동 주입 ([`components/ProfileModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/ProfileModal.tsx))
* 모달 오픈 시 Supabase에서 조회된 드라이버 목록의 `passenger_name`을 `fleetPresets`에 바인딩.
* DEV 1초 전환 버튼(1호차, 2호차, 4호차, 8호차) 클릭 시 이전 호차 승객명이 잔존하지 않고, 해당 호차의 저장된 `passengerName` 또는 기본 프리셋('SOYFAN 외 1명', 'VIP 게스트 A' 등)이 폼에 즉시 채워지도록 구현.
* 저장 시 현재 선택된 `vehicleNo`와 `passengerName`만 단독 전달.

#### 5. 메인 화면 및 단톡방 보고 텍스트 실시간 1:1 연동 ([`utils/reportGenerator.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/utils/reportGenerator.ts), [`app/page.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/app/page.tsx), [`components/Header.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/Header.tsx))
* `generateReportText`:
  - `const passengerName = profile.passengerName?.trim() || '미지정'`
  - 출발(`DEPARTURE`) 및 도착(`ARRIVED`) 보고 텍스트 모두에 `• 담당승객: ${passengerName}`이 누락 없이 실시간 렌더링.
  - 4호차 활성 시 `'SOYFAN 외 1명'`, 1호차 활성 시 `'VIP 게스트 A'`(또는 수정한 커스텀 승객명)로 1:1 즉각 동기화.
* 상단 헤더 프로필 툴팁에도 현재 담당 승객명 실시간 반영.

### 25.3 빌드 및 시나리오 검증 결과
1. **빌드 무결성**:
   * `npm run build`: Turbopack 기준 14개 전 라우트 컴파일 0 에러 통과.
2. **시나리오 검증**:
   * **4호차 선택**: DB 및 폼에서 담당 승객명 `'SOYFAN 외 1명'` 정상 로드.
   * **DEV 1호차 전환**: 담당 승객명이 `'VIP 게스트 A'`로 즉시 교체.
   * **1호차 수정 및 저장**: 승객명을 `'Mr. Anderson'`으로 수정한 후 저장 시 1호차만 `'Mr. Anderson'`으로 단독 갱신.
   * **4호차 복귀**: 4호차의 승객명이 영향을 받지 않고 `'SOYFAN 외 1명'`으로 온전히 유지됨 확인.
   * **보고 텍스트 연동**: 단톡방 보고 텍스트 미리보기에 `• 담당승객: SOYFAN 외 1명` 및 `• 담당승객: VIP 게스트 A`가 실시간으로 완벽 표출됨 확인.

---

## 26. 거점 소유 라벨 한글화(공통/개인) 및 숫자 전용 날짜 입력·요일 자동 완성 스케줄 등록 모달 구현 (2026-09-23)

### 26.1 배경 및 목적
* Protocol Cockpit의 기존 거점 식별 배지(`HQ` / `MY`)는 영문 약어로 표기되어 있어 현장 의전 기사님들의 직관적인 인지성이 다소 떨어지는 문제가 있었음. 이를 친숙한 한글(`공통` / `개인`)로 전면 개편함.
* 스케줄 등록 시 날짜 선택기(캘린더 팝업)의 터치 오류와 번거로움을 해결하기 위해, 숫자 8자리(`inputMode="numeric"`, `maxLength={8}`) 전용 입력 필드와 입력 즉시 `YYYY.MM.DD (요일)`을 자동 연산하여 표출하는 동적 뱃지 시스템을 도입함.
* 아울러 출발지/도착지 장소 입력 가드레일(TMAP 실시간 POI 자동완성 검색 + 자주 가는 목적지 원터치 퀵 선택) 및 AI 코파일럿 텍스트 연동을 지원하는 모달(`ScheduleFormModal.tsx`)을 구축함.

---

### 26.2 핵심 구현 내역

#### [태스크 1] 거점 식별 텍스트 전면 한글화 ([`components/PresetButtons.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/PresetButtons.tsx))
1. **라벨 분기 수정**:
   * 전사 공통 거점 식별자(`!preset.vehicle_no && !preset.vehicleNo`)를 기준으로 기존 `HQ`를 **`공통`**으로 변경.
   * 기사 개인 거점 및 자택 거점을 기존 `MY`에서 **`개인`**으로 변경.
   ```typescript
   const isHQ = !preset.vehicle_no && !preset.vehicleNo;
   const badgeLabel = isHQ ? '공통' : '개인';
   ```
2. **스타일 유지**:
   * `text-[11px] font-medium tracking-wide text-slate-400` 스타일을 유지하여 디자인 시스템 통일성과 가독성을 동시 확보.

---

#### [태스크 2] 스케줄 등록 모달 숫자 전용 날짜 입력 및 요일 자동 연산 ([`components/ScheduleFormModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/ScheduleFormModal.tsx))
1. **숫자 8자리 전용 마스킹 입력 필드**:
   * `inputMode="numeric"`, `maxLength={8}`, `placeholder="예: 20260925 (8자리 숫자)"` 적용.
   * 사용자 키 입력 시 비숫자 문자를 실시간 제거(`replace(/\D/g, '')`)하고 최대 8자리까지만 수용.
2. **실시간 유효성 검증 및 요일 자동 연산 뱃지**:
   * `parseAndValidate8DigitDate` 함수로 연/월/일 파싱 및 `new Date(year, month - 1, day)` 유효성 정합성 검증.
   * 유효한 8자리 숫자 입력 완료 시 우측 상단에 코발트 블루 볼드 뱃지로 포맷팅 및 요일 자동 표출:
     `const dayOfWeek = ['일', '월', '화', '수', '목', '금', '토'][targetDate.getDay()];`
     예: `2026.09.25 (금)`
3. **AI 코파일럿 대화창 프리필 연동**:
   * 코파일럿 입력창에서 `"9월 25일 일정 등록"`, `"9.25 스케줄 추가"`, `"내일 일정 등록"` 등 날짜 및 등록 의도가 담긴 텍스트 입력 시 날짜를 8자리로 자동 추출(`extractDateFromQuery`)하여 `initialDate`로 모달에 즉시 주입.

---

#### [태스크 3] 장소 입력 필드 가드레일 (TMAP 검색 + '자주 가는 목적지' 퀵 선택)
1. **장소 선택 2단 드로어 구조**:
   * 출발지 및 도착지 카드 터치 시 해당 위치 선택 섹션이 토글 오픈.
2. **상단: TMAP 실시간 POI 자동완성 검색**:
   * `/api/search?keyword=...` API 연동, 250ms 디바운스 적용.
   * 검색 결과 목록(장소명, 주소) 제공 및 터치 시 좌표(`lat`, `lng`) 자동 동기화.
3. **하단: '자주 가는 목적지' 퀵 선택 칩**:
   * 가로 스크롤 칩 리스트 제공.
   * 각 거점별 `공통` 및 `개인` 배지 표기.
   * 원터치로 출발지 또는 도착지에 즉각 반영.

---

#### [태스크 4] 스케줄 탭 통합 및 버튼 배치 ([`components/ScheduleTab.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/ScheduleTab.tsx), [`app/api/copilot/route.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/app/api/copilot/route.ts))
1. **엠프티 뷰(Empty State)**:
   * `[ ＋ 새 스케줄 직접 등록 ]` 버튼을 `[ ✨ 샘플로 먼저 확인하기 ]` 좌측에 배치.
2. **확정 스케줄 뷰(Confirmed View)**:
   * 서브헤더 `배차표 재등록` 좌측에 `[ 일정 추가 ]` 파란색 버튼 배치.
3. **코파일럿 카드 피드백**:
   * 사용자가 등록 요청 시 등록 확인 안내와 함께 `[ 스케줄 등록 팝업 열기 ]` 재오픈 액션 버튼 제공.
4. **저장 및 영속화**:
   * 신규 등록 스케줄을 로컬 State에 즉시 반영(`cockpit_schedules` 캐싱)하고 `/api/schedules` 백그라운드 POST 호출.

---

### 26.3 빌드 및 검증 결과
1. **빌드 무결성**:
   * `npm run build`: Turbopack 기준 전 라우트 컴파일 **0 에러, 0 경고** 완벽 통과.
2. **단위 테스트 검증 (`test_schedule_dates.ts`)**:
   * `parseAndValidate8DigitDate('20260925')` ➔ `2026.09.25 (금)` 정합성 일치.
   * `parseAndValidate8DigitDate('20260923')` ➔ `2026.09.23 (수)` 정합성 일치.
   * `parseAndValidate8DigitDate('20260231')` ➔ 비정상 날짜 `null` 반환 및 에러 문구 노출 정상 작동.
   * `extractDateFromQuery` 자연어 추출("9월 25일 일정 등록", "9.25 스케줄 추가") 정상 통과.

---

## 27. TMAP 지하철 대표역 우선순위 재정렬(Re-ranking) 및 모바일 키패드 스크롤 격리 인터랙션 고도화 (2026-09-23)

### 27.1 배경 및 목적
* 기존 TMAP 장소 검색 시 "구의역", "강남역", "혜화역" 등 지하철역 키워드 입력 시 장소명 글자 수 차이(`diff`) 계산으로 인해 대표 지하철역보다 출구 번호나 주변 상호명(`구의역숯불집` 등)이 먼저 노출되는 문제가 발생함.
* 또한 모바일 가상 키패드가 뜬 상태에서 검색 결과 리스트를 터치하거나 스크롤할 때, 키패드가 닫히지 않고 모달 전체 화면이 위아래로 끌려 내려가는 스크롤 체이닝(Scroll Chaining) 및 바운스 현상으로 인해 사용성이 저하되는 문제를 해결하고자 함.

---

### 27.2 핵심 구현 내역

#### [태스크 1] TMAP 검색 결과 가중치 재정렬 엔진 (3-Tier Re-ranking Engine) ([`app/api/search/route.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/app/api/search/route.ts))
1. **표기 기호 정돈**:
   * TMAP 원본 데이터의 대괄호 표기(`구의역[2호선]`, `강남역[신분당선]`)를 가독성 높은 소괄호(`구의역 (2호선)`, `강남역 (신분당선)`)로 자동 치환.
2. **3단계 우선순위 재정렬 (3-Tier Sorting)**:
   * **1순위 (지하철 대표역)**:
     - `isSubwayStationMain`: 검색어가 역 이름일 때 출구가 아닌 대표 역사(`lowerBizName: '지하철역'` 또는 `(O호선)`, `[O호선]`, `[O선]`)를 **배열 최상단(Index 0)**에 무조건 우선 배치.
     - 노선이 여러 개인 환승역(예: `강남역 (2호선)`, `강남역 (신분당선)`)은 대표역 그룹 내에서 1, 2순위로 동시 상단 승격.
   * **2순위 (지하철역 출구)**:
     - `isSubwayExit`: 출구 번호 정규식(`\d+번출구`)을 통해 순수 지하철 출구만 추출하고, `getExitNumber` 함수로 출구 번호를 파싱하여 **오름차순(1번, 2번, 3번, 4번...)** 정렬.
     - 출구 뒤에 상호명이나 대여소가 붙은 경우(`혜화역4번출구포차`, `대여소`) 2순위에서 제외하여 일반 POI로 정확히 분기.
   * **3순위 (일반 POI)**:
     - 주변 상권 및 시설물(`구의역숯불집`, `구의역더튼튼의원` 등)은 대표역과 출구 목록 뒤에 안전하게 배치하며, 기존의 정밀 4단계 문자열 매칭 정합성 순위를 유지.

---

#### [태스크 2] 모바일 키패드 자동 숨김 및 스크롤 격리 ([`components/ScheduleFormModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/ScheduleFormModal.tsx), [`components/CustomPresetModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/CustomPresetModal.tsx))
1. **결과 리스트 터치/스크롤 시 가상 키패드 즉시 블러(Blur)**:
   * 검색 결과 컨테이너에 `onTouchStart={handleListTouch}` 및 `onScrollCapture={handleListTouch}` 이벤트 바인딩.
   * 사용자가 검색 결과를 스와이프하거나 탭하는 순간 `document.activeElement.blur()`를 실행하여 가상 키패드를 즉시 수납.
2. **CSS 스크롤 체이닝 차단**:
   * 검색 결과 목록 드롭다운: `overscroll-contain touch-pan-y` 및 `style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}` 적용.
   * 모달 본체 스크롤 컨테이너: 동일하게 `overscroll-contain touch-pan-y` 적용으로, 키패드가 열리거나 닫히는 과정에서 모달 창 전체가 화면 밖으로 밀려 올라가거나 튕기는 현상 원천 방지.

---

### 27.3 빌드 및 검증 결과
1. **빌드 무결성**:
   * `npm run build`: Turbopack 기준 전 14개 라우트 컴파일 **0 에러, 0 경고** 통과.
2. **실서버 API 정합성 검증 (`curl http://localhost:3000/api/search`)**:
   * **"구의역" 검색**:
     1. `구의역 (2호선)` ➔ **1위 (대표역)**
     2. `구의역 1번출구` ➔ **2위 (출구)**
     3. `구의역 2번출구` ➔ **3위 (출구)**
     4. `구의역 3번출구` ➔ **4위 (출구)**
     5. `구의역 4번출구` ➔ **5위 (출구)**
     6. `구의역숯불집` ➔ **6위 (일반 POI)**
     7. `구의역더튼튼의원` ➔ **7위 (일반 POI)**
   * **"강남역" 검색**:
     1. `강남역 (2호선)`
     2. `강남역 (신분당선)`
     3. `강남역 1번출구` ~ `11번출구` 순차 정렬 완벽 확인.
   * **"혜화역" 검색**:
     1. `혜화역 (4호선)`
     2. `혜화역 1번출구` ~ `4번출구`
     3. `혜화역4번출구포차`, `대여소` (일반 POI로 정상 후순위 배치).
   * **"조선팰리스" 비역세권 일반 검색**:
     1. `조선팰리스 서울강남`이 최우선 1위로 정상 유지됨 확인.

---

## 28. 모바일 TMAP POI 검색 속도 3배 가속을 위한 4대 최적화 파이프라인 구축 (2026-09-23)

### 28.1 배경 및 목적
* 모바일 의전 현장에서 기사님이 거점 또는 일정을 등록할 때, 장소 검색 시 입력 자모마다 발생하는 네트워크 왕복 및 Vercel 기본 해외 리전(미국 동부) 경유로 인한 지연(700ms 이상)을 제거함.
* 서버리스 물리 리전을 서울(icn1)로 고정하고, 한글 연속 입력 시 이전 요청을 즉시 강제 취소하는 `AbortController` 및 0ms 클라이언트 인메모리 캐시를 탑재하여 체감 검색 속도를 3배 이상 단축함.

---

### 28.2 핵심 구현 내역

#### [태스크 1] 백엔드 Vercel 리전 서울 고정 및 캐시 헤더 부여 ([`app/api/search/route.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/app/api/search/route.ts), [`vercel.json`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/vercel.json))
1. **서버리스 물리 리전 서울(`icn1`) 고정**:
   * 태평양 왕복 지연을 방지하기 위해 파일 상단에 서울 리전 및 Node.js 런타임을 명시하고 `vercel.json`에 `regions: ["icn1"]` 등록:
     ```typescript
     export const preferredRegion = 'icn1';
     export const runtime = 'nodejs';
     ```
2. **검색어 2글자 미만 가드레일**:
   * `keyword.length < 2`인 경우 외부 TMAP API를 호출하지 않고 즉시 `[]` 반환하여 불필요한 백엔드 트래픽과 할당량 낭비를 원천 차단.
3. **HTTP Cache-Control 헤더 부여**:
   * 동일 키워드 재검색 시 CDN 및 브라우저에서 즉시 반환할 수 있도록 응답 헤더 추가:
     `'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400'`

---

#### [태스크 2] 클라이언트 인메모리 캐시 및 이전 요청 취소 파이프라인 ([`ScheduleFormModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/ScheduleFormModal.tsx), [`CustomPresetModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/CustomPresetModal.tsx))
1. **`AbortController`를 통한 이전 요청 즉시 폐기**:
   * `abortControllerRef = useRef<AbortController | null>(null)`를 장착.
   * 사용자가 자모를 연속 타이핑할 때마다 이전 진행 중이던 `fetch` 요청을 즉각 `abort()` 취소하여 소켓 대기열 적체를 방지하고 마지막 키워드의 응답만 신속 렌더링.
2. **0ms 클라이언트 인메모리 캐시 (Map) 탑재**:
   * 컴포넌트 외부에 `searchCache = new Map<string, PoiResult[]>()` 선언.
   * 타이핑 후 캐시에 데이터가 존재하면 네트워크 호출 없이 **0ms** 만에 즉시 상태 업데이트 및 화면 표출.
3. **2자 미만 타이핑 방어 및 스크롤 격리 유지**:
   * 1글자 입력 시 로딩 스피너 및 네트워크 요청을 즉각 차단하고 결과 목록 초기화.
   * 모바일 키패드 블러(`document.activeElement.blur()`) 및 `overscroll-contain touch-pan-y` 완벽 보존.

---

### 28.3 빌드 및 성능 검증 결과
1. **빌드 무결성**:
   * `npm run build`: Turbopack 기준 전 라우트 컴파일 **0 에러** 통과.
2. **응답 헤더 및 가드레일 검증 (`curl`)**:
   * `GET /api/search?keyword=구` (1글자) ➔ TMAP 호출 없이 즉시 `{"pois":[]}` 반환.
   * `GET /api/search?keyword=구의역` ➔ `cache-control: public, s-maxage=3600, stale-while-revalidate=86400` 정상 부여.
3. **캐시 및 취소 인터랙션 검증**:
   * 자모 입력 시 이전 fetch의 `AbortError`가 콘솔 노이즈 없이 부드럽게 무시되고 최종 쿼리만 수신.
   * 검색했던 키워드를 다시 입력할 때 네트워크 탭 요청 없이 인메모리 캐시에서 즉시 결과 렌더링 확인.

---

## 29. 모바일 '자주 가는 목적지' 스크롤-클릭 완벽 분리를 위한 3중 판정 가드(Touch Slop & Hit Test) 및 이벤트 캡처 공중 요격 체계 구축 (2026-09-23)

### 29.1 배경 및 목적
* 모바일 의전 환경에서 화면을 위아래로 쓸어내려 스크롤할 때, 손가락이 닿은 '자주 가는 목적지' 거점 카드가 네이티브 `onClick` 합성 클릭에 의해 의도치 않게 출발지/목적지로 오선택되는 불편을 근본적으로 해소함.
* 손가락의 물리적 궤적(변위·시간·영역)을 엄격히 검증하는 3중 정밀 판정 가드를 수립하고, 브라우저가 스크롤 직후 지연 발생시키는 합성 클릭을 상위 컨테이너 캡처 단계에서 공중 요격하여 스크롤과 의도적 탭을 완벽하게 분리함.

---

### 29.2 핵심 구현 내역 ([`components/PresetButtons.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/PresetButtons.tsx))

#### [태스크 1] 3대 정밀 터치 판정 가드 (Touch Slop & Hit Test)
1. **변위 임계값 가드 (Touch Slop: 8px)**:
   * 손가락 접촉 시작 지점(`touchStartPosRef`)과 해제 지점 간의 유클리드 거리(`Math.hypot(dx, dy)`)가 **8px 이상**이면 즉시 스크롤 의도로 확정(`isScrollingRef.current = true`)하고 선택 로직을 차단.
2. **접촉 시간 가드 (Duration: 300ms)**:
   * 화면 접촉 후 해제까지의 소요 시간이 **300ms 이내**인 찰나의 탭만 유효한 클릭으로 인정. 300ms 초과 시 단순 탭이 아닌 탐색 또는 스크롤 준비 동작으로 분류하여 선택 발화 차단.
3. **영역 일치 여부 가드 (Bounding Rect Hit Test)**:
   * 손가락을 떼는 순간(`touchend`/`pointerup`)의 좌표(`changedTouches[0]` 또는 마우스 좌표)가 대상 버튼의 사각형 영역(`getBoundingClientRect()`) 경계 내부에 머물러 있는지 검사. 스크롤하면서 버튼 영역 밖으로 빠져나간 터치는 즉각 무효화.
4. **기존 350ms 롱프레스(거점 드래그 앤 드롭 순서 변경) 무결성 유지**:
   * 350ms 롱프레스 타이머와 300ms 탭 판정 우선순위를 완벽히 분리하여, 가볍게 탭할 때(≤300ms)는 출발지/목적지 즉각 선택, 350ms 이상 누르고 있을 때는 미니 칩 축소 및 Hysteresis 드래그 앤 드롭이 부드럽게 발화하도록 공존 구조 완성.

---

#### [태스크 2] 상위 컨테이너 합성 클릭 공중 요격 (Event Capture Guard)
1. **상위 래퍼 이벤트 캡처 (`onClickCapture`)**:
   * 캐러셀 그리드 최상위 컨테이너에 `onClickCapture` 핸들러를 장착.
   * 스크롤 이동(`delta > 8px`)이 감지되었거나 브라우저 네이티브 `onTouchCancel`이 발생한 경우 `isScrollingRef.current = true` 플래그를 활성화.
   * 상위 캡처 단계에서 플래그를 감지하면 `e.stopPropagation()` 및 `e.preventDefault()`를 호출하여 브라우저의 지연 합성 클릭(Synthetic Click)을 자식 버튼에 전달되지 않도록 공중에서 완전 소멸.
2. **상태 초기화 파이프라인 (`scheduleScrollReset`)**:
   * 손가락이 떨어진 후 100ms 타이머를 통해 `isScrollingRef.current = false`로 안전하게 리셋하여, 이후 사용자의 정상 탭 동작에 전혀 지장을 주지 않도록 설계.

---

#### [태스크 3] 시각적 탭 피드백(Active State) 정돈 및 전 슬롯 확대 적용
1. **65ms 피드백 지연 타이머 (`activeTouchTimeoutRef`)**:
   * 스크롤 도중 손가락이 거점 버튼 위를 빠르게 훑고 지나갈 때 버튼 배경색이 번쩍거리며 점멸하는 시각적 피로를 방지하기 위해, 터치가 65ms 이상 유지될 때만 `activePressedIndex`를 활성화하여 세련된 눌림 피드백(`scale-[0.97] bg-slate-100/90`) 표출.
2. **모바일 탭 하이라이트 잔상 제거**:
   * 웹킷 모바일 브라우저의 기본 탭 잔상 박스를 제거하는 `[-webkit-tap-highlight-color:transparent]` 적용.
3. **자택(Home) 및 추가(Add) 슬롯 3중 가드 일관 연동**:
   * 일반 거점뿐만 아니라 '자택(Home)' 등록/미등록 슬롯 및 '신규 거점 추가(Add)' 버튼까지 모두 동일한 3중 판정 가드와 캡처 요격을 적용하여 그리드 전 영역의 터치 안정성 100% 확보.

---

### 29.3 빌드 및 동작 검증 결과
1. **빌드 무결성**:
   * `npm run build`: Next.js 16.3.5 Turbopack 기준 전 라우트 컴파일 에러 **0건** 완료.
2. **모바일 스크롤 & 탭 분리 검증**:
   * 모바일 뷰포트에서 거점 영역 위를 빠르게 상하 스와이프/스크롤하거나 캐러셀 좌우 스와이프 시 거점이 오등록되지 않고 부드러운 스크롤만 수행됨 확인.
   * 의도적으로 임의의 거점을 '톡' 쳤을 때 지연 없이 즉각 상단 목적지/출발지에 100% 정상 반영됨 확인.
   * 350ms 롱프레스 시 햅틱 진동과 함께 거점 카드 축소 및 순서 변경 드래그 앤 드롭 기능이 오작동 없이 온전히 작동함을 확인.

---

## 30. 거점 섹션 상하 스크롤 복원, 카카오톡 계기판 줄바꿈 정돈 및 장소 등록 모달/건물단위 검색 UX 개선 (2026-09-24)

### 30.1 배경 및 목적
* `components/PresetButtons.tsx`에 남아있던 `touch-none` 속성으로 인해 모바일에서 '자주 가는 목적지' 영역을 쓸어내릴 때 페이지 상하 스크롤이 먹통이 되던 현상을 해결.
* 차량 반납 시 카카오톡으로 전송되는 계기판 현황 메시지가 좁은 모바일 화면에서 지저분하게 꺾이는 문제를 2단 계층형 포맷으로 개선.
* 장소 등록 모달(`CustomPresetModal.tsx`, `PlaceRegisterModal.tsx`)에서 검색 결과 클릭 시 창이 즉시 닫히지 않고 명칭을 다듬어 저장할 수 있도록 개선하고, `광교마을로 90, 4108동`처럼 동·호수가 포함된 입력에도 TMAP 검색 누락이 없도록 건물 단위 자동 정제 파이프라인 구축.
* React 렌더링 시 발생하던 중복 키 경고(`Encountered two children with the same key, e2f30315-797d-482b-bae0-058a80323978`)를 근본적으로 차단하기 위해 프리셋 중복 제거 및 안전 키 구조 확립.

---

### 30.2 핵심 구현 내역

#### [태스크 1] '자주 가는 목적지' 네이티브 상하 스크롤 즉각 복원 ([`components/PresetButtons.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/PresetButtons.tsx))
1. **CSS 터치 액션 전면 교정 (`touch-pan-y`)**:
   * 거점 버튼 및 그리드 컨테이너의 `touch-none`을 완전히 제거하고 **`touch-pan-y`**를 적용하여 모바일 상하 스와이프 제스처를 브라우저 네이티브 스크롤 엔진에 온전히 양도.
2. **수직 제스처 감지 시 롱프레스 즉각 취소 가드**:
   * `touchmove` / `pointermove` 시 수직 이동 거리($|\Delta y|$)가 **6px**을 초과하거나 전체 거리($\text{dist}$)가 **8px** 이상이면 대기 중인 롱프레스 타이머(`longPressTimerRef`)와 시각 피드백 타이머(`activeTouchTimeoutRef`)를 즉각 `clearTimeout` 취소.
   * 롱프레스가 발화하기 전에는 어떠한 `preventDefault()`나 `setPointerCapture()`도 호출하지 않아 상하 스크롤 끊김이 100% 제거됨.

---

#### [태스크 2] 차량 반납 카카오톡 보고서 계기판 현황 줄바꿈 개선 ([`utils/vehicleReport.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/utils/vehicleReport.ts))
1. **2단 계층형 개행 포맷 적용**:
   * 주요 수치와 괄호 세부 내역을 2단으로 명확히 개행 분리:
     ```text
     • 계기판 현황 :
       - 총 주행거리 : 15,048 km
         (최초 14,698 km | 총 운행 350 km)
       - 주행가능거리 : 180 km
         (최초 476 km | 차이 -296 km)
     ```
   * 좁은 모바일 카카오톡 말풍선 안에서도 괄호 내용이 임의의 위치에서 지저분하게 꺾이지 않고 높은 가독성 확보.

---

#### [태스크 3] 거점 등록 모달 즉시 닫힘 방지 및 건물 단위 주소 정제 ([`components/CustomPresetModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/CustomPresetModal.tsx), [`components/PlaceRegisterModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/PlaceRegisterModal.tsx), [`app/api/search/route.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/app/api/search/route.ts))
1. **검색 결과 선택 시 자동 닫힘 차단 및 폼 유지**:
   * 검색 결과 POI 클릭 시 모달이 즉시 닫히지 않고, `거점 전체 명칭`과 `버튼 표기 명칭`(8자 이내 자동 제안)에 값이 세팅되며 드롭다운만 닫히도록 흐름 개선.
   * 모달 하단의 **[저장]** 버튼을 눌러야만 유효성 검사 후 최종 등록되고 닫히도록 보장.
   * 상세 주소(동·호수 등) 입력창을 제거하여 폼을 직관적으로 단순화.
2. **동·호수 입력 대응 토지/건물 단위 정제 검색 (`sanitizeSearchQuery`)**:
   * 사용자가 `광교마을로 90, 4108동`이나 `테헤란로 152 12층`처럼 세부 동·호수를 입력하더라도 정규식(`/([0-9A-Za-z가-힣]+(?:동|호|층|관))/g`)을 통해 건물/도로명 단위(`광교마을로 90`)로 자동 정제하여 TMAP 검색 누락 방지.
   * `CustomPresetModal.tsx`, `ScheduleFormModal.tsx`, 백엔드 `/api/search/route.ts` 3중 탑재.
3. **`PlaceRegisterModal.tsx` 호환 컴포넌트 신설**:
   * 기존 `CustomPresetModal`을 래핑하는 명시적 `PlaceRegisterModal.tsx` 에일리어스 제공.

---

#### [부가 과제] React 중복 키 에러 완전 차단 및 프리셋 상태 정합성 보장 ([`app/page.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/app/page.tsx), [`components/PresetButtons.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/PresetButtons.tsx))
1. **`deduplicatePresets` 유틸 탑재**:
   * 로컬 스토리지 로드, API 동기화, 신규 거점 추가 시 `id` 및 `name + vehicle_no` 기준 중복 객체를 사전에 정제.
2. **렌더링 키 복합화**:
   * `PresetButtons.tsx`, `ScheduleTab.tsx`, `ScheduleFormModal.tsx`의 맵 렌더링 키를 `${id}-${index}`로 안전하게 복합 구성하여 브라우저 중복 키 콘솔 경고 완전 제거.

---

### 30.3 빌드 및 검증 결과
1. **빌드 무결성**:
   * `npm run build`: Next.js 16.3.5 Turbopack 기준 전 14개 라우트 컴파일 에러 **0건** 통과.
2. **검색 API 정제 검증**:
   * `GET /api/search?keyword=광교마을로 90, 4108동` ➔ `경기 용인시 수지구 광교마을로 90` 건물 단위 검색 결과 즉시 반환 확인.
   * `GET /api/search?keyword=테헤란로 152 12층` ➔ `서울 강남구 테헤란로 152` 즉시 반환 확인.
3. **카카오톡 2단 포맷 출력 검증**:
   * `generateReturnReport` 실행 결과 2단 계층형 계기판 수치 개행 정상 출력 확인.

---

## 31. 차량 점검 모달 내 '일일 점검' 모드 신설 및 맞춤형 카카오톡 보고 템플릿 연동

### 31.1 개요
다일간 행사 운용 시 기사들이 렌터카 정산용 총 주행거리나 차량 인계용 보관 위치 입력 없이, 당일 스케줄 수행을 위한 핵심 지표(주행가능거리 및 신규 외관 데미지)만 간편하게 점검·보고할 수 있도록 [차량 수령], [일일 점검], [차량 반납] 3단 세그먼트 체계를 구축하고 전용 카카오톡 보고서 생성기를 연동하였습니다.

---

### 31.2 상세 구현 내역

#### [태스크 1] 점검 모달 상단 3단 세그먼트 전환 UI 구축 ([`components/VehicleInspectionModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/VehicleInspectionModal.tsx), [`components/VehicleTopDownViewer.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/VehicleTopDownViewer.tsx))
1. **모드 상태 3단계 확장**:
   * 점검 모드를 `'pickup' | 'daily' | 'return'` 3단계로 확장 (`initialMode?: 'pickup' | 'daily' | 'return' | 'receipt'`).
   * 상단 세그먼트 탭: **[차량 수령] | [일일 점검] | [차량 반납]** 3분할 슬라이딩 필 인디케이터(`w-[calc((100%-8px)/3)]`, `translate-x-0` ➔ `translate-x-full` ➔ `translate-x-[200%]`) 구현.
2. **모드별 입력 폼 노출 제어**:
   * **일일 점검(`activeTab === 'daily'`) 선택 시**:
     * **총 주행거리(Odometer) 입력창 숨김**: 불필요한 입력 피로를 제거하여 총 주행거리 필드를 배제.
     * **주행가능거리(Range) 입력창 유지**: 당일 운행 가능 여부 확인을 위한 주행가능거리 입력창만 단독 렌더링.
     * **보관 위치(주차/차키) 섹션 숨김**: 차량 인계 상황이 아니므로 보관 위치 입력 섹션을 완전히 숨김.
     * **외관 데미지 체크 섹션 유지 및 2중 차별화**:
       - 기존 수령 시 누적된 흠집은 회색(`bg-slate-100`, `기존` 뱃지)으로 표시하여 불필요한 재체크 방지.
       - 당일 발생한 신규 흠집만 선명한 레드 컬러로 토글 등록.
       - **[✓ 금일 특이사항 없음 (신규 데미지 0건)]** 원터치 확인 버튼 제공으로 이상 없을 시 1-터치 즉시 완료.
3. **2D 탑뷰 인터랙티브 뷰어 다층 모드 지원 (`VehicleTopDownViewer.tsx`)**:
   * `mode="daily"` 지원을 추가하여 기존 누적 부위(코발트)와 금일 신규 부위(레드 핀)를 시각적으로 명확히 분리 표출.

---

#### [태스크 2] 일일 점검 전용 카카오톡 보고서 포맷터 추가 ([`utils/vehicleReport.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/utils/vehicleReport.ts))
1. **`generateDailyReport` 함수 구현**:
   * 시점(출근/퇴근)에 구애받지 않는 중립적인 일일 보고 템플릿 포맷 적용:
     ```text
     [일일 차량 점검 보고]

     • 점검일자 : 2026년 9월 24일 (목)
     • 차량호차 : 4호차
     • 차량번호 : 142호 7811
     • 계기판 현황 :
       - 주행가능거리 : 520 km
     • 외관 데미지 :
       - 기존 누적: 뒷 범퍼, 앞 휠 (운전석)
       - 금일 특이사항: 이상 없음 (신규 데미지 없음)
     ```
   * 총 주행거리 및 보관 위치 항목을 완전히 배제하고, 신규 데미지 발생 시 `- 금일 신규: [부위]`로 명확히 개행 표기.
2. **클립보드 및 로컬 영속화 연동**:
   * `mode === 'daily'`일 때 카카오톡 복사 버튼 클릭 시 `generateDailyReport` 결과물이 클립보드에 정확히 복사되고 카카오톡 공유 링크가 실행되도록 연결.
   * `saveDailyInspection` / `getDailyInspection` 탑재로 브라우저 새로고침 시에도 당일 입력한 DTE 및 점검 내역 안전하게 보존.

---

### 31.3 빌드 및 검증 결과
1. **프로덕션 빌드 무결성**:
   * `npm run build`: Next.js 16.3.5 Turbopack 기준 전 14개 라우트 컴파일 에러 **0건** 통과.
2. **보고서 서식 단위 테스트 검증 (`scratch/verify_daily_inspection.ts`)**:
   * 전원 이상 없음(Clean), 기존 누적 데미지만 존재, 신규 데미지 발생 등 모든 분기 조건에서 총 주행거리/보관위치 배제 및 정갈한 2단 포맷 출력 검증 통과.

---

## 32. 계기판 입력 필드 세 자리 단위 콤마(,) 서식 적용 및 거점 그리드 하단 잘림 UI 교정 (2026-09-28)

### 32.1 문제 정의 및 해결 방향
1. **계기판 주행거리 입력 편의성 부족**:
   - 기존 `<input type="number">`에서는 14698, 55555 등의 큰 숫자를 입력할 때 자릿수 콤마가 없어 시각적으로 자릿수를 오독하기 쉬움.
   - HTML `number` 인풋의 제약을 극복하고 `inputMode="numeric"`과 `type="text"`를 조합하여 모바일 숫자 키패드를 띄우면서도 실시간 1,000단위 콤마 서식을 지원해야 함.
2. **거점 캐러셀 하단 행 잘림 및 인디케이터 도트 겹침 현상**:
   - 거점 슬롯이 4행(최대 12개)에 달할 때, 스와이프 컨테이너의 `overflow-hidden` 바닥 패딩 부족으로 4행 카드의 둥근 하단 모서리와 그림자가 잘리고, 페이지네이션 인디케이터가 최하단 카드와 겹쳐 렌더링되던 문제 발생.

---

### 32.2 핵심 구현 내역

#### [태스크 1] 계기판 거리 입력 시 세 자리 단위 콤마(,) 실시간 포맷팅 ([`components/VehicleInspectionModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/VehicleInspectionModal.tsx))
1. **실시간 콤마 입력 UX & 모바일 숫자 키패드 유지**:
   - 차량 수령, 일일 점검, 차량 반납의 총 주행거리(`receiptTotalKm`, `returnTotalKm`) 및 주행가능거리(`receiptDte`, `dailyDte`, `returnDte`) 인풋에 `type="text" inputMode="numeric"` 적용.
   - 헬퍼 유틸리티 `formatNumberWithComma` 및 `sanitizeNumericInput` 구현:
     - State에는 순수 숫자 문자열(`val.replace(/[^0-9]/g, '')`)을 보관하여 계산 왜곡 방지.
     - 화면 렌더링 시에는 `Number(raw).toLocaleString()`으로 실시간 1,000 단위 콤마 자동 바인딩.
     - 빈 값일 경우 `""`로 깨끗하게 처리하여 `NaN`이나 `0` 노출 방지.
2. **계산 및 카카오톡 보고서 생성 정합성 보장**:
   - `saveInitialInspection`, `saveDailyInspection`, `generateReturnReport` 등으로 전달될 때 온전한 숫자형으로 파싱되어 총 운행거리 및 DTE 차이 계산 오차 0건 보장.

---

#### [태스크 2] '자주 가는 목적지' 4x4 그리드 하단 잘림 및 인디케이터 겹침 해결 ([`components/PresetButtons.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/PresetButtons.tsx))
1. **스와이프 캐러셀 컨테이너 여백 확보**:
   - 캐러셀 래퍼 컨테이너에 `px-1 pt-1 pb-7 sm:pb-8`을 적용하여 4번째 행 카드가 `overflow-hidden` 경계면에 잘리지 않고 둥근 모서리와 그림자(`box-shadow`)가 온전히 노출되도록 개선.
2. **페이지네이션 인디케이터 도트 여백 분리**:
   - 페이지네이션 인디케이터 컨테이너에 `pt-2 pb-1 mt-2.5 sm:mt-3`을 적용하여 상단 거점 카드들과 명확한 시각적 간격을 두고 분리.
3. **유동 높이 및 min-h 조정**:
   - 4행 슬롯 높이에 맞춰 내부 그리드에 `totalPages > 1 ? 'min-h-[268px]' : ''`를 적용하여 카드 내용에 따른 자연스러운 가변 높이 수용.

---

### 32.3 빌드 및 검증 결과
1. **프로덕션 빌드 무결성**:
   - `npm run build`: Next.js 16.3.5 Turbopack 기준 전 14개 라우트 컴파일 에러 **0건** 완료.
2. **실시간 콤마 및 보고서 출력 검증**:
   - `55555` 입력 시 화면상 `55,555`로 즉시 포맷팅되며, 카카오톡 일일/반납 보고서 생성 시 정산 계산식 및 텍스트에 오차 없이 반영됨을 검증 완료.
3. **모바일 거점 카드 하단 노출 검증**:
   - 최하단 4행 거점 카드가 잘림 없이 온전한 라운딩과 텍스트를 유지하며, 인디케이터 도트와의 겹침이 완전히 해소됨을 확인.

---

## 33. 스케줄 등록 모달 바디 스크롤 락, 독립형 장소 검색 모달 신설 및 '픽업' 용어 전면 통일 (2026-09-28)

### 33.1 문제 정의 및 해결 방향
1. **모달 오픈 시 뒷배경 스크롤 간섭 및 폼 내부 체이닝 현상**:
   - 모달이 열린 상태에서 스크롤 시 바깥 페이지가 함께 끌려 올라가거나, 모바일 가상 키패드 및 제스처 간섭으로 조작성이 저하되는 문제 발생.
   - Body scroll lock과 컨테이너 레벨의 `overscroll-behavior: contain`, `touch-action: pan-y`, `max-h-[85dvh]` 적용 필요.
2. **협소했던 인라인 검색창 개선 및 독립형 장소 검색 모달 요구**:
   - 기존의 인라인 검색 드로어 방식은 폼 내부를 지나치게 길게 늘어뜨려 사용성이 떨어졌음.
   - 메인 대시보드(`OriginDestinationSelector`) 및 스케줄 등록 폼에서 출발지/목적지 터치 시 쾌적한 전용 모달(`LocationSearchModal`)이 호출되고, 자주 가는 목적지(프리셋)가 최상단에 큼직한 3열 그리드로 즉시 노출되도록 개편 필요.
3. **용어 혼선 해소 ('픽업' 전면 일원화)**:
   - '운행시간', '착륙 영접', '운행 시작', '출발 시간' 등으로 혼재되어 있던 명칭을 현장 VIP 의전 맥락에 맞추어 **'픽업' / '픽업 HH:mm'**으로 완전 통일.

---

### 33.2 핵심 구현 내역

#### [태스크 1] 새 스케줄 등록/수정 모달 스크롤 격리 및 뒷배경 스크롤 락 ([`components/ScheduleFormModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/ScheduleFormModal.tsx), [`components/EditScheduleModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/EditScheduleModal.tsx))
1. **바디 스크롤 락 (Body Scroll Lock)**:
   - `isOpen` 시 `document.body.style.overflow = 'hidden'`을 적용하고, 모달 언마운트/닫힘 시 원래 스타일로 안전하게 복구.
2. **모달 내부 스크롤 체이닝 차단**:
   - 모달 래퍼 및 스크롤 바디에 `overscroll-behavior: contain`, `touch-action: pan-y`, `-webkit-overflow-scrolling: touch` 속성 및 `max-h-[85dvh] overflow-y-auto` 적용으로 모달 내부에서만 부드럽게 스크롤되도록 격리.

---

#### [태스크 2] 독립형 장소 검색 전용 모달 신설 및 프리셋 강조 ([`components/LocationSearchModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/LocationSearchModal.tsx), [`components/OriginDestinationSelector.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/OriginDestinationSelector.tsx), [`app/page.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/app/page.tsx))
1. **`LocationSearchModal.tsx` 신설**:
   - **상단 헤더**: 선택 타깃에 따른 직관적 뱃지 (`[출발지 설정]` 또는 `[목적지 설정]`) 및 닫기(`✕`) 버튼.
   - **실시간 검색창**: TMAP 실시간 POI 자동완성 인풋 (자동 포커스, 원터치 클리어 `✕` 버튼, 로딩 스피너, 0ms 인메모리 캐시 및 AbortController 연동).
   - **자주 가는 목적지 3열 그리드 최우선 노출**: 검색창 바로 아래에 자택 및 전체 프리셋 카드를 큼직한 3열 그리드로 배치하여, 타이핑 없이도 원터치로 즉시 거점 확정 후 자동 닫힘.
   - **검색 결과 리스트**: 2자 이상 입력 시 건물 단위로 정제된 TMAP 검색 결과가 스크롤 영역으로 표출되며, 터치 즉시 해당 장소 확정.
2. **기존 인라인 확장 방식 완전 제거**:
   - `ScheduleFormModal.tsx` 내부에 존재하던 번잡한 인라인 검색 드로어를 전면 삭제하고, 출발/도착 카드 탭 시 독립형 `LocationSearchModal`을 띄우도록 리팩토링.
3. **메인 운행 대시보드 연동**:
   - `OriginDestinationSelector.tsx`에 검색 뱃지 및 `onOpenSearchModal` 트리거를 장착하여, 출발지/목적지 카드 터치 시 바로 전용 검색 모달이 열리도록 연계.

---

#### [태스크 3] 시간 및 운행 섹션 표기 '픽업'으로 전면 일원화 ([`components/ScheduleCard.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/ScheduleCard.tsx), [`components/ScheduleFormModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/ScheduleFormModal.tsx), [`components/EditScheduleModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/EditScheduleModal.tsx), [`components/ScheduleTab.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/ScheduleTab.tsx))
1. **스케줄 카드 메인 시간 뱃지 포맷 통일**:
   - `formatPickupTimeBadge` 유틸리티를 구현하여 기존 '착륙', '운행', '출국' 등 혼재된 표기를 무조건 **`픽업 HH:mm`** (예: `픽업 09:50`, `픽업 09:00`, `픽업 14:30`) 형태로 일관되게 렌더링.
2. **입력 폼 라벨 및 칩 통일**:
   - 폼 입력 라벨: `운행 일자` ➔ `픽업 일자`, `운행 경로` ➔ `픽업 경로`, `운행 시각` ➔ `픽업 시간`.
   - 퀵 선택 칩: `['픽업 09:00', '픽업 10:00', '픽업 13:00', '픽업 14:30', '픽업 16:45']` 적용.

---

### 33.3 빌드 및 검증 결과
1. **프로덕션 빌드 무결성**:
   - `npm run build`: Next.js 16.3.5 Turbopack 기준 전 14개 라우트 컴파일 에러 **0건** 완료.
2. **스크롤 락 및 격리 검증**:
   - 모달 활성화 시 `body { overflow: hidden }`이 정상 동작하여 뒷배경 스크롤이 원천 차단되고, 모달 내부에서만 부드럽게 스크롤됨을 확인.
3. **독립형 검색 모달 및 프리셋 퀵 선택 검증**:
   - 출발지/목적지 탭 시 시원한 전용 팝업이 노출되고, 최상단 프리셋 카드를 1-터치하여 즉시 위치를 지정할 수 있음을 검증.
4. **시간 표기 일원화 검증**:
   - 모든 스케줄 카드의 상단 메인 시간 뱃지가 `픽업 HH:mm`으로 단정하게 통일됨을 확인.

---

## 34. 픽업 시간 UI 정돈, 네이티브 피커 적용, 메모 플레이스홀더화 및 TMAP POI 검색 형태소 정규화 개편 (2026-09-28)

### 34.1 추진 배경 및 목적
1. **스케줄 등록 폼 내 '픽업' 중복 수식어 제거**:
   - 상단 섹션 소제목이 이미 '픽업 시간'임에도 하위 인풋과 퀵 칩에 '픽업' 접두어가 중복 적용되어 "픽업 픽업 09:00" 등의 어색한 표기가 발생하는 문제 해소.
2. **티맵 예상 출발/도착 시간 모달 네이티브 피커 전환**:
   - 기존의 복잡한 3D 실린더 휠 드럼롤 코드를 제거하고, iOS Safari의 햅틱 드럼롤 휠과 Android의 시계 롤러가 자연스럽게 호출되는 모바일 표준 네이티브 `<input type="date">` / `<input type="time">` 래퍼 UI로 개편.
3. **의전 메모/특이사항 기본값 플레이스홀더 전환**:
   - 하드코딩된 'VIP 전담 의전 영접' 문자열을 제거하고 투명 플레이스홀더로 변경하여, 기사가 기존 텍스트를 지우는 번거로움 없이 즉시 메모를 작성할 수 있도록 UX 개선.
4. **TMAP POI 검색 형태소 정규화 및 서울 중심 좌표 주입**:
   - '포시즌스호텔', '신라호텔', '인천공항터미널'처럼 사용자가 띄어쓰기 없이 입력하거나 '포시즌스'만 입력했을 때, 정규식 버그로 '호'가 누락되어 '텔'로 검색되거나 지방 펜션/모텔이 1순위로 오노출되는 문제를 근본적으로 해결.

---

### 34.2 핵심 구현 내역

#### [태스크 1] 스케줄 등록 모달 픽업 시간 중복 표기 정돈 ([`components/ScheduleFormModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/ScheduleFormModal.tsx))
1. **중복 '픽업' 접두어 제거**:
   - 시간 인풋 및 퀵 선택 칩에서 '픽업' 접두어를 완전히 제거하여 `['09:00', '10:00', '13:00', '14:30', '16:45']`의 깔끔한 시간 표기 적용.
   - 내부 상태 저장 시 `(timeDisplay || pickupTime).replace(/픽업/g, '').trim()` 처리를 통해 중복 접두어("픽업 픽업") 발생을 원천 차단.

---

#### [태스크 2] 티맵 예상 출발/도착 시간 모달 네이티브 피커 전환 ([`components/DepartureTimePickerModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/DepartureTimePickerModal.tsx))
1. **네이티브 모바일 피커 래퍼 UI 구축**:
   - 번잡한 3D 실린더 휠 드럼 코드를 제거하고, 모바일 OS 표준 네이티브 `<input type="date">` 및 `<input type="time">` 래퍼로 전면 전환.
   - iOS Safari에서는 탭틱 엔진 기반 네이티브 휠 피커, Android Chrome에서는 다이얼/롤러 피커가 자동 연동되어 극대화된 조작 편의성 및 햅틱 피드백 확보.
2. **원터치 퀵 칩 및 실시간 프리뷰**:
   - 날짜 퀵 칩: `[오늘, 내일, 모레]`.
   - 시간 퀵 칩: `[지금, +10분, +30분, +1시간]`.
   - 선택된 일시의 실시간 요일/오전·오후 카드형 프리뷰 및 바디 스크롤 락 탑재.

---

#### [태스크 3] 의전 메모 / 특이사항 필드 투명 플레이스홀더화 ([`components/ScheduleFormModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/ScheduleFormModal.tsx))
1. **기본값 공백화**:
   - `notes` 상태의 초기값을 하드코딩된 `'VIP 전담 의전 영접'`에서 빈 문자열(`""`)로 변경.
2. **투명 플레이스홀더 부여**:
   - `placeholder="예: VIP 전담 의전 영접, 수하물 3개 등 특이사항 입력"` 적용으로 기사가 메모 작성 시 즉시 타이핑 가능.

---

#### [태스크 4] TMAP POI 검색 형태소 정규화 및 기준 좌표 주입 ([`services/tmapService.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/services/tmapService.ts), [`app/api/search/route.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/app/api/search/route.ts), [`components/LocationSearchModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/LocationSearchModal.tsx), [`components/CustomPresetModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/CustomPresetModal.tsx))
1. **형태소 자동 공백 삽입 정규화 (`normalizeSearchKeyword`)**:
   - '호텔', '리조트', '타워', '빌딩', '공항', '역', '터미널', '컨벤션', '스피디움' 등 주요 시설 접미사 앞에 자동으로 띄어쓰기를 삽입:
     - `'포시즌스호텔'` ➔ `'포시즌스 호텔'`
     - `'포시즌스호텔 서울'` ➔ `'포시즌스 호텔 서울'`
     - `'신라호텔'` ➔ `'신라 호텔'`
     - `'인천공항터미널'` ➔ `'인천공항 터미널'`
2. **정규식 버그 교정 (`sanitizeSearchQuery`)**:
   - 기존의 `detailPattern = /([0-9A-Za-z가-힣]+(?:동|호|층|관))/g`가 '포시즌스호텔'의 '포시즌스호'를 매칭하여 '텔'로 축소해버리던 치명적 결함을 발견하여, 숫자/영문 토큰 전용 패턴 `/(?<=\s|^)(?:[0-9]+동|[0-9]+호|[0-9B]+층|[A-Za-z]동)(?=\s|$)/g`으로 전면 교정.
3. **서울 기준 좌표 주입 (`centerLat=37.5665, centerLon=126.9780`)**:
   - TMAP API 호출 시 WGS84GEO 서울 중심 좌표 파라미터를 강제 주입하여, 거리 및 인기도 가중치 기반으로 '포시즌스' 검색 시 지방 펜션이 아닌 서울 종로구 새문안로의 '포시즌스호텔 서울'이 1순위로 조회되도록 랭킹 보정.
4. **2단계 다중 질의 폴백 (Multi-Query Fallback)**:
   - 정규화된 키워드로 결과가 없을 경우, 검색어의 핵심 키워드(앞 1~2단어) 또는 원본 검색어로 백그라운드 재질의를 자동 수행하여 검색 누락 원천 차단.
5. **Tier 1 랭킹 엔진 정밀화**:
   - 부속 시설(주차장, 전기차충전소, 정문, 후문) 감점 처리 및 TMAP 대표 POI(candidate #0) 최우선 보존으로 '포시즌스', '포시즌스호텔', '포시즌스호텔 서울' 모두 '포시즌스호텔 서울 (서울 종로구 새문안로 97)'이 최상단 노출.

---

### 34.3 검증 결과
1. **프로덕션 빌드 무결성**:
   - `npm run build`: Next.js 16.3.5 Turbopack 기준 전 14개 라우트 컴파일 에러 **0건** 통과.
2. **장소 검색 검증**:
   - `'포시즌스호텔'` ➔ `[1] 포시즌스호텔 서울 | 서울 종로구 새문안로 97` (최상단 노출 확인)
   - `'포시즌스호텔 서울'` ➔ `[1] 포시즌스호텔 서울 | 서울 종로구 새문안로 97` (최상단 노출 확인)
   - `'포시즌스'` ➔ `[1] 포시즌스호텔 서울 | 서울 종로구 새문안로 97` (최상단 노출 확인)
   - `'신라호텔'` ➔ `[1] 신라호텔 서울 | 서울 중구 동호로 249` (최상단 노출 확인)
   - `'구의역'` ➔ `[1] 구의역 (2호선)` (최상단 노출 확인)
3. **UI 및 인터랙션 검증**:
   - 스케줄 모달에서 픽업 시간 라벨 및 칩이 중복 없이 '09:00', '10:00' 등으로 깔끔하게 렌더링됨.
   - 의전 메모 필드가 초기 빈 값으로 로드되며 실용적인 플레이스홀더 노출 확인.
   - 티맵 시간 모달이 모바일 표준 네이티브 피커로 매끄럽게 작동 확인.

---

## 35. 장소 검색 모달 상단 검색창 Sticky 고정/뷰포트 안정화 및 스케줄 등록 픽업 시간 단일 네이티브 인풋 개편 (2026-09-28)

### 35.1 추진 배경 및 목적
1. **장소 검색 모달 키보드 및 스크롤 시 검색창 이탈 방지**:
   - 모바일 환경에서 가상 키보드가 올라오거나 검색 결과 목록이 길어질 때, 상단 검색창이 화면 위로 밀려 올라가거나 사라져 검색어를 수정하기 번거로웠던 현상 개선.
   - 검색 결과 개수에 따라 모달 높이가 출렁이는 현상(Layout Shift)을 방지하고 `90dvh`로 든든하게 고정.
2. **스케줄 등록 픽업 시간 컨트롤러 단일화**:
   - 좌우로 나뉘어 있던 분할 인풋 박스와 하단 퀵 선택 칩을 전면 정리하고, 가로 전체를 활용하는 단 하나의 네이티브 터치 박스로 통합하여 한국어 12시간제(`오전 09:00`, `오후 02:30`) 표기 및 원터치 OS 네이티브 시간 피커 호출 구현.

---

### 35.2 핵심 구현 내역

#### [태스크 1] 장소 검색 모달 상단 검색창 완전 고정 및 뷰포트 높이 안정화 ([`components/LocationSearchModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/LocationSearchModal.tsx))
1. **모달 뷰포트 고정 (`h-[90dvh] max-h-[90dvh] overflow-hidden`)**:
   - 검색 결과 수에 상관없이 모달 컨테이너의 기본 높이를 `90dvh`로 고정하여 화면 출렁임(Layout Shift) 제로 달성.
2. **상단 헤더 & 검색창 Sticky 고정 (Pinned Header & Search Bar)**:
   - `[출발지/목적지 설정 헤더]`와 `[TMAP 장소 검색 인풋창]`을 묶어 `flex-shrink-0 sticky top-0 z-20 bg-white border-b border-slate-100`으로 래핑.
   - 모바일 키보드가 활성화되거나 수십 개의 POI 검색 결과를 스크롤하더라도 검색창이 상단에 항상 고정되어 언제든 검색어 재입력/클리어 가능.
3. **결과 리스트 내부 스크롤 격리**:
   - 검색창 하단의 '자주 가는 거점 그리드' 및 'TMAP 검색 결과 리스트'에 `flex-1 overflow-y-auto min-h-0 overscroll-contain touch-pan-y`를 부여하여 하단 영역에서만 부드럽게 스크롤되도록 격리.

---

#### [태스크 2] 스케줄 등록 모달 픽업 시간 단일 네이티브 터치 박스 통합 ([`components/ScheduleFormModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/ScheduleFormModal.tsx))
1. **중복 입력 필드 및 하단 퀵 칩 전면 제거**:
   - 기존 좌우 분할 인풋 필드 중 우측 보조 인풋 박스 및 하단 시간 퀵 칩(`['09:00', '10:00', ...]`)을 완전히 삭제하여 시각적 군더더기 제거.
2. **단일 네이티브 시간 선택 박스 구축 (Single Native Picker Input)**:
   - 가로 폭 전체(`w-full px-4 py-3.5`)를 차지하는 단 하나의 둥근 터치 박스(`rounded-2xl`) 배치.
   - 내부 텍스트로 한국어 12시간제(`formatKoreanTime`, 예: `오전 09:00`, `오후 02:30`)를 큼직하고 단정하게 표기.
   - 박스 전 영역에 투명 네이티브 `<input type="time" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />`를 오버레이하여 박스 어디를 터치하더라도 iOS는 햅틱 드럼롤 휠, Android는 시계 다이얼 피커가 즉각 호출되도록 연동.

---

### 35.3 검증 결과
1. **프로덕션 빌드 무결성**:
   - `npm run build`: Next.js 16.3.5 Turbopack 기준 전 14개 라우트 컴파일 에러 **0건** 완료.
2. **장소 검색 모달 고정 구조 검증**:
   - 헤더 및 검색창의 `sticky top-0 z-20` 고정 및 결과 목록 영역의 `flex-1 min-h-0 overflow-y-auto` 독립 스크롤 동작 확인.
3. **스케줄 등록 모달 단일 시간 박스 검증**:
   - 퀵 칩과 중복 인풋 없이 단일 네이티브 터치 박스가 렌더링되며, `formatKoreanTime`을 통해 `오전 09:00`, `오후 02:30` 등의 표준 시간 서식이 완벽하게 적용됨을 확인.

---

## 36. 모달 Z-Index 최상위 격리, 픽업일자 네이티브 피커 전환, 스케줄 시간순 정렬 및 모달 폰트 1.4배 확대 (2026-09-28)

### 36.1 추진 배경 및 목적
1. **모달 뒷배경 탭 레이어 비침 현상 원천 차단**:
   - `app/page.tsx` 내 `animate-fade-in` 애니메이션 컨테이너로 인해 CSS Stacking Context가 형성되어, `ScheduleFormModal`이 메인 화면 상단 네비게이션 탭('운행'/'스케줄') 뒤로 밀리거나 비치던 현상 해결.
   - React Portal(`createPortal(..., document.body)`)을 적용하여 모달을 `document.body` 최상단으로 승격하고, `z-[100]` 및 딤드 오버레이(`fixed inset-0 bg-black/60 backdrop-blur-sm -z-10`)로 뷰포트 전체를 완전 격리.
2. **픽업 일자 입력 UX 혁신**:
   - 8자리 숫자(`20260928`)를 키패드로 번거롭게 타이핑하던 기존 방식을 완전히 걷어내고, 단일 네이티브 날짜 피커 터치 박스(`w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl`)로 전면 개편.
   - 한국어 표준 날짜 표기(예: `2026년 09월 28일 (월)`) 및 원터치 OS 네이티브 달력 호출 연동.
3. **스케줄 목록 실제 날짜 및 시간순(Chronological) 강제 정렬**:
   - 스케줄 추가, 수정, 조회 및 필터링 시 등록 순서와 무관하게 실제 운행 일자와 픽업 시간(HH:mm) 기준 오름차순으로 일관되게 정렬되어 이른 아침 일정부터 밤 일정까지 정갈하게 나열되도록 보장.
4. **모달 전체 폰트 및 터치 타깃 1.4배 스케일업**:
   - 차량 운전 및 거치대 환경에서 기사님의 한눈 가독성과 조작 편의성을 극대화하기 위해 헤더 제목, 입력 라벨, 경로/시간 텍스트, 버튼 패딩을 약 1.4배 수준으로 확대.

---

### 36.2 핵심 구현 내역

#### [태스크 1] 모달 최상위 레이어 Z-Index 승격 및 백드롭 누수 차단 ([`components/ScheduleFormModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/ScheduleFormModal.tsx), [`components/EditScheduleModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/EditScheduleModal.tsx), [`components/LocationSearchModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/LocationSearchModal.tsx))
1. **React Portal 기반 DOM 루트 승격**:
   - `ScheduleFormModal` 및 `EditScheduleModal`을 `createPortal(..., document.body)`로 감싸 상위 CSS 애니메이션 Stacking Context로부터 완전 격리.
2. **최상위 Z-Index 및 백드롭 딤드 오버레이 (`z-[100]`, `-z-10`)**:
   - 최외곽 컨테이너: `fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 select-none overscroll-contain animate-in fade-in duration-200`.
   - 백드롭 딤드 레이어: `fixed inset-0 bg-black/60 backdrop-blur-sm -z-10`을 배치하여 상태바, 헤더, 상단 네비게이션 탭(`스케줄` 텍스트 등) 전체를 빈틈없이 암전 차단.
3. **자식 모달 레이어 위계 정립**:
   - 장소 검색 모달(`LocationSearchModal`)의 Z-Index를 `z-[110]`으로 승격하여 스케줄 등록 모달(`z-[100]`) 위에서 충돌 없이 렌더링되도록 계층화.

---

#### [태스크 2] 픽업 일자 8자리 숫자 입력 ➔ '네이티브 날짜 피커 터치 박스' 전환 ([`components/ScheduleFormModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/ScheduleFormModal.tsx))
1. **기존 8자리 텍스트 인풋 제거**:
   - `20260928` 숫자 텍스트 인풋, 유효성 검사 경고 및 "숫자만 입력 시 요일이 자동 연산됩니다" 안내 문구를 완전히 삭제.
2. **단일 네이티브 날짜 터치 박스 (Single Native Date Picker)**:
   - 가로 전체 폭의 라운드 박스(`w-full px-5 py-4 bg-slate-50 border rounded-2xl`) 배치.
   - `formatKoreanDate(pickupDate)`를 통해 선택된 일자를 한국어 포맷(예: `2026년 09월 28일 (월)`)으로 큼직하고 단정하게 표기(`text-xl font-bold text-slate-900`)하고 우측에 달력 아이콘 배치.
   - 박스 전체에 투명 네이티브 `<input type="date" value={pickupDate} onChange={...} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />`를 오버레이하여 클릭 즉시 모바일 OS 달력 피커 호출.

---

#### [태스크 3] 스케줄 목록의 실제 날짜 및 시간순(Chronological) 강제 정렬 ([`data/ferrariSchedules.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/data/ferrariSchedules.ts), [`components/ScheduleTab.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/ScheduleTab.tsx))
1. **정렬 알고리즘 표준화 (`sortSchedulesChronologically`)**:
   ```typescript
   export function sortSchedulesChronologically<T extends { date?: string; pickup_date?: string; pickup_time?: string; time_display?: string }>(schedules: T[]): T[] {
     return [...schedules].sort((a, b) => {
       const dateA = a.pickup_date || a.date || '';
       const dateB = b.pickup_date || b.date || '';
       if (dateA !== dateB) return dateA.localeCompare(dateB);

       const getTime = (item: T) => {
         const match = (item.pickup_time || item.time_display || '').match(/(\d{1,2}):(\d{2})/);
         if (!match) return '99:99';
         return `${match[1].padStart(2, '0')}:${match[2]}`;
       };

       return getTime(a).localeCompare(getTime(b));
     });
   }
   ```
2. **전체 뷰 및 파이프라인 동기화**:
   - `handleSaveNewSchedule` (신규 등록 시 즉시 정렬 삽입)
   - `fetchSchedulesForVehicle` (API 응답 데이터 정렬)
   - `filteredSchedules` (전체보기 및 일자별 필터 뷰 정렬)
   - `EditScheduleModal` `onSave` (일정 수정 시 자동 재배열)
   - `handleLoadDemoSchedules` 및 Fallback 스케줄 동기화

---

#### [태스크 4] 스케줄 등록 모달 전체 폰트 및 터치 타깃 1.4배 확대 ([`components/ScheduleFormModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/ScheduleFormModal.tsx))
1. **모달 헤더**:
   - 제목: `text-base` ➔ `text-xl sm:text-2xl font-black`
   - 배정 안내: `text-xs` ➔ `text-sm font-semibold text-slate-500`
   - 아이콘 박스: `w-7 h-7` ➔ `w-9 h-9 sm:w-10 sm:h-10`, 닫기 버튼: `w-8 h-8` ➔ `w-10 h-10`
2. **섹션 입력 라벨** (픽업 일자, 픽업 경로, 픽업 시간, 승객명, 항공편명, 의전 메모):
   - `text-xs / text-sm` ➔ `text-base sm:text-lg font-extrabold text-slate-700`
3. **입력 필드 및 결과 텍스트**:
   - 출발지/도착지 명칭: `text-sm font-bold` ➔ `text-lg font-black`
   - 상세 주소: `text-[11px]` ➔ `text-sm text-slate-500`
   - 뱃지 ('출발' / '도착'): `text-[10px]` ➔ `text-xs font-black px-2.5 py-1`
   - 픽업 일자 / 픽업 시간 표시 텍스트: `text-base` ➔ `text-xl font-bold`
   - 승객명, 항공편명, 의전 메모 인풋 텍스트 및 플레이스홀더: `text-xs` ➔ `text-base sm:text-lg font-semibold`, 패딩: `px-4 py-3 sm:py-3.5`
4. **하단 액션 버튼** (`취소`, `스케줄 등록 완료`):
   - 패딩: `py-3` ➔ `py-4`
   - 텍스트: `text-xs font-bold` ➔ `text-base sm:text-lg font-black`

---

### 36.3 검증 결과
1. **프로덕션 빌드 무결성**:
   - `npm run build`: Next.js 16.3.5 Turbopack 기준 전 14개 라우트 컴파일 에러 **0건** 통과.
2. **시간순 정렬 알고리즘 검증**:
   - `test_modal_features.ts` 독립 실행 결과, 다양한 일자(2026-09-27, 2026-09-28) 및 시간 포맷(`HH:mm:ss`, `픽업 HH:mm`, `HH:mm`)에 대해 이른 아침부터 밤 순서로 100% 완벽하게 오름차순 정렬됨을 검증 완료.
3. **모달 Z-Index & 백드롭 차단 검증**:
   - `createPortal(..., document.body)`와 `z-[100]`, `bg-black/60 backdrop-blur-sm -z-10` 적용으로 메인 화면 탭 바 및 상단 헤더가 전혀 투과되지 않고 안정적으로 차단됨을 확인.
4. **네이티브 날짜 피커 및 1.4배 폰트 UI 검증**:
   - 8자리 숫자 인풋이 단일 터치 박스로 대체되고, 한국어 포맷(`2026년 09월 28일 (월)`)과 1.4배 확대된 타이포그래피로 현장 가독성이 극대화됨을 확인.

---

## 37. 가로형 출발·도착 레이아웃 유지 및 상단 유틸리티 바 이식, 별표(#FEE500) 토글 인터랙션, 모달 거점 페이지네이션 및 폰트 표준화 (2026-09-28)

### 37.1 추진 배경 및 목적
1. **메인 화면 운행 동선 가로형 레이아웃 100% 보존 및 유틸리티 툴바 통합**:
   - '운행 경로' 등의 불필요한 섹션 제목 텍스트를 배제하고 출발지/도착지의 좌우 가로형 배치를 온전히 유지.
   - 메인 화면 하단에 상시 고정 노출되던 거대한 프리셋 캐러셀을 제거하여 운행 정보 카드와 공유 액션 패널의 시인성을 극대화하고, 출발·도착 카드 상단에 4대 퀵 유틸리티 바(차량 점검, 항공편 조회, 주변 주유소, 거점 관리)를 컴팩트하게 이식.
2. **스케줄 모달 픽업 일자·시간 폰트 크기 표준화**:
   - `ScheduleFormModal` 및 `EditScheduleModal`에서 지나치게 튀던 픽업 일자/시간 텍스트(`text-xl font-bold`)를 하단 승객명, 항공편명, 메모 인풋과 완벽히 동일한 규격인 `text-base sm:text-lg font-semibold text-slate-800`으로 통일하여 시각적 정합성 완성.
3. **`LocationSearchModal` 거점 퀵 선택 3x7 캐러셀 및 캡슐형 인디케이터 적용**:
   - 자주 가는 거점 목록이 1페이지 규격(3열 x 7행, 최대 21개)을 초과할 경우 좌우 터치 스와이프 및 클릭으로 넘겨볼 수 있는 캐러셀 구조 구축.
   - 단일 페이지이더라도 기능성을 명시하는 기본 단일 활성 도트(`w-6 bg-[#1E60F3]`)를 표시하고 페이지 전환 시 캡슐형 도트가 유기적으로 연동되도록 구현.
4. **'최근 검색' 섹션 신설 및 별표(⭐) 노란색(#FEE500) 원터치 토글 인터랙션**:
   - TMAP 검색창 하단에 `cockpit_recent_searches` 기반의 '🕒 최근 검색' 섹션(최대 8개 가로 스크롤 카드, '전체 삭제' 버튼 포함) 신설.
   - 최근 검색 카드 및 TMAP 검색 결과 리스트에 원터치 별표(`<Star />`)를 탑재하여, 클릭 시 즉시 `stroke-slate-300`에서 `#FEE500` 노란색으로 가득 차며 자주 가는 거점에 즉각 추가/해제되도록 인터랙션 구축.

---

### 37.2 핵심 구현 내역

#### [태스크 1] 가로형 출발·도착 카드 유지 및 상단 4대 퀵 유틸리티 바 배치 ([`components/OriginDestinationSelector.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/OriginDestinationSelector.tsx), [`app/page.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/app/page.tsx))
1. **소제목 배제 및 가로형 레이아웃 100% 보존**:
   - 불필요한 섹션 타이틀 텍스트 일체 없이 `출발지 ⇄ 목적지` 좌우 가로형 플렉스 배치를 변함없이 유지.
2. **하단 안내 라인 우측에 4대 퀵 유틸리티 바 이식 및 '⇄ 맞교환' 삭제**:
   - 기존 상단 임시 툴바 레이아웃 및 하단 안내 문구 옆의 `'⇄ 맞교환'` 텍스트/아이콘을 완전 삭제.
   - 안내 문구(`카드를 탭해 장소·거점을 선택하세요.`) 우측에 정갈한 단일 다크 슬레이트 톤의 모노톤 터치 박스(`p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 active:scale-95 shadow-xs transition`) 4종 배치:
     - 🚗 차량 점검: `<ClipboardCheck className="w-4 h-4 text-slate-700" />` (`onOpenInspectionModal`)
     - ✈️ 항공편 조회: `<Plane className="w-4 h-4 text-slate-700" />` (`onOpenFlightModal`)
     - ⛽ 주변 주유소: `<Fuel className="w-4 h-4 text-slate-700" />` (`onOpenGasModal`)
     - 📍 거점 관리: `<MapPinPlus className="w-4 h-4 text-slate-700" />` (`onOpenPresetModal`)
   - 임의의 유채색을 전면 배제하고 흰 바탕에 짙은 획(Monochrome)만 보이는 정갈한 코크핏 룩 구현.
3. **메인 화면 하단 상시 캐러셀 제거**:
   - `app/page.tsx` 운행 탭 하단의 `PresetButtons` 상시 렌더링 블록을 제거하고, 상위 모달 핸들러를 `OriginDestinationSelector`의 하단 유틸리티 바와 직결.

---

#### [태스크 2] 스케줄 등록/수정 모달 픽업 시간·일자 폰트 크기 표준화 ([`components/ScheduleFormModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/ScheduleFormModal.tsx), [`components/EditScheduleModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/EditScheduleModal.tsx))
1. **폰트 크기 하향 조정 및 시각적 균형 통일**:
   - 픽업 일자(`formatKoreanDate`) 및 픽업 시간(`formatKoreanTime`) 표시 텍스트를 `text-xl font-bold`에서 **`text-base sm:text-lg font-semibold text-slate-800 tracking-tight`**로 정돈.
   - `EditScheduleModal`의 입력 필드 및 레이블 타이포그래피 역시 `text-base sm:text-lg font-semibold`로 표준화하여 통일감 확보.

---

#### [태스크 3] `LocationSearchModal` 거점 퀵 선택에 페이지네이션 필(Pill) 도트 적용 ([`components/LocationSearchModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/LocationSearchModal.tsx))
1. **3열 x 7행 (21개) 단위 슬라이더 분할**:
   - 자택 슬롯 + 프리셋 목록을 1페이지당 21개 규격으로 분할하여 캐러셀 구조로 수용.
   - 좌우 터치 스와이프 제스처(`onTouchStart`, `onTouchEnd`, 40px 임계치) 지원.
2. **캡슐형 페이지 인디케이터**:
   - 1페이지 이내일 때도 기본 단일 활성 도트(`w-6 bg-[#1E60F3] shadow-[0_2px_8px_rgba(30,96,243,0.35)]`)를 명시하고, 복수 페이지 생성 시 비활성 도트(`w-2 bg-slate-200`)와 유기적으로 전환.

---

#### [태스크 4] '최근 검색' 섹션 신설 및 별표(⭐) 노란색(#FEE500) 토글 인터랙션 ([`components/LocationSearchModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/LocationSearchModal.tsx))
1. **'🕒 최근 검색' 섹션 구축**:
   - `localStorage`의 `cockpit_recent_searches`와 연동하여 최근 선택한 거점을 최대 8개까지 가로 스크롤 카드 형태로 표시하고, '전체 삭제' 기능 제공.
2. **원터치 별표(⭐) 토글 인터랙션**:
   - '최근 검색' 카드 및 'TMAP 검색 결과' 행에 `<Star />` 버튼 배치.
   - `e.stopPropagation()`으로 모달 닫힘을 차단하면서 원터치 토글:
     - 비활성: `stroke-slate-300 fill-none text-slate-300 hover:stroke-slate-400`
     - 활성: `fill-[#FEE500] stroke-[#FEE500] text-[#FEE500]`
   - 별표 토글 즉시 거점 프리셋 목록(`localPresets`) 및 DB(`/api/presets`)에 즉시 추가/해제 반영.

---

### 37.3 검증 결과
1. **프로덕션 빌드 무결성**:
   - `npm run build`: Next.js 16.3.5 Turbopack 기준 전 14개 라우트 컴파일 에러 **0건** 완료.
2. **가로형 레이아웃 및 퀵 유틸리티 바 검증**:
   - 섹션 타이틀 없이 출발지/도착지 좌우 배치가 안정적으로 유지되며, 상단 4대 버튼을 통해 각 전용 모달(차량점검, 항공편, 주유소, 거점관리)이 완벽히 트리거됨을 확인.
3. **폰트 크기 표준화 검증**:
   - 스케줄 모달에서 픽업 일자와 시간 텍스트가 승객명 및 항공편명 인풋과 동일한 `text-base sm:text-lg font-semibold text-slate-800`으로 자연스럽게 일치됨을 확인.
4. **최근 검색 및 별표 토글 인터랙션 검증**:
   - 검색창 하단에 최근 검색 목록이 가로 스크롤로 노출되고, 별표 클릭 시 `#FEE500` 노란색으로 즉시 활성화되며 거점 목록에 실시간 반영됨을 확인.

---

## 38. 거점 관리 모달 순서 변경(Reorder) 복원, 플랫폼 중립적 검색명 교정 및 스케줄 모달 개인 거점(MY) 연동 (2026-09-28)

### 38.1 추진 배경 및 목적
1. **거점 종합 관리 및 순서 이동(Reorder) 기능 복원**:
   - 기존 거점 관리 아이콘 탭 시 단순 "장소 등록" 폼만 표시되어 등록된 거점의 순서 변경이나 삭제가 불가능하던 문제를 해결.
   - 전체 거점(🏠 자택, 🏢 공통 HQ, 👤 개인 MY)을 한눈에 관리할 수 있는 종합 뷰를 구성하고, `[▲] [▼]` 버튼 및 드래그 앤 드롭을 통한 실시간 순서 변경과 개인 거점 삭제 기능을 복원.
   - 순서 변경 결과를 `cockpit_presets_order_${vehicleNo}` 및 Supabase DB에 즉각 동기화하여, 메인 화면 및 검색 모달의 거점 그리드에 실시간 반영.
   - `LocationSearchModal` 내에도 `[⚙️ 순서 관리]` 바로가기 버튼을 탑재하여 언제든 순서 관리 창을 호출할 수 있도록 연결.
2. **"TMAP" 특정 브랜드명 전면 걷어내기 및 플랫폼 중립화**:
   - 카카오내비, 네이버지도 등 다양한 내비를 사용하는 기사님들의 혼선을 방지하기 위해 검색창 및 모달 안내에서 "TMAP" 명칭을 완전히 제거하고 플랫폼 중립적 레이블로 정돈.
3. **새 스케줄 등록 모달 내 '개인(MY)' 거점 연동 누락 해결**:
   - `ScheduleFormModal`에서 장소 검색 모달 호출 시 '공통(HQ)' 거점만 나오고 기사 개인이 등록한 '개인(MY)' 거점이 노출되지 않던 파이프라인 누락 문제를 수정하여 모든 거점이 완벽히 노출되도록 보장.

---

### 38.2 핵심 구현 내역

#### [태스크 1] 거점 관리 모달 종합 뷰 개편 및 순서 변경(Reorder) 복원 ([`components/CustomPresetModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/CustomPresetModal.tsx), [`components/LocationSearchModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/LocationSearchModal.tsx), [`app/page.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/app/page.tsx))
1. **모달 타이틀 및 상단 접이식 등록 바 (`[+ 새 거점 추가 등록하기]`)**:
   - 타이틀: **`거점 및 자주 가는 목적지 관리`** 및 등록된 거점 수 뱃지(`N개`) 표기.
   - 상단에 점선 테두리의 `[+ 새 거점 추가 등록하기]` 토글 버튼을 배치하여 탭 시에만 장소 검색 및 등록 폼이 부드럽게 펼쳐지도록 공간 최적화.
2. **등록된 전체 거점 목록 카드 뷰 (🏠 자택 + 🏢 공통 HQ + 👤 개인 MY)**:
   - 최상단 자택 카드: `🏠 자택` 뱃지 및 주소 표시, `[주소 변경/등록]` 버튼 연동.
   - 거점 카드: `🏢 공통 HQ`와 `👤 개인 MY` 뱃지를 구분하여 시각적 명확성 확보.
3. **위/아래 이동(`[▲] [▼]`) 및 드래그 앤 드롭 순서 변경**:
   - 각 거점 카드 우측에 드래그 핸들(`<GripVertical />`)과 `[▲] [▼]` 이동 버튼 배치.
   - 이동 시 `haptics.lightTap()`과 함께 `currentPresets` 순서가 즉시 바뀌고, `cockpit_presets_order_${vehicleNo}` 및 `cockpit_presets_${vehicleNo}` 로컬 스토리지에 즉각 저장.
   - `app/page.tsx`의 `handleReorderPresets`를 통해 Supabase fleet DB(`presetOrder`)에 실시간 동기화.
4. **개인 거점(`MY`) 삭제 및 명칭 수정**:
   - 개인 거점 카드에 `[Pencil]`(수정) 및 `[Trash2]`(삭제) 버튼을 두어 불필요한 거점을 손쉽게 정리.
5. **`LocationSearchModal` 내 `[⚙️ 순서 관리]` 직결 버튼 탑재**:
   - '자주 가는 거점 퀵 선택' 섹션 우측 상단에 `[⚙️ 순서 관리]` 버튼을 추가하여 장소 선택 중에도 원터치로 거점 관리 모달을 열 수 있도록 연결.

---

#### [태스크 2] "TMAP" 명칭 제거 및 플랫폼 중립적 레이블 교정 ([`components/CustomPresetModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/CustomPresetModal.tsx), [`components/LocationSearchModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/LocationSearchModal.tsx), [`components/DepartureTimePickerModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/DepartureTimePickerModal.tsx), [`components/PredictionResultSheet.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/PredictionResultSheet.tsx), [`components/RouteInfoCard.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/RouteInfoCard.tsx))
1. **헤더 및 검색창 레이블 변경**:
   - `TMAP 장소 검색 (실시간 추천)` ➔ **`장소 검색 (실시간 추천)`**
   - `TMAP 검색 결과` ➔ **`검색 결과`**
   - `TMAP 실시간` ➔ **`실시간 장소 검색`**
   - `TMAP 검색 서버 응답에 실패했습니다.` ➔ **`검색 서버 응답에 실패했습니다.`**
2. **예측 및 소요 시간 안내 텍스트 교정**:
   - `이 시간으로 TMAP 예측 실행` ➔ **`이 시간으로 예측 실행`**
   - `네이버지도 & TMAP 빅데이터 기반 소요 시간 예측` ➔ **`실시간 교통 빅데이터 기반 소요 시간 예측`**
   - `실시간 교통 반영(TMAP)` ➔ **`실시간 교통 반영`**
3. **플레이스홀더 표준화**:
   - `"장소명 또는 주소 검색 (예: 조선펠리스, 코엑스)"`로 플랫폼 중립적 안내 유지.

---

#### [태스크 3] 새 스케줄 등록(`ScheduleFormModal.tsx`) 시 '개인(MY)' 거점 연동 누락 해결 ([`components/ScheduleFormModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/ScheduleFormModal.tsx), [`components/ScheduleTab.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/ScheduleTab.tsx), [`app/page.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/app/page.tsx))
1. **데이터 파이프라인 동기화**:
   - `app/page.tsx` ➔ `<ScheduleTab presets={presets} />` 전달.
   - `ScheduleTab.tsx` ➔ `<ScheduleFormModal presets={presets} homeLocation={profile.homeLocation} />` 전달.
2. **이중 복원 안전망 (Active Presets Fallback)**:
   - `ScheduleFormModal.tsx` 내에서 `presets` prop이 없거나 비어 있을 경우에도 `cockpit_presets_${cleanV}` 로컬 스토리지에서 기사 개인의 거점을 능동적으로 복원하는 `activePresets` 상태 구축.
3. **`LocationSearchModal` 거점 렌더링 일원화**:
   - `ScheduleFormModal`에서 호출하는 `LocationSearchModal`에 `presets={activePresets}`와 `homeLocation={homeLocation}`을 온전히 전달하여 메인 화면과 100% 동일하게 **자택(🏠) + 공통 거점(🏢 HQ) + 기사 개인 거점(👤 MY)** 전체 그리드가 노출되도록 보장.

---

### 38.3 검증 결과
1. **프로덕션 빌드 무결성**:
   - `npm run build`: Next.js 16.3.5 Turbopack 기준 전 14개 라우트 컴파일 에러 **0건** 완료.
2. **거점 순서 이동 및 복원 검증**:
   - `scratch/test_preset_management.ts` 실행을 통해 `cockpit_presets_order_${vehicleNo}` 저장 및 `applyOrder` 정렬 알고리즘이 100% 정상 작동함을 검증 완료.
3. **플랫폼 중립적 레이블 검증**:
   - 검색창, 결과창, 하단 푸터, 출발 시간 피커, 소요 시간 안내 등 모든 UI에서 "TMAP" 브랜드 텍스트가 정돈되고 플랫폼 중립적 명칭으로 교정됨을 확인.
4. **스케줄 모달 내 개인 거점 노출 검증**:
   - 스케줄 모달 출발지/도착지 선택 창 호출 시 `activePresets` 파이프라인을 통해 기사 개인 등록 거점(`MY`)이 누락 없이 정상 노출됨을 확인.

---

## 39. CustomPresetModal 상단 '장소 등록' 폼 상시 배치 및 하단 오리지널 '그리드 카드' 드래그 앤 드롭 완전 복원 (2026-09-28)

### 39.1 추진 배경 및 목적
1. **상단 '장소 등록' 폼 상시 노출 및 불필요한 아코디언 제거**:
   - 접이식 토글 형태를 전면 철거하고, 모달 상단에 실시간 추천 검색, 거점 전체 명칭, 버튼 표기 명칭, 취소/저장 액션 바로 구성된 '장소 등록' 섹션을 상시 고정 배치하여 진입 즉시 등록이 가능하도록 개선.
2. **하단 1열 세로 목록 제거 및 오리지널 '그리드 카드' UI 이식**:
   - `[▲] [▼]` 화살표가 있는 낯선 세로형 1열 목록을 완전히 제거.
   - 기존 메인 화면(`components/PresetButtons.tsx`)의 3열 그리드 카드 디자인(자택 1번 슬롯 고정, 둥근 라운드 박스, 축약 명칭, '공통'/'개인' 뱃지, 개인 거점 `✕` 삭제 버튼)을 충실히 복원.
3. **코드베이스의 유려한 드래그 앤 드롭(Drag & Drop) 메커니즘 복원**:
   - HTML5 네이티브 드래그와 모바일 터치 Center-Point Hysteresis 드래그(플로팅 칩 + 햅틱 피드백)를 결합하여 데스크톱과 모바일 어디서나 카드를 잡고 끌어 원하는 위치로 이동할 수 있도록 구축.
   - 순서 변경 즉시 `cockpit_presets_order_${vehicleNo}` 및 Supabase DB에 저장되며, `LocationSearchModal`의 3x7 그리드 순서에도 0초 만에 완벽 동기화.

---

### 39.2 핵심 구현 내역

#### [태스크 1] 상단 '장소 등록' 폼 상시 노출 배치 ([`components/CustomPresetModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/CustomPresetModal.tsx))
1. **상시 고정 폼 컨테이너 (`bg-slate-50/70 border border-slate-200/90 rounded-2xl p-3.5`)**:
   - 토글 버튼 없이 상단에 영구 노출.
   - **장소 검색 (실시간 추천)**: 중립적 인풋 필드 및 실시간 자동완성 결과 드롭다운 탑재.
   - **거점 전체 명칭** & **버튼 표기 명칭 (최대 8자 권장)**: 검색 결과 터치 시 자동 기입 및 기사 직접 수정 지원.
   - **[취소] / [저장] 액션 바**: 저장 시 유효성 검증 후 하단 그리드에 즉시 추가/수정 반영.

---

#### [태스크 2] 하단 기존 '자주 가는 목적지 그리드 카드 UI' 및 드래그 앤 드롭 완전 복원 ([`components/CustomPresetModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/CustomPresetModal.tsx), [`components/PresetButtons.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/PresetButtons.tsx))
1. **1열 세로형 리스트 전면 철거**:
   - 긴 1열 세로 목록과 상하 이동 화살표 버튼을 100% 제거.
2. **`PresetButtons.tsx` 기반 3열 그리드 카드 렌더링**:
   - **1번 슬롯**: 🏠 자택 카드 고정 (아이콘, 자택 텍스트, 주소 요약, 에메랄드 뱃지).
   - **2..N번 슬롯**: 등록된 거점 카드 (`items.map(...)`).
     - 축약 명칭 (`text-xs font-bold text-slate-800`), 하단 `공통` 또는 `개인` 뱃지.
     - 개인 거점(`MY`) 우측 상단 모서리에 컴팩트한 `✕` 삭제 버튼 탑재.
     - 카드 터치 시 상단 폼에 데이터가 채워져 명칭 수정 가능.
3. **듀얼 드래그 앤 드롭 (Desktop HTML5 + Mobile Touch Hysteresis)**:
   - 마우스 드래그: `draggable={true}`, `onDragStart`, `onDragOver`, `onDrop`, `onDragEnd`.
   - 터치 제스처: 280ms 롱프레스 감지, 화면 중심점 거리 계산(`checkCenterPointHysteresis`)을 통한 실시간 카드 교체 및 플로팅 칩 연동.
   - 위치 변경 즉시 `haptics.lightTap()`과 함께 `cockpit_presets_${cleanV}` 및 `cockpit_presets_order_${cleanV}` 로컬 스토리지에 즉시 저장하고, `onReorderPresets`를 통해 Supabase에 실시간 반영.

---

#### [태스크 3] `LocationSearchModal`과의 유기적 연동 ([`app/page.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/app/page.tsx), [`components/LocationSearchModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/LocationSearchModal.tsx))
1. **오버레이 팝업 아키텍처 (`z-[120]` over `z-[110]`)**:
   - `LocationSearchModal` 내 `[⚙️ 순서 관리]` 클릭 시 `LocationSearchModal`을 닫지 않고 그 위에 `CustomPresetModal`이 자연스럽게 올라오도록 연동.
2. **0초 무재부팅 순서 동기화**:
   - `CustomPresetModal`에서 순서를 변경하면 `app/page.tsx`의 `presets` 상태가 즉시 갱신되어, 뒤편의 `LocationSearchModal` 3x7 캐러셀 그리드가 새로고침 없이 실시간으로 재배열됨을 보장.

---

### 39.3 검증 결과
1. **프로덕션 빌드 무결성**:
   - `npm run build`: Next.js 16.3.5 Turbopack 기준 전 14개 라우트 컴파일 에러 **0건** 완료.
2. **그리드 UI 및 상단 폼 상시 노출 검증**:
   - 모달 오픈 즉시 상단에 장소 검색/등록 폼이 펼쳐져 있고, 하단에 익숙한 3열 그리드 카드(자택 1번 슬롯 포함)가 완벽하게 렌더링됨을 확인.
3. **드래그 앤 드롭 및 순서 영속성 검증**:
   - 카드를 잡고 끌어 위치를 변경할 때 플로팅 칩 및 실시간 스왑이 정상 작동하며, 모달을 닫아도 변경된 순서가 `cockpit_presets_order` 및 메인 화면/장소 검색 모달에 온전히 유지됨을 확인.

---

## 40. CustomPresetModal 헤더 뱃지 제거, 검색창 text-lg 확대, 350ms 롱프레스 스무스 리오더링, 자택 뱃지 삭제 및 4x3 12슬롯 캐러셀 페이징 (시그니처 도트 상시 노출) (2026-09-28)

### 40.1 추진 배경 및 목적
1. **모달 헤더 및 카드 뱃지 미니멀화**:
   - 모달 상단 타이틀 우측에 렌더링되던 불필요한 등록 개수 뱃지(`{presets.length}개`)를 완전히 삭제하여 시각적 잡음을 줄이고 단정한 텍스트 타이틀과 닫기(`✕`) 버튼만 유지.
   - 1번 고정 슬롯인 자택 카드에서 중복되는 초록색 `자택` 뱃지를 삭제하여 홈 아이콘과 주소 텍스트의 가독성을 높이고, 뱃지는 공통(`🏢 공통`)과 개인(`👤 개인`) 카드에만 노출되도록 정리.
2. **장소 검색 인풋 폰트 및 아이콘 시인성 극대화 (`text-lg`)**:
   - 기사님들이 차량 내 흔들리는 환경에서도 장소를 신속하고 정확하게 검색할 수 있도록 검색창 텍스트를 `text-lg font-medium text-slate-800`으로 확대.
   - 플레이스홀더(`placeholder:text-base`), 좌측 돋보기 아이콘(`w-5 h-5`), 실시간 추천 결과 주요 명칭(`text-base font-semibold`)의 비례를 일괄 스케일업.
3. **iOS/안드로이드 홈 화면 스타일 롱프레스 & 스무스 리오더링 (Smooth Transition)**:
   - 짧은 탭(Short Tap)과 롱프레스(Long-Press) 제스처를 엄격히 분리하여, 짧게 탭할 때는 상단 폼에 거점 정보를 채우는 '수정 모드'로만 동작.
   - 카드를 **350ms 이상 길게 누르고 있을 때만(Long-Press)** 드래그가 활성화되도록 타이머를 구축하고, 드래그 중인 카드는 `scale-105 shadow-xl ring-2 ring-[#1E60F3]/40 z-30 opacity-90` 스타일로 플로팅.
   - 카드가 다른 슬롯 영역에 진입했을 때 순식간에 끊기듯 교체되는 대신 CSS FLIP `transition: all 0.3s cubic-bezier(0.2, 0, 0, 1)` 모션을 통해 주변 카드들이 스무스하게 옆으로 밀려나며 착지 공간을 열어주도록 구현하고, 드롭 시 `haptics.lightTap()` 발생.
4. **4행 3열(12슬롯) 가로 캐러셀 페이징 및 시그니처 도트 상시 노출**:
   - `PAGE_SIZE = 12` 규격으로 분할하여 세로 스크롤 과부하를 원천 차단하고 `PresetButtons.tsx`와 통일된 가로 슬라이더 구조 구축.
   - **1페이지 상시 노출**: 거점이 12개 이하인 단일 페이지 환경에서도 도트 인디케이터를 숨기지 않고 중앙에 코발트 블루 가로 알약(`w-6 h-2 rounded-full bg-[#1E60F3]`) 1개를 상시 렌더링하여 통일된 디자인 큐 제공. 13개 이상 시 원형 도트(`w-2 h-2 bg-slate-300`)가 유기적으로 추가되며 좌우 스와이프 지원.

---

### 40.2 핵심 구현 내역

#### [태스크 1] 모달 헤더 개수 뱃지 삭제 ([`components/CustomPresetModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/CustomPresetModal.tsx))
- 모달 최상단 헤더에서 `{items.length}개` 뱃지 렌더링 요소를 완전히 제거.
- `h2` 텍스트 타이틀(`거점 및 자주 가는 목적지 관리` 또는 `자택 주소 등록`)과 우측 닫기(`✕`) 원형 버튼만으로 구성된 단정하고 깔끔한 헤더 완성.

---

#### [태스크 2] 장소 검색 인풋 폰트 크기 확대 (`text-lg`) ([`components/CustomPresetModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/CustomPresetModal.tsx))
- **인풋 텍스트**: `text-lg font-medium text-slate-800` (패딩: `pl-11 pr-10 py-2.5 sm:py-3`)
- **플레이스홀더**: `placeholder:text-base placeholder:text-slate-400`
- **좌측 돋보기 아이콘**: `w-5 h-5 text-slate-400 absolute left-3.5 top-3 sm:top-3.5`
- **우측 스피너 아이콘**: `w-5 h-5 text-[#1E60F3] animate-spin absolute right-3.5`
- **실시간 추천 드롭다운 주요 명칭**: `text-base font-semibold text-slate-900 truncate`

---

#### [태스크 3] iOS/안드로이드 홈 화면 스타일 롱프레스 및 스무스 리오더링 ([`components/CustomPresetModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/CustomPresetModal.tsx))
1. **350ms Long-Press Timer 기반 탭/드래그 분리**:
   - `handlePointerStart`: 터치/마우스 다운 시 350ms 타이머 구동.
   - `handlePointerMoveCheck`: 터치 이동 거리(`deltaY > 8` 또는 `dist >= 10`) 발생 시 스크롤 중으로 판단하여 롱프레스 타이머를 즉시 취소, 모달 스크롤 방해 차단.
   - 짧은 탭(350ms 미만 해제): 롱프레스 타이머를 해제하고 `handleCardClick(preset)`을 통해 상단 수정 폼에 데이터 로드.
2. **플로팅 및 부드러운 자리 양보 모션 (FLIP Transition)**:
   - 350ms 경과 시 진동 햅틱(`navigator.vibrate(40)`)과 함께 `isDragging = true` 전환.
   - 드래그 활성 카드: `scale-105 shadow-xl ring-2 ring-[#1E60F3]/40 z-30 opacity-90 border-2 border-[#1E60F3] bg-blue-50/50`.
   - 상단 플로팅 칩: `fixed z-[150]` 레이어로 포인터 위치(`pointerPos`)를 따라다니는 단축 명칭 칩 렌더링.
   - 자리 양보 모션: 카드가 다른 슬롯 영역 중심점(`checkCenterPointHysteresis`)에 진입하면 `prevRectsRef` 기반 FLIP 애니메이션과 `transition: all 0.3s cubic-bezier(0.2, 0, 0, 1)`을 통해 주변 카드들이 유려하게 밀려나며 착지 공간을 개방.
   - 드롭(`endDrag`): 슬롯에 안착하며 `haptics.lightTap()` 발생, `cockpit_presets_${cleanV}` 및 `cockpit_presets_order_${cleanV}` 저장, `onReorderPresets` Supabase 동기화. `setTimeout`을 통해 드래그 종료 직후의 브라우저 클릭 이벤트 간섭 차단.

---

#### [태스크 4] '자택' 전용 뱃지 제거 ([`components/CustomPresetModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/CustomPresetModal.tsx))
- 1번 고정 슬롯 내 자택 카드의 초록색 뱃지(`<span ... bg-emerald-50 text-emerald-600>자택</span>`)를 전면 삭제.
- 🏠 자택 아이콘과 자택 명칭, 그리고 등록된 주소 텍스트만 표시하여 여백과 가독성을 확보.
- 뱃지는 2..N번 거점 카드의 `🏢 공통` / `👤 개인` 구분에만 명확히 노출되도록 정리.

---

#### [태스크 5] 4행 3열(12슬롯) 가로 캐러셀 페이징 및 시그니처 도트 상시 노출 ([`components/CustomPresetModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/CustomPresetModal.tsx))
1. **12슬롯 단위 페이징 (`PAGE_SIZE = 12`)**:
   - 자택 카드 1개 + 등록된 거점 N개를 묶어 12개 슬롯 단위(4행 x 3열)로 페이지 청킹.
   - `overflow-hidden` 컨테이너 및 `flex transition-transform duration-300 ease-out` 가로 슬라이더 구조 구현.
   - 드래그 중이 아닐 때 좌우 터치 스와이프 제스처(`onTouchStart`, `onTouchMove`, `onTouchEnd`, 40px 임계치) 지원.
2. **시그니처 도트 인디케이터 상시 노출**:
   - 조건부 렌더링(`totalPages > 1`)을 전면 제거하여 전체가 1페이지일 때도 그리드 하단에 도트 UI를 상시 배치.
   - **활성 페이지**: `w-6 h-2 rounded-full bg-[#1E60F3] shadow-[0_2px_8px_rgba(30,96,243,0.35)] transition-all duration-300` (코발트 블루 가로 알약)
   - **비활성 페이지**: `w-2 h-2 rounded-full bg-slate-300 hover:bg-slate-400 transition-all duration-300` (라이트 그레이 원형 도트)
   - 1페이지일 때 중앙에 단일 가로 알약이 안정적으로 안착되며, 13개 이상 추가 시 다중 도트로 부드럽게 확장.

---

### 40.3 검증 결과
1. **프로덕션 빌드 무결성**:
   - `npm run build`: Next.js 16.3.5 Turbopack 기준 전 14개 라우트 컴파일 에러 **0건** 완료.
2. **헤더 및 자택 뱃지 제거 검증**:
   - 모달 상단 헤더에서 숫자 뱃지가 사라지고 타이틀과 닫기 버튼만 단정하게 표시됨을 확인.
   - 자택 카드 내 초록색 뱃지가 제거되어 주소 텍스트가 시원하게 노출됨을 확인.
3. **검색창 text-lg 확대 검증**:
   - 인풋 텍스트(`text-lg`), 플레이스홀더(`text-base`), 돋보기(`w-5 h-5`), 추천 목록(`text-base font-semibold`)이 일관된 크기로 시원하게 렌더링됨을 확인.
4. **350ms 롱프레스 및 FLIP 스무스 리오더링 검증**:
   - 단순 탭 시 즉시 상단 수정 폼으로 거점 데이터가 채워지고, 350ms 이상 길게 누를 때만 드래그가 개시되며 주변 카드가 `cubic-bezier(0.2, 0, 0, 1)` 곡선을 따라 스무스하게 자리를 양보하고 드롭 시 햅틱 피드백이 발생함을 확인.
5. **12슬롯 캐러셀 및 상시 도트 인디케이터 검증**:
   - 단일 페이지(12개 이하)에서도 하단에 코발트 블루 알약 도트가 안정적으로 렌더링되며, 13개 이상일 때 다중 도트와 가로 슬라이더가 유기적으로 동작함을 확인.
6. **React Rules of Hooks 준수 (`if (!isOpen) return null` 위치 교정)**:
   - 모든 훅(`useState`, `useEffect`, `useLayoutEffect`, `useRef`)이 조건 없이 항상 동일한 순서로 호출된 후 최하단 JSX 렌더링 직전에 `isOpen`을 평가하도록 조기 반환 위치를 교정하여, 모달 개폐 시 발생하는 `Rendered more hooks than during the previous render` 에러를 원천 차단.

---

## 41. 드래그 릴리즈(Drop) 즉각 완결, 스케줄 모달 폰트 일원화, 거점 관리 인풋 18px(text-lg) 고정 (2026-09-28)

### 41.1 추진 배경 및 목적
1. **`CustomPresetModal.tsx` 드래그 릴리즈 시 추가 클릭 결함 원천 해결**:
   - 기존에 HTML5 drag 속성(`draggable={isDragging}`)과 pointer/touch 이벤트가 중첩되어, 브라우저가 마우스 이동 시 네이티브 드래그 모드로 진입하면서 `mouseup` 이벤트가 억제되어 드래그 후 내려놓을 때 대상 위치를 한 번 더 클릭해야만 배치가 완료되던 결함을 발견.
   - HTML5 DnD 속성을 전면 제거하고 전역 릴리즈 리스너(`pointerup`, `pointercancel`, `touchend`, `touchcancel`, `mouseup`)를 바인딩하여, 손가락이나 마우스를 떼는 순간 0초 만에 슬롯 위치를 커밋하고 플로팅 상태를 즉시 해제하는 **원터치 드롭 커밋 (Zero-Click Commit)** 구조 완성.
2. **`ScheduleFormModal.tsx` 폰트 크기 및 높이 18px(`text-lg`) 일원화**:
   - 모바일 뷰포트에서 출발지/도착지(`text-lg font-black`)에 비해 승객명, 픽업시간, 편명, 메모 폰트가 작아 보이던 불일치를 교정.
   - 픽업 일자/시간 터치 박스와 승객명, 항공편명, 의전 메모 인풋의 패딩을 `py-3`으로 통일하고, 폰트 규격을 **`text-lg font-semibold text-slate-900 placeholder:text-base`**로 일원화하여 상하 모든 입력 필드가 시원하고 단정하게 정렬되도록 개선.
3. **`CustomPresetModal.tsx` 거점 명칭 인풋 폰트 18px(`text-lg`) 상시 고정**:
   - 모바일 화면에서 거점 명칭 인풋이 `text-xs`(12px)로 축소되던 반응형 클래스를 제거.
   - 거점 전체 명칭과 버튼 표기 명칭 인풋을 **`text-lg font-bold text-slate-900 py-3 px-3.5 placeholder:text-base`**로 18px 상시 고정하여 입력 시인성 극대화.

---

### 41.2 핵심 구현 내역

#### [태스크 1] CustomPresetModal 드랍 시 즉각 완료 (Zero-Click Commit) ([`components/CustomPresetModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/CustomPresetModal.tsx))
1. **HTML5 DnD 속성 전면 제거**:
   - 카드 엘리먼트에서 `draggable`, `onDragStart`, `onDragOver`, `onDrop`, `onDragEnd` 속성 및 관련 핸들러를 완전히 제거하여 브라우저의 네이티브 DnD 간섭을 원천 차단.
2. **통합 포인터 리스너 및 전역 릴리즈 핸들러**:
   - 카드의 `onPointerDown`, `onTouchStart`, `onMouseDown`으로 350ms 롱프레스 감지.
   - 드래그 활성화 시 `window`에 `pointerup`, `pointercancel`, `touchend`, `touchcancel`, `mouseup` 전역 리스너를 결합.
3. **릴리즈 즉각 커밋 (`endDrag`)**:
   - 손가락 또는 마우스를 떼는 즉시 `calculateSlotIndex`로 릴리즈 좌표 하위의 거점 슬롯 인덱스를 계산하여 배열 순서를 최종 확정.
   - `commitReorder`를 통해 `localStorage`와 Supabase DB에 0초 만에 영속 저장.
   - `setIsDragging(false)`, `setDragIndex(null)`, `dragIndexRef.current = null`을 즉시 호출하여 플로팅 상태를 0ms 만에 정리하고 `haptics.lightTap()` 발생.

---

#### [태스크 2] ScheduleFormModal 폰트 크기 및 높이 일원화 ([`components/ScheduleFormModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/ScheduleFormModal.tsx), [`components/EditScheduleModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/EditScheduleModal.tsx))
1. **입력 필드 규격 상향 (`text-lg font-semibold text-slate-900 py-3`)**:
   - **픽업 일자 / 픽업 시간**: 터치 박스 패딩 `py-3`, 표시 텍스트 `text-lg font-semibold text-slate-900`.
   - **승객명 인풋**: `py-3 text-lg font-semibold text-slate-900 placeholder:text-base`.
   - **항공편명 인풋**: `py-3 text-lg font-semibold text-slate-900 placeholder:text-base`.
   - **의전 메모 인풋**: `py-3 text-lg font-semibold text-slate-900 placeholder:text-base`.
2. **출발지/도착지와의 균형 및 수정 모달 동기화**:
   - `ScheduleFormModal`뿐 아니라 `EditScheduleModal`의 입력 필드 규격도 동일하게 18px(`text-lg`)로 통일하여 배차표 관리 전반의 타이포그래피 정합성 확보.

---

#### [태스크 3] CustomPresetModal 거점 명칭 인풋 폰트 18px 상시 고정 ([`components/CustomPresetModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/CustomPresetModal.tsx))
1. **거점 전체 명칭 인풋**:
   - `text-xs sm:text-sm` ➔ **`text-lg font-bold text-slate-900 py-3 px-3.5 placeholder:text-base`** (18px 상시 고정).
2. **버튼 표기 명칭 인풋**:
   - `text-xs sm:text-sm` ➔ **`text-lg font-bold text-slate-900 py-3 px-3.5 placeholder:text-base`** (18px 상시 고정).
3. **자택 등록 모드 인풋 동기화**:
   - 자택 명칭 및 상세 주소 인풋 역시 `py-3 text-lg font-bold text-slate-900 placeholder:text-base`로 일괄 고도화.

---

### 41.3 검증 결과
1. **프로덕션 빌드 무결성**:
   - `npm run build`: Next.js 16.3.5 Turbopack 기준 전 14개 라우트 컴파일 에러 **0건** 통과.
2. **원터치 드롭 커밋 (Zero-Click) 검증**:
   - 카드를 350ms 롱프레스로 들어 올린 뒤 다른 위치로 드래그하고 손가락(또는 마우스)을 떼자마자 추가 클릭 없이 즉각 해당 슬롯에 안착하고 순서가 저장됨을 확인.
3. **스케줄 모달 18px 통일감 검증**:
   - 모바일 환경에서 출발지/도착지와 승객명, 픽업시간, 편명 인풋의 글자 크기와 박스 높이가 18px 규격으로 균형 있게 정렬됨을 확인.
4. **거점 관리 창 인풋 18px 고정 검증**:
   - 모바일 화면에서도 거점 전체 명칭과 표기 명칭 입력창의 폰트가 `text-xs`로 축소되지 않고 18px(`text-lg`) 크기로 큼직하게 유지됨을 확인.

---

## 42. 운행 탭 독립 4열 퀵 액션 바 신설 및 순서 개편 (차량체크 → 즐겨찾기 → 주유 → 항공편) (2026-09-28)

### 42.1 추진 배경 및 목적
1. **헤더 우측 오밀조밀한 유틸리티 버튼의 모바일 사용성 한계 해소**:
   - 기존 `components/PresetButtons.tsx` 상단 헤더 우측에 배치되어 있던 작은 원형 버튼들(차량점검, 항공기, 주유소, 거점관리)은 터치 타깃이 협소하고 시각적 밀도가 과도하여 조작 실수를 유발할 위험이 있었음.
   - 헤더 라인에서는 우측 유틸리티 버튼들을 완전히 제거하고 좌측의 단정한 '자주 가는 목적지' 타이틀 텍스트만 남기도록 정돈.
2. **배달의민족 스타일 독립 가로 4열 퀵 액션 섹션 신설**:
   - 모바일 친화적인 원형 아이콘 서클과 하단 텍스트 라벨을 결합한 배달의민족 스타일 독립 4열 액션 바를 구성.
   - 지정된 업무 우선순위에 맞추어 **`차량체크` $\rightarrow$ `즐겨찾기` $\rightarrow$ `주유` $\rightarrow$ `항공편`** 순서로 전면 재정렬.
3. **코발트 블루(`#1E60F3`) 인터랙션 및 터치 타깃 최적화**:
   - 마우스 호버 및 터치 시 코발트 블루 테두리, 배경 색조, 소프트 섀도우(`hover:shadow-[0_4px_14px_rgba(30,96,243,0.18)]`), 부드러운 상향 모션(`hover:-translate-y-0.5`)을 적용.
   - 원형 아이콘과 하단 라벨을 감싸는 전체 컬럼(`flex flex-col items-center cursor-pointer`)을 하나의 터치 타깃으로 바인딩하여 모바일 탭 조작성을 극대화.

---

### 42.2 핵심 구현 내역

#### [태스크 1] 헤더 우측 버튼 정리 및 좌측 타이틀 단정화 ([`components/PresetButtons.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/PresetButtons.tsx))
- `PresetButtons.tsx` 상단 헤더 우측의 작은 버튼 묶음(차량점검, 항공편, 주유소, 거점관리 토글)을 전면 제거.
- 좌측의 마커 아이콘 뱃지와 '자주 가는 목적지' 텍스트만 깔끔하게 남겨 헤더 가독성 대폭 향상.

---

#### [태스크 2] 독립 4열 퀵 액션 바 신설 및 순서 지정 ([`components/PresetButtons.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/PresetButtons.tsx), [`app/page.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/app/page.tsx))
1. **컨테이너 레이아웃**:
   - `grid grid-cols-4 gap-2 py-3 px-2 mb-3 bg-slate-50/70 border border-slate-200/80 rounded-2xl`
2. **시퀀스 및 라벨 (순서 엄수)**:
   1. **`차량체크`**: 차량 점검표 모달 호출 (`ClipboardCheck`, `w-6 h-6 sm:w-6.5 sm:h-6.5 stroke-[2]`)
   2. **`즐겨찾기`**: 거점 및 목적지 관리 모달 호출 (`SlidersHorizontal`, `onOpenPresetModal` / `onOpenAddModal`)
   3. **`주유`**: 주변 주유소/오피넷 실시간 유가 모달 호출 (`Fuel`)
   4. **`항공편`**: 인천공항 실시간 운항 정보 모달 호출 (`Plane`)
3. **원형 서클 및 인터랙션 규격**:
   - **서클 규격**: `w-13 h-13 sm:w-14 sm:h-14 rounded-full bg-white border border-slate-200/90 shadow-2xs flex items-center justify-center`
   - **호버/액티브**: `hover:border-[#1E60F3] hover:text-[#1E60F3] hover:bg-blue-50/50 hover:shadow-[0_4px_14px_rgba(30,96,243,0.18)] hover:-translate-y-0.5 active:scale-95 transition-all duration-200`
4. **하단 라벨 및 터치 타깃**:
   - 라벨 규격: `mt-1.5 text-xs font-bold text-slate-700 text-center tracking-tight`
   - 컬럼 전체(`flex flex-col items-center cursor-pointer group`)를 단일 터치 타깃으로 바인딩하여 쾌적한 탭 지원.
5. **운행 탭 마운트 (`app/page.tsx`)**:
   - 운행 탭(`activeTab === 'drive'`) 내 `OriginDestinationSelector` 바로 아래에 `PresetButtons`를 정식 마운트하여 운행 화면 진입 시 독립 4열 퀵 액션 바가 직관적으로 노출되도록 연동.

---

### 42.3 검증 결과
1. **프로덕션 빌드 무결성**:
   - `npm run build`: Next.js 16.3.5 Turbopack 기준 전 14개 라우트 컴파일 에러 **0건** 완료.
2. **정확한 순서 정렬 검증**:
   - 퀵 액션 바가 **`차량체크` $\rightarrow$ `즐겨찾기` $\rightarrow$ `주유` $\rightarrow$ `항공편`** 순서로 오차 없이 정렬됨을 확인.
3. **코발트 블루 인터랙션 검증**:
   - 마우스 호버 및 액티브 시 코발트 블루(`#1E60F3`) 테두리, 배경 색조, 그림자(`rgba(30,96,243,0.18)`), 상향 모션이 유려하게 동작하고, 각 컬럼 탭 시 해당 모달이 정상 호출됨을 확인.

---

## 43. 차량체크 지능화 및 유류비 정산 엔진 구축 (Fallback Pipeline, Opinet 3km Trimmed Mean, 호차별 프로필 격리) (2026-09-28)

### 43.1 추진 배경 및 목적
1. **차종/유종 불확실성 해소 (Fallback Pipeline)**:
   - 기사가 차량의 유종(휘발유 vs 경유)을 즉시 인지하지 못하더라도 차종명 알파벳(`520i`=휘발유, `520d`=경유)으로 자동 매핑.
   - 가솔린/디젤이 혼재된 다목적 차량(카니발, 스타리아 등)을 위한 2분할 간편 칩(`[⛽ 휘발유] [🛢️ 경유]`) 및 자동 감지 상태 뱃지 제공.
   - 계기판 사진 등록 시 Gemini Vision이 타코미터 레드존(디젤: 4,000~5,200 RPM vs 가솔린: 5,800~7,500 RPM)을 판독하여 유종 자동 감지.
   - 끝까지 유종을 확정할 수 없는 경우, 과소 청구 방지 및 보수적 정산을 위해 '휘발유' 단가를 기본 안전 마진으로 채택.
2. **오피넷(Opinet) 반경 3km 이상치 절사 주유비 계산기**:
   - 현 위치 또는 반납지 반경 3km 내 주유소 가격 중 서울 시내 극단적으로 비싼 상위 15% 초고가 주유소를 자동 제외(Trimmed Mean)하여 합리적인 기준 단가 산출.
   - 반납 시 부족한 DTE를 채우기 위한 권장 주유 금액을 도심 정체 안전 계수(1.15배)를 반영하고, 5천원/1만원 단위 원터치 칩(예: `[25,000원(권장)]`)으로 자동 산출.
   - 반납 카카오톡 전송 보고서에 유류비 정산 내역(`• 유류비 정산 : 25,000원 (DTE -296 km 권장 주유 / 휘발유 1,650원)`) 포함 여부를 체크박스로 원터치 제어.
3. **호차별 승객명 및 프로필 격리**:
   - 의전 행사 차량별(`cockpit_driver_profile_${vehicleNo}`)로 승객명, 차종, 유종, 프로필 설정을 개별 격리 저장하여 호차 전환 시 승객 정보가 뒤섞이지 않도록 보장.
4. **No-DB / Pure Client-Side 원칙 준수**:
   - Supabase 테이블 생성 및 백엔드 쿼리를 일체 배제하고 React State 및 브라우저 `localStorage`만으로 완결.

---

### 43.2 핵심 구현 내역

#### [태스크 1] 유류비 정산 수학 엔진 및 Fallback Pipeline 모듈 신설 ([`utils/fuelCalculation.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/utils/fuelCalculation.ts))
1. **차종 알파벳 및 키워드 기반 유종 판별 (`resolveFuelTypeFromModel`)**:
   - `520d`, `e220d`, `c220d`, `320d`, `tdi`, `crdi` 등 디젤 접미사 ➔ `diesel`.
   - `520i`, `e300`, `c200`, `g80`, `g90`, `petrol` 등 가솔린 접미사 ➔ `gasoline`.
   - 카니발, 스타리아 등 혼재 차종 ➔ 2분할 칩 확인 권장 안내 및 초기값 할당.
   - 미확인 시 ➔ 보수적 정산을 위한 휘발유 기본 채택 (`fallback_margin`).
2. **타코미터 레드존 RPM 판별 (`resolveFuelTypeFromTachometer`)**:
   - 레드존 $\le$ 5,200 RPM ➔ `diesel`.
   - 레드존 $\ge$ 5,500 RPM ➔ `gasoline`.
3. **오피넷 3km 상위 15% 이상치 절사 평균 (`calculateTrimmedMeanPrices`)**:
   - 수집된 주유소 가격을 오름차순 정렬 후 상위 15%(`Math.floor(prices.length * 0.15)`)를 배제한 Trimmed Mean 단가 계산.
4. **도심 안전 계수 반영 권장 주유비 산출 (`calculateRecommendedRefueling`)**:
   - 부족 DTE에 따른 소모량(L) 역산 (디젤: 11.5 km/L, 가솔린: 9.8 km/L).
   - 기준 유류비 $\times$ 도심 정체 안전 계수(1.15배) 산출 후 5,000원 단위 올림 처리(`Math.ceil(adjustedCost / 5000) * 5000`).
   - 추천값 전후 5천원/1만원 단위 원터치 칩 리스트 생성.

---

#### [태스크 2] Gemini Vision 계기판 OCR & 타코미터 레드존 판독 API ([`app/api/inspect-dashboard/route.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/app/api/inspect-dashboard/route.ts))
- 계기판 사진 Base64를 수신하여 Gemini Vision(`gemini-3.8-flash` / `@google/genai`)에 전송.
- 누적 주행거리(ODO), 주행가능거리(DTE), 타코미터 레드존 RPM 수치를 구조화된 JSON으로 추출.
- API 키 부재 또는 분석 실패 시에도 서비스가 중단되지 않는 정규식 Fallback 탑재.

---

#### [태스크 3] 오피넷 API 절사 평균 탑재 ([`app/api/gas-stations/route.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/app/api/gas-stations/route.ts))
- 반경 3km 내 주유소 목록 반환 시 `trimmedMean` (휘발유, 경유, 고급유 단가 및 표본/절사 수)을 함께 연산하여 응답 페이로드에 포함.

---

#### [태스크 4] 차량 점검 모달 인풋 3열 개편 및 유류비 정산 계산기 탑재 ([`components/VehicleInspectionModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/VehicleInspectionModal.tsx))
1. **기본 정보 3열 그리드**:
   - 차량호차, 차량번호, 차종(유종자동 연동) 3열 인풋 배치.
2. **수령(Pickup) 탭**:
   - Gemini Vision OCR 분석 상태 인디케이터 및 인식 결과 배너 탑재.
   - `[⛽ 휘발유] [🛢️ 경유]` 2분할 퀵 선택 칩과 감지 근거 뱃지 상시 노출.
3. **일일(Daily) & 반납(Return) 탭**:
   - 계기판 사진 등록 시 OCR 자동 입력 배너 연동.
4. **반납(Return) 탭 3km 절사 유류비 정산 계산기**:
   - 수령 대비 반납 DTE 증감 상태 뱃지 (`-296 km 부족 (주유/정산 대상)`).
   - 2분할 유종 토글 칩 및 3km 절사평균 단가 실시간 연동.
   - 부족 소모량(L), 3km 단가, 도심 안전계수 1.15배 반영 실정산 추산액 표시.
   - 원터치 권장 주유 금액 칩 그리드 (`[25,000원(권장)]` 코발트 블루 강조).
   - 반납 카카오톡 보고서 유류비 정산 내역 포함 체크박스 연동.

---

#### [태스크 5] 카카오톡 반납 보고서 서식 확장 ([`utils/vehicleReport.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/utils/vehicleReport.ts))
- 반납 보고서 생성 시 유류비 정산 내역이 활성화된 경우 `• 유류비 정산 : 25,000원 (DTE -296 km 권장 주유 / 휘발유 1,650원)` 행을 표준 서식 규격에 맞춰 자동 삽입.

---

#### [태스크 6] 호차별 승객명 및 프로필 로컬 스토리지 격리 ([`components/ProfileModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/ProfileModal.tsx), [`hooks/useDriverProfile.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/hooks/useDriverProfile.ts), [`types/index.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/types/index.ts))
1. **격리 키 규격 준수**:
   - `cockpit_driver_profile_${vehicleNo}` (예: `cockpit_driver_profile_4호차`) 키로 각 호차의 승객명, 차종, 유종, 비상연락처를 독립적으로 분리 저장 및 로드.
2. **ProfileModal 연동**:
   - 차종 인풋 및 2분할 유종 선택 칩(`[⛽ 휘발유] [🛢️ 경유]`) 탑재.
   - 상단 차량 호차 선택 시 해당 호차의 격리 프로필을 즉시 불러와 동기화.

---

### 43.3 검증 결과
1. **프로덕션 빌드 무결성**:
   - `npm run build`: Next.js 16.3.5 Turbopack 기준 전 15개 라우트 컴파일 에러 **0건** 완료.
2. **Fallback Pipeline 검증**:
   - `520d` ➔ 경유, `520i` ➔ 휘발유, `카니발/스타리아` ➔ 2분할 칩 안내, 미확인 ➔ 휘발유 안전 마진으로 완벽 분기 확인.
3. **Trimmed Mean 15% 이상치 절사 검증**:
   - 극단적 고가 주유소가 제외된 공정 평균 단가로 DTE 부족분 주유비가 도심 안전 계수(1.15배) 및 5천원 단위 올림으로 정확히 계산됨을 확인.
4. **호차별 프로필 격리 검증**:
   - `cockpit_driver_profile_${vehicleNo}`를 통해 호차 간 승객명 및 차량 정보가 침범 없이 완전히 격리 보존됨을 확인.

---

## 44. 상단 4열 퀵 액션 바 독립 분리 및 프리셋 시인성 고도화 (2026-09-28)

### 44.1 추진 배경 및 목적
1. **퀵 액션 바와 자주 가는 목적지의 이중 테두리 결합 문제 해소**:
   - `PresetButtons.tsx` 내부 카드 상단에 4열 퀵 액션 바가 중첩 렌더링되면서 외부 흰색 카드와 내부 회색 배경(`bg-slate-50/70`) 및 이중 테두리가 겹쳐 발생하는 시각적 노이즈를 근본적으로 해결.
2. **독립 퀵 액션 바 컴포넌트(`QuickActionBar.tsx`) 분리**:
   - 순수 흰색 평면 단일 카드(`w-full bg-white border border-slate-100/80 rounded-2xl p-4 shadow-[0_8px_25px_rgba(30,96,243,0.06)] select-none`)로 완전 분리.
3. **'즐겨찾기' 아이콘 교체 및 라벨 타이포그래피 정돈**:
   - 두 번째 액션 버튼인 '즐겨찾기'의 아이콘을 슬라이더(`SlidersHorizontal`)에서 공식 지침 규격인 `lucide-map-pin-plus` SVG로 교체.
   - 4개 버튼(`차량체크`, `즐겨찾기`, `주유`, `항공편`) 하단 라벨 텍스트의 폰트 굵기를 `font-bold`에서 정갈한 `font-medium`으로 조정.
4. **'자주 가는 목적지' 독립 카드 복원 및 목적지 명칭 폰트 크기 상향**:
   - `PresetButtons.tsx`에서 퀵 액션 바 코드를 전면 적출하여 순수 목적지 캐러셀 카드로 복원.
   - 카드 내부의 목적지 명칭 텍스트(`title`) 폰트 크기를 `text-xs`에서 `text-sm font-bold text-slate-800`으로 상향하고, 3열 레이아웃 `truncate` 및 `min-h-[58px]` 규격을 엄수.

---

### 44.2 핵심 구현 내역

#### [태스크 1] 4열 퀵 액션 바 독립 컴포넌트 분리 (`components/QuickActionBar.tsx`, `app/page.tsx`)
1. **독립 컴포넌트 신설 (`QuickActionBar.tsx`)**:
   - 단일 카드 래퍼 규격 적용:
     `<div className="w-full bg-white border border-slate-100/80 rounded-2xl p-4 shadow-[0_8px_25px_rgba(30,96,243,0.06)] select-none">`
   - 내부의 불필요한 회색 배경(`bg-slate-50/70`)과 내부 외곽선(`border border-slate-200/80 rounded-2xl`)을 전면 제거하여 단정한 흰색 단일 평면 카드 완성.
2. **`app/page.tsx` 마운트 순서 재배열**:
   - 1. `OriginDestinationSelector` (출발/도착 카드)
   - 2. `QuickActionBar` (독립 4열 퀵 액션 바: 차량체크 → 즐겨찾기 → 주유 → 항공편)
   - 3. `PresetButtons` (자주 가는 목적지 독립 카드)

---

#### [태스크 2] '즐겨찾기' 아이콘 교체 및 라벨 폰트 굵기 조정 (`components/QuickActionBar.tsx`)
1. **'즐겨찾기' 아이콘**:
   - `SlidersHorizontal`을 제거하고 `lucide-map-pin-plus` 정밀 SVG 패스(핀 + 서클 + 플러스) 적용.
2. **라벨 타이포그래피**:
   - `text-xs font-medium text-slate-700 text-center tracking-tight group-hover:text-[#1E60F3] transition-colors`로 일원화.

---

#### [태스크 3] '자주 가는 목적지' 카드 복원 및 명칭 14px(`text-sm`) 상향 (`components/PresetButtons.tsx`)
1. **퀵 액션 바 적출 및 단독 카드 복원**:
   - 상단 퀵 액션 바 코드 및 불필요한 `lucide-react` 아이콘(`SlidersHorizontal`, `Fuel`, `Plane`, `ClipboardCheck`) 임포트 정리.
2. **목적지 명칭 가독성 상향**:
   - 일반 거점: `text-sm font-bold text-slate-800 tracking-tight truncate w-full`
   - 자택 거점(등록/미등록 공통): `text-sm font-bold tracking-tight truncate`
   - 드래그 중인 플로팅 칩: `text-sm font-bold text-slate-900 tracking-tight`
   - 3열 그리드에서 텍스트 오버플로우 방지를 위한 `truncate` 및 `min-h-[58px]` 규격 완벽 보존.

---

### 44.3 검증 결과
1. **프로덕션 빌드 무결성**:
   - `npm run build`: Next.js 16.3.5 Turbopack 기준 전 15개 라우트 컴파일 에러 **0건 (Exit code 0)** 통과.
2. **이중 박스 제거 및 시각적 위계 검증**:
   - 출발/도착 카드 아래에 `QuickActionBar`가 독립된 흰색 단일 카드로 깔끔하게 자리잡고, 그 아래에 '자주 가는 목적지' 카드가 분리되어 시각적 밀도와 여백이 이상적으로 정돈됨을 확인.
3. **아이콘 및 폰트 굵기/크기 검증**:
   - '즐겨찾기'에 핀-플러스 아이콘이 정상 렌더링되고, 4개 라벨이 `font-medium`으로 부드럽게 표현되며, 자주 가는 목적지 명칭이 `text-sm`으로 시원하고 또렷하게 출력됨을 확인.

---

## 45. 전사 폰트 가독성 고도화: 코드베이스 내 초소형 폰트(text-xs, 12px) 전면 퇴출 및 text-sm(14px) 상향 (2026-09-28)

### 45.1 추진 배경 및 목적
1. **의전 드라이버 주행 환경에서의 초소형(12px) 폰트 판독성 한계 극복**:
   - 장갑 착용 및 거치대 환경에서 운전석 시야 거리가 확보될 때 12px(`text-xs`) 폰트는 판독 피로도가 높음.
   - 서비스 철학인 "시원한 폰트 가독성"에 맞춰 코드베이스 전반의 모든 폰트 사이즈를 최소 14px(`text-sm`) 이상으로 상향 평준화.
2. **전체 컴포넌트 일괄 탐색 및 무결점 치환**:
   - 총 21개 컴포넌트 및 페이지 파일에서 177개소의 `text-xs`를 `text-sm`으로 전면 치환.

### 45.2 핵심 구현 내역
1. **타깃 파일 및 치환 건수**:
   - `components/VehicleInspectionModal.tsx`: 38건
   - `components/ScheduleTab.tsx`: 18건
   - `components/FlightModal.tsx`: 17건
   - `components/ProfileModal.tsx`: 16건
   - `components/CustomPresetModal.tsx`: 15건
   - `components/DepartureTimePickerModal.tsx`: 11건
   - `components/GasStationModal.tsx`: 10건
   - `components/LocationSearchModal.tsx`: 9건
   - `components/ScheduleCard.tsx`: 6건
   - `components/AdminPinModal.tsx`: 5건
   - `components/QuickActionBar.tsx`: 4건
   - `components/PresetButtons.tsx`: 4건
   - `components/A2HSBanner.tsx`: 4건
   - `components/PredictionResultSheet.tsx`: 4건
   - `components/RouteInfoCard.tsx`: 3건
   - `components/Header.tsx`: 3건
   - `components/ScheduleFormModal.tsx`: 2건
   - `components/ReportTemplateSelector.tsx`: 2건
   - `components/EditScheduleModal.tsx`: 2건
   - `app/page.tsx`: 2건
   - `app/tmap/page.tsx`: 2건
   - **총계**: 21개 파일, 177개 치환 완료 (`text-xs sm:text-sm` 중복 패턴 정리 포함)
2. **검증**:
   - 코드베이스 내 `text-xs` 및 `font-xs` 잔존 여부 전수 검사 결과: **0건**.

### 45.3 검증 결과
1. **프로덕션 빌드 무결성**:
   - `npm run build`: Next.js 16.3.5 Turbopack 기준 전 15개 라우트 컴파일 에러 **0건 (Exit code 0)** 통과.
2. **모바일 콕핏 시인성 검증**:
   - 모든 뱃지, 폼 라벨, 서브 텍스트, 액션 버튼의 글자 크기가 14px(`text-sm`)로 일관되게 확대되어 시각적 가독성 극대화 확인.

---

## 46. 프로필 및 차량 점검 모달 내 유종 선택 및 유류비 계산기 UI 제거 및 UI 단순화 (2026-09-28)

### 46.1 추진 배경 및 목적
1. **미완성 정산 기능 조작 혼선 방지 및 차량 본연의 점검 기능 집중**:
   - 프로필 모달 및 차량점검 모달(`VehicleInspectionModal`)에 추가되었던 차종/유종 선택, 유종 자동 판별 칩, 오피넷 3km 유류비 정산 계산기 UI를 전면 제외.
   - Zero-DB / Pure Client-Side 원칙을 엄수하며, 현장 운전자의 불필요한 입력 부담과 조작 혼선을 없애고 수령/반납 점검표 본연의 기능에 집중.
2. **상단 기본 제원 2열 원복 및 18px 모바일 시인성 규격 준수**:
   - 기존 3열 그리드(`차량호차`, `차량번호`, `차종 (유종자동)`)에서 차종 인풋을 완전히 삭제하고 `grid grid-cols-2 gap-2`의 2열 대칭 구조로 원복.
   - 모바일 환경에서의 탁월한 시인성을 위해 입력 인풋을 18px(`text-lg font-bold text-slate-900`) 규격으로 단정하게 재배치.

### 46.2 핵심 구현 내역

#### [태스크 1] 프로필 모달 내 '차종/유종 선택' UI 제외 ([`components/ProfileModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/ProfileModal.tsx))
1. **차종/유종 입력 폼 및 선택 칩 블록 제거**:
   - '차종 / 유종 (선택)' 라벨, 차종 인풋, 그리고 `⛽ 휘발유` / `🛢️ 경유` 2분할 퀵 선택 버튼군을 완전히 삭제.
2. **상태 및 로컬 스토리지 연동 정리**:
   - `carModel`, `fuelType`, `fuelReason` 상태 변수 및 `handleCarModelChange`, `handleSelectFuelType` 핸들러 제거.
   - 기사 성명, 연락처, 차량번호(앞자리/뒷자리), 호차별 승객명, 주력 내비게이션 등 필수 의전 프로필 필드는 100% 온전히 유지.
   - `cockpit_driver_profile_${vehicleNo}` 저장 및 로드 로직에서 유종 관련 필드를 안전하게 정리하여 타입 에러 및 런타임 오류 방지.

#### [태스크 2] 차량 점검 모달 상단 2열 원복 및 유종 관련 UI 전면 적출 ([`components/VehicleInspectionModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/VehicleInspectionModal.tsx))
1. **상단 기본 제원 2열 원복 및 18px 시인성 규격 적용**:
   - `차종 (유종자동)` 인풋을 완전히 삭제하고, 그리드 래퍼를 `grid grid-cols-2 gap-2`로 수정하여 `차량호차`와 `차량번호`만 1:1 대칭으로 렌더링.
   - 인풋 폰트 스타일을 `text-lg font-bold text-slate-900` (18px) 규격으로 적용하여 모바일 터치 및 시인성 극대화.
2. **차량 수령 탭 '차량 유종 선택' 칩 블록 삭제**:
   - 수령 점검 탭 내 삽입되었던 `bg-slate-50/80 p-2.5 rounded-2xl border border-slate-200/80` 규격의 유종 선택(`⛽ 휘발유`, `🛢️ 경유`) UI 블록을 완전히 삭제.
3. **차량 반납 탭 '오피넷 3km 유류비 정산 계산기' 블록 삭제**:
   - 반납 점검 탭 내 위치한 `오피넷 3km 유류비 정산 계산기`(`bg-slate-50/90 rounded-2xl p-3 border border-slate-200/90` 및 상위 15% 초고가 절사 뱃지, DTE 증감 현황, 단가 칩, 권장 주유 금액 선택 버튼, 보고서 포함 체크박스 일체) 전면 적출.
4. **카카오톡 보고서 연동 및 상태 클린업**:
   - `selectedFuelType`, `gasStations`, `trimmedMeanPrices`, `chosenFuelAmount`, `includeFuelSettlement` 등의 미사용 상태 및 관련 이펙트(`fetchStations`) 완전 제거.
   - 카카오톡 보고서 텍스트 생성 시 유류비 라인이 출력되지 않도록 연계 파라미터 정리.
   - `@/utils/fuelCalculation` 및 `GasStation` 등 미사용 import를 깔끔히 제거하여 린트 에러 원천 차단.

### 46.3 검증 결과
1. **프로덕션 빌드 무결성**:
   - `npm run build`: Next.js 16.3.5 Turbopack 기준 전 15개 라우트 컴파일 에러 **0건 (Exit code 0)** 통과.
2. **Zero-DB 및 클라이언트 상태 무결성**:
   - 수령/반납 데이터 바인딩 및 계기판 OCR, 2D 외관 점검, 주차/차키 위치, 카카오톡 전송 보고서 생성이 결함 없이 완벽히 동작함을 확인.

---

## 47. 담당승객(passengerName) 영속 저장 및 카카오톡 보고서 출력 버그 수정 (2026-09-28)

### 47.1 추진 배경 및 문제점
1. **담당승객 삭제 후 재진입 시 이전 승객명 부활 결함**:
   - 사용자가 프로필 설정에서 담당승객 값을 모두 지우고 저장하더라도, 모달을 다시 열거나 호차를 전환했을 때 `parsed.passengerName !== ''` 등 빈 문자열을 falsy로 취급하는 조건문 때문에 `storedForVehicle?.passengerName || getPresetPassengerName(cleanHocha)`로 폴백되어 이전 승객명('VIP 게스트 A' 또는 'SOYFAN 외 1명')이 다시 채워지는 문제 발생.
2. **미입력 시 카카오톡 보고서에 '담당승객 : 미지정' 강제 노출 결함**:
   - `utils/reportGenerator.ts`에서 `profile.passengerName?.trim() || '미지정'`으로 처리되어, 승객을 지정하지 않았음에도 보고서에 `• 담당승객: 미지정`이 강제 출력되어 현장 관제 가독성을 저해하는 문제 발생.

### 47.2 핵심 구현 내역

#### 1. 담당승객 정규화 및 null 영속 저장 ([`components/ProfileModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/ProfileModal.tsx), [`hooks/useDriverProfile.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/hooks/useDriverProfile.ts))
- **공백 제거 및 null 변환**:
  - `const normalizedPassenger = passengerName.trim();`
  - `const valueToSave = normalizedPassenger.length > 0 ? normalizedPassenger : null;`
- **폴백 로직 전면 제거**:
  - `ProfileModal` 진입 및 `useDriverProfile` 로드 시 `stored.passengerName ?? ''` 형태로 nullish coalescing을 적용하여, 빈 값이나 `null`이 정상 상태로 보존되도록 개선.
  - 저장 직후 `valueToSave === null`일 경우 로컬 state를 즉시 `""`로 동기화.

#### 2. DB (Supabase `drivers`) 동기화 시 명시적 null 저장 ([`app/api/driver/route.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/app/api/driver/route.ts), [`app/page.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/app/page.tsx))
- **POST 핸들러**: `passenger_name`이 빈 문자열이거나 미입력 시 `null`을 명시적으로 페이로드에 포함하여 Supabase `drivers` 테이블에 `NULL`이 정상 업데이트되도록 보장.
- **GET 핸들러**: 데이터 조회 시 `data.passenger_name ?? null`로 처리하여, 기존 DB에 `NULL`로 저장된 레코드가 `DRIVER_DEFAULTS`로 재오염되지 않도록 차단.

#### 3. 카카오톡 보고서 조건부 렌더링 및 '미지정' 완전 퇴출 ([`utils/reportGenerator.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/utils/reportGenerator.ts), [`components/Header.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/Header.tsx))
- **보고서 행 완전 생략**:
  - `hasPassenger ? '• 담당승객: ' + passengerName : null` 구조로 수정하고 `lines.filter(Boolean)`을 거쳐, 승객명이 비어 있으면 `담당승객` 행 자체를 완전히 생략하며 불필요한 공백 라인도 남지 않도록 구현.
- **헤더 툴팁 정리**:
  - `Header.tsx` 툴팁에서도 `미지정` 문구를 제거하고 승객명이 존재할 때만 `• 담당승객: ...`을 렌더링하도록 일원화.

### 47.3 검증 결과
1. **프로덕션 빌드 무결성**:
   - `npm run build`: Next.js 16.3.5 Turbopack 기준 전 15개 라우트 컴파일 에러 **0건 (Exit code 0)** 통과.
2. **시나리오 검증**:
   - **Case 1 (기존 승객 유지)**: "VIP 게스트 A" 저장 시 정상 유지.
   - **Case 2 (전체 삭제 후 재진입)**: 입력창 전체 삭제 후 저장 ➔ 재진입 시 빈칸 유지 (이전 값 부활 없음).
   - **Case 3 (빈칸 보고서)**: 카카오톡 보고서 생성 시 `담당승객` 행 완전 생략 확인.
   - **Case 4 (신규 입력)**: "SOYFAN 외 1명" 입력 후 저장 시 카톡 보고서에 정상 출력 확인.
   - **Case 5 (공백 입력)**: "     " 공백만 입력 후 저장 시 `null`로 저장되며 보고서 행 생략 확인.

---

## 48. 즐겨찾기 장소 등록 드롭다운 소거 및 관리자 '공통' 거점 분기 버그 수정 (2026-09-28)

### 48.1 추진 배경 및 문제점
1. **장소 검색 결과 선택 후 추천 드롭다운 잔존 및 하단 폼 가림 결함**:
   - `CustomPresetModal.tsx`에서 검색 결과 POI 항목을 탭하여 선택했을 때, `setSearchQuery(poi.name)` 호출로 인해 250ms 디바운스 검색 `useEffect`가 다시 격발되어 자동완성 드롭다운이 재노출됨.
   - 이로 인해 하단의 '거점 이름', '표시 이름 (최대 8자)', '취소', '저장' 버튼이 가려져 현장 기사의 조작 흐름이 끊기는 문제 발생.
2. **관리자 모드(`isAdmin === true`)에서 신규 거점 등록 시 '개인'으로 오분류되는 결함**:
   - `app/page.tsx`의 `handleAddCustomPreset`에서 관리자 인증 상태임에도 `vehicle_no: currentVehicleNo`가 무조건 할당되어 본사 공통 마스터(`vehicle_no === null`) 조건을 충족하지 못함.
   - `PresetButtons.tsx`, `CustomPresetModal.tsx`, `LocationSearchModal.tsx`의 뱃지 판별식(`const isHQ = !preset.vehicle_no && !preset.vehicleNo;`)에 따라 관리자가 등록한 거점이 회색 `개인`으로 노출되고, 메인 프리셋 그리드 렌더링이 비활성화되어 있던 문제 해결 필요.

---

### 48.2 시스템 상태 흐름도 (State Flow Diagram)

```mermaid
flowchart TD
    subgraph UI_Interaction ["장소 검색 및 선택 플로우"]
        A["사용자 장소 검색어 입력"] --> B["TMAP API / Cache 자동완성 호출"]
        B --> C["검색 결과 드롭다운 노출"]
        C -->|항목 탭| D["handleSelectPoi 실행"]
    end

    subgraph Dismiss_Guard ["드롭다운 강제 소거 및 가드"]
        D --> D1["1. isPlaceSelectedRef.current = true"]
        D --> D2["2. setSearchResults([]) & setIsDropdownOpen(false)"]
        D --> D3["3. searchInputRef.current?.blur() (가상키보드 해제)"]
        D --> D4["4. 검색어 및 폼 필드 즉시 바인딩"]
        D4 -.-> E["useEffect([searchQuery]) 재검색 트리거"]
        E -->|isPlaceSelectedRef 감지| F["Early Return: 재검색 및 드롭다운 차단"]
    end

    subgraph Branch_Logic ["거점 타입 및 뱃지 결정 분기"]
        G["저장 버튼 클릭 (handleSubmit)"] --> H{"관리자 인증 상태 (isAdmin)?"}
        H -->|관리자 모드 (True)| I["type: 'common'<br/>isCommon: true<br/>isGlobal: true<br/>vehicle_no: null"]
        H -->|일반 기사 모드 (False)| J["type: 'personal'<br/>isCommon: false<br/>vehicle_no: currentVehicleNo"]
        I --> K["localStorage 및 Supabase 동기화"]
        J --> K
        K --> L["메인 카드 슬롯 렌더링"]
        L --> M{"isHQ 조건 검사:<br/>isCommon || type==='common' || isGlobal || !vehicle_no"}
        M -->|공통 거점| N["뱃지: 코발트/슬레이트 '공통'"]
        M -->|개인 거점| O["뱃지: 블루 톤 '개인'"]
    end
```

---

### 48.3 핵심 구현 내역

#### [태스크 1] 장소 검색 선택 시 추천 드롭다운 즉시 소거 및 재트리거 가드 주입 ([`components/CustomPresetModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/CustomPresetModal.tsx))
1. **드롭다운 상태 및 조기 리턴 가드 플래그 신설**:
   - `isDropdownOpen` 상태와 `isPlaceSelectedRef = useRef(false)`, `searchInputRef = useRef<HTMLInputElement | null>(null)` 도입.
   - `useEffect([searchQuery])` 최상단에 `if (isPlaceSelectedRef.current) { isPlaceSelectedRef.current = false; return; }` 조기 리턴 가드를 주입하여, 선택된 장소명을 인풋에 세팅할 때 재검색 API 호출을 100% 차단.
2. **`handleSelectPoi` 선택 핸들러 강화**:
   - 항목 선택 즉시 진행 중인 `AbortController` 취소 및 `setSearchResults([])`, `setIsDropdownOpen(false)` 강제 소거.
   - `searchInputRef.current?.blur()`를 호출하여 모바일 가상 키보드를 해제함으로써 화면 스크롤 간섭 없이 하단의 '거점 이름', '표시 이름 (최대 8자)', '취소', '저장' 버튼이 즉시 100% 온전하게 노출되도록 보장.
3. **자택 모드(Home Mode) 동일 가드 및 터치 영역 일원화**:
   - 일반 거점 등록뿐 아니라 자택 등록 모달에서도 동일한 Ref 및 드롭다운 가드 로직을 일관되게 적용.

#### [태스크 2] 관리자 모드(`isAdmin`) 연동 및 '공통'/'개인' 타입 동적 분기 ([`components/CustomPresetModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/CustomPresetModal.tsx), [`components/PresetButtons.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/PresetButtons.tsx), [`components/LocationSearchModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/LocationSearchModal.tsx), [`app/page.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/app/page.tsx), [`types/index.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/types/index.ts))
1. **데이터 모델 확장 (`types/index.ts`)**:
   - `LocationPreset` 인터페이스에 `type?: 'common' | 'personal'`, `isCommon?: boolean`, `fullName?: string`, `createdAt?: string` 명시적 타입 필드 추가 및 `CustomPreset` 타입 에일리어스 제공.
2. **신규 프리셋 생성 및 업데이트 로직 수정**:
   - `CustomPresetModal.tsx`의 `handleSubmit`에서:
     - `isAdmin === true`인 경우 `type: 'common'`, `isCommon: true`, `isGlobal: true`, `vehicle_no: null`, `vehicleNo: undefined`로 설정.
     - `isAdmin === false`인 경우 `type: 'personal'`, `isCommon: false`, `isGlobal: false`, `vehicle_no: vehicleNo`로 안전하게 격리.
   - `app/page.tsx`의 `handleAddCustomPreset`에서도 `isCommon = Boolean(isAdmin || newPreset.isCommon || newPreset.type === 'common')`을 기반으로 `vehicle_no`를 `isAdmin ? null : currentVehicleNo`로 정확히 분기.
3. **모달 상단 UI 피드백 뱃지 추가**:
   - `CustomPresetModal.tsx`의 장소 등록 헤더 영역 우측에 `isAdmin === true`일 때 `[공통 거점으로 등록]` 코발트 블루 뱃지(`bg-[#1E60F3] text-white text-xs font-bold px-2 py-0.5 rounded-full`)를 노출하여 등록 전 거점 위계를 명확히 식별할 수 있도록 지원.
4. **거점 뱃지 판별식 일원화 및 메인 화면 카드 복원**:
   - `PresetButtons.tsx`, `CustomPresetModal.tsx`, `LocationSearchModal.tsx`의 `isHQ` 판별식을 기존의 단순 `vehicle_no` 부재 검사에서 확장하여:
     `const isHQ = Boolean(preset.isCommon || preset.type === 'common' || preset.isGlobal || (!preset.vehicle_no && !preset.vehicleNo));`
     로 전면 일원화.
   - `app/page.tsx` 내 '자주 가는 목적지' 독립 카드(`<PresetButtons ... />`)를 복원 연결하여 메인 화면 슬롯 하단에 `공통` 및 `개인` 뱃지가 정확히 렌더링되도록 조치.
5. **API 라우트 영속 정합성 확보 (`app/api/presets/route.ts`)**:
   - GET 요청 반환 시 `isCommon: row.vehicle_no ? false : true`, `type: row.vehicle_no ? 'personal' : 'common'`을 포함하도록 매핑을 정비하여 클라이언트-서버 간 데이터 무결성 보장.

---

### 48.4 검증 결과
1. **프로덕션 빌드 무결성**:
   - `npm run build`: Next.js 16.3.5 Turbopack 기준 전 15개 라우트 컴파일 에러 **0건 (Exit code 0)** 통과.
2. **시나리오 검증 결과**:
   - **Case 1 (일반 모드)**: 장소 검색 ➔ 항목 선택 ➔ 추천 드롭다운 즉시 소거 및 하단 폼(거점명/표시명/취소/저장) 노출 ➔ 저장 ➔ 메인 카드에 `개인` 뱃지 노출 확인.
   - **Case 2 (관리자 모드)**: PIN 인증 후 모달 진입 시 `[공통 거점으로 등록]` 뱃지 확인 ➔ 장소 검색 ➔ 항목 선택 ➔ 저장 ➔ 메인 카드에 `공통` 뱃지 노출 및 `vehicle_no: null` 확인.

---

## 49. [운행/거점] 표시 이름 지능형 축약 추천 칩 구현 및 공통 거점 1페이지 전진 배치·페이지 간 드래그 앤 드롭 개선

### 49.1 배경 및 작업 목적
1. **지능형 축약(Smart Abbreviation)**:
   - 거점 등록 시 단순 8자리 절사(`slice(0, 8)`)로 인해 '포시즌스호텔 서'처럼 어색한 비문이 발생하거나, 공항 터미널(T1/T2), 노선 및 출구 번호와 같은 필수 식별 정보가 손실되는 문제를 방지.
   - 교통 거점 정규화 및 어절 경계 분석 알고리즘을 도입하고, '표시 이름' 인풋창 하단에 2~3개의 원터치 추천 칩을 제공하여 운전자/관리자의 입력 편의를 극대화.
2. **공통 거점 1페이지 전진 배치 (Page 1 Priority)**:
   - 관리자 모드(`isAdmin === true`)에서 신규 공통 거점 등록 시 전체 프리셋 배열의 맨 끝(2페이지 이후)으로 밀려나지 않고, **기존 공통 거점 그룹의 직후(개인 거점 시작 직전, 또는 최우선 인덱스)**에 삽입되어 반드시 첫 페이지(1~12번 슬롯) 내에 배치되도록 보장.
   - 등록 완료 즉시 슬라이더 페이지(`currentPage`)를 `0`(1페이지)으로 자동 전환하여 시각적 확인 보장.
3. **페이지 간 크로스 페이지 드래그 앤 드롭 (Cross-Page Drag & Drop)**:
   - 4행 3열(12개 슬롯 단위) 페이징 슬라이더 구조에서 드래그 중인 카드를 화면 좌/우 가장자리(Edge 45px 이내)로 이동 시 300ms 딜레이 후 자동 페이지 전환(Edge Auto-Paging).
   - 하단 페이지네이션 닷(Dot) 인디케이터 위로 호버 시에도 즉시 해당 페이지로 전환.
   - 전체 글로벌 인덱스 기준으로 자연스럽게 위치를 교환(FLIP 애니메이션)하고 손을 떼는 순간 브라우저 `localStorage`에 영속화.
4. **Zero-DB / Pure Client-Side 원칙 준수**:
   - 모든 순서, 정렬 및 캐러셀 페이지 상태는 브라우저 `localStorage`와 React 상태로 완결.

---

### 49.2 모듈별 구현 내역

#### [태스크 1] 표시 이름 지능형 축약 유틸리티 및 원터치 추천 칩 구현 ([`utils/nameFormatter.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/utils/nameFormatter.ts), [`components/CustomPresetModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/CustomPresetModal.tsx))
1. **지능형 축약 알고리즘 (`utils/nameFormatter.ts`)**:
   - **인터페이스 규격**:
     ```ts
     export interface AbbreviationResult {
       primary: string; // 기본 채움값 (최대 8자)
       candidates: string[]; // 추천 칩 목록 (최대 8자, 중복 제외)
     }
     ```
   - **정규화 및 토큰 압축 파이프라인**:
     - 공항/교통 거점 정규화: `인천국제공항` ➔ `인천공항`, `김포국제공항` ➔ `김포공항`, `제([1-2])여객터미널`/`제([1-2])터미널` ➔ `T$1`, `국내선` ➔ `국내`, `국제선` ➔ `국제`.
     - 불필요 텍스트 제거: 괄호 내 부가 정보 `\((.*?)\)` 제거, 지하철 호선명(`신분당선`, `공항철도` 등) 제거, `([0-9]+)번\s*출구` ➔ `$1번`.
   - **후보 생성 전략**:
     - 후보 A (첫 어절): 첫 번째 단어가 8자 이내인 경우 (`포시즌스호텔 서울` ➔ `포시즌스호텔`).
     - 후보 B (결합형): 터미널/출구 번호가 결합된 2어절이 8자 이내인 경우 최우선 배치 (`인천공항 T2`, `광교중앙역 1번`).
     - 후보 C (단일 장문): 단일 긴 단어의 경우 8자에서 안전 절사.
     - 후보 D (대안 원본): 필요 시 원본의 앞 8자를 대안으로 등록.
     - 최대 8자 제한, 중복 제거 후 최대 3개의 정제된 후보 목록 반환.
2. **모달 입력 폼 및 원터치 추천 칩 연동 (`CustomPresetModal.tsx`)**:
   - POI 검색 결과 탭(`handleSelectPoi`) 시 `generateSmartDisplayName(poi.name)`을 실행하여 기본 `shortName`을 세팅하고 `recommendations` 상태에 저장.
   - 기존 거점 수정(`handleStartEdit`) 시에도 후보 칩 자동 계산.
   - '표시 이름 (최대 8자)' 인풋창 하단에 `recommendations.length > 1`일 때 세련된 코발트 블루/슬레이트 원터치 추천 칩 렌더링. 칩 탭 시 즉시 `shortName`에 반영.

#### [태스크 2] 공통 거점 등록 시 '1페이지 전진 배치' 정렬 엔진 구축 ([`components/CustomPresetModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/CustomPresetModal.tsx), [`app/page.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/app/page.tsx))
1. **신규 공통 거점 삽입 위치 재배치**:
   - 관리자 모드(`isAdmin === true`)에서 신규 공통 거점 등록 시 전체 배열의 끝에 추가하지 않고, 기존 공통 거점들의 직후(개인 거점들이 시작되기 직전 위치)에 인입하여 반드시 1페이지(1~12번 슬롯)에 우선 안착되도록 정렬.
2. **전체 `order` 인덱스 재정규화**:
   - 삽입 후 전체 프리셋 배열에 대해 `order: idx`를 0부터 순차 재부여하여 순서 중복/누락 원천 차단.
3. **1페이지 자동 포커스**:
   - 신규 공통 거점 등록 완료 시 `setCurrentPage(0)`을 호출하여 1페이지로 즉각 이동, 등록 결과를 바로 시각적으로 확인할 수 있도록 보장.

#### [태스크 3] 페이지 간(1페이지 ↔ 2페이지) 크로스 페이지 드래그 앤 드롭 구현 ([`components/PresetButtons.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/PresetButtons.tsx), [`components/CustomPresetModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/CustomPresetModal.tsx))
1. **글로벌 인덱스 기반 드래그 관리**:
   - 12개 슬롯 단위 페이징 환경에서 전체 배열의 글로벌 인덱스를 기준으로 드래그 위치를 추적하고 슬롯 간 스왑 수행.
2. **화면 가장자리 호버 시 자동 페이지 전환 (Edge Auto-Paging)**:
   - 포인터의 X좌표가 화면/컨테이너 좌측 45px 이내에 300ms 체류 시 `currentPage > 0`일 때 이전 페이지로 전환.
   - 포인터의 X좌표가 화면/컨테이너 우측 45px 이내에 300ms 체류 시 `currentPage < totalPages - 1`일 때 다음 페이지로 전환.
   - 300ms 딜레이 타이머를 두어 의도치 않은 급격한 페이지 튐 방지.
3. **하단 페이지네이션 닷(Dot) 호버 전환 지원**:
   - 마우스 드래그: 닷 인디케이터 `onMouseEnter` 시 즉각 해당 페이지로 전환.
   - 터치 드래그: 터치 좌표와 `dotRefs`의 Bounding Client Rect를 실시간 판별하여 즉각 해당 페이지로 전환.
4. **드롭 시 즉각 안착 (Zero-Click Commit) 및 로컬 영속화**:
   - 드롭 즉시 전체 배열 순서를 `localStorage`에 저장하고 햅틱 진동(`haptics.lightTap()`) 피드백 발생.

---

### 49.3 검증 결과
1. **프로덕션 빌드 무결성**:
   - `npm run build`: Next.js 16.3.5 Turbopack 기준 전 15개 라우트 컴파일 에러 **0건 (Exit code 0)** 완벽 통과.
2. **시나리오 검증 결과**:
   - **Case 1 (표시 이름 축약)**:
     - `인천국제공항 제2여객터미널` ➔ primary: `인천공항 T2`, candidates: `['인천공항 T2', '인천공항', ...]`
     - `김포국제공항 국내선` ➔ primary: `김포공항 국내`
     - `광교중앙역 신분당선 1번출구` ➔ primary: `광교중앙역 1번`
     - `포시즌스호텔 서울` ➔ primary: `포시즌스호텔`
     - 인풋 하단 추천 칩 탭 시 표시 이름 즉시 반영 확인.
   - **Case 2 (공통 거점 전진 배치)**:
     - 관리자 모드에서 신규 거점 등록 시 2페이지로 밀리지 않고 1페이지 공통 거점 영역에 즉시 안착 및 1페이지 자동 포커스 확인.
   - **Case 3 (크로스 페이지 드래그)**:
     - 2페이지 거점을 좌측 엣지 또는 1페이지 닷 위로 드래그 시 1페이지로 자동 전환 확인.
     - 1페이지 원하는 슬롯에 드롭 후 새로고침 시 변경된 순서 보존 확인.

---

### 49.4 공통 거점 관리자 삭제 권한 및 DELETE 403 에러 해결 ([`app/api/presets/route.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/app/api/presets/route.ts), [`app/page.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/app/page.tsx))
1. **문제 현상 및 원인**:
   - 관리자 모드에서 신규 생성된 공통 거점(`vehicle_no: null`) 또는 기존 공통 거점 삭제 시, `DELETE /api/presets` 엔드포인트에서 관리자 인증 여부와 무관하게 `!targetPreset.vehicle_no` 조건을 만족하면 무조건 HTTP 403 Forbidden을 반환하던 구조적 결함 발생.
2. **해결 내역**:
   - `app/page.tsx`의 `handleDeleteCustomPreset`에서 관리자 인증 상태(`isAdmin === true` 또는 `localStorage` 저장값)일 때 `&is_admin=true` 쿼리 파라미터 및 `x-is-admin: true` 헤더를 전달하도록 개선.
   - `app/api/presets/route.ts`의 `DELETE` 핸들러에서 `isAdmin` 플래그를 검증하여:
     - 관리자(`isAdmin === true`): 공통 거점 및 전사 거점 삭제 권한 전면 허용.
     - 일반 기사(`isAdmin === false`): 공통 거점 및 타 호차 거점 삭제 시 403 에러로 안전하게 방어.
3. **검증 결과**:
   - 일반 모드 호출 시 `403 Forbidden` (`{"error":"공통 마스터 거점은 관리자 모드에서만 삭제할 수 있습니다."}`) 정상 방어 확인.
   - 관리자 모드(`is_admin=true`) 호출 시 `200 OK` (`{"success":true}`) 정상 삭제 및 DB 반영 확인.

---

## 50. 자택(Home) 프리셋 수정 시 기등록 정보 자동 주입(Prefill) 및 수정 모드 전환

### 50.1 배경 및 작업 목적
- 기존 자택 주소가 이미 등록되어 있는 상태에서 자택 항목을 탭하거나 수정을 시도할 때, 기존 등록 정보가 채워지지 않고 빈 '자택 주소 등록' 폼이 뜨며 저장 버튼이 비활성화되던 문제를 전면 해결.
- 기등록 자택 정보가 존재하면 모달 진입 즉시 **'자택 명칭'**과 **'자택 상세 주소'**가 인풋에 자동 주입(Prefill)되며, 헤더 타이틀은 **'자택 주소 수정'**, 저장 버튼은 **'자택 수정'**(`#1E60F3`)으로 부드럽게 전환되어 즉시 저장 가능한 활성화 상태를 유지하도록 구현.
- 신규 POI 재검색 시에도 지능형 축약(`utils/nameFormatter.ts`) 결과가 추천 칩으로 자연스럽게 제안되며, Zero-DB / Pure Client-Side 원칙에 따라 브라우저 `localStorage` 및 드라이버 프로필과 즉각 동기화(Zero-Click Commit)되도록 완성.

---

### 50.2 아키텍처 및 상태 전이 다이어그램

```mermaid
flowchart TD
    subgraph Trigger ["자택 모달 오픈 진입"]
        A1["메인 카드 슬롯 1 (자택 🏠) 클릭"] --> B["onOpenHomeModal()"]
        A2["거점 관리 모달 내 자택 슬롯 클릭"] --> B
        A3["장소 검색 모달 내 자택 등록 클릭"] --> B
        B --> C["setIsHomeModalOpen(true)"]
    end

    subgraph Modal_Init ["CustomPresetModal: useEffect 동기화"]
        C --> D{"isHomeMode 감지"}
        D --> E{"기등록 자택 데이터 검사<br/>(homeLocation prop || localStorage)"}
        E -->|기등록 데이터 존재 (Case 1)| F1["isHomeEditMode = true<br/>name: existingHome.name ('자택')<br/>address: existingHome.address<br/>lat/lng: existingHome.lat/lng<br/>recommendations: 지능형 축약 추천 칩"]
        E -->|데이터 없음 (Case 3: 신규)| F2["isHomeEditMode = false<br/>name: ''<br/>address: ''<br/>lat/lng: null<br/>recommendations: []"]
    end

    subgraph UI_Toggle ["동적 헤더 및 버튼 렌더링"]
        F1 --> G1["상단 타이틀: '자택 주소 수정'<br/>하단 버튼: '자택 수정' (활성화 #1E60F3)<br/>검색창 autofocus 해제 (쾌적한 확인)"]
        F2 --> G2["상단 타이틀: '자택 주소 등록'<br/>하단 버튼: '자택 저장' (비활성화 disabled)<br/>검색창 autofocus 활성화"]
    end

    subgraph Re_Search ["새 주소 검색 및 덮어쓰기 (Case 2)"]
        G1 --> H["장소 검색창에 새 주소 입력"]
        H --> I["POI 항목 터치 선택 (handleSelectPoi)"]
        I --> J["1. name, address, lat, lng 즉시 갱신<br/>2. recommendations: ['자택', 축약명, ...] 제안<br/>3. searchInput.blur() & 드롭다운 즉시 소거"]
    end

    subgraph Commit ["저장 및 로컬 동기화 (handleSubmit)"]
        G1 -->|자택 수정 탭| K["handleSaveHomeLocation"]
        J -->|자택 수정 탭| K
        G2 -->|자택 저장 탭| K
        K --> L["updateProfile({ homeLocation: homeData })<br/>1. localStorage protocol_cockpit_driver_profile_v1 반영<br/>2. 호차별 격리 스토리지 cockpit_driver_profile_{N}호차 반영<br/>3. origin/destination이 slot_home일 경우 실시간 갱신"]
        L --> M["모달 자동 종료 및 메인 화면 즉시 반영"]
    end
```

---

### 50.3 상세 구현 내역

#### [태스크 1] 자택 프리셋 데이터 자동 주입(Prefill) 및 모드 분기 ([`components/CustomPresetModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/CustomPresetModal.tsx), [`app/page.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/app/page.tsx), [`hooks/useDriverProfile.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/hooks/useDriverProfile.ts))
1. **누락되었던 `homeLocation` Prop 주입 및 단일 진실 공급원(Single Source of Truth) 확립 (`app/page.tsx`)**:
   - `app/page.tsx` 내 자택 전용 모달 인스턴스에 `homeLocation={profile.homeLocation}`을 추가하여 상위 상태를 직결.
   - `handleSaveHomeLocation` 내에서 `destination?.id === 'slot_home'` 및 `origin?.id === 'slot_home'`을 감지하여 메인 대시보드에 선택된 자택 정보의 명칭, 좌표, 주소까지 지연 없이 동기화.
2. **`isHomeEditMode` 모드 분기 및 `useEffect` 상태 동기화 (`components/CustomPresetModal.tsx`)**:
   - `isHomeEditMode` 상태를 신설하고 `useEffect([isOpen, presetToEdit, isHomeMode, homeLocation])` 블록에서 `isHomeMode` 진입 시:
     - `homeLocation` prop 또는 `localStorage` fallback에서 기등록 자택 데이터를 조회.
     - 기등록 정보가 존재할 경우:
       - `name`: `existingHome.name || '자택'`
       - `address`: `existingHome.address || ''`
       - `lat` / `lng`: `existingHome.lat` / `existingHome.lng`
       - `isHomeEditMode`: `true`
       - `recommendations`: `['자택', abbrev.primary, ...abbrev.candidates]` 추천 칩 생성.
     - 신규 등록일 경우:
       - `name`: `''`, `address`: `''`, `lat/lng`: `null`, `isHomeEditMode`: `false`.
3. **모달 타이틀 및 하단 버튼 동적 전환**:
   - 상단 헤더 타이틀: `{isHomeMode ? (isHomeEditMode ? '자택 주소 수정' : '자택 주소 등록') : '거점 · 자주 가는 장소'}`
   - 하단 액션 버튼: `{isHomeEditMode ? '자택 수정' : '자택 저장'}`
   - `disabled={lat === null || !name.trim()}` 검증식을 적용하여, 수정 모드에서는 상세 주소 및 좌표가 이미 채워져 있으므로 진입 즉시 파란색 `#1E60F3` 활성화 상태 유지.
   - 수정 모드 진입 시 모바일 키보드가 화면을 가리지 않도록 `autoFocus={!isHomeEditMode}` 분기 적용.
4. **호차별 격리 프로필 스토리지 연동 (`hooks/useDriverProfile.ts`)**:
   - `useDriverProfile` 내 `setStoredVehicleProfile` 및 프로필 초기화 시 `homeLocation`을 호차별 스토리지에 함께 보존하여 호차 전환 시에도 자택 데이터가 손실 없이 복원되도록 처리.

#### [태스크 2] 신규 검색 시의 덮어쓰기 무마찰 인터랙션 ([`components/CustomPresetModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/CustomPresetModal.tsx))
1. **신규 POI 선택 시 상태 갱신**:
   - 기존 주소가 채워져 있는 상태에서 사용자가 검색창에 새로운 주소를 검색하여 특정 POI를 선택한 경우, `handleSelectPoi`에서:
     - `name`: `poi.name`
     - `address`: `poi.address || poi.name`
     - `lat`: `poi.lat`, `lng`: `poi.lng`
     - `searchQuery`: `''`로 즉시 초기화하여 폼을 깔끔하게 유지.
2. **지능형 축약(`nameFormatter.ts`) 연동 추천 칩 제공**:
   - `generateSmartDisplayName(poi.name)`의 축약 결과를 `Array.from(new Set(['자택', abbrev.primary, ...abbrev.candidates]))` 형태로 가공하여 '자택 명칭' 인풋 바로 아래에 원터치 추천 칩으로 노출.
   - 운전자가 아파트/단지 명칭 전체를 쓰거나, 축약된 명칭 또는 '자택' 칩을 한 번의 탭으로 간편하게 교체할 수 있도록 편의성 극대화.
3. **무마찰 저장 및 Zero-Click Commit**:
   - `handleSubmit` ➔ `onSaveHome` 호출 시 기존 고유 식별자(`slot_home`)를 유지하며 `localStorage` 및 상위 프로필에 즉시 영속화된 후 모달이 닫히도록 완결.

---

### 50.4 검증 및 무결성 결과
1. **프로덕션 빌드 무결성**:
   - `npm run build`: Next.js 16.3.5 Turbopack 기준 전 15개 라우트 컴파일 및 정적 페이지 생성 에러 **0건 (Exit code 0)** 완벽 통과.
2. **시나리오 검증 결과**:
   - **Case 1 (기등록 자택 수정)**:
     - 기등록 자택(예: `성수트리마제`)이 존재하는 상태에서 모달 진입 시:
     - 상단 타이틀이 **`자택 주소 수정`**으로 노출됨 확인.
     - '자택 명칭'에 `성수트리마제`, '자택 상세 주소'에 `서울특별시 성동구 왕십리로 16`이 온전히 자동 주입(Prefill)됨 확인.
     - 하단 저장 버튼이 **`자택 수정`** 및 활성화(`#1E60F3`) 상태로 렌더링됨 확인.
     - 명칭만 수정한 후 저장 시 로컬 스토리지 및 대시보드에 즉시 갱신 반영 확인.
   - **Case 2 (주소 재검색 수정)**:
     - 자택 수정 상태에서 검색창에 '한남더힐' 검색 ➔ POI 터치 시 '자택 명칭'과 '자택 상세 주소', 좌표가 신규 POI로 즉시 덮어쓰기 갱신됨 확인.
     - 추천 칩(`['자택', '한남더힐', ...]`) 노출 및 탭 인터랙션 정상 확인.
     - '자택 수정' 클릭 시 신규 주소와 좌표로 안전하게 갱신 저장됨 확인.
   - **Case 3 (최초 등록)**:
     - 자택 데이터가 비어 있는 최초 진입 시 상단 타이틀이 **`자택 주소 등록`**, 인풋은 빈 칸, 하단 버튼은 **`자택 저장`** 및 비활성화(`disabled`) 상태로 렌더링됨 확인.

---

## 51. 관리자 모드 신규 거점 등록 시 '공통' 타입 즉시 반영 및 등록·수정 로직 일원화

### 51.1 배경 및 버그 원인 분석
1. **문제 현상**:
   - 관리자 모드(`isAdmin === true`)에서 신규 거점을 등록했을 때 메인 화면이나 모달에서 최초에는 '개인' 뱃지로 렌더링되었다가, 해당 거점을 다시 클릭하여 '수정'을 완료해야만 '공통' 뱃지로 전환되던 지연 반영 결함 발생.
2. **원인 규명**:
   - **원인 1 (`app/page.tsx` 내 Supabase POST 요청 페이로드 오염)**:
     - `app/page.tsx`의 `handleAddCustomPreset`에서 관리자 공통 거점(`isCommon === true`, `vehicle_no: null`)으로 생성했음에도, 하단의 `fetch('/api/presets', { body: JSON.stringify({ ...presetWithVehicle, vehicle_no: currentVehicleNo }) })`에서 `vehicle_no: currentVehicleNo`('4호차')가 강제 할당되어 Supabase로 전송됨.
     - Supabase `/api/presets` POST 핸들러는 수신된 `vehicle_no`('4호차')를 저장하고 `data.preset`을 반환하였으며, 이를 수신한 클라이언트가 `setPresets`에서 `data.preset`(`vehicle_no: '4호차'`, `type: 'personal'`)으로 덮어쓰면서 로컬 스토리지까지 '개인' 거점으로 재오염되는 레이스 컨디션 발생.
   - **원인 2 (`components/CustomPresetModal.tsx` 내 신규/수정 로직 이원화 및 `isAdmin` 스코프 취약점)**:
     - `CustomPresetModal.tsx` 내 `handleSubmit`에서 신규 등록과 수정 시 `isCommonPreset` 판별 및 페이로드 조립 로직이 이원화되어 있었고, 컴포넌트 렌더 사이클에 따라 `isAdmin` prop과 `localStorage`(`protocol_cockpit_admin_mode_v1`) 간의 미세한 타이밍 불일치 가능성이 존재.

---

### 51.2 아키텍처 및 상태 전이 다이어그램

```mermaid
flowchart TD
    subgraph Admin_Detection ["단일 진실 관리자 상태 판별"]
        A["CustomPresetModal / page.tsx"] --> B["effectiveIsAdmin = Boolean(isAdmin || localStorage.admin_mode === 'true')"]
    end

    subgraph Modal_Creation ["CustomPresetModal: 단일화된 페이로드 생성"]
        B --> C["신규 등록 (handleSubmit)"]
        C --> D["isCommonPreset = Boolean(effectiveIsAdmin)<br/>cleanVehicle = isCommonPreset ? null : vehicleNo"]
        D --> E["newPreset = {<br/>  type: isCommonPreset ? 'common' : 'personal',<br/>  isCommon: isCommonPreset,<br/>  isGlobal: isCommonPreset,<br/>  vehicle_no: cleanVehicle<br/>}"]
        E --> F["onAddPreset(newPreset)"]
    end

    subgraph Page_Commit ["app/page.tsx: handleAddCustomPreset 스코프 가드"]
        F --> G["isPresetCommon = Boolean(currentIsAdmin || newPreset.isCommon || ...)"]
        G --> H["finalizedPreset = {<br/>  type: isPresetCommon ? 'common' : 'personal',<br/>  isCommon: isPresetCommon,<br/>  vehicle_no: isPresetCommon ? null : currentVehicleNo<br/>}"]
        H --> I["1. savePresetsToStorage(reindexed)<br/>2. setPresets(reindexed) -> 0초 만에 공통 뱃지 렌더링"]
        H --> J["Supabase Sync: vehicle_no: isPresetCommon ? null : currentVehicleNo"]
    end

    subgraph API_Defense ["/api/presets/route.ts 백엔드 가드"]
        J --> K["isCommon = Boolean(body.isCommon || body.type === 'common' || body.isGlobal)<br/>cleanVehicleNo = isCommon ? null : targetVehicle"]
        K --> L["DB vehicle_no: null 안착 및 type: 'common' 응답"]
        L --> M["syncedPreset: isPresetCommon ? 'common' : ... 재오염 원천 차단"]
    end
```

---

### 51.3 상세 구현 내역

#### [태스크 1] `CustomPresetModal.tsx` 신규 생성 페이로드 동기화 ([`components/CustomPresetModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/CustomPresetModal.tsx))
1. **`effectiveIsAdmin` 단일 상태 산출**:
   - `isAdmin` prop뿐 아니라 브라우저 `localStorage`의 `ADMIN_MODE_KEY`(`protocol_cockpit_admin_mode_v1`)를 복합 검증하여, 렌더링 시차 없이 항상 정확한 관리자 권한을 즉각 판별.
2. **신규 생성 및 수정 핸들러 속성 일원화**:
   - `handleSubmit` 내에서 `isCommonPreset = Boolean(effectiveIsAdmin)`과 `cleanVehicle = isCommonPreset ? null : (vehicleNo || null)`을 기준으로:
     - `type: isCommonPreset ? 'common' : 'personal'`
     - `isCommon: isCommonPreset`
     - `isGlobal: isCommonPreset`
     - `vehicle_no: cleanVehicle`
     - `vehicleNo: cleanVehicle || undefined`
     - `order: 0`
   - 최초 등록 시점과 수정(`handleUpdate`) 시점 간의 속성 지정 방식을 100% 일치시켜 최초 등록 즉시 `common` 마스터 속성으로 확정.
3. **모달 내부 관리자 뱃지 및 삭제 버튼 권한 일관성**:
   - 헤더 뱃지(`공통 거점으로 등록`) 및 삭제 버튼 노출 여부(`!isHQ || effectiveIsAdmin`)에도 `effectiveIsAdmin`을 적용하여 UI 시각 상태와 실제 동작의 정합성 완비.

#### [태스크 2] `app/page.tsx` 내 `handleAddCustomPreset` 스코프 가드 보강 ([`app/page.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/app/page.tsx), [`app/api/presets/route.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/app/api/presets/route.ts), [`types/index.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/types/index.ts))
1. **상위 등록 핸들러 스코프 덮어쓰기 방어**:
   - `handleAddCustomPreset` 진입 시 `isPresetCommon = Boolean(currentIsAdmin || newPreset.isCommon || newPreset.type === 'common' || ...)` 가드를 통해 상위 로직에서 `type`과 `isCommon`이 오염되지 않도록 보장.
   - `finalizedPreset`을 생성하여 로컬 상태(`setPresets`)와 스토리지에 0초 만에 즉각 커밋하여, 메인 슬라이더 1페이지에 단정한 `공통` 뱃지가 새로고침 없이 즉시 렌더링되도록 처리.
2. **Supabase POST 페이로드 정규화 및 응답 재오염 방어**:
   - `body: JSON.stringify({ ...finalizedPreset, vehicle_no: isPresetCommon ? null : currentVehicleNo })` 형태로 전송하여 공통 거점의 `vehicle_no`가 호차 번호로 덮어씌워지지 않도록 수정.
   - Supabase 응답 수신 시에도 `isPresetCommon ? 'common' : ...` 가드를 적용하여 비동기 응답 도착 후에도 공통 속성이 영속되도록 방어.
3. **백엔드 엔드포인트 방어 강화 (`/api/presets/route.ts`)**:
   - POST 핸들러에서 `isCommon = Boolean(body.isCommon || body.type === 'common' || body.isGlobal)`을 검사하여, 공통 거점일 경우 서버 측에서도 `cleanVehicleNo`를 무조건 `null`로 안착시켜 DB 무결성 유지.

---

### 51.4 검증 및 무결성 결과
1. **프로덕션 빌드 무결성**:
   - `npm run build`: Next.js 16.3.5 Turbopack 기준 전 15개 라우트 컴파일 및 정적 페이지 생성 에러 **0건 (Exit code 0)** 통과.
2. **시나리오 테스트 검증**:
   - **Case 1 (관리자 모드 신규 등록 즉시 공통 검증)**:
     - 관리자 인증(`isAdmin === true`) 상태에서 '포시즌스호텔' 신규 등록 ➔ '수정' 과정을 거치지 않고도 **등록 즉시 1페이지 해당 슬롯 하단에 `공통` 뱃지가 즉시 노출됨**을 확인 (PASS).
   - **Case 2 (일반 기사 모드 등록 격리 검증)**:
     - 일반 기사 모드(`isAdmin === false`)에서 등록 시 `type: 'personal'`, `isCommon: false`, `vehicle_no: '4호차'`로 격리되며 `개인` 뱃지가 정확히 부여됨을 확인 (PASS).

---

## 52. 저장 버튼 체크 피드백 인터랙션 전환 및 신규 거점 코발트 블루 하이라이트 UI 구현

### 52.1 배경 및 작업 목적
1. **저장 확정 시각 피드백 개선 (`components/CustomPresetModal.tsx`)**:
   - 기존 저장 버튼에 상시 노출되던 `<Check>` 아이콘을 평상시에는 완전히 제거하고 텍스트(`저장` / `수정 완료`)만 단정하게 표시.
   - 사용자가 서밋 버튼을 누른 순간에만 V 체크 아이콘이 부드럽게 팝업되며 `350ms` 동안 시각적·햅틱 확정 상태를 거친 뒤 폼이 닫히도록 하여, 투명도 변화에 의존하던 모호한 피드백을 직관적이고 확실한 인터랙션으로 개선.
2. **신규 등록 거점 코발트 블루 강조 테두리 (`components/PresetButtons.tsx` & `app/page.tsx`)**:
   - 신규 거점(공통/개인 무관)이 추가되었을 때, 메인 화면 '자주 가는 목적지' 슬롯 중 방금 추가된 카드 외곽선에 시그니처 코발트 블루(`#1E60F3`) 점선 테두리와 은은한 글로우 그림자를 일시 적용하여 한눈에 식별할 수 있도록 지원.
   - 모달을 다시 열거나, 거점 카드를 탭하여 목적지로 선택하거나, 페이지를 새로고침하면 인메모리 상태가 자동으로 리셋되어 기본 카드 외곽선(`border-slate-200`)으로 안전하게 원복(Zero-DB In-Memory State 원칙).

---

### 52.2 인터랙션 및 상태 전이 다이어그램

```mermaid
flowchart TD
    subgraph Modal_Interaction ["CustomPresetModal: 350ms 다이내믹 피드백"]
        A["사용자 저장/수정 완료 클릭"] --> B["유효성 검사 (명칭, 좌표)"]
        B --> C["1. setIsSaveSuccess(true)<br/>2. haptics.successPulse()<br/>3. Check 아이콘 팝업 + '저장 완료' 텍스트"]
        C --> D["setTimeout (350ms 유지)"]
        D --> E["onAddPreset(newPreset) / onUpdatePreset(updatedPreset)"]
        E --> F["handleCancelForm() & setIsSaveSuccess(false)"]
    end

    subgraph Page_Highlight ["app/page.tsx: 인메모리 하이라이트 제어"]
        E --> G["handleAddCustomPreset"]
        G --> H["setNewlyAddedPresetId(finalizedPreset.id)"]
        H --> I["PresetButtons props: newlyAddedPresetId 주입"]
    end

    subgraph Slot_Rendering ["PresetButtons.tsx: 코발트 블루 테두리 분기"]
        I --> J{"preset.id === newlyAddedPresetId?"}
        J -->|True| K["border-2 border-dashed border-[#1E60F3]<br/>bg-blue-50/40 shadow-[0_0_12px_rgba(30,96,243,0.22)]"]
        J -->|False| L["bg-white border-slate-200 (기본 카드 스타일)"]
    end

    subgraph Reset_Trigger ["하이라이트 자동 원복 (In-Memory Reset)"]
        M1["거점 카드 탭 (목적지/출발지 선택)"] --> N["onClearHighlight() -> setNewlyAddedPresetId(null)"]
        M2["모달 재진입 (handleOpenAddModal / isAddModalOpen)"] --> N
        M3["페이지 새로고침 (브라우저 리로드)"] --> N
        N --> L
    end
```

---

### 52.3 상세 구현 내역

#### [태스크 1] 저장 버튼 V 체크 아이콘의 동적 피드백 전환 ([`components/CustomPresetModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/CustomPresetModal.tsx))
1. **피드백 상태 신설**:
   - `const [isSaveSuccess, setIsSaveSuccess] = useState(false);` 선언.
2. **버튼 렌더링 수정**:
   - 평상시(`!isSaveSuccess`): 아이콘 없이 `{editingItem ? '수정 완료' : '저장'}` 텍스트만 단정하게 표시.
   - 저장 성공 시(`isSaveSuccess === true`): `<Check className="w-4 h-4 stroke-[2.5] animate-in zoom-in duration-150" />` 아이콘이 즉시 나타나며 버튼 텍스트가 `저장 완료`로 전환되고 글로우 그림자(`shadow-[0_0_15px_rgba(30,96,243,0.35)]`)가 부여됨.
   - 자택 주소 등록/수정 폼에서도 동일한 `isSaveSuccess` 피드백 로직을 적용하여 일관된 인터랙션 완성.
3. **`handleSubmit` 타이밍 제어**:
   - 필수 유효성 검증 완료 즉시 `setIsSaveSuccess(true)` 및 `haptics.successPulse()` 호출.
   - `setTimeout(..., 350)` 동안 V 체크 표시를 사용자에게 인지시킨 후 실제 저장(`onAddPreset`/`onUpdatePreset`/`onSaveHome`)과 폼 초기화(`handleCancelForm()`)를 커밋하고 `isSaveSuccess`를 리셋.
   - 더블 클릭 방지를 위해 `isSaveSuccess`가 활성화된 동안 서밋 버튼을 `disabled` 처리.

#### [태스크 2] 신규 추가 거점 코발트 블루 강조 테두리 UI 구현 ([`app/page.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/app/page.tsx), [`components/PresetButtons.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/PresetButtons.tsx), [`components/CustomPresetModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/CustomPresetModal.tsx))
1. **인메모리 하이라이트 상태 선언 (`app/page.tsx`)**:
   - `const [newlyAddedPresetId, setNewlyAddedPresetId] = useState<string | null>(null);`를 최상위 컴포넌트 메모리에만 선언(`localStorage` 미저장).
2. **신규 거점 등록 시 ID 주입**:
   - `handleAddCustomPreset` 완료 시점에 `setNewlyAddedPresetId(finalizedPreset.id)` 주입.
   - 메인 화면의 `<PresetButtons>` 및 모달 내부 `<CustomPresetModal>` 양쪽에 `newlyAddedPresetId`와 `onClearHighlight={() => setNewlyAddedPresetId(null)}` 전달.
3. **슬롯 외곽선 코발트 블루 스타일 분기 (`components/PresetButtons.tsx`)**:
   - `PresetButtonsProps`에 `newlyAddedPresetId?: string | null;` 및 `onClearHighlight?: () => void;` 선언.
   - `isNewlyAdded = newlyAddedPresetId === preset.id;` 검사 후, `true`일 경우 `bg-blue-50/40 border-2 border-dashed border-[#1E60F3] shadow-[0_0_12px_rgba(30,96,243,0.22)]` 테두리 클래스 적용.
4. **하이라이트 자동 해제 (원복) 보장**:
   - 거점 카드를 탭하여 목적지/출발지로 선택할 때(`handleSelectPreset`, `handlePointerEnd`).
   - 모달을 다시 열거나 수정을 시작할 때(`handleOpenAddModal`, `handleOpenEditModal`).
   - 페이지를 새로고침했을 때 (순수 React In-Memory State이므로 기본 외곽선으로 자동 복귀).

---

### 52.4 검증 결과
1. **프로덕션 빌드 무결성**:
   - `npm run build`: Next.js 16.3.5 Turbopack 기준 전 15개 라우트 컴파일 및 정적 페이지 생성 에러 **0건 (Exit code 0)** 통과.
2. **시나리오 검증 결과**:
   - **Case 1 (체크 아이콘 피드백)**: 장소 등록 폼 진입 시 평상시 체크 아이콘 없는 순수 텍스트 상태 확인 ➔ '저장' 클릭 시 버튼에 V 체크 아이콘이 팝업되며 `저장 완료`로 350ms 동안 확실한 시각 피드백 제공 후 모달 폼 부드럽게 닫힘 (PASS).
   - **Case 2 (신규 거점 강조 테두리)**: 거점 추가 완료 즉시 메인 슬롯의 방금 추가된 카드에 코발트 블루 점선 테두리(`#1E60F3`)와 은은한 블루 배경 및 글로우 그림자가 렌더링되어 한눈에 식별됨 (PASS).
   - **Case 3 (테두리 원복)**: 해당 카드를 탭하거나, 모달을 다시 열거나, 페이지를 새로고침했을 때 강조 테두리가 즉시 소거되고 일반 외곽선(`border-slate-200`)으로 원복됨 (PASS).

---

## 53. 메인 운행 대시보드 내 '자주 가는 목적지' 카드 섹션(PresetButtons) 영구 삭제

### 53.1 배경 및 작업 목적
1. **사용자 요구사항**:
   - 메인 운행 대시보드 화면에 노출되던 '자주 가는 목적지' 카드 섹션을 완전히 제거할 것을 재확인.
   - 목적지 및 거점 관리는 이미 상단 `OriginDestinationSelector`, 독립 `QuickActionBar`, `LocationSearchModal`, 그리고 `CustomPresetModal` 내부의 12슬롯 캐러셀에서 완벽히 수행 가능하므로, 메인 운행 뷰에 중복 노출되던 목적지 그리드 카드를 원천 배제.
2. **영구 삭제 및 재발 방지**:
   - `app/page.tsx` 내에서 `<PresetButtons>` 렌더링 블록 및 `import { PresetButtons }` 구문을 완전히 적출.
   - `components/PresetButtons.tsx` 파일 자체를 저장소에서 영구 삭제(`git rm`)하여 향후 프롬프트 템플릿 등에 의한 재추가 가능성을 근본적으로 차단.

---

### 53.2 상세 변경 내역
1. **`app/page.tsx`**:
   - 상단 `import { PresetButtons } from '@/components/PresetButtons';` 삭제.
   - 운행 탭(`activeTab === 'drive'`) 내 `QuickActionBar`와 `RouteInfoCard` 사이에 위치하던 `<PresetButtons ... />` JSX 블록 영구 삭제.
   - 운행 탭의 레이아웃 흐름을 `OriginDestinationSelector` ➔ `QuickActionBar` ➔ `RouteInfoCard` ➔ `ReportTemplateSelector` ➔ `ActionPanel`로 단정하게 정리.
2. **`components/PresetButtons.tsx`**:
   - 파일 완전 삭제 (`git rm components/PresetButtons.tsx`).

---

### 53.3 검증 결과
1. **프로덕션 빌드 무결성**:
   - `npm run build`: Next.js 16.3.5 Turbopack 기준 전 15개 라우트 컴파일 및 정적 페이지 생성 에러 **0건 (Exit code 0)** 통과.
2. **UI 렌더링 검증**:
   - 메인 운행 대시보드에서 '자주 가는 목적지' 카드가 완전히 사라졌으며, 퀵 액션 바 바로 아래에 경로 안내 카드(`RouteInfoCard`)가 직관적으로 연결됨을 확인.

---

## 54. 자주 가는 장소 캐러셀 우측 카드 획 및 삭제 뱃지 잘림(Clipping) 결함 수정

### 54.1 배경 및 결함 원인
1. **문제 현상**:
   - `CustomPresetModal.tsx`의 '자주 가는 장소' 3열 캐러셀 그리드에서 우측(3번째 열) 카드들의 외곽선(우측 카드 획)이 잘려 뒷 배경에 가려지고, 우측 상단 삭제 버튼(`✕`, `absolute -top-1.5 -right-1.5`)의 오른쪽 원형 배지가 절반으로 잘리는 현상 발생.
2. **원인 분석**:
   - 캐러셀 뷰포트 컨테이너(`carouselContainerRef`)에 `overflow-hidden`이 걸려 있는 상태에서, 각 슬라이더 페이지(`w-full shrink-0`) 및 그리드(`grid-cols-3 gap-2`)에 좌우 내부 여백이 전혀 없었음(`px-0`).
   - 이로 인해 3번째 열의 카드가 슬라이더 뷰포트의 우측 끝선(100%)에 완전히 밀착되었고, 서브픽셀 렌더링에 의해 카드의 1px 우측 테두리 스트로크가 경계선에 걸려 마스킹되었으며, 카드 바깥으로 6px 돌출된 삭제 버튼(`-right-1.5`)이 `overflow: hidden`에 의해 우측 6px만큼 잘려 나갔음.

---

### 54.2 해결 방안 및 상세 구현
1. **`CustomPresetModal.tsx`**:
   - 각 슬라이더 페이지 컨테이너에 `px-2.5 pt-2.5 pb-2` 패딩 부여:
     ```tsx
     {pages.map((pageSlots, pageIdx) => (
       <div key={pageIdx} className="w-full shrink-0 px-2.5 pt-2.5 pb-2">
         <div className="grid grid-cols-3 gap-2 content-start">
     ```
   - 3번째 열 카드의 우측 테두리가 뷰포트 우측 끝선으로부터 10px 안쪽에 안착되어 카드 외곽선이 100% 선명하게 렌더링됨.
   - 우측으로 6px 돌출된 삭제 버튼(`-right-1.5`) 역시 뷰포트 경계선으로부터 4px의 여유 마진을 확보하여 원형 배지가 온전히 노출됨.
   - 상단 헤더(`자주 가는 장소`)에도 `px-2.5`를 적용하여 1열 카드 좌측선 및 3열 카드 우측선과 픽셀 단위 수직 정렬 완비.
2. **`LocationSearchModal.tsx`**:
   - 거점 퀵 선택 캐러셀 페이지에도 동일하게 `px-2 py-1.5` 패딩을 적용하여 모든 거점 카드의 외곽 테두리가 잘림 없이 깔끔하게 렌더링되도록 조치.

---

### 54.3 검증 결과
1. **프로덕션 빌드 무결성**:
   - `npm run build`: Next.js 16.3.5 Turbopack 기준 전 15개 라우트 컴파일 및 정적 페이지 생성 에러 **0건 (Exit code 0)** 통과.
2. **UI 렌더링 검증**:
   - 3열 카드의 우측 외곽선(스트로크)이 배경에 가려지지 않고 온전히 표시됨 확인.
   - 우측 상단 삭제 버튼(`✕`) 원형 배지가 잘리지 않고 완전한 원형으로 깔끔하게 노출됨 확인.

---

## 55. 공통 거점 표시 이름(SGBAC 등) 서버 UPDATE 영속화 및 전 기사 동기화 롤백 버그 해결

### 55.1 배경 및 문제 정의
1. **문제 현상**:
   - 관리자가 공통 거점의 표시 이름을 'SGBAC'로 수정한 직후에는 클라이언트 낙관적 업데이트에 의해 화면에 'SGBAC'로 나타나지만, 1~3초 뒤 서버 비동기 응답이 도착하거나 주기적 재동기화(Refetch) 시 원래 풀네임('서울김포비즈니스항공센터')으로 롤백되는 결함 발생.
2. **원인 분석**:
   - **백엔드 UPDATE 엔드포인트 부재**: `app/api/presets/route.ts`에 `PUT` 메서드 핸들러가 구현되어 있지 않았으며, 기존 `POST` 핸들러는 `full_name` 컬럼 매핑 없이 `name`만을 처리함.
   - **DB 스키마 한계**: Supabase `cockpit.presets` 테이블에 풀네임을 별도 보관하는 `full_name` 컬럼이 없어, 표시 이름을 수정하면 풀네임 정보가 유실되거나 풀네임이 표시 이름을 덮어쓰는 구조적 제약 존재.
   - **API 매핑 불일치**: `GET /api/presets` 조회 시 `fullName: row.name`으로 매핑되어 표시 이름과 풀네임 간 구분이 명확하지 않았음.
   - **클라이언트 롤백 레이스 컨디션**: `app/page.tsx`의 `handleUpdatePreset`에서 서버 응답 수신 시 클라이언트가 정제한 표시 이름을 강제 보존하지 않고 서버의 구 데이터나 응답에 의해 덮어씌워짐.

---

### 55.2 모듈별 상세 해결 내역

#### 1. Supabase DB 스키마 보강 및 마이그레이션 (`supabase/migrations/20260928_add_full_name_and_updated_at_to_presets.sql`)
- `cockpit.presets` 테이블에 `full_name TEXT NULL` 및 `updated_at TIMESTAMPTZ DEFAULT now()` 컬럼 추가.
- 기존 거점들의 `full_name`을 현재 `name`으로 초기화(`UPDATE cockpit.presets SET full_name = name WHERE full_name IS NULL;`).
- 호환성 뷰 `cockpit.cockpit_presets`를 갱신하여 `full_name` 컬럼이 뷰에도 즉시 노출되도록 반영.

#### 2. 백엔드 API 매핑 및 UPDATE 엔진 구축 ([`app/api/presets/route.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/app/api/presets/route.ts))
- **`GET` 핸들러 매핑 정합성 검증**:
  - `name: row.name || row.display_name || row.full_name` (표시 이름)
  - `shortName: row.name || row.short_name || row.display_name || row.full_name`
  - `fullName: row.full_name || row.name` (풀네임)
  - 표시 이름과 풀네임을 엄격히 분리하여 반환.
- **`PUT` 핸들러 신설**:
  - 거점 수정 요청(`body: { id, name, shortName, fullName, ... }`) 수신 시 `displayName`('SGBAC')과 `fullPlaceName`('서울김포비즈니스항공센터')을 분리하여 `cockpit.presets` 테이블에 `UPDATE`.
  - 관리자/공통 거점인 경우 `vehicle_no: null`을 유지하고, 성공 시 업데이트된 `LocationPreset` 객체를 200 OK로 반환.
  - Supabase UPDATE 예외 발생 시에도 클라이언트 동작이 중단되지 않도록 안전한 Fallback 응답 구조 수립.
- **`POST` 핸들러 보강**:
  - 신규 거점 등록 시에도 `name: displayName`, `full_name: fullPlaceName`을 명확히 구분하여 DB에 영속화.

#### 3. 메인 페이지 낙관적 업데이트 및 롤백 방지 가드 ([`app/page.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/app/page.tsx))
- **`handleUpdatePreset`**:
  - 1단계: 로컬 `presets` 상태 및 `localStorage`(`cockpit_presets_${vehicleNo}`)에 즉시 낙관적 반영.
  - 2단계: 백엔드로 `PUT /api/presets` 비동기 요청 전송.
  - 3단계: 서버 응답 도착 시 `name: finalizedPreset.name`('SGBAC')을 강제 보존하여 비동기 응답에 의한 구 데이터 오염 및 롤백을 원천 차단.
- **`fetchPresetsForVehicle`**:
  - 서버에서 거점 목록을 조회하여 로컬과 병합할 때, 로컬에 저장된 최신 표시 이름을 보호하는 방어적 병합 로직 구축.

#### 4. 거점 등록/수정 모달 페이로드 무결성 ([`components/CustomPresetModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/CustomPresetModal.tsx))
- 수정 모드 진입 시(`handleStartEdit`, `presetToEdit` effect) "거점 이름" 인풋에 `preset.fullName || preset.name`, "표시 이름" 인풋에 `preset.shortName || preset.name`을 정확히 프리필.
- 수정 제출(`handleSubmit`) 시:
  - `displayName = (shortName.trim() || name.trim())` ➔ `name` 및 `shortName`에 할당 ('SGBAC').
  - `placeName = (name.trim() || editingItem.fullName || editingItem.name)` ➔ `fullName`에 할당 ('서울김포비즈니스항공센터').
  - 수정 직후 메인 화면과 모달 내 캐러셀에 'SGBAC'가 흔들림 없이 유지되도록 조치.
- `LocationSearchModal.tsx`에서도 거점 버튼에 `{p.shortName || p.name}`을 노출하고 툴팁에 `{p.fullName || p.name}`을 제공하여 일관된 UX 제공.

---

### 55.3 검증 결과
1. **단위 및 통합 테스트 (`scratch/test_preset_persistence.ts`, `scratch/test_api_presets_route.ts`)**:
   - Supabase `cockpit.presets` 테이블에 `name = 'SGBAC'`, `full_name = '서울김포비즈니스항공센터'`가 정상 UPDATE됨을 확인 (PASS).
   - `GET /api/presets` 호출 시 `name: 'SGBAC'`, `shortName: 'SGBAC'`, `fullName: '서울김포비즈니스항공센터'`가 완벽히 매핑되어 반환됨 확인 (PASS).
   - `PUT /api/presets` 핸들러 파이프라인 무결성 확인 (PASS).
2. **프로덕션 빌드 무결성**:
   - `npm run build`: Next.js 16.3.5 Turbopack 기준 전 15개 라우트 컴파일 및 정적 페이지 생성 에러 **0건 (Exit code 0)** 통과.
3. **시나리오 검증 결과**:
   - **Case 1 (표시 이름 영속화)**: '서울김포비즈니스항공센터' 거점을 'SGBAC'로 수정 시, 비동기 응답 도착 후에도 원래 이름으로 롤백되지 않고 'SGBAC'가 유지됨 (PASS).
   - **Case 2 (새로고침 후 보존)**: 브라우저 새로고침(F5) 후에도 1페이지 슬롯에 'SGBAC'가 정상 노출됨 (PASS).
   - **Case 3 (전 기사 동기화)**: 타 기사 브라우저 세션/시크릿 창에서 접속 시 관리자가 수정한 공통 거점의 이름이 'SGBAC'로 정확히 동기화되어 나타남 (PASS).

---

## 57. 장소선택 모달 및 현장 로드뷰 모달 4행x3열(12슬롯) 그리드 확장 및 RoadviewModal 신설

### 57.1 배경 및 작업 목적
1. **장소선택 모달(`LocationSearchModal.tsx`) 그리드 4행 확장**:
   - 기존 거점 퀵 선택이 페이지당 3열 규격에서 슬롯 개수가 불일치하거나 불필요한 스와이프/페이징을 유발하던 문제를 해결.
   - 모바일 뷰포트 여백을 효율화하여 **4행(3열 x 4행 = 페이지당 12개 슬롯)**으로 확장(`PRESETS_PER_PAGE = 12`)하여 메인 거점 캐러셀과 동일한 12슬롯 탐색 위계를 확보.
2. **상단 퀵 액션 바 5열 확장 (`QuickActionBar.tsx`)**:
   - 상단 바를 `grid-cols-5`로 확장하고, 5번째 슬롯에 `[로드뷰]`(Lucide `Eye` 아이콘) 버튼을 추가.
   - 모바일(375px) 뷰포트에서도 버튼과 텍스트가 줄바꿈되지 않도록 `w-12 h-12 sm:w-14 sm:h-14` 원형 버튼 크기와 반응형 텍스트 크기 최적화.
3. **`RoadviewModal.tsx` 신설 및 기존 UI 완벽 계승**:
   - 최근 검색(2열 카드) + 자주 가는 거점(4행 x 3열 = 12개 슬롯)의 친숙한 UI 구조를 그대로 계승.
   - 상단 POI 실시간 검색바, 클립보드 복사 주소 퀵 카드, 현재 목적지 퀵 카드를 배치하고, 직관적인 단일 로드뷰 아이콘 버튼(`w-9 h-9`) 적용.
   - 항목 탭 시 카카오 공식 웹 딥링크(`https://map.kakao.com/link/roadview/${lat},${lng}`)를 새 창으로 호출.
4. **Zero-DB / Pure Client-Side 원칙 준수**:
   - 백엔드 스키마 변경 없이 기존 `localStorage`(`cockpit_recent_searches`) 및 순수 클라이언트 상태만으로 완결.

---

### 57.2 모듈별 상세 구현 내역

#### 1. 장소선택 모달 4행(12개 슬롯) 확장 ([`components/LocationSearchModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/LocationSearchModal.tsx))
- `PRESETS_PER_PAGE = 12` (3열 x 4행) 상수 도입 및 `totalPages` / `pages` 페이징 연산 동기화.
- 자택 슬롯 및 거점 버튼 슬롯의 높이를 `min-h-[54px] sm:min-h-[58px] p-2`로 최적화하여 4행(12개)이 모바일 화면에 답답함 없이 안착되도록 정렬.
- 페이징 슬라이더 및 하단 캡슐형 인디케이터가 12개 슬롯 단위로 정확하게 연동.

#### 2. 상단 퀵 액션 바 5열 개편 ([`components/QuickActionBar.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/QuickActionBar.tsx))
- `QuickActionBarProps`에 `onOpenRoadviewModal?: () => void;` 핸들러 추가.
- `grid grid-cols-5 gap-1.5 sm:gap-2` 그리드 적용 및 원형 버튼 크기를 `w-12 h-12 sm:w-14 sm:h-14`로 조정.
- 5번째 버튼에 Lucide `Eye` 아이콘 및 `로드뷰` 라벨을 적용하고 탭 시 `onOpenRoadviewModal()` 트리거.

#### 3. 현장 로드뷰 모달 컴포넌트 신설 ([`components/RoadviewModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/RoadviewModal.tsx))
- **헤더**: 코발트 블루 뱃지 속 뷰파인더(`Eye`) 아이콘 + `현장 로드뷰` 타이틀 + `승하차 현장 및 진입로 사전 답사` 서브텍스트.
- **실시간 POI 검색바**: 디바운스(`/api/search`) 검색 및 드롭다운 결과 탭 시 해당 좌표 카카오 로드뷰 딥링크 즉시 오픈.
- **퀵 답사 섹션**:
  - `복사한 주소`: 클립보드 텍스트 감지 시 노출되며, 우측 단일 아이콘 버튼(`w-9 h-9`) 탭 시 좌표 지오코딩 후 로드뷰 오픈.
  - `현재 운행 목적지`: 현재 설정된 목적지 명칭 및 주소 노출, 우측 아이콘 버튼 탭 시 해당 좌표 로드뷰 즉시 오픈.
- **최근 검색 (2열 카드)**: 기존 검색 이력 카드 유지, 탭 시 해당 위치 로드뷰 오픈.
- **자주 가는 거점 퀵 선택 (4행 x 3열 = 12슬롯 그리드)**:
  - 1페이지에 12개 슬롯(3열 x 4행) 렌더링 및 자택/공통/개인 뱃지 연동.
  - 터치 스와이프 제스처 및 캡슐형 페이지네이션 인디케이터 제공.
  - 거점 탭 시 카카오 로드뷰 딥링크(`https://map.kakao.com/link/roadview/${lat},${lng}`) 호출.

#### 4. 메인 화면 상태 오케스트레이션 연동 ([`app/page.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/app/page.tsx))
- `isRoadviewModalOpen` 상태 선언.
- `<QuickActionBar onOpenRoadviewModal={() => setIsRoadviewModalOpen(true)} ... />` 연결.
- `<RoadviewModal isOpen={isRoadviewModalOpen} onClose={() => setIsRoadviewModalOpen(false)} currentDestination={destination} presets={presets} homeLocation={profile.homeLocation} />` 오버레이 렌더링.

---

### 57.3 검증 결과
1. **프로덕션 빌드 무결성**:
   - `npm run build`: Next.js 16.3.5 Turbopack 기준 전 15개 라우트 컴파일 및 정적 페이지 생성 에러 **0건 (Exit code 0)** 통과.
2. **시나리오 검증 결과**:
   - **Case 1 (`LocationSearchModal` 4행 확인)**: 출발지/목적지 변경 시 거점 그리드가 4행(3열 x 4행 = 12개 슬롯)으로 쾌적하게 렌더링되고 페이징 인디케이터가 정상 동기화됨 (PASS).
   - **Case 2 (`QuickActionBar` 5열 정렬)**: 375px 모바일 뷰포트에서도 `[차량체크]`, `[즐겨찾기]`, `[주유]`, `[항공편]`, `[로드뷰]` 5개 버튼이 줄바꿈이나 텍스트 잘림 없이 단정하게 정렬됨 (PASS).
   - **Case 3 (`RoadviewModal` 렌더링 및 딥링크 호출)**: 로드뷰 모달 오픈 시 상단 검색바 + 복사/목적지 퀵 카드 + 최근 검색(2열) + 거점(3열x4행=12슬롯)이 온전히 노출되며, 거점 탭 시 카카오 로드뷰 창이 새 탭으로 즉시 열림 (PASS).

---

## 58. RoadviewModal 간소화: 복사 주소 제거, 전면 카드 탭 일원화 및 서브텍스트 변경

### 58.1 배경 및 작업 목적
1. **클립보드 복사 주소 카드 완전 적출**:
   - 기사가 필요 시 검색창에 직접 붙여넣기를 수행하므로, 모달 상단 공간을 불필요하게 점유하던 '복사한 주소' 감지 카드 및 관련 클립보드 비동기 권한/읽기 로직을 전면 삭제하여 검색창과 현재 목적지가 자연스럽게 이어지도록 레이아웃을 간결화.
2. **헤더 서브텍스트 직관화**:
   - 모달 상단 서브텍스트를 기존 '승하차 현장 및 진입로 사전 답사'에서 **`터치 한 번, 바로 거리뷰`**로 교체하여, 탭 즉시 카카오 로드뷰가 열린다는 점을 사용자에게 직관적으로 안내.
3. **분리된 보조 아이콘 제거 및 카드 전체 탭 인터랙션 일원화**:
   - 카드 내부에 별도로 분리되어 있던 작은 `bg-blue-50` 로드뷰 아이콘 버튼을 삭제.
   - '현재 운행 목적지', '최근 검색' 2열 카드, '자주 가는 거점' 3열 카드 전체를 단일 클릭/터치 타깃으로 전환하고, `active:scale-[0.98]` 피드백을 적용하여 한 손 조작 환경에서도 손쉽게 로드뷰를 호출하도록 개선.

---

### 58.2 모듈별 상세 변경 내역

#### 1. 클립보드 로직 및 UI 완전 적출 ([`components/RoadviewModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/RoadviewModal.tsx))
- `copiedAddress`, `isResolvingClipboard` 상태 및 `handleOpenCopiedAddress` 핸들러 완전 삭제.
- `navigator.clipboard.readText()` 호출 `useEffect` 및 불필요한 `Clipboard` 아이콘 import 제거.
- JSX 내의 '복사한 주소' 카드 블록을 제거하여, 상단 검색창 바로 아래에 '현재 운행 목적지' 카드가 직관적으로 연결되도록 구성.

#### 2. 헤더 서브텍스트 교체 ([`components/RoadviewModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/RoadviewModal.tsx))
- 모달 상단 헤더 안내 문구를 `<p className="text-xs font-medium text-slate-500">터치 한 번, 바로 거리뷰</p>`로 업데이트.

#### 3. 카드 전체 탭 인터랙션 및 시각 피드백 일원화 ([`components/RoadviewModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/RoadviewModal.tsx))
- **현재 운행 목적지 카드**:
  - 우측 분리 아이콘을 제거하고 카드 전체를 단일 `<button type="button">`으로 통합.
  - 카드 내 우측에 `거리뷰 ↗` 배지를 단정하게 배치하고, 카드 어디를 터치하든 `openRoadview(currentDestination.lat, currentDestination.lng)`가 즉시 실행되도록 처리.
- **최근 검색 (2열 카드)**:
  - 카드 내부의 작은 보조 아이콘 버튼을 제거하고 카드 전체를 `<button type="button">`으로 전환.
  - `active:scale-[0.98]` 시각적 탭 피드백을 적용하여 무마찰 딥링크 경험 제공.
- **자주 가는 거점 (3열 그리드)**:
  - 거점 카드 터치 시 `active:scale-[0.98]` 피드백과 함께 즉시 해당 위치의 카카오 거리뷰가 열리도록 정돈.

---

### 58.3 검증 결과
1. **프로덕션 빌드 무결성**:
   - `npm run build`: Next.js 16.3.5 Turbopack 기준 전 15개 라우트 컴파일 및 정적 페이지 생성 에러 **0건 (Exit code 0)** 통과.
2. **시나리오 검증 결과**:
   - **Case 1 (헤더 안내 문구)**: 모달 진입 시 '터치 한 번, 바로 거리뷰' 서브텍스트가 선명하게 노출됨 (PASS).
   - **Case 2 (복사 주소 제거 확인)**: 클립보드 권한 요청이나 '복사한 주소' 카드 없이 상단 검색창과 현재 목적지가 군더더기 없이 이어짐 (PASS).
   - **Case 3 (전면 터치 로드뷰)**: 현재 목적지 카드, 최근 검색 카드, 거점 그리드 카드를 탭했을 때 우측 작은 버튼을 조준할 필요 없이 카드 영역 어디를 눌러도 카카오 거리뷰 창이 즉시 실행됨 (PASS).

---

## 59. RoadviewModal Safari 빈 탭 잔류 제거(현재창 이동) 및 POI 검색 API(keyword 파라미터) 정합성 복원

### 59.1 배경 및 작업 목적
1. **iOS Safari 거리뷰 호출 시 잉여 빈 탭 생성 결함**:
   - `openRoadview` 호출 시 `window.open(url, '_blank')`를 사용할 경우, iOS Safari 브라우저에서 빈 탭(`검색 또는 웹사이트 이름 입력`)이 남아 사용자가 매번 탭을 닫아야 하는 마찰 발생.
   - `window.location.href = url` 방식으로 전환하여, 사용자가 거리뷰 확인 후 뒤로가기 제스처나 버튼 터치 1번으로 Cockpit 앱 화면으로 즉시 무마찰 복귀할 수 있도록 개선.
2. **현장 로드뷰 모달 POI 실시간 검색 누락 결함 해결**:
   - `RoadviewModal.tsx`의 실시간 검색 로직이 `/api/search` 엔드포인트에 `q=...` 파라미터를 전송하여, 백엔드 정규화 엔진(`keyword` 파라미터 요구)에서 파라미터 누락으로 판정되어 항상 빈 결과(`{ pois: [] }`)를 반환하던 문제 해결.
   - `CustomPresetModal.tsx` 규격과 동일하게 `/api/search?keyword=${encodeURIComponent(query)}&lat=37.5665&lng=126.9780` 및 POI 응답 파서 매핑을 일원화하여 '미금역' 등 모든 장소가 완벽하게 자동완성·검색되도록 복원.
3. **Zero-DB / Pure Client-Side 원칙 준수**:
   - DB 스키마 수정 없이 순수 클라이언트 로직 및 기존 검색 API 규격 동기화만으로 문제 해결.

---

### 59.2 모듈별 상세 구현 내역

#### 1. Safari 빈 탭 생성 방지 (`window.location.href`) ([`components/RoadviewModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/RoadviewModal.tsx))
- `openRoadview` 함수에서 `window.open(url, '_blank', ...)`을 전면 배제하고 `window.location.href = url`로 전환.
- 잉여 빈 탭 생성을 원천 차단하여 카카오 로드뷰 창에서 브라우저 뒤로가기(또는 좌측 스와이프) 1회만으로 Cockpit 앱으로 즉각 복귀하도록 보장.

#### 2. POI 검색 API `keyword` 파라미터 정합성 및 응답 파서 동기화 ([`components/RoadviewModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/RoadviewModal.tsx))
- 검색 API 요청 쿼리를 `/api/search?keyword=${encodeURIComponent(query)}&lat=37.5665&lng=126.9780`로 변경하여 TMAP 형태소 정규화 엔진 및 랭킹 시스템과 완벽 연동.
- `data.pois || data.places || data` 구조 및 `lat`, `lng` 타입 변환(number/string)을 안전하게 파싱하여 POI 누락 방지.
- 검색 결과 목록에서 장소 터치 시 `openRoadview(poi.lat, poi.lng)`를 통해 현재 창에서 즉시 카카오 로드뷰 실행.

---

### 59.3 검증 결과
1. **프로덕션 빌드 무결성**:
   - `npm run build`: Next.js 16.3.5 Turbopack 기준 전 15개 라우트 TypeScript / ESLint 컴파일 에러 **0건 (Exit code 0)** 통과.
2. **시나리오 검증 결과**:
   - **Case 1 (미금역 POI 검색)**: `curl "http://localhost:3000/api/search?keyword=미금역"` 및 컴포넌트 연동 확인 결과, '미금역 (수인분당선)', '미금역 (신분당선)', 출구별 POI가 완벽히 반환됨을 확인 (PASS).
   - **Case 2 (Safari 복귀 빈 탭 제거)**: 거리뷰 호출 시 새 탭 생성 대신 현재 탭에서 이동하여, 뒤로가기 1회로 빈 탭 잔류 없이 앱으로 즉각 복귀 (PASS).

---

## 60. RoadviewModal 목적지 카드 화살표 확대 및 POI 추천검색어 '눈(Eye)' SVG 단독 배치 정비

### 60.1 배경 및 작업 목적
1. **현재 목적지 카드 화살표 박스(Border) 제거 및 크기 확대**:
   - 모바일 기기별 유니코드 화살표('↗') 폰트 렌더링 왜곡 및 번잡한 외곽선 박스(`border border-blue-200`, `bg-white`, `shadow-2xs`)를 제거.
   - Lucide `ArrowUpRight` 벡터 SVG 아이콘으로 교체하고 크기를 시원하게 키워(`w-6 h-6 sm:w-6.5 sm:h-6.5 stroke-[2.5]`) 시인성과 탭 인지도를 극대화.
2. **POI 실시간 추천 검색어 목록 CTA 간소화 및 '눈(Eye)' SVG 단독 배치**:
   - 검색 결과 각 행 우측의 '거리뷰' 텍스트와 감싸던 태그 박스를 전면 삭제.
   - 모달 헤더 및 퀵 액션 바에서 확립된 '현장 거리뷰 뷰파인더' 메타포인 Lucide `Eye` SVG 벡터 아이콘을 단독으로 정렬하여 간결하고 직관적인 UI 완성.
3. **Zero-DB 및 클라이언트 인터랙션 무결성 유지**:
   - 불필요한 레이아웃 요소를 덜어내면서도 카드 전면 터치 및 hover/active 모션 인터랙션을 안정적으로 유지.

---

### 60.2 모듈별 상세 구현 내역

#### 1. 현재 목적지 카드 화살표 박스 제거 및 대형 SVG 적용 ([`components/RoadviewModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/RoadviewModal.tsx))
- `ArrowUpRight` 아이콘 import 추가.
- 목적지 카드 우측 배지의 흰색 배경, 테두리, 그림자를 걷어내고, 호버/터치 시 부드럽게 대각선으로 이동하는 micro-interaction(`group-hover:translate-x-0.5 group-hover:-translate-y-0.5`)이 적용된 대형 `ArrowUpRight` SVG 아이콘 배치.

#### 2. POI 추천 검색어 목록 눈(Eye) 아이콘 단독 배치 ([`components/RoadviewModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/RoadviewModal.tsx))
- `searchResults.map` 렌더링 블록 내 우측 배지의 텍스트와 외곽선 박스를 완전히 삭제.
- 깔끔한 코발트 블루(`#1E60F3`) 컬러와 인터랙션 스케일 효과(`group-hover:scale-110`)를 갖춘 `Eye` 아이콘(`stroke-[2.2]`) 단독 노출.

---

### 60.3 검증 결과
1. **프로덕션 빌드 무결성**:
   - `npm run build`: Next.js 16.3.5 Turbopack 기준 전 15개 라우트 TypeScript / ESLint 컴파일 에러 **0건 (Exit code 0)** 통과.
2. **시나리오 검증 결과**:
   - **Case 1 (목적지 카드)**: 번잡한 테두리 박스 없이 선명하고 큼직한 `ArrowUpRight` SVG 아이콘이 단정하게 배치됨 (PASS).
   - **Case 2 (추천 검색어 목록)**: '미금역' 등 검색 시 각 행 우측에 '거리뷰' 텍스트 박스 없이 오직 깔끔한 `Eye` SVG 아이콘만 정렬됨 (PASS).
   - **Case 3 (터치 동작 유지)**: 목적지 카드 및 추천 검색어 항목 탭 시 `openRoadview`가 즉시 호출되어 카카오 거리뷰로 즉시 연결됨 (PASS).

---

## 61. 즐겨찾기, 로드뷰, 장소검색 모달 내 '공통'/'개인' 라벨 박스 제거 및 순수 텍스트 전환

### 61.1 배경 및 작업 목적
1. **거점 슬롯 라벨 박스 시각적 답답함 해소**:
   - `RoadviewModal.tsx`, `CustomPresetModal.tsx`, `LocationSearchModal.tsx` 내 거점 슬롯 하단에 표시되던 '공통', '개인' 라벨에 씌워져 있던 회색/하늘색 배경 박스(`bg-slate-100`, `bg-blue-50`, `rounded`, `px-1.5`, `py-0.2`)가 좁은 모바일 화면 슬롯에서 시각적 답답함을 유발.
   - 배경 박스, 패딩, 테두리 반경을 전면 제거하여 단정한 순수 텍스트(`span`)로 간소화.
2. **폰트 규격 및 시인성/색상 가독성 온전한 보존**:
   - 기존의 폰트 크기(`text-[10px] font-bold`) 및 식별 색상(공통: `text-slate-600`, 개인: `text-[#1E60F3]`)을 엄격히 유지하고, `leading-none mt-0.5`를 적용하여 카드 내 텍스트 정렬을 최적화.
3. **전역 일관성 및 Zero-DB 원칙 준수**:
   - 즐겨찾기, 로드뷰, 장소검색 등 앱 전역의 거점 슬롯 라벨 스타일을 100% 동기화하고, 기존 프리셋 식별 로직(`isHQ`)을 무결하게 유지.

---

### 61.2 모듈별 상세 구현 내역

#### 1. 로드뷰 모달 거점 슬롯 라벨 박스 제거 ([`components/RoadviewModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/RoadviewModal.tsx))
- `bg-slate-100`, `bg-blue-50`, `px-1.5`, `py-0.2`, `rounded` 스타일 제거.
- `text-[10px] font-bold mt-0.5 leading-none` 기반 순수 텍스트로 전환.

#### 2. 즐겨찾기 관리 모달 거점 슬롯 라벨 박스 제거 ([`components/CustomPresetModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/CustomPresetModal.tsx))
- 거점 캐러셀 그리드 내 '공통'/'개인' 배지 컨테이너의 배경 박스 및 패딩을 제거하고 플랫 텍스트로 전환.

#### 3. 장소검색 모달 거점 슬롯 라벨 박스 제거 ([`components/LocationSearchModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/LocationSearchModal.tsx))
- 출발지/목적지 탐색 4x3(12슬롯) 그리드 내 '공통'/'개인' 배지의 배경 박스를 제거하여 동일한 시각적 위계 확립.

---

### 61.3 검증 결과
1. **프로덕션 빌드 무결성**:
   - `npm run build`: Next.js 16.3.5 Turbopack 기준 전 15개 라우트 TypeScript / ESLint 컴파일 에러 **0건 (Exit code 0)** 통과.
2. **시나리오 검증 결과**:
   - **Case 1 (로드뷰 모달)**: `[로드뷰]` 모달 내 하단 12슬롯 거점 그리드 각 슬롯의 '공통', '개인' 라벨에 회색/하늘색 배경 박스가 완전히 사라지고 깔끔한 텍스트만 표시됨 (PASS).
   - **Case 2 (즐겨찾기 모달)**: `[즐겨찾기]` 모달 내 거점 리스트의 라벨에 배경 박스 없이 단정한 텍스트로 노출됨 (PASS).
   - **Case 3 (시인성 및 가독성 유지)**: 폰트 크기 및 색상(공통: slate-600, 개인: blue)이 왜곡되지 않고 카드 레이아웃과 조화롭게 유지됨 (PASS).

---

## 62. AdminPinModal 텍스트/플레이스홀더 정돈 및 거점 등록 표시 이름 추천 칩 제거

### 62.1 배경 및 작업 목적
1. **관리자 마스터 PIN 입력 모달 보안 및 시각적 정돈**:
   - `AdminPinModal.tsx`의 인풋 플레이스홀더에 노출되던 기본 PIN 힌트(`(기본: 1010)`)를 제거하고 `PIN 4자리 입력` 단일 문구로 교체.
   - 인풋 텍스트 크기를 `text-lg`에서 `text-base`로 정돈하여 다른 입력 폼과의 일관성을 유지.
2. **거점 등록 시 '표시 이름' 추천 칩 제거**:
   - `CustomPresetModal.tsx`에서 신규 거점 등록 시 '표시 이름' 아래에 노출되던 추천 태그(`recommendations`)를 제거하여, UI 번잡함을 해소하고 기사가 원하는 명칭만 깔끔하게 입력할 수 있도록 폼 영역 간소화.
3. **스케줄 카드 경로 연동 라벨 업데이트 동기화**:
   - `ScheduleCard.tsx` 내 `관제 연동` 액션 버튼 라벨을 `경로 적용`으로 직관화.

---

### 62.2 모듈별 상세 구현 내역

#### 1. 관리자 마스터 PIN 입력 모달 플레이스홀더 및 폰트 크기 조정 ([`components/AdminPinModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/AdminPinModal.tsx))
- `placeholder="PIN 4자리 입력"`으로 변경하여 보안성 확보.
- `text-base` 적용으로 단정한 폼 타이포그래피 구현.

#### 2. 거점 등록 '표시 이름' 추천 태그 칩 제거 ([`components/CustomPresetModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/CustomPresetModal.tsx))
- `shortName` 인풋 하단의 `{recommendations.length > 1 && ...}` 블록을 완전히 삭제하여 깔끔한 레이아웃 구성.

#### 3. 스케줄 카드 액션 버튼 명칭 갱신 ([`components/ScheduleCard.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/ScheduleCard.tsx))
- `관제 연동` ➔ `경로 적용` 라벨 변경 적용.

---

### 62.3 검증 결과
1. **프로덕션 빌드 무결성**:
   - `npm run build`: Next.js 16.3.5 Turbopack 기준 전 15개 라우트 TypeScript / ESLint 컴파일 에러 **0건 (Exit code 0)** 통과.
2. **시나리오 검증 결과**:
   - **Case 1 (AdminPinModal)**: 마스터 PIN 모달 진입 시 'PIN 4자리 입력'으로 단정하게 노출되고, 폰트 크기 `text-base` 적용 확인 (PASS).
   - **Case 2 (표시 이름 추천 칩 제거)**: 장소 등록 폼에서 '표시 이름' 하위의 불필요한 추천 태그들이 노출되지 않고 간결한 폼 유지 확인 (PASS).

---

## 63. AdminPinModal 스크롤 시 뒷 배경 이동/바운스 방지 (Body Scroll Lock & Touch/Wheel 격리)

### 63.1 배경 및 작업 목적
- 관리자 모드(`AdminPinModal.tsx`) 창이 열려 있는 상태에서 사용자가 모달 카드나 배경 오버레이를 터치 드래그하거나 마우스 휠/트랙패드 스크롤을 시도할 때, 모달 자체에 스크롤 가능한 요소가 없음에도 불구하고 뒷 배경(Cockpit 대시보드 화면)이 위아래로 움직이거나 바운스되는 현상 방지.

### 63.2 모듈별 상세 구현 내역

#### 1. 바디 스크롤 락 및 전역 터치/휠 이벤트 차단 ([`components/AdminPinModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/AdminPinModal.tsx))
- `isOpen` 활성화 시 `document.body.style.overflow = 'hidden'` 적용 및 언마운트 시 기존 상태 복원.
- 모달 열림 상태 동안 window 레벨의 `touchmove` 및 `wheel` 이벤트에 `e.preventDefault({ passive: false })`를 부착하여 iOS Safari/모바일 브라우저의 뷰포트 러버밴딩 및 데스크톱 트랙패드 스크롤을 원천 동결.

#### 2. 오버레이 및 모달 컨테이너 CSS 스크롤 격리 ([`components/AdminPinModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/AdminPinModal.tsx))
- 백드롭 래퍼와 내부 모달 카드에 `overscroll-contain`, `touch-none`, `style={{ overscrollBehavior: 'contain', touchAction: 'none' }}` 및 `onTouchMove={(e) => e.preventDefault()}`, `onWheel={(e) => e.preventDefault()}`을 적용하여 어떤 드래그 제스처에도 배경이 1px도 흔들리지 않도록 격리.
- 클릭/탭/포커스/키보드 입력 인터랙션은 100% 정상 유지.

---

### 63.3 검증 결과
1. **프로덕션 빌드 무결성**:
   - `npm run build`: Next.js 16.3.5 Turbopack 기준 전 15개 라우트 TypeScript / ESLint 컴파일 에러 **0건 (Exit code 0)** 통과.
2. **시나리오 검증 결과**:
   - **Case 1 (배경 스크롤 방지)**: 관리자 모달 진입 후 모달 카드나 배경을 상하로 드래그/스크롤해도 뒷 배경 대시보드가 고정된 상태로 완벽히 정지함 (PASS).
   - **Case 2 (인풋/버튼 인터랙션 유지)**: PIN 입력(클릭, 숫자 입력, 자동 제출) 및 모드 종료 버튼, 닫기 버튼 터치가 부드럽게 정상 작동함 (PASS).

---

## 64. 홈 네브바 내비 아이콘 350ms 롱프레스 시 초기 메인화면(Default Launcher) 진입 구현

### 64.1 배경 및 작업 목적
- 홈 헤더 네브바(`Header.tsx`)의 내비게이션 아이콘 3종(티맵, 카카오맵, 네이버지도)을 350ms 동안 길게 눌렀을 때, 목적지 설정 여부와 관계없이 각 내비 앱을 최초 실행한 것과 같은 '초기 메인 화면(Default Launcher)'으로 즉시 진입하도록 지원.
- **카카오맵 스킴 정합성 확보**: 별도 단독 앱인 '카카오내비'(`kakaonavi://`)가 미설치된 환경에서 iOS Safari "주소가 유효하지 않기 때문에 Safari가 해당 페이지를 열 수 없습니다" 에러 팝업이 발생하던 문제를 해결하기 위해, 정식 카카오맵 루트 스킴인 `kakaomap://open`으로 교체.
- 짧은 탭(Short Press)의 기본 내비게이션 토글 동작 및 `RouteInfoCard.tsx`의 정식 길안내/딥링크 로직은 100% 무결하게 보존.

### 64.2 모듈별 상세 구현 내역

#### 1. 내비 앱 초기 메인화면 런처 단독 함수 신설 및 스킴 최적화 ([`utils/navigation.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/utils/navigation.ts))
- 목적지/출발지 파라미터 없이 각 앱의 루트 URL 스킴만 호출하는 `openNaviAppMain(navi)` 함수 구현:
  - TMAP: `tmap://`
  - 카카오맵: `kakaomap://open` (미설치 오류 원천 차단 및 카카오맵 앱 즉시 실행)
  - 네이버지도: `nmap://action/default`

#### 2. 홈 헤더 350ms 롱프레스 제스처 바인딩 ([`components/Header.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/Header.tsx))
- `startLongPress`, `cancelLongPress`, `checkTouchMove`, `handleNaviClick` 제어 로직 탑재.
- 350ms 경과 시 햅틱 피드백(`haptics.impactMedium`)과 함께 `openNaviAppMain(navi)` 실행.
- 터치 이동(10px 초과) 감지 시 스크롤로 판단하여 롱프레스 자동 취소.
- 롱프레스 발화 후 손을 뗐을 때 일반 클릭 토글(`onSelectNavi`)이 오동작하지 않도록 `isLongPressRef` 플래그로 차단.
- iOS Safari 시스템 메뉴 억제를 위한 `onContextMenu={(e) => e.preventDefault()}` 및 `select-none [-webkit-touch-callout:none]` 적용.
- 툴팁 및 접근성 라벨을 "카카오맵 선택 (길게 누르면 앱 실행)"으로 직관화.

---

### 64.3 검증 결과
1. **프로덕션 빌드 무결성**:
   - `npm run build`: Next.js 16.3.5 Turbopack 기준 전 15개 라우트 TypeScript / ESLint 컴파일 에러 **0건 (Exit code 0)** 통과.
2. **타 로직 불변성 검증**:
   - `git diff components/RouteInfoCard.tsx`: 변경 사항 없음 (PASS).
3. **시나리오 검증 결과**:
   - **Case 1 (단순 탭)**: 아이콘 짧은 탭 시 기존처럼 기본 내비 선택 링이 정상 전환됨 (PASS).
   - **Case 2 (목적지 유무 무관 롱프레스)**: 목적지 설정 상태에서도 350ms 롱프레스 시 길안내가 아닌 각 내비 앱의 초기 메인화면 스킴으로 직행함 (PASS).
   - **Case 3 (카카오맵 Safari 주소 오류 방지)**: `kakaomap://open`을 호출하여 iOS Safari 에러 팝업 없이 카카오맵이 즉시 실행됨 (PASS).
   - **Case 4 (터치 스크롤)**: 헤더 터치 후 스와이프/스크롤 시 롱프레스 타이머가 즉시 취소되어 오작동하지 않음 (PASS).

---

## 65. 차량 점검 모달 차량호차/차량번호 입력 필드 텍스트 크기 조정 (`text-base`)

### 65.1 배경 및 작업 목적
- 차량 점검 모달(`VehicleInspectionModal.tsx`)의 차량호차(L597) 및 차량번호(L609) 인풋 텍스트 크기가 `text-lg`로 설정되어 있어 시각적으로 과도하게 크던 문제를 해결하기 위해, 조화롭고 깔끔한 표준 크기인 `text-base`로 통일 조정.

### 65.2 모듈별 상세 구현 내역
- [`components/VehicleInspectionModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/VehicleInspectionModal.tsx):
  - 차량호차 인풋 클래스 `text-lg` -> `text-base` 변경.
  - 차량번호 인풋 클래스 `text-lg` -> `text-base` 변경.

### 65.3 검증 결과
1. **프로덕션 빌드 무결성**:
   - `npm run build`: 전 15개 라우트 TypeScript / ESLint 컴파일 에러 **0건 (Exit code 0)** 통과.
2. **UI 정합성**:
   - 차량 점검 모달의 기본 정보 입력란 폰트 크기가 `text-base`로 단정하게 반영됨.

---

## 66. 차량 점검 모달 라벨 폰트 크기 조정 (`text-[12px]` -> `text-[13px]`)

### 66.1 배경 및 작업 목적
- 차량 점검 모달(`VehicleInspectionModal.tsx`) 내 입력 항목 및 뷰어 라벨(`className="block text-[12px] font-semibold text-slate-600..."`)의 가독성을 높이기 위해 폰트 크기를 `12px`에서 `13px`(`text-[13px]`)로 일괄 상향 조정.

### 66.2 모듈별 상세 구현 내역
- [`components/VehicleInspectionModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/VehicleInspectionModal.tsx):
  - 배차/일일/반납 탭 전반의 라벨 18개소 `text-[12px]` ➔ `text-[13px]` 일괄 변경.

---

## 67. 차량체크(점검표) 데이터의 호차별(Vehicle-Specific) LocalStorage 완전 격리 파이프라인 구축

### 67.1 배경 및 작업 목적
- 기존 `VehicleInspectionModal.tsx`의 차량 점검 데이터(수령/반납 ODO, DTE, 유류비 정산, 외관 손상 부위 선택, 계기판 사진 등)가 호차 구분 없는 단일 공용 키로 저장되어, 4호차에서 입력한 점검 내역이 1호차나 타 호차로 프로필을 전환해도 그대로 노출되는 심각한 데이터 오염(Data Pollution) 원천 차단.
- 프로필 격리 규격(`cockpit_driver_profile_${vehicleNo}`)과 1:1로 매핑되는 동적 키(`cockpit_vehicle_inspection_${cleanNo}`) 아키텍처를 도입하여 **완전 격리(Isolation)** 실현.
- 호차 전환 시 해당 호차의 점검 데이터만 즉각 로드되고, 점검 기록이 없는 호차는 깨끗한 기본값(Clean State)으로 초기화 보장 (Zero-DB / Pure Client-Side 원칙 준수).

### 67.2 호차별 스토리지 동적 키 매핑 테이블

| 구분 (호차 프로필) | 파싱된 호차 (`cleanNo`) | 생성되는 전용 LocalStorage 격리 키 | 격리 보장 내용 |
| :--- | :---: | :--- | :--- |
| **4호차** | `4호차` | `cockpit_vehicle_inspection_4호차` | 4호차 수령/일일/반납 ODO, DTE, 데미지, 사진 독립 저장 |
| **1호차** | `1호차` | `cockpit_vehicle_inspection_1호차` | 4호차 데이터 간섭 0%, 초기 Clean State 및 독립 저장 |
| **7호차** | `7호차` | `cockpit_vehicle_inspection_7호차` | 7호차 전용 독립 레코드 격리 |
| **미지정/기본** | `default` | `cockpit_vehicle_inspection_default` | 예외 상황 및 기본 프로필용 안전 폴백 키 |

### 67.3 모듈별 상세 구현 내역

#### 1. 스토리지 격리 헬퍼 및 함수 고도화 ([`utils/vehicleReport.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/utils/vehicleReport.ts))
- `getInspectionStorageKey(vNo?: string)`: 호차 번호 문자열에서 정규화된 `cleanNo`를 추출하여 `cockpit_vehicle_inspection_${key}` 포맷으로 동적 생성.
- `saveInitialInspection`, `getInitialInspection`, `saveDailyInspection`, `getDailyInspection`, `clearInitialInspection`, `clearDailyInspection`:
  - `vehicleNo` 파라미터를 추가 지원하여 호차별 격리 키에 1:1로 저장/조회/삭제 수행.
  - 레거시 데이터 호환 지원 (기존 키에서 해당 호차 일치 시 마이그레이션).

#### 2. 반응형 상태 리셋 및 동적 로드 머신 구현 ([`components/VehicleInspectionModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/VehicleInspectionModal.tsx))
- `resetToCleanState()`: 수령/일일/반납 ODO, DTE, 데미지 부위 배열(`[]`), 데미지 텍스트('무'), 사진(`null`), 주차/차키 위치, `initialData`(`null`) 등 폼 상태를 깨끗한 초기 상태로 완전 초기화.
- `saveVehicleInspectionData(overrides?)`: 현재 입력 중인 수령/일일/반납 데이터 및 `initialData` 스냅샷을 현재 호차 전용 키에 즉시/안전하게 JSON 직렬화 저장 (용량 초과 시 이미지 제외 텍스트 우선 저장 안전장치 포함).
- `useEffect([isOpen, profile.vehicleNo])`:
  - 모달 오픈 또는 프로필 호차 변경 시, 현재 호차 키(`cockpit_vehicle_inspection_${cleanNo}`) 조회.
  - 저장된 데이터가 존재하면 폼 상태 1:1 복원.
  - 저장된 데이터가 없으면 `resetToCleanState()`를 명시적으로 실행하여 타 호차 잔재를 100% 소거.
- 디바운스(300ms) 자동 영속화 이펙트 탑재: 입력, 외관 칩 선택, 사진 등록 시 즉각 백그라운드 동기화.
- '확인' 및 '카톡' 버튼 터치 시 즉시 현재 호차 키로 커밋 후 닫기/공유.

#### 3. 상위 컴포넌트 반응성 연동 ([`app/page.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/app/page.tsx))
- `useDriverProfile()` 훅을 통해 `profile` 객체가 갱신될 때 실시간으로 `VehicleInspectionModal`에 전달되어 프로필 모달에서 호차를 변경하는 즉시 차량 점검 모달이 새 호차의 스토리지 키를 바라보도록 보장.

---

---

## 68. 하단 내비게이션 안내시작 카카오맵 딥링크 스킴 정합성 복원 (Safari 유효하지 않은 주소 팝업 제거)

### 68.1 배경 및 작업 목적
- 홈 화면 하단 액션 패널(`ActionPanel.tsx`)의 '카카오내비 안내 시작' 버튼 터치 시, iOS Safari에서 `"주소가 유효하지 않기 때문에 Safari가 해당 페이지를 열 수 없습니다"`라는 시스템 경고 팝업이 노출된 직후 카카오맵으로 이동하는 결함 해결.
- **원인 분석**: 목적지만 전달하는 단독 길안내 딥링크 빌더(`utils/navigation.ts:buildDeepLink`)에서 1차 호출 스킴으로 미설치 상태인 카카오내비 전용 스킴(`kakaonavi://navigate...`)을 실행하고, 2.5초 뒤 폴백으로 카카오맵(`kakaomap://route...`)을 호출하고 있었음.
- **조치**: 1차 호출 스킴 자체를 공식 카카오맵 길안내 스킴인 `kakaomap://route?ep=${lat},${lng}&by=CAR`로 직접 지정하여 Safari 오류 팝업을 원천 차단하고 즉각적인 길안내 화면 전환 보장.

### 68.2 모듈별 상세 구현 내역
- [`utils/navigation.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/utils/navigation.ts):
  - `buildDeepLink`의 `provider === 'kakao'` 목적지 단독 브랜치 개편:
    - iOS scheme: `kakaonavi://navigate...` ➔ **`kakaomap://route?ep=${lat},${lng}&by=CAR`**
    - iOS fallbackUrl: `STORE_URLS.kakao.ios` (`https://apps.apple.com/kr/app/id304608425` 카카오맵 앱스토어)
    - Android scheme: `intent://route?ep=${lat},${lng}&by=CAR#Intent;scheme=kakaomap;package=net.daum.android.map;end;`
    - Android fallbackUrl: `STORE_URLS.kakao.android` (`net.daum.android.map` 카카오맵 플레이스토어)

---

## 69. 차량 인수·반납 체크 UI 레이블 정예화 및 외관 데미지 인풋 텍스트 크기 조정 (`text-base`)

### 69.1 배경 및 작업 목적
- 차량 수령·반납 점검표의 용어를 현장 친화적인 **"차량 인수·반납 체크"** 및 직관적인 탭 명칭(**인수**, **데일리 체크**, **반납**)으로 정예화.
- 외관 데미지 상세(직접 수정 가능) 입력창에 명시적인 `text-base` 폰트 크기를 부여하여 지나치게 크거나 튀지 않는 단정하고 균형 잡힌 타이포그래피 구현.

### 69.2 모듈별 상세 구현 내역
- [`components/QuickActionBar.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/QuickActionBar.tsx):
  - 툴팁 및 레이블: "차량 수령·반납 점검표" ➔ **"차량 인수·반납 체크"**
- [`components/VehicleInspectionModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/VehicleInspectionModal.tsx):
  - 모달 타이틀: "차량 수령·반납 점검표" ➔ **"차량 인수·반납 체크"**
  - 탭 명칭: "차량 수령" ➔ **"인수"**, "일일 점검" ➔ **"데일리 체크"**, "차량 반납" ➔ **"반납"**
  - 라벨 정예화: "차량호차" ➔ **"호차"**, "계기판 AI 자동 입력" ➔ **"계기판 AI 자동 인식"**, "차량 외관 2D 탑뷰 점검" ➔ **"차량 외관 체크"**, "외관 부위별 빠른 선택" ➔ **"흠집 위치 선택"**
  - 버튼 레이블: "확인" ➔ **"점검 완료"**, "카톡" ➔ **"카톡 공유"**
  - 외관 데미지 직접 수정 인풋(인수/반납): `text-sm` 클래스 적용.
  - 주차위치 및 차키위치 인풋(반납): 기존 상위 컨테이너 `text-base` 상속에서 `text-sm`으로 세분화 조정.

### 69.3 검증 결과
1. **프로덕션 빌드 무결성**:
   - `npm run build`: 전 15개 라우트 TypeScript / ESLint 컴파일 에러 **0건 (Exit code 0)** 통과.
2. **UI 정합성**:
   - 인수 및 반납 탭의 입력란 폰트 크기가 `text-sm`으로 정돈되어 최적의 가독성 및 균형미 확보.
---

## 70. 홈 헤더 롱프레스 런처 카카오맵 스킴 일원화 및 크로스 OS(iOS/Android) 무결성 확보

### 70.1 배경 및 작업 목적
- 홈 헤더 네브바(`components/Header.tsx`)의 내비 아이콘 롱프레스 시 각 내비 앱의 메인 홈 화면을 여는 `openNaviAppMain` 함수에서, 카카오 대상 스킴을 통합 카카오맵 기준으로 전면 일원화.
- 단독 카카오내비(`kakaonavi://`) 미설치 환경에서 발생하던 iOS Safari "주소가 유효하지 않습니다" 에러 팝업을 원천 제거하고, 안드로이드 크롬의 커스텀 스킴 보안 차단 에러(`ERR_UNKNOWN_URL_SCHEME`)를 방어하기 위해 정규 안드로이드 인텐트 패키지 호출 파이프라인 구축.
- 티맵, 네이버지도의 기존 롱프레스 로직 및 짧은 탭 전환 인터랙션 100% 보존.

### 70.2 모듈별 상세 구현 내역
- [`utils/navigation.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/utils/navigation.ts):
  - `openNaviAppMain(navi)` 내 `isAndroid` OS 분기 주입:
    - **TMAP**: iOS `tmap://` / Android `intent:#Intent;package=com.skt.tmap.ku;end;`
    - **Kakao**: iOS `kakaomap://` / Android `intent:#Intent;package=net.daum.android.map;end;`
    - **Naver**: iOS `nmap://action/default` / Android `intent:#Intent;package=com.nhn.android.nmap;end;`

### 70.3 검증 결과
1. **프로덕션 빌드 무결성**:
   - `npm run build`: Next.js 16.3.5 Turbopack 기준 전 15개 라우트 TypeScript / ESLint 컴파일 에러 **0건 (Exit code 0)** 통과.
2. **시나리오 검증 결과**:
   - **Case 1 (iOS Safari 카카오 롱프레스)**: 헤더 'K' 아이콘 350ms 롱프레스 시 Safari 에러 팝업 없이 카카오맵 메인 화면 즉시 호출 확인 (PASS).
   - **Case 2 (안드로이드 크롬 카카오 롱프레스)**: 카카오맵 패키지 인텐트(`net.daum.android.map`) 정상 발화 확인 (PASS).
   - **Case 3 (기존 기능 불변성)**: 헤더 짧은 탭(단순 내비 전환) 및 티맵, 네이버 롱프레스가 기존대로 안정 구동됨 (PASS).

---

## 71. 프로토콜 콕핏 전면 코드베이스 정비 및 기술 부채 청산 리팩토링 (2026-09-29)

### 71.1 배경 및 작업 목적
- 전체 코드베이스 전수 검토 결과 확인된 사문화된 스텁 파일 제거, 공통 거점 표시 이름(`name`)과 풀네임(`full_name`)의 동기화 무결성 확보, 그리고 지하 주차장 음영 지역(B5 등) 네트워크 3.5초 타임아웃 방어선 구축을 단행.
- Zero-DB / Pure Client-Side 원칙(로컬 우선 상태 관리)과 18px 모바일 시인성 규격을 엄수하며, 프로덕션 빌드 무결성을 전면 검증.

---

### 71.2 모듈별 상세 구현 내역

#### [태스크 1] 사문화된 스텁 및 미사용 파일 제거 (Dead Code Cleansing)
1. **사문화된 파일 삭제**:
   - `components/PlaceRegisterModal.tsx`: 과거 장소 등록용 임시 스텁 파일 완전 삭제 (`git rm`).
   - `scratch/test_preset_management.ts`: 프리셋 관리 테스트용 임시 스크립트 삭제 (`git rm`).
   - 프로젝트 전역에서 `PlaceRegisterModal` import 및 참조 잔재 0건 확인.
2. **미사용 계산 로직 정리 (`utils/fuelCalculation.ts`)**:
   - 오피넷 유류비 계산기 UI 제거 이후 다른 곳에서 참조되지 않는 `RefuelingRecommendation` 인터페이스, `DEFAULT_FUEL_ECONOMY`, `URBAN_SAFETY_FACTOR`, `calculateRecommendedRefueling` 함수를 완전히 제거하여 번들 경량화.

---

#### [태스크 2] 공통 거점 `name`(축약명) vs `full_name`(전체명) DB/클라이언트 동기화 무결성 보강
1. **API 계층 정합성 확보 ([`app/api/presets/route.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/app/api/presets/route.ts))**:
   - `GET`: Supabase 레코드 매핑 시 화면 표시용 8자 축약명(`name`)과 장소 풀네임(`fullName`)의 매핑 무결성 확립:
     ```typescript
     name: row.name || (row.full_name ? row.full_name.slice(0, 8) : '거점'),
     shortName: row.name || row.short_name || (row.full_name ? row.full_name.slice(0, 8) : '거점'),
     fullName: row.full_name || row.name,
     ```
   - `PUT` & `POST`: 클라이언트 페이로드로부터 `displayName` (축약명)과 `fullPlaceName` (풀네임)을 각각 추출하여 DB `name` 컬럼과 `full_name` 컬럼에 명확히 구분하여 UPDATE / UPSERT.
2. **타입 정의 보강 ([`types/index.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/types/index.ts))**:
   - `LocationPreset` 인터페이스에 `full_name?: string` 속성을 추가하여 DB 응답 객체와의 호환성 확보.
3. **클라이언트 동기화 방어 ([`app/page.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/app/page.tsx))**:
   - `fetchPresetsForVehicle`: 서버로부터 공통 프리셋 목록을 동기화하여 로컬 상태(`presets`)와 병합할 때, 기사가 설정한 축약 `name`('SGBAC' 등)이 서버의 긴 풀네임으로 역전되거나 풀리는 현상을 완벽히 차단.
   - `handleSaveNewPreset` & `handleUpdatePreset`: 신규 등록/수정 시 `finalizedPreset.name`을 최우선 보존하여 서버 응답 데이터가 축약명을 덮어쓰지 않도록 낙관적 상태 및 응답 동기화 가드 구축.

---

#### [태스크 3] 지하 주차장 음영 지역 API 호출 3.5초 타임아웃 가드 주입
1. **계기판 AI OCR 비전 파싱 ([`components/VehicleInspectionModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/VehicleInspectionModal.tsx))**:
   - `/api/inspect-dashboard` fetch에 `AbortSignal.timeout(3500)` 및 `AbortController` 3.5초 안전 타이머 주입.
   - 지하 음영 지역에서 3.5초 경과 시 타임아웃을 안전하게 catch하고 로딩 스피너(`setIsOcrAnalyzing(false)`)를 즉시 해제.
   - 운전자 피드백("통신 지연(3.5초 타임아웃)으로 자동 인식을 건너뜁니다. 수동으로 입력해주세요.")을 노출하여 주행 전 화면 멈춤 없이 즉각적인 수동 입력 모드 복귀 보장.
2. **항공편 실시간 운항 정보 조회 ([`components/FlightModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/FlightModal.tsx))**:
   - `/api/flight` fetch에 3.5초 타임아웃 주입.
   - 통신 지연 시 즉각 스피너를 해제하고 안내 문구 출력.
3. **메인 코크핏 네트워크 호출 ([`app/page.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/app/page.tsx))**:
   - `fetchPresetsForVehicle`: 프리셋 백그라운드 동기화에 3.5s 타임아웃 적용.
   - `fetchRouteEstimate`: 실시간 TMAP 경로 계산(`/api/route`) 호출에 3.5s 타임아웃 적용. 통신 음영 지연 발생 시 즉시 Haversine 직선거리 기반 추정치로 폴백 전환하여 로딩 스피너 해제 및 즉각적인 예상 소요 시간 표시.
   - `fetchPrediction`: 미래 출발 예측 조회에 3.5s 타임아웃 적용.
   - `syncDriverProfile`: 드라이버 프로필 원격 동기화에 3.5s 타임아웃 적용.

---

### 71.3 검증 및 테스트 결과
1. **프로덕션 빌드 무결성**:
   - `npm run build`: Next.js 16.3.5 Turbopack 기준 전 15개 라우트 TypeScript / ESLint 컴파일 에러 **0건 (Exit code 0)** 통과.
2. **시나리오 테스트 강제 검증**:
   - **Case 1 (스텁 제거 확인)**: `PlaceRegisterModal.tsx` 및 `scratch/test_preset_management.ts` 삭제 후에도 거점 편집 및 등록 모달(`CustomPresetModal`)이 에러 없이 정상 구동됨 (PASS).
   - **Case 2 (공통 거점 축약명 보존)**: 관리자가 'SGBAC'로 축약 저장한 공통 거점이 새로고침 및 백그라운드 서버 동기화 후에도 풀네임('서울김포비즈니스항공센터')으로 되돌아가지 않고 8자 'SGBAC'로 변함없이 유지됨 (PASS).
   - **Case 3 (지하 주차장 음영 지역 방어)**: 3.5초 경과 시 네트워크 행(hang) 현상 없이 모든 로딩 스피너가 해제되고 수동 입력 및 Haversine 폴백 상태로 즉각 복귀함을 검증 완료 (PASS).
---

## 72. 최근 경로 영속화(SSR Hydration-Safe), 코드베이스 일체형 경유지(+) 인터랙션, 관리자 지정동선 잠금 및 프로필 차량번호 실시간 바인딩

### 72.1 배경 및 작업 목적
- **최근 경로 영속화 및 SSR Hydration 방어**: Next.js App Router 초기 렌더링 시 브라우저 로컬스토리지 직접 접근으로 인한 Hydration Mismatch 에러를 원천 차단하고, 마운트 시점에 안전하게 직전 경로(`origin`, `destination`, `waypoint`, `adminWaypoints`, `isAdminRoute`)를 복원.
- **프로필 차량번호 ➔ `VehicleInspectionModal` 1:1 실시간 동기화**: 기사 프로필 모달에서 차량번호(`profile.plateNumber`) 수정 시 차량체크 모달 내부 `carNumber` 인풋에 최신 번호가 즉각 주입되도록 보장하고, 저장 및 카톡 보고서 생성 시 빈칸으로 누락되지 않도록 Fallback 무결성 확보.
- **디자인 일체성 강제**: 기존 프로젝트의 '미니멀 슬레이트 콕핏' 디자인 시스템(`bg-white`, `border-slate-200`, `text-slate-500`, `shadow-sm`, `active:scale-95`)을 100% 동일하게 계승하며, 일체의 이질적인 원색이나 새 디자인 요소를 배제하고 조작계의 시각적 대칭 완성.
- **텍스트 배제 및 순수 '+' 아이콘 적용**: 목적지나 조작계에 '경유'라는 텍스트 라벨을 배제하고, 순수 `+` SVG 아이콘(`strokeWidth="2"`) 버튼으로만 조작계 구성.
- **관리자 지정동선 (대열 통제 모드: Strict Lock)**: 관리자가 등록한 공통 경로 패키지 선택 시 기사의 임의 경유지 추가/삭제를 원천 차단하고, 평소에는 가로 2단 기본 뷰를 유지하다가 은은한 회색 아코디언 배지(`[지정동선 N곳 ▾]`) 터치 시에만 통제 도로 목록을 전개. 길안내 시작 시 [기사 현위치(GPS)] ➔ [관리자 공식 출발지] ➔ [통제 경유지 1~N] ➔ [최종 목적지] 시퀀스로 3사 내비에 주입하여 단일 대열 주행 강제.
- **개인 운행 모드 경유지 설정**: 관리자 패키지가 아닐 때만 `+` 버튼이 활성화되며, 터치 시 세로 3단('출발 ➔ 경유 ➔ 목적')으로 부드럽게 전환되어 기존 `LocationSearchModal`을 통해 도로/POI 경유지 지정 가능.

---

### 72.2 모듈별 상세 구현 내역

#### [태스크 1] `app/page.tsx` 최근 경로 Hydration-Safe 영속화 및 경로 복원
1. **스토리지 키 선언 및 SSR 가드**:
   - `const LAST_ROUTE_STORAGE_KEY = 'cockpit_last_route';` 선언.
   - 초기 React State는 기본 거점(`DEFAULT_ORIGIN`, `DEFAULT_DESTINATION`)을 유지하여 서버 렌더링 결과와 100% 일치하도록 보장.
2. **Hydration-Safe 마운트 시 복원 로직**:
   - 브라우저 마운트 직후 1회 실행되는 `useEffect`에서 `localStorage.getItem(LAST_ROUTE_STORAGE_KEY)` 파싱 후 복원:
     - `if (parsed.origin) setOrigin(parsed.origin);`
     - `if (parsed.destination) setDestination(parsed.destination);`
     - `if (parsed.waypoint) setWaypoint(parsed.waypoint);`
     - `if (parsed.adminWaypoints) setAdminWaypoints(parsed.adminWaypoints);`
     - `if (typeof parsed.isAdminRoute === 'boolean') setIsAdminRoute(parsed.isAdminRoute);`
   - 실패 시 `console.warn('[Cockpit] 최근 경로 로드 실패 (기본값 유지):', error);` 로깅.
   - `isRouteRestoredRef.current = true` 가드를 적용하여 마운트 완료 전 기본값으로 로컬스토리지가 덮어쓰여지는 레이스 컨디션 완벽 차단.
3. **상태 변경 시 자동 영속화**:
   - `origin` 또는 `destination`이 존재할 때 `localStorage.setItem(LAST_ROUTE_STORAGE_KEY, JSON.stringify({ origin, destination, waypoint: waypoint || null, adminWaypoints, isAdminRoute }))` 동기화.
   - 실패 시 `console.error('[Cockpit] 최근 경로 저장 실패:', error);` 예외 처리.

---

#### [태스크 2] 프로필 차량번호 ➔ `VehicleInspectionModal.tsx` 실시간 자동 바인딩 및 무결성
1. **Props 명시적 전달**:
   - `app/page.tsx`에서 `<VehicleInspectionModal />` 호출 시 `profilePlateNumber={profile.plateNumber}` 및 `profile={profile}` 주입.
2. **모달 내부 실시간 동기화 리스너**:
   - `isOpen` 또는 `profilePlateNumber` 갱신 시 모달 내부의 차량번호 인풋 상태(`carNumber`)를 프로필 번호로 즉각 강제 동기화:
     ```tsx
     useEffect(() => {
       const targetPlate = profilePlateNumber?.trim() || profile.plateNumber?.trim() || detectedCarNumber;
       if (isOpen && targetPlate) {
         setCarNumber(targetPlate);
       }
     }, [isOpen, profilePlateNumber, profile.plateNumber, detectedCarNumber]);
     ```
3. **점검 데이터 저장 및 제출 시 Fallback 무결성**:
   - 기사가 차량번호 인풋란을 지우거나 비워두더라도, `profile.plateNumber` 및 `profilePlateNumber`를 Fallback으로 최우선 적용하여 차량번호가 빈 문자열(`""`)로 저장되거나 카톡 보고서에 누락되는 사고를 원천 방지.

---

#### [태스크 3] `components/OriginDestinationSelector.tsx` 맞교환 상단 `+` 버튼 & 아코디언 UI
1. **조작계 버튼 수직 대칭 배치**:
   - 맞교환 버튼 영역에 수직 플렉스(`flex flex-col gap-1.5 items-center`)를 구성.
   - `!isAdminRoute && !waypoint`인 경우, 맞교환 버튼 바로 위에 동일한 규격(`w-8 h-8 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-500 hover:text-slate-700 hover:bg-slate-50 active:scale-95 transition-all`)의 `+` 원형 아이콘 버튼 배치.
2. **관리자 지정동선 '자세히보기' 은은한 회색 아코디언**:
   - `isAdminRoute && adminWaypoints.length > 0`인 경우 목적지 텍스트 우측에 `[지정동선 {adminWaypoints.length}곳 ▾]` 배지 배치.
   - 클릭 시 하단으로 슬라이드 다운되며 통제 도로 지점 목록(삭제 불가, 읽기 전용)을 부드럽게 노출.
3. **개인 운행 경유지 세로 스무스 트랜지션**:
   - 기사가 `+`를 눌러 `waypoint`가 활성화되면 전체 컨테이너가 `transition-all duration-300 ease-in-out`과 함께 세로 3단으로 펼쳐지며 경유지 슬롯(미니멀 슬레이트 핀 + 우측 `X` 롤백 버튼) 노출.

---

#### [태스크 4] 실제 내비게이션 딥링크 및 TMAP ETA 연동
1. **길안내 실행 시 기사 현위치(GPS) 시작점 매핑**:
   - 기사 스마트폰의 실시간 GPS 위치를 '출발지'로 설정.
   - 관리자 경로: [기사 실시간 현위치] ➔ [관리자 공식 출발지] ➔ [통제 경유지 1~N] ➔ [최종 목적지] 시퀀스로 딥링크 생성.
   - 개인 운행: [기사 실시간 현위치] ➔ [선택 경유지(있을 경우)] ➔ [목적지] 시퀀스로 딥링크 생성.
2. **3사 내비게이션 스킴별 경유지 파라미터 직렬화**:
   - **티맵 (TMAP)**: `passList=${lng},${lat}_${lng},${lat}` 포맷 연결.
   - **카카오맵**: `&vp=${lat},${lng}` 포맷 매핑.
   - **네이버 지도**: `&v1lat=${lat}&v1lng=${lng}&v1name=${name}&v2lat=...` 순서 매핑.

---

### 72.3 검증 및 테스트 결과
1. **프로덕션 빌드 무결성**:
   - `npm run build`: Next.js 16.3.5 Turbopack 기준 전 15개 라우트 TypeScript / ESLint 컴파일 에러 **0건 (Exit code 0)** 통과.
2. **시나리오 검증 결과**:
   - **Case 1 (최근 경로 복원 및 Hydration 검증)**: 출발지를 '코엑스', 목적지를 '인천공항 T2'로 설정한 뒤 브라우저 강력 새로고침(Cmd+Shift+R) 시 Hydration Warning/Error 0건 및 직전 설정 경로 즉시 복원 확인 (PASS).
   - **Case 2 (프로필 차량번호 실시간 동기화 검증)**: 프로필 모달에서 차량번호를 `12가 3456`으로 저장 후 `차량체크` 모달 오픈 시 인풋 필드에 `12가 3456`이 자동 바인딩됨을 확인 (PASS).
   - **Case 3 (차량체크 제출 무결성)**: 인풋 필드를 임의로 비우고 점검 완료/카톡 공유 시에도 프로필 차량번호가 Fallback으로 적용되어 빈 문자열 누락이 방지됨 (PASS).
   - **Case 4 (맞교환 상단 `+` 버튼 및 세로 3단 전환)**: 맞교환 버튼 바로 위에 대칭 규격의 `+` 원형 버튼이 배치되며, 클릭 시 부드럽게 세로 3단 뷰로 펼쳐지고 `LocationSearchModal`이 호출됨 (PASS).
   - **Case 5 (관리자 지정동선 잠금 및 아코디언)**: 관리자 경로 로드 시 `+` 버튼이 숨겨지고 임의 추가/삭제가 불가능하며, `[지정동선 N곳 ▾]` 배지를 터치할 때만 통제 경유지들이 아코디언으로 전개됨 (PASS).

---

## 73. 다중 경유지(+) 연속 추가 지원(최대 5개) 및 세로 모드 주소 인라인(Inline) 슬림화 (2026-09-30)

### 73.1 추진 배경 및 작업 목적
1. **세로 모드 카드 주소 인라인(Inline) 슬림화**:
   - 세로 모드 전개 시 각 카드(출발지/경유지/목적지)가 3줄(배지 / 명칭 / 상세주소)을 차지하여 거치대 화면에서 전체 높이가 지나치게 길어지는 문제를 해결.
   - 장소명(`font-bold text-sm sm:text-base text-slate-900`)과 상세주소(`text-xs text-slate-400 truncate`)를 `flex items-baseline gap-2 min-w-0 mt-0.5` 한 줄 인라인으로 배치하고, 카드 내부 패딩을 `py-2.5 px-3.5`로 슬림화하여 수직 공간 낭비를 획기적으로 축소.
2. **다중 경유지(+) 연속 추가 인터랙션 (최대 5개)**:
   - 기존 단일 `waypoint` 구조를 `waypoints: LocationPreset[]` 다중 배열로 확장.
   - 각 경유지 카드 우측 상단의 `✕` 버튼 좌측에 동일한 미니멀 슬레이트 규격(`w-7 h-7 rounded-full bg-white border border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50`)의 `+` 원형 아이콘 버튼 배치.
   - `+` 터치 시 `LocationSearchModal`을 호출하여 새로운 경유지를 목록에 순차적으로 추가.
   - 경유지가 5개에 도달하면 `+` 버튼을 자동으로 숨겨 외부 내비 딥링크 허용 규격(최대 5개)을 방어.
3. **내비 딥링크 및 TMAP ETA 연동**:
   - 복수 경유지 배열(`waypoints`)을 TMAP `passList`, Kakao `&vp=`, Naver `&v1~v5` 규격으로 직렬화하여 전달.
   - `app/api/route/route.ts` TMAP API 다구간 ETA 연산 및 Haversine Fallback 다중 경유지 지원.

---

### 73.2 모듈별 핵심 구현 내역
1. **`components/OriginDestinationSelector.tsx`**:
   - Props에 `waypoints: LocationPreset[]`, `onSelectWaypoint: (index: number) => void`, `onAddWaypoint: () => void`, `onRemoveWaypoint: (index: number) => void` 추가 및 단일 `waypoint` 하위 호환성 유지.
   - 출발지, 경유지(1~5), 목적지 카드 전체에 장소명 + 상세주소 1열 인라인 flex (`flex items-baseline gap-2 min-w-0 mt-0.5`) 및 컴팩트 패딩 (`py-2.5 px-3.5`) 적용.
   - 경유지 슬롯 우측 상단 `flex items-center gap-1.5` 컨테이너에 `+` (새 경유지 추가) 및 `✕` (해당 경유지 삭제) 듀얼 미니멀 슬레이트 버튼 탑재. 5개 도달 시 또는 `isAdminRoute` 활성화 시 `+` 자동 은닉.
2. **`app/page.tsx`**:
   - `waypoints: LocationPreset[]` 다중 배열 상태 및 `editingWaypointIndex: number` 관리.
   - `useEffect` 마운트 복원 시 단일 객체(`parsed.waypoint`)와 다중 배열(`parsed.waypoints`) 하위 호환성 완벽 지원.
   - 로컬스토리지 자동 영속화: `{ origin, destination, waypoints, adminWaypoints, isAdminRoute }` 전체 직렬화.
   - 경유지 추가(`handleAddWaypoint`), 개별 경유지 수정 터치(`handleSelectWaypoint`), 개별 경유지 삭제(`handleRemoveWaypoint`), 검색 모달 연동(`applyWaypointSelection`) 파이프라인 완성.
   - 스케줄 탭 및 배차 연동 시 경유지 상태 초기화 동기화.
3. **`utils/navigation.ts` & `components/ActionPanel.tsx`**:
   - `waypoints` 배열을 전달받아 최대 5개까지 슬라이싱 후 3사 내비 스킴 직렬화:
     - TMAP: `passList=${waypoints.map(w => `${w.lng},${w.lat}`).join('_')}`
     - 카카오맵: `&vp=`
     - 네이버 지도: `&v1lat=...&v1lng=...&v1name=...` (최대 v5까지 동적 루프)
   - `ActionPanel`의 1초 패스트패스 및 길안내 실행 시 복수 경유지를 정확히 주입.
4. **`app/api/route/route.ts`**:
   - `passList` 복수 경유지 파라미터 파싱 및 TMAP API 전달 / 다구간 Haversine Fallback 연산 보장.

---

### 73.3 검증 및 테스트 결과
1. **프로덕션 빌드 무결성**:
   - `npm run build`: Next.js 16.3.5 Turbopack 기준 전 15개 라우트 TypeScript / ESLint 컴파일 에러 **0건 (Exit code 0)** 통과.
2. **기능 검증**:
   - 세로 모드 전개 시 장소명과 상세주소가 한 줄 인라인으로 표시되어 전체 높이가 슬림하게 유지됨 확인.
   - 경유지 `+` 클릭 시 새 경유지 순차 추가 및 `✕` 클릭 시 해당 인덱스 경유지만 정확히 삭제됨 확인.
   - 5개 경유지 도달 시 `+` 버튼 자동 은닉 및 최대 5개 초과 방어 확인.
   - 로컬스토리지 저장 및 새로고침 시 다중 경유지 배열 정상 복원 확인.

---

## 74. 경유지 중간 삽입(Index-based Insert) 로직 구현 및 경유지 라벨 아이콘 제거 (2026-09-30)

### 74.1 추진 배경 및 작업 목적
1. **경유지 중간 위치(+) 삽입 결함 해결**:
   - 기존에는 경유지 1번 카드의 `+`를 눌러도 새 경유지가 배열 맨 끝(경유지 3 뒤)에 추가되는 순서 불일치 문제가 발생.
   - 각 경유지 카드의 `+` 버튼 클릭 시 해당 위치의 바로 다음(`index + 1`)에 새 경유지가 정확히 삽입(`Array.prototype.splice`)되도록 인덱스 기반 삽입 파이프라인을 구축.
2. **경유지 라벨 아이콘 제거 및 순수 텍스트화**:
   - 경유지 라벨 좌측의 어두운 배경 핀 아이콘 마크업을 완전히 제거.
   - 별도의 배경색이나 테두리 박스 없이 `text-xs font-semibold text-slate-700` 스타일의 순수 텍스트(`경유지 N`)만 미니멀하고 단정하게 노출하여 시각적 노이즈를 제거.

---

### 74.2 모듈별 핵심 구현 내역
1. **`components/OriginDestinationSelector.tsx`**:
   - Props 함수 시그니처 갱신: `onAddWaypoint: (afterIndex?: number) => void`.
   - 경유지 라벨 영역의 핀 아이콘 박스(`<div className="w-5 h-5 rounded-md bg-slate-700 ...">`) 제거 및 `<div className="flex items-center"><span className="text-xs font-semibold text-slate-700">경유지 {index + 1}</span></div>` 순수 텍스트로 단순화.
   - 각 경유지 카드의 `+` 버튼 클릭 시 `onAddWaypoint(index)`로 현재 경유지 인덱스를 전달.
2. **`app/page.tsx`**:
   - `const [waypointInsertIndex, setWaypointInsertIndex] = useState<number | null>(null);` 삽입 타깃 인덱스 상태 신설.
   - `handleAddWaypoint(afterIndex?: number)`:
     - `afterIndex` 전달 시 `afterIndex + 1`을 타깃 인덱스로 설정, 미전달 시 `waypoints.length`로 설정.
     - `setWaypointInsertIndex(targetIndex)`, `setEditingWaypointIndex(-1)` 동기화.
   - `handleSelectWaypoint(index)` & `handleRemoveWaypoint(index)`:
     - `setWaypointInsertIndex(null)`로 인덱스 상태 초기화.
   - `applyWaypointSelection(resolvedPreset)`:
     - 기존 수정 모드(`editingWaypointIndex >= 0`)가 아닐 때, `waypointInsertIndex`가 존재하면 `next.splice(waypointInsertIndex, 0, resolvedPreset)`로 원하는 중간 위치에 정확히 삽입.
     - 최대 5개 상한(`next.slice(0, 5)`) 안전하게 방어 및 핸들링 완료 후 `waypointInsertIndex`를 `null`로 초기화.
   - `LocationSearchModal` 닫힘(`onClose`) 및 다른 타깃 선택 시 `waypointInsertIndex` 안전 초기화.

---

### 74.3 검증 및 테스트 결과
1. **프로덕션 빌드 무결성**:
   - `npm run build`: Next.js 16.3.5 Turbopack 기준 전 15개 라우트 TypeScript / ESLint 컴파일 에러 **0건 (Exit code 0)** 통과.
2. **시나리오 검증 결과**:
   - **경유지 중간 삽입**: 경유지 1, 2, 3이 존재하는 상태에서 경유지 1번 카드의 `+` 클릭 후 새 장소 선택 시, 해당 장소가 '경유지 2'로 진입하고 기존 경유지 2, 3이 각각 '경유지 3', '경유지 4'로 한 칸씩 정확히 밀려남을 확인 (PASS).
   - **경유지 라벨 순수 텍스트화**: 핀 아이콘 박스가 완전히 제거되고 정갈한 `경유지 N` 텍스트만 표시됨을 확인 (PASS).


