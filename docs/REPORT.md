# Protocol Cockpit (driver-eta-notifier) - 수하물 벨트(Baggage) 기반 출구/게이트 교차 보정 및 단기 지상주차장 구역 자동 매핑 완료 보고서

> **평가 일시**: 2026년 9월 22일  
> **대상 애플리케이션**: Protocol Cockpit (의전 드라이버 전용 스마트 관제 런처 v4.51 - 인천국제공항 T1/T2 수하물 벨트 번호 기준 입국 출구(A~F) 및 1층 외부 영접 게이트(외부 1~14번) 교차 검증·모순 자동 보정, 단기 지상주차장 최적 구역(P1/P2/T2 지상) 자동 산출 및 UI/단톡방 보고서 규격 탑재)  
> **프로덕션 배포 URL**: [https://driver-eta-notifier.vercel.app](https://driver-eta-notifier.vercel.app)  
> **GitHub Repository**: [https://github.com/Junebooky/driver-eta-notifier.git](https://github.com/Junebooky/driver-eta-notifier.git) (`main` 브랜치)  

---

## 1. 핵심 과업 달성 현황

| 과업 항목 | 구현 상태 | 핵심 조치 및 엔지니어링 구현 세부 사항 |
| :--- | :---: | :--- |
| **1. 수하물 벨트 기준 터미널 물리 매핑 및 모순 해결 (`resolveArrivalCrossValidation`)** | ✅ 완료 | • `utils/flightMapping.ts`에 `resolveArrivalCrossValidation` 및 `ArrivalGateResolution` 인터페이스 신설.<br>• **T1(제1여객터미널)**:<br>  - 수하물 1~10번(동편): A·B출구 / 외부 1~4번 게이트 / 추천 주차: **P1 단기 지상 (A·B구역)**<br>  - 수하물 11~15번(중앙): C·D출구 / 외부 5~10번 게이트 / 추천 주차: **P1·P2 단기 지상 (C·D구역)**<br>  - 수하물 16~23번(서편): E·F출구 / 외부 11~14번 게이트 / 추천 주차: **P2 단기 지상 (F·G구역)**<br>• **T2(제2여객터미널)**:<br>  - 수하물 1~10번(서편): A출구 / 외부 1~3번 게이트 / 추천 주차: **T2 서편 단기 지상**<br>  - 수하물 11~20번(동편): B출구 / 외부 4~5번 게이트 / 추천 주차: **T2 동편 단기 지상**<br>• **모순 자동 보정**: T1에서 수하물이 18번(서편)인데 출구가 B로 잘못 수신된 경우, 명백한 물리 벨트 위치를 우선하여 **'E출구'**로 자동 보정 및 외부 게이트를 **'외부 11~14번 게이트'**로 매핑. |
| **2. 티켓 카드 하단 UI 반영 (`FlightModal.tsx`)** | ✅ 완료 | • 입국 상세 위치 카드 내에 `영접 위치: [외부 N번 게이트]` 및 **`추천 주차: [P1/P2 단기 지상 (구역)]`**을 2단 구조로 정갈하게 배치.<br>• 파란색 박스 없이 텍스트 중심의 하이라이트(`text-[#1E60F3] font-bold`, `text-slate-800 font-bold`)로 시각적 개방감 유지. |
| **3. 카카오톡 단톡방 표준 보고서 규격 반영 (`formatFlightReport`)** | ✅ 완료 | • 단톡방 복사 텍스트에 `• 추천주차: ${recommendedParking}` 라인 자동 추가.<br>• 기사 및 영접 지원팀이 현장 도착 즉시 최적 단기 지상 주차 구역과 영접 도어를 동시 파악 가능. |
| **4. 백엔드 및 타입 시스템 연동 (`route.ts`, `types/index.ts`)** | ✅ 완료 | • `FlightInfo` 인터페이스에 `recommendedParking?: string;` 필드 추가.<br>• 백엔드 프록시(`app/api/flight/route.ts`)에서 수하물 번호와 출구 교차 검증을 즉각 수행하여 보정된 출구(`exitNumber`), 영접 게이트(`curbsideGate`), 추천 주차 구역(`recommendedParking`)을 캐시 및 프론트에 동시 제공. |
| **5. 빌드 무결성** | ✅ 완료 | • `npm run build` TypeScript 컴파일 에러 **0건**, Turbopack 최적화 빌드 완료. |

---

## 2. 주요 코드 변경 요약

### ① [`utils/flightMapping.ts`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/utils/flightMapping.ts)

```typescript
export interface ArrivalGateResolution {
  exit: string;              // 예: "E출구"
  curbsideGate: string;      // 예: "외부 11~14번 게이트"
  recommendedParking: string; // 예: "P2 단기 지상 (F·G구역)"
}

export function resolveArrivalCrossValidation(
  terminal: string,
  rawExit?: string | null,
  rawBaggage?: string | null
): ArrivalGateResolution {
  const cleanTerminal = (terminal || '').replace(/\s+/g, '');
  const cleanExit = (rawExit || '').trim().replace(/출구$/, '').trim().toUpperCase();
  const digits = (rawBaggage || '').replace(/[^0-9]/g, '');
  const beltNum = digits ? parseInt(digits, 10) : NaN;
  const hasBelt = !isNaN(beltNum) && beltNum > 0;

  const isT2 = cleanTerminal.includes('제2') || cleanTerminal.includes('T2');

  if (isT2) {
    if (hasBelt) {
      if (beltNum >= 1 && beltNum <= 10) {
        return {
          exit: 'A출구',
          curbsideGate: '외부 1~3번 게이트',
          recommendedParking: 'T2 서편 단기 지상',
        };
      }
      if (beltNum >= 11 && beltNum <= 20) {
        return {
          exit: 'B출구',
          curbsideGate: '외부 4~5번 게이트',
          recommendedParking: 'T2 동편 단기 지상',
        };
      }
    }
    // ... 출구 기반 폴백
  }

  // T1 (제1여객터미널)
  if (hasBelt) {
    if (beltNum >= 1 && beltNum <= 10) {
      const exit = cleanExit === 'A' ? 'A출구' : cleanExit === 'B' ? 'B출구' : (beltNum <= 5 ? 'A출구' : 'B출구');
      return {
        exit,
        curbsideGate: '외부 1~4번 게이트',
        recommendedParking: 'P1 단기 지상 (A·B구역)',
      };
    }
    if (beltNum >= 11 && beltNum <= 15) {
      const exit = cleanExit === 'D' ? 'D출구' : 'C출구';
      return {
        exit,
        curbsideGate: '외부 5~10번 게이트',
        recommendedParking: 'P1·P2 단기 지상 (C·D구역)',
      };
    }
    if (beltNum >= 16 && beltNum <= 23) {
      const exit = cleanExit === 'F' ? 'F출구' : 'E출구';
      return {
        exit,
        curbsideGate: '외부 11~14번 게이트',
        recommendedParking: 'P2 단기 지상 (F·G구역)',
      };
    }
  }
  // ...
}
```

### ② [`components/FlightModal.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/FlightModal.tsx)

```tsx
{/* 입국 시 1층 도로변 외부 영접 게이트 및 추천 단기 주차 구역 노출 */}
{flight.type === 'arrival' &&
  (() => {
    const resolution = resolveArrivalCrossValidation(
      flight.terminal,
      flight.exitNumber,
      flight.carousel
    );
    const curbside = flight.curbsideGate || resolution.curbsideGate;
    const parking = flight.recommendedParking || resolution.recommendedParking;

    return (
      <div className="space-y-1 mt-1.5">
        {curbside && curbside !== '외부 게이트 확인 필요' && (
          <p className="text-xs text-slate-500 font-medium">
            영접 위치: <span className="font-bold text-[#1E60F3]">{curbside}</span>
          </p>
        )}
        {parking && !parking.includes('확인 필요') && (
          <p className="text-xs text-slate-500 font-medium">
            추천 주차: <span className="font-bold text-slate-800">{parking}</span>
          </p>
        )}
      </div>
    );
  })()}
```

---

## 3. 검증 결과

1. **자동 교차 검증 테스트 결과**:
   - `T1 / 수하물 18번 / 오출구 B`: 출구 `E출구`로 자동 보정 ➔ `외부 11~14번 게이트` ➔ `P2 단기 지상 (F·G구역)` 정상 산출.
   - `T1 / 수하물 3번`: `A출구` ➔ `외부 1~4번 게이트` ➔ `P1 단기 지상 (A·B구역)` 정상 산출.
   - `T1 / 수하물 12번`: `C출구` ➔ `외부 5~10번 게이트` ➔ `P1·P2 단기 지상 (C·D구역)` 정상 산출.
   - `T2 / 수하물 5번`: `A출구` ➔ `외부 1~3번 게이트` ➔ `T2 서편 단기 지상` 정상 산출.
   - `T2 / 수하물 15번`: `B출구` ➔ `외부 4~5번 게이트` ➔ `T2 동편 단기 지상` 정상 산출.
2. **카카오톡 보고서 출력 예시**:
   ```
   [1호차 김의전]
   • 담당승객: VIP 고객님
   • 항공편명: LH712 (프랑크푸르트 ➔ ICN)
   • 예상착륙: 09:34 (조기 도착 -21분)
   • 입국게이트: 제1여객터미널 1층 (E출구 / 수하물 18번)
   • 영접위치: 외부 11~14번 게이트
   • 추천주차: P2 단기 지상 (F·G구역)
   ```
3. **빌드 검증**:
   - `npm run build` 결과 11/11 라우트 전체 컴파일 성공 (TypeScript 에러 0건).
