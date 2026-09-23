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

