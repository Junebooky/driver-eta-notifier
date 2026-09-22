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
