# Protocol Cockpit (driver-eta-notifier) - 담당 승객명 빈 값 저장 허용 및 단톡방 조건부 행 출력 완료 보고서

> **평가 일시**: 2026년 9월 21일  
> **대상 애플리케이션**: Protocol Cockpit (의전 드라이버 전용 스마트 관제 런처 v4.6 - 담당 승객명 공백 저장 허용, 단독 이동 시 승객 행 조건부 생략 & 실시간 보고 템플릿 연동)  
> **프로덕션 배포 URL**: [https://driver-eta-notifier.vercel.app](https://driver-eta-notifier.vercel.app)  
> **GitHub Repository**: [https://github.com/Junebooky/driver-eta-notifier.git](https://github.com/Junebooky/driver-eta-notifier.git) (main 브랜치)  

---

## 1. 실무 핵심 과업 달성도

| 과업 항목 | 구현 상태 | 핵심 조치 및 동작 세부 사항 |
| :--- | :---: | :--- |
| **1. 담당 승객명 빈 값 저장 허용** | ✅ 완료 | 기존의 Falsy 체크(`||`)로 인해 빈 문자열(`""`) 저장 시 기본값('SOFYAN 외 1명')으로 강제 회귀하던 문제를 전면 해결.<br>• `ProfileModal.tsx`: `passengerName !== undefined ? passengerName.trim() : ''`로 온전히 빈 문자열 유지 저장.<br>• placeholder를 `예: SOFYAN 외 1명 (미입력 시 생략)`으로 직관적 안내.<br>• `useDriverProfile.ts` 및 `app/api/driver/route.ts`: nullish 병합 및 `!== undefined` 체크로 `localStorage` 및 백엔드 동기화 시 빈 문자열 정상 보존. |
| **2. 단톡방 보고 텍스트 조건부 행 출력** | ✅ 완료 | `utils/reportGenerator.ts` 및 `utils/kakao.ts`에서 승객명 공백 여부(`Boolean(passengerName?.trim())`)를 판별.<br>• **승객명 존재 시**: `• 담당승객: SOFYAN 외 1명` 포함 5행 출력.<br>• **승객명 미입력 시(단독 이동/공차 회송)**: `• 담당승객` 행을 완전히 생략하고 출발지/목적지/ETA만 4행으로 깔끔하게 출력. |
| **3. 미리보기 및 클립보드 복사 연동** | ✅ 완료 | `ReportTemplateSelector.tsx`의 실시간 미리보기 박스 및 `ActionPanel.tsx`의 원터치 내비 시작 / 카카오톡 공유 시 복사되는 문자열 모두 동일한 조건부 개행 로직에 따라 완벽히 일치하여 작동함 확인. |
| **4. 빌드 무결성 검증 및 배포** | ✅ 완료 | `npm run build` 수행 결과 TypeScript 컴파일 에러 0건 확인 (Turbopack 빌드 성공 in 377ms). `main` 브랜치에 커밋(`fix: allow empty passenger name in profile and conditionally omit passenger line in reports`) 및 원격 푸시 완료. |

---

## 2. 세부 엔지니어링 구현 내역

### 1) 담당 승객명 빈 값 저장 허용 (`ProfileModal.tsx`, `useDriverProfile.ts`, `app/api/driver/route.ts`)
- **버그 원인**:
  - `ProfileModal.tsx`의 `handleSubmit`에서 `passengerName.trim() || 'SOFYAN 외 1명'`으로 작성되어 있어, 승객명을 지우고 저장하면 빈 문자열 `""`이 Falsy로 평가되어 무조건 기존 기본값으로 롤백되는 결함이 존재함.
- **개선 및 교정**:
  - **`ProfileModal.tsx`**:
    * 상태 초기화: `useState(profile.passengerName ?? '')`
    * 저장 핸들러: `passengerName: passengerName !== undefined ? passengerName.trim() : ''`
    * 안내 placeholder: `placeholder="예: SOFYAN 외 1명 (미입력 시 생략)"`
  - **`useDriverProfile.ts`**:
    * `localStorage` 로드 및 `updateProfile` 호출 시 `newProfile.passengerName !== undefined ? newProfile.passengerName : prev.passengerName` 검사를 적용하여 빈 문자열이 유효한 상태 값으로 저장 및 유지되도록 보장.
  - **`app/api/driver/route.ts`**:
    * 요청 바디에서 `passengerName`을 수신하고 `if (passengerName !== undefined) payload.passenger_name = passengerName;`를 통해 빈 문자열을 페이로드에 정상 반영.

### 2) 단톡방 보고 텍스트 조건부 행 출력 (`utils/reportGenerator.ts`, `utils/kakao.ts`)
- **조건부 불릿 렌더링 로직**:
  - `profile.passengerName?.trim()`의 존재 여부를 `hasPassenger = Boolean(passengerName)`으로 명확히 평가.
  - `hasPassenger`가 `true`일 때만 배열에 `• 담당승객: ${passengerName}`을 삽입하고, `false`일 때는 `null`을 삽입한 뒤 `.filter(Boolean).join('\n')`으로 결합하여 빈 줄(공백 줄바꿈)이 남지 않는 무결한 다단 텍스트 생성.

---

## 3. 출력 포맷 검증 결과

### 1) 출발 보고 (`DEPARTURE` 모드)
- **승객명이 등록되어 있는 경우**:
  ```text
  [4호차 윤태준]
  • 담당승객: SOFYAN 외 1명
  • 출발지: 조선팰리스 강남
  • 목적지: 대원베스트빌
  • ETA: 03:08
  ```
- **승객명이 비어 있는 경우 (단독 이동/공차 회송)**:
  ```text
  [4호차 윤태준]
  • 출발지: 조선팰리스 강남
  • 목적지: 대원베스트빌
  • ETA: 03:08
  ```

### 2) 도착 보고 (`ARRIVED` 모드)
- **승객명이 등록되어 있는 경우**:
  ```text
  [4호차 윤태준]
  • 담당승객: SOFYAN 외 1명
  • 도착지: 대원베스트빌
  • 상태: 도착 완료
  ```
- **승객명이 비어 있는 경우 (단독 이동/공차 회송)**:
  ```text
  [4호차 윤태준]
  • 도착지: 대원베스트빌
  • 상태: 도착 완료
  ```

---

## 4. 빌드 및 배포 내역

- **대상 저장소**: `Junebooky/driver-eta-notifier` (`main` 브랜치)
- **빌드 검증**: `npm run build` (0 error, Turbopack 최적화 성공)
  ```text
  ▲ Next.js 16.3.5 (Turbopack)
  - Environments: .env.local
  ✓ Running next.config.ts took 11ms
    Creating an optimized production build ...
  ✓ Compiled successfully in 377ms
    Finished TypeScript in 832ms    ✓ Finished TypeScript in 832ms 
    Collecting page data using 10 workers in 275ms    ✓ Collecting page data using 10 workers in 275ms 
  ✓ Generating static pages using 10 workers (9/9) in 226ms
    Finalizing page optimization in 8ms    ✓ Finalizing page optimization in 8ms 

  Route (app)
  ┌ ○ /
  ├ ○ /_not-found
  ├ ƒ /api/driver
  ├ ƒ /api/presets
  ├ ƒ /api/route
  ├ ƒ /api/search
  └ ○ /tmap

  ○  (Static)   prerendered as static content
  ƒ  (Dynamic)  server-rendered on demand
  ```
- **수정 파일 목록**:
  - `components/ProfileModal.tsx`: 빈 문자열 저장 허용 및 placeholder 가이드 수정
  - `hooks/useDriverProfile.ts`: `passengerName` 빈 문자열 보존 로직 적용
  - `app/api/driver/route.ts`: 백엔드 동기화 페이로드에 `passenger_name` 처리 반영
  - `utils/reportGenerator.ts`: 승객명 공백 시 `• 담당승객` 행 조건부 생략
  - `utils/kakao.ts`: 카카오 VIP 보고 텍스트 조건부 생략 동기화
  - `docs/REPORT.md`: 과업 내역 및 검증 결과 갱신
- **Git Commit**: `fix: allow empty passenger name in profile and conditionally omit passenger line in reports`
- **배포 상태**: `origin/main` 푸시 완료 (Vercel 자동 프로덕션 배포 완료)
