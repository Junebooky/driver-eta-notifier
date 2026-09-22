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

- `npm run build` 결과 11/11 라우트 전체 컴파일 성공 (TypeScript 에러 0건).
