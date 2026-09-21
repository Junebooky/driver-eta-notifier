# Protocol Cockpit (driver-eta-notifier) - 항공편 모달 리얼 보딩패스 티켓 리디자인 및 아시아나 터미널 매핑 긴급 교정 완료 보고서

> **평가 일시**: 2026년 9월 21일  
> **대상 애플리케이션**: Protocol Cockpit (의전 드라이버 전용 스마트 관제 런처 v4.41 - 인천국제공항공사 실시간 항공편 모달 실물 보딩패스 티켓 일체화, 아시아나항공 T1 터미널 오매핑 긴급 버그 교정, 코발트 스쿼클 헤더 및 슬라이딩 필 탭 탑재, 홈 주유소/항공편 쌍둥이 퀵 액션 버튼 동기화)  
> **프로덕션 배포 URL**: [https://driver-eta-notifier.vercel.app](https://driver-eta-notifier.vercel.app)  
> **GitHub Repository**: [https://github.com/Junebooky/driver-eta-notifier.git](https://github.com/Junebooky/driver-eta-notifier.git) (`main` 브랜치)  

---

## 1. 핵심 과업 달성 현황

| 과업 항목 | 구현 상태 | 핵심 조치 및 엔지니어링 구현 세부 사항 |
| :--- | :---: | :--- |
| **1. 아시아나항공(OZ) 터미널 매핑 긴급 교정 (`utils/flightMapping.ts`, `app/api/flight/route.ts`)** | ✅ 완료 | • **API 오응답 원천 차단**: 공항공사 API에서 아시아나항공(`OZ`) 운항 정보 조회 시 `terminalid: P03`이 비정상 반환되던 문제를 해결.<br>• IATA 코드가 `OZ`이거나 `P01/P02`인 경우 무조건 **'제1여객터미널' (`isT2: false`)**로 강제 바인딩.<br>• `OZ741` 실시간 쿼리 검증: `제1여객터미널 3층 (카운터 G17-J40 / 7~8번 도어 앞)` 및 T1 출국장 좌표(`custom_flight_icn_t1_dep`, lat 37.4495) 정상 매핑 완료. |
| **2. 모달 헤더 및 슬라이딩 세그먼트 탭 UI 정제 (`components/FlightModal.tsx`)** | ✅ 완료 | • **헤더 간결화**: 연하늘색 아이콘 대신 브랜드 솔리드 코발트 블루 스쿼클(`w-10 h-10 rounded-2xl bg-[#1E60F3] text-white`) 탑재, 부제목을 걷어내고 메인 타이틀 `인천공항 실시간 운항 관제`만 볼드 표출.<br>• **2글자 세그먼트 탭 (`[입국]` / `[출국]`)**: 단톡방 보고 섹션과 동일한 부드러운 좌우 슬라이딩 필 애니메이션(`transition-transform duration-300 ease-out`, `translate-x-0` ↔ `translate-x-full`) 적용. |
| **3. 리얼 보딩패스(Boarding Pass) 티켓 일체화** | ✅ 완료 | • **군더더기 요소 제거**: 복잡도를 유발하던 빠른 조회 칩 및 담당승객 프로필 표출 행 화면 제거 (백그라운드 단톡방 보고서 복사 로직은 100% 보존).<br>• **실물 항공권 컴포넌트 통합**: 상단 비행정보 카드와 하단 하차도어 카드를 단 하나의 보딩패스로 통합.<br>  - **티켓 상단**: 항공사 뱃지 + 편명 + 운항 상태 캡슐, 출발 ➔ 도착 노선 및 비행기 패스, 스케줄 vs 예상 시각 비교 그리드.<br>  - **티켓 중앙 절취선**: 양 끝 반원형 티켓 홈(Notches, `-ml-3 w-6 h-6 rounded-r-full bg-slate-50` / `-mr-3 w-6 h-6 rounded-l-full bg-slate-50`) 및 점선 절취선(`border-b-2 border-dashed border-slate-200`) 완벽 구현.<br>  - **티켓 하단 스텁**: 출국 시 `{터미널} 3층 ({카운터} / {도어}번 도어 앞)`, 입국 시 `{터미널} 1층 ({출구} / 수하물 {수취대}번)` 선명한 볼드 타이포그래피 강조. |
| **4. 하단 액션 버튼 재정의** | ✅ 완료 | • 기존 버튼 대신 **`[확인]` 버튼(`bg-[#1E60F3] text-white font-bold rounded-2xl h-12 flex-1`)**을 배치하여 터치 시 즉시 모달 닫힘 바인딩.<br>• 우측 노란색 **`[카톡]` 버튼**은 단톡방 표준 보고서 클립보드 자동 복사 + `kakaotalk://` 딥링크 호출을 즉각 실행하도록 유지. |
| **5. 메인 홈 주유소 버튼 비주얼 동기화 (`components/PresetButtons.tsx`)** | ✅ 완료 | • '거점 관리' 좌측의 **주유소(`Fuel`) 버튼**을 항공편 버튼과 완벽히 동일한 화이트 카드 규격(`w-10 h-10 rounded-2xl bg-white border border-slate-200/80 shadow-2xs text-slate-700 hover:bg-[#1E60F3] hover:text-white hover:border-[#1E60F3] active:scale-95`)으로 통일하여 완벽한 쌍둥이 인터랙션 구축. |
| **6. 빌드 무결성** | ✅ 완료 | • `npm run build` TypeScript 컴파일 에러 **0건**, Next.js 16.3.5 Turbopack 최적화 빌드 완료. |

---

## 2. 주요 구현 코드 변경 요약

### 1) [`utils/flightMapping.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/utils/flightMapping.ts) - 터미널 판별 우선순위 강제
```ts
export function resolveTerminal(terminalId?: string | null, flightId?: string): { terminal: string; isT2: boolean } {
  const prefix = (flightId || '').slice(0, 2).toUpperCase();
  const tId = (terminalId || '').toUpperCase();

  // Rule 1: Asiana Airlines (OZ) or P01/P02 is strictly Terminal 1
  if (prefix === 'OZ' || tId === 'P01' || tId === 'P02') {
    return { terminal: '제1여객터미널', isT2: false };
  }

  // Rule 2: T2 airlines or explicitly P03
  const t2Airlines = ['KE', 'DL', 'AF', 'KL', 'AM', 'GA', 'ME', 'RO', 'SV', 'UX', 'VN', 'MF', 'LJ'];
  if (t2Airlines.includes(prefix) || tId === 'P03') {
    return { terminal: '제2여객터미널', isT2: true };
  }

  return { terminal: '제1여객터미널', isT2: false };
}
```

### 2) [`components/FlightModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/FlightModal.tsx) - 보딩패스 티켓 일체화 & 슬라이딩 탭
- 상단 헤더: `Plane` 코발트 스쿼클 아이콘 + 간결한 타이틀.
- 슬라이딩 필: `w-[calc(50%-4px)] h-[calc(100%-8px)] transition-transform duration-300 ease-out`.
- 실물 보딩패스: 상단 비행정보 + 중앙 반원형 노치 및 대시 절취선 + 하단 VIP 의전 하차 도어/게이트 스텁.
- 액션 바: `[확인]` (모달 닫힘) + `[카톡]` (클립보드 복사 + 카카오톡 실행).

### 3) [`components/PresetButtons.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/PresetButtons.tsx) - 항공편/주유소 쌍둥이 버튼 규격
- 항공편(`Plane`) 버튼 & 주유소(`Fuel`) 버튼 모두 `w-10 h-10 rounded-2xl bg-white border border-slate-200/80 shadow-2xs text-slate-700 hover:bg-[#1E60F3] hover:text-white hover:border-[#1E60F3] active:scale-95` 적용.

---

## 3. 엔드투엔드(E2E) 검증 결과

1. **OZ741 (아시아나항공 방콕행 출국) 실제 조회 검증**:
   - `terminal`: **`제1여객터미널`** (기존 제2여객터미널 오표기 결함 완벽 해결)
   - `terminalId`: **`P01`**
   - `departureLocationText`: **`제1여객터미널 3층 (카운터 G17-J40 / 7~8번 도어 앞)`**
   - `targetPreset`: **`custom_flight_icn_t1_dep`** (위도 37.4495, 경도 126.4512)
   - `statusText`: **`20:01 (지연 시간 +26분)`**
2. **KE012 (대한항공 로스앤젤레스발 입국) 실제 조회 검증**:
   - `terminal`: **`제2여객터미널`**
   - `arrivalLocationText`: **`제2여객터미널 1층 (B출구 / 수하물 13번)`**
   - `targetPreset`: **`custom_flight_icn_t2_arr`** (위도 37.4691, 경도 126.4344)
3. **빌드 검증**:
   - `npm run build` 결과 11/11 정적/동적 라우트 전체 컴파일 성공 (TypeScript 에러 0건).
