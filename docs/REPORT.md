# Protocol Cockpit (driver-eta-notifier) - 스케줄 탭(Schedule Tab) UI 구현 및 페라리 의전 4일치 원본 배차표 연동 완료 보고서

> **평가 일시**: 2026년 9월 22일  
> **대상 애플리케이션**: Protocol Cockpit (의전 드라이버 전용 스마트 관제 런처 v4.60 - 상단 슬라이딩 세그먼트 탭 [운행] \| [스케줄], 엠티 스테이트 3D 젬 비주얼, 2단 플로팅 액션 도크, 기사 프로필 가드레일, 2행 인라인 주소 카드 및 페라리 VIP 의전 4일치 원본 배차표 연동)  
> **프로덕션 배포 URL**: [https://driver-eta-notifier.vercel.app](https://driver-eta-notifier.vercel.app)  
> **GitHub Repository**: [https://github.com/Junebooky/driver-eta-notifier.git](https://github.com/Junebooky/driver-eta-notifier.git) (`main` 브랜치)  

---

## 1. 핵심 과업 달성 현황

| 과업 항목 | 구현 상태 | 핵심 조치 및 엔지니어링 구현 세부 사항 |
| :--- | :---: | :--- |
| **1. 상단 슬라이딩 세그먼트 탭 (`app/page.tsx`)** | ✅ 완료 | • 기존 하단 도크와의 충돌 방지를 위해 상단 기사 프로필 헤더 바로 아래에 `[ 운행 ] \| [ 스케줄 ]` 슬라이딩 탭 배치.<br>• `w-[calc(50%-4px)]` 정밀 규격 적용으로 오버플로우 없는 1:1 완벽 정렬 및 GPU 가속 전환 애니메이션 적용. |
| **2. 엠티 스테이트 UI (`ScheduleTab.tsx`)** | ✅ 완료 | • 레퍼런스 시안의 만화풍 이목구비를 완전 배제하고 라벤더-스카이블루-민트 그라데이션의 고급 입체 3D 젬 스타 심볼 렌더링.<br>• 상단 캡슐형 `[📷 이미지 업로드]` 버튼 + 하단 라운드 인풋 바 및 솔리드 코발트 블루 전송 버튼 2단 플로팅 액션 도크 구축.<br>• 기사 프로필 미등록 시 하단 도크 비활성화 및 상단 설정 안내 배너 가드레일 적용.<br>• 엠티 스테이트 내 '페라리 4일치 원본 배차표 불러오기' 샘플 버튼 연동. |
| **3. 2행 인라인 주소 카드 (`ScheduleCard.tsx`)** | ✅ 완료 | • 1행(출발 뱃지 + 거점명 + 도로명 주소 인라인) / 2행(도착 뱃지 + 거점명 + 도로명 주소 인라인) 수직 배치 및 좌측 커넥터 라인 구축.<br>• 원본 기재 단일 시간 뱃지(`dropoff_time: null`) 표기.<br>• 카드 우측 하단 (1) 화이트 원형 출발 시간 예측 휠 피커 버튼(w-11 h-11) 및 (2) 솔리드 블루 원형 내비 실행 버튼(w-11 h-11) 듀얼 플로팅 액션 보존. |
| **4. SSOT 준수 페라리 4일치 배차표 (`ferrariSchedules.ts`)** | ✅ 완료 | • 윤태준 드라이버 (4호차 / 142호 7811) 실제 4일치 동선(인천공항 T1, 조선팰리스 강남, 인제스피디움 호텔, 인제스피디움 트랙)을 Supabase `cockpit_presets` 공인 명칭/위경도와 100% 동일하게 매핑. |
| **5. 빌드 무결성** | ✅ 완료 | • `npm run build` TypeScript 컴파일 에러 **0건**, Turbopack 최적화 빌드 완료. |

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
