# Protocol Cockpit (driver-eta-notifier) - 항공편 출구 미배정 시 접미사 중복('출구 배정 중출구') 버그 수정 완료 보고서

> **평가 일시**: 2026년 9월 22일  
> **대상 애플리케이션**: Protocol Cockpit (의전 드라이버 전용 스마트 관제 런처 v4.53 - 항공편 출구 미배정 시 '출구 배정 중' 텍스트에 접미사 '출구'가 중복 부착되는 '출구 배정 중출구' 버그 완전 해소 및 출구 정제 유틸 표준화)  
> **프로덕션 배포 URL**: [https://driver-eta-notifier.vercel.app](https://driver-eta-notifier.vercel.app)  
> **GitHub Repository**: [https://github.com/Junebooky/driver-eta-notifier.git](https://github.com/Junebooky/driver-eta-notifier.git) (`main` 브랜치)  

---

## 1. 핵심 과업 달성 현황

| 과업 항목 | 구현 상태 | 핵심 조치 및 엔지니어링 구현 세부 사항 |
| :--- | :---: | :--- |
| **1. 출구 접미사 중복 방지 포맷터 (`formatExitText`)** | ✅ 완료 | • `utils/flightMapping.ts`에 `formatExitText` 구현.<br>• 입력값에 이미 `'배정'` 키워드가 포함되어 있거나 끝자리가 `'출구'`인 경우 중복 접미사를 붙이지 않으며, 값이 없을 때 `'출구 배정 중'` 반환.<br>• 기존에 오염된 `'출구 배정 중출구'`가 인입되더라도 자체 치유하여 `'출구 배정 중'`으로 정상 환원. |
| **2. 순수 출구 코드 추출 유틸 (`cleanExitCode`)** | ✅ 완료 | • 입국 데이터 정제 시 `'배정'` 포함 텍스트는 빈 문자열(`''`)로 정규화하여 미배정 상태를 안전하게 식별.<br>• `app/api/flight/route.ts`의 `exitNumber` 매핑 시 `cleanExitCode`를 적용하여 잘못된 문자열 전파 차단. |
| **3. 입국 게이트 교차 검증 및 UI 안전화 (`FlightModal.tsx` & `route.ts`)** | ✅ 완료 | • `resolveArrivalCrossValidation` 및 `resolveArrivalGate` 전반에 `formatExitText` 및 `cleanExitCode`를 일관되게 적용.<br>• 입국장 안내 문구가 `제N여객터미널 1층 (입국 게이트 배정 중 / 현장 전광판 확인)` 등으로 깨끗하게 렌더링되도록 수정. |
| **4. 빌드 무결성** | ✅ 완료 | • `npm run build` TypeScript 컴파일 에러 **0건**, Turbopack 최적화 빌드 완료. |

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
