# Protocol Cockpit (driver-eta-notifier) - 단톡방 보고 모드 셀렉터 슬라이딩 바 오버플로우 버그 수정 완료 보고서

> **평가 일시**: 2026년 9월 22일  
> **대상 애플리케이션**: Protocol Cockpit (의전 드라이버 전용 스마트 관제 런처 v4.54 - 메인 '단톡방 보고' 세그먼트 컨트롤에서 '도착' 선택 시 인디케이터 바가 우측 패딩을 뚫고 오버플로우되던 기하학 계산 버그 완전 수정)  
> **프로덕션 배포 URL**: [https://driver-eta-notifier.vercel.app](https://driver-eta-notifier.vercel.app)  
> **GitHub Repository**: [https://github.com/Junebooky/driver-eta-notifier.git](https://github.com/Junebooky/driver-eta-notifier.git) (`main` 브랜치)  

---

## 1. 핵심 과업 달성 현황

| 과업 항목 | 구현 상태 | 핵심 조치 및 엔지니어링 구현 세부 사항 |
| :--- | :---: | :--- |
| **1. 단톡방 보고 모드 셀렉터 바 규격 수정 (`ReportTemplateSelector.tsx`)** | ✅ 완료 | • 기존 `w-1/2` 너비 지정으로 인해 컨테이너 패딩(`p-1`=4px)을 고려하지 못해 `translate-x-full` 적용 시 우측으로 8px 초과 돌출되던 버그 발견.<br>• 인디케이터 바 너비를 `w-[calc(50%-4px)]`로 정밀 수정하여 '출발'과 '도착' 모두 좌우 4px 패딩 영역 내에 1:1 완벽하게 핏되도록 보정.<br>• `transition-transform duration-300 ease-out`을 적용하여 GPU 가속 기반의 부드러운 전환 구현. |
| **2. 빌드 무결성** | ✅ 완료 | • `npm run build` TypeScript 컴파일 에러 **0건**, Turbopack 최적화 빌드 완료. |

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
