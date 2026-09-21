# Protocol Cockpit (driver-eta-notifier) - 인천공항 항공편 관제 고도화: 백엔드 익일 룩어헤드 및 브랜드 일체화·보딩패스 UI 정제 완료 보고서

> **평가 일시**: 2026년 9월 21일  
> **대상 애플리케이션**: Protocol Cockpit (의전 드라이버 전용 스마트 관제 런처 v4.42 - 과거 만료 항공편 자동 필터링 및 익일(+1일) 자동 룩어헤드 파이프라인, 보딩패스 스케줄-예상 시각 '타임 브릿지(Time Bridge)' 연결 인터랙션, 잡색 전면 제거 및 브랜드 코발트 블루 일체화, [내일 운항] 배지, 입국장 탑승구 문구 삭제 및 의전 거점 단독 강조, 직관적 Empty State 카피)  
> **프로덕션 배포 URL**: [https://driver-eta-notifier.vercel.app](https://driver-eta-notifier.vercel.app)  
> **GitHub Repository**: [https://github.com/Junebooky/driver-eta-notifier.git](https://github.com/Junebooky/driver-eta-notifier.git) (`main` 브랜치)  

---

## 1. 핵심 과업 달성 현황

| 과업 항목 | 구현 상태 | 핵심 조치 및 엔지니어링 구현 세부 사항 |
| :--- | :---: | :--- |
| **1. 백엔드 스마트 타임 윈도우 & 익일(+1일) 자동 룩어헤드 (`app/api/flight/route.ts`, `utils/flightMapping.ts`)** | ✅ 완료 | • **만료 운항(Stale Flight) 판정**: 현재 시각 기준 **2시간 이상 과거**에 도착/출발이 완료된 당일 비행편은 '종료된 과거 운항'으로 판정하여 바인딩 제외.<br>• **익일(+1일) 자동 룩어헤드 파이프라인**: 당일 잔여 운항이 없는 야간 시간대 조회 시, 내일(`YYYYMMDD + 1일`) 스케줄을 자동으로 탐색하여 `isTomorrow: true`, `flightDate: "YYYY-MM-DD"` 메타데이터와 함께 즉시 반환.<br>• **KST-UTC 무손실 파싱**: Vercel 서버리스 환경(UTC+0)에서도 KST(UTC+9) 시각 왜곡이 발생하지 않도록 `Date.UTC(y, m, d, h - 9, min)` 정밀 변환 적용. |
| **2. 브랜드 컬러 일체화 & 지연 시간 '타임 브릿지' 구현 (`components/FlightModal.tsx`)** | ✅ 완료 | • **오프브랜드 잡색 제거**: 연하늘색(`bg-blue-50`) 및 황갈색 지연 배지(`bg-amber-100`) 완전 삭제. 항공사명은 단정한 서브헤더(`text-sm font-semibold text-slate-500`)로 편명 상단에 배치.<br>• **스케줄-예상 시각 '타임 브릿지'**: [스케줄 예정 시각] ➔ [예상 착륙(출발) 시각] 사이를 가로지르는 가이드 라인과 우측 화살표(`➔`) 구축. 중앙에 지연(`+N분 지연`, rose), 조기(`-N분 조기`, emerald), 정시(`정시 운항`, slate) 모던 필 배지 탑재.<br>• 예상 시각 숫자는 브랜드 코발트 블루(`text-[#1E60F3] font-black text-lg`)로 강조.<br>• 내일 비행편의 경우 보딩패스 상단에 **`[내일 운항]` (`bg-blue-50 text-[#1E60F3] border border-blue-200`)** 배지 표출. |
| **3. '탑승구(Gate)' 용어 오류 제거 및 입국 거점 표기 단순화** | ✅ 완료 | • 입국 픽업 화면에서 일반구역 대기 의전 기사에게 불필요한 `탑승구(Gate): 268번 게이트` 라인을 완전히 제거.<br>• 입국 시 영접 거점인 **`제1(2)여객터미널 1층 ({출구}출구 / 수하물 {수취대}번)`** 위치 정보만 여백을 주어 볼드하게 단독 강조. |
| **4. 조회 결과 없음(Empty State) 화면 카피 간결화** | ✅ 완료 | • 장황한 안내 텍스트를 제거하고 직관적인 카피로 대체:<br>  - 메인 타이틀: `운항 정보를 찾을 수 없습니다` (`text-base font-bold text-slate-800 mt-3`)<br>  - 서브 가이드: `편명 또는 [입국/출국] 탭 설정을 확인해 주세요.` (`text-xs text-slate-400 mt-1`) |
| **5. 빌드 무결성** | ✅ 완료 | • `npm run build` TypeScript 컴파일 에러 **0건**, Turbopack 최적화 빌드 완료. |

---

## 2. 주요 코드 변경 요약

### 1) [`app/api/flight/route.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/app/api/flight/route.ts) - 만료 비행편 판정 및 익일 룩어헤드
```ts
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

function isStaleFlight(item: any, nowMs: number): boolean {
  const dtStr = item.estimatedDateTime || item.scheduleDateTime;
  const itemDate = parseFlightDateTime(dtStr);
  if (!itemDate) return false;

  const diffFromNow = nowMs - itemDate.getTime();
  const remark = (item.remark || '').trim();
  const isCompletedRemark = ['도착', '출발', '결항', '탑승마감'].some((r) => remark.includes(r));

  return diffFromNow >= TWO_HOURS_MS && (isCompletedRemark || diffFromNow >= 3.5 * 60 * 60 * 1000);
}
```

### 2) [`components/FlightModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/FlightModal.tsx) - 타임 브릿지 및 UI 정제
- **항공사명 서브헤더 + `[내일 운항]` 뱃지**:
  - `isTomorrow && <span className="bg-blue-50 text-[#1E60F3] border border-blue-200 font-bold px-2 py-0.5 rounded-md text-[11px]">내일 운항</span>`
- **타임 브릿지(Time Bridge)**:
  - 좌측 [스케줄 예정 시각] ➔ 중앙 [편차 뱃지 + 연결 화살표] ➔ 우측 [예상 시각(코발트 블루 텍스트)]
- **입국 거점 단독 표출**:
  - 탑승구 문구 삭제, `{flight.arrivalLocationText}` 단독 카드 강조.

---

## 3. 엔드투엔드(E2E) 실시간 쿼리 검증 결과

1. **KE012 (입국 / 주간 도착편 야간 조회 시뮬레이션)**:
   - 당일 05:15 도착 완료편(17시간 전) 자동 만료 처리.
   - 내일(`2026-09-22`) 스케줄로 자동 룩어헤드 연계 성공:
     - `isTomorrow`: **`true`**
     - `flightDate`: **`"2026-09-22"`**
     - `scheduleTimeFormatted`: **`"04:40"`**
     - `estimatedTimeFormatted`: **`"04:41"`**
     - `arrivalLocationText`: **`"제2여객터미널 1층 (B출구 / 수하물 11번)"`**
2. **OZ741 (출국 / 아시아나항공 방콕행)**:
   - 당일 20:01 출발 완료편(2.4시간 전) 만료 판정 후 내일 19:35 스케줄로 룩어헤드 성공:
     - `isTomorrow`: **`true`**
     - `flightDate`: **`"2026-09-22"`**
     - `terminal`: **`"제1여객터미널"`**
     - `departureLocationText`: **`"제1여객터미널 3층 (카운터 G17-J34 / 7~8번 도어 앞)"`**
3. **Empty State 검증 (`XX999`)**:
   - `운항 정보를 찾을 수 없습니다` 및 `편명 또는 [입국/출국] 탭 설정을 확인해 주세요.` 표출 확인.
4. **빌드 검증**:
   - `npm run build` 결과 11/11 정적/동적 라우트 컴파일 100% 성공.
