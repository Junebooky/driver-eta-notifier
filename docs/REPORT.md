# Protocol Cockpit (driver-eta-notifier) - ETA 24시간제 포맷 교정, 담당 승객명 배치 및 네이버 브랜드 컬러 통일 완료 보고서

> **평가 일시**: 2026년 9월 21일  
> **대상 애플리케이션**: Protocol Cockpit (의전 드라이버 전용 스마트 관제 런처 v4.4 - ETA 24시간제(HH:mm) 보장, 담당 승객 카드 배치 및 네이버 브랜드 컬러 일체화)  
> **프로덕션 배포 URL**: [https://driver-eta-notifier.vercel.app](https://driver-eta-notifier.vercel.app)  
> **GitHub Repository**: [https://github.com/Junebooky/driver-eta-notifier.git](https://github.com/Junebooky/driver-eta-notifier.git) (main 브랜치)  

---

## 1. 실무 3대 핵심 교정 과업 달성도

| 과업 항목 | 구현 상태 | 핵심 조치 및 동작 세부 사항 |
| :--- | :---: | :--- |
| **1. ETA 시간 포맷 24시간제(HH:mm) 완전 교정** | ✅ 완료 | 로케일 종속성(오전/오후 분리 및 왜곡 버그)을 원천 차단하는 `formatEtaTime`, `getEtaString` 함수를 신설. 자바스크립트 Date 객체로부터 엄격한 24시간제 `HH:mm` (예: `14:35`, `09:20`)을 반환하도록 전면 교정. 중앙 ETA 카드 및 단톡방 보고 텍스트에 오차 없는 명확한 24시간제 시간 단독 노출. |
| **2. 담당 승객명 UI 상단 배치 및 단톡방 보고 텍스트 반영** | ✅ 완료 | 1) **단톡방 보고 텍스트**: 프로필 내 저장된 승객명(`profile.passengerName`, 기본값: 'SOFYAN 외 1명')을 추출하여 표준 의전 프로토콜 포맷인 `[4호차] 인천공항 T1 to 조선팰리스 호텔 출발 / SOFYAN 외 1명 승차 / ETA 14:30`로 일괄 개편.<br>2) **메인 화면 승객 정보 배치**: 출발지 선택 거점 칩 리스트 바로 위쪽(`OriginDestinationSelector`와 `PresetButtons` 사이)에 은은한 유저 아이콘 + 볼드 승객명 + 설정창 바로가기 [수정] 링크를 포함한 카드 배치. |
| **3. 네이버 아이콘 컬러 통일 (설정 모달 기준)** | ✅ 완료 | 메인 상단 헤더(`components/Header.tsx`)의 네이버 버튼이 설정창(`components/ProfileModal.tsx`)과 상이했던 연녹색 파스텔 톤(`bg-[#A7F3D0]`, `text-emerald-800`)을 전면 폐기하고, 설정 모달과 완벽히 동일한 네이버 공식 브랜드 그린(`bg-[#03C75A]`, `border-emerald-400`, `text-white`, `shadow-[0_4px_12px_rgba(3,199,90,0.35)]`)으로 통일. |
| **4. 빌드 무결성 검증 및 배포** | ✅ 완료 | Next.js 16.3.5 (Turbopack) 최적화 빌드 수행 (`npm run build`) 결과 TypeScript 컴파일 에러 0건 확인. `main` 브랜치에 커밋(`fix: resolve ETA 24h format, display passenger above origin presets, and unify Naver brand color`) 및 원격 푸시 완료. |

---

## 2. 세부 엔지니어링 구현 내역

### 1) ETA 시간 포맷 24시간제(HH:mm) 완전 교정 (`utils/navigation.ts`, `RouteInfoCard.tsx`, `app/page.tsx`, `route.ts`)
- **원인 분석**:
  - 기존 코드에서는 `dynamicEtaFormatted` 생성 시 로케일 기반의 `${period} ${hours12}:${minutes}` (예: "오후 2:35")를 사용하였고, 보고서 생성 로직의 `etaFormatted.split(' ')[0]` 처리로 인해 시간 숫자가 날아가고 "오후" 텍스트만 분리 노출되는 왜곡 현상이 발생함.
- **해결 방안 및 구현**:
  - `utils/navigation.ts`에 독립 24시간제 포맷팅 유틸리티 구현:
    ```typescript
    export function formatEtaTime(date: Date): string {
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      return `${hours}:${minutes}`;
    }

    export function getEtaString(durationMinutes: number, fromDate: Date = new Date()): string {
      const etaDate = new Date(fromDate.getTime() + durationMinutes * 60 * 1000);
      return formatEtaTime(etaDate);
    }
    ```
  - `app/page.tsx`의 `fetchRouteEstimate` 및 `calculateHaversineEstimate`에서 로컬 클록 기반의 `getEtaString(durationMinutes, now)`을 호출하여 상태에 순수 24시간제 `HH:mm` (예: `14:35`) 문자열만 저장.
  - `components/RouteInfoCard.tsx`에서 정규식 `match(/(\d{1,2}:\d{2})/)`을 적용하여 24시간제 시간 파트(`14:35`)와 소요 시간 파트(`(51분 소요)`)를 명확하게 분리 렌더링.
  - 서버 라우트 핸들러(`app/api/route/route.ts`)의 캐시/라이브 응답 또한 `${hours}:${minutes}` 형식으로 통일.

### 2) 담당 승객명 UI 상단 배치 및 단톡방 보고 텍스트 개편 (`app/page.tsx`, `utils/reportGenerator.ts`, `ActionPanel.tsx`)
- **단톡방 보고 텍스트 개편 (`utils/reportGenerator.ts` & `utils/kakao.ts`)**:
  - 승객명(`profile.passengerName` || 'SOFYAN 외 1명') 유무에 따른 동적 포맷팅 적용:
    * **출발 모드**: `[4호차] 인천공항 T1 to 조선팰리스 호텔 출발 / SOFYAN 외 1명 승차 / ETA 14:30` (승객명 미입력 시 승차 항목 자동 생략)
    * **도착 모드**: `[4호차] 조선팰리스 호텔 도착 / SOFYAN 외 1명 하차 완료`
- **메인 화면 승객 정보 카드 신설 (`app/page.tsx`)**:
  - `OriginDestinationSelector`(출발/도착 카드)와 `PresetButtons`(거점 칩 그리드) 사이에 전용 카드 배치:
    * 스타일: `bg-slate-100 dark:bg-slate-800/80 rounded-xl p-3 mb-2 flex items-center justify-between border border-slate-200 dark:border-slate-700`
    * 좌측: 서브틀한 `User` 아이콘 + `담당 승객: SOFYAN 외 1명` 볼드 텍스트
    * 우측: 클릭 시 `ProfileModal`을 즉시 오픈하는 `[수정]` 텍스트 버튼 배치.

### 3) 네이버 아이콘 컬러 통일 (`components/Header.tsx`)
- **설정 모달(`ProfileModal.tsx`) 규격 일체화**:
  - 기존 `Header.tsx`: `bg-[#A7F3D0]`, `border-emerald-300`, `text-emerald-800` (흐릿한 파스텔 톤)
  - 교정 `Header.tsx`:
    * 배경: `bg-[#03C75A]` (네이버 공식 그린)
    * 테두리: `border-emerald-400`
    * 심볼: `text-white font-black text-xs`
    * 활성 상태: `ring-2 ring-emerald-500 scale-105 shadow-[0_4px_12px_rgba(3,199,90,0.35)] z-10`
  - 설정 모달의 네이버 칩과 헤더 상단의 네이버 내비 칩 간의 100% 동일한 비주얼 톤 달성.

---

## 3. 실기기 및 빌드 검증 결과

### 1) 빌드 무결성 검증 (`npm run build`)
```text
▲ Next.js 16.3.5 (Turbopack)
- Environments: .env.local
✓ Running next.config.ts took 12ms
  Creating an optimized production build ...
✓ Compiled successfully in 412ms
  Finished TypeScript in 867ms    ✓ Finished TypeScript in 867ms 
  Collecting page data using 10 workers in 314ms    ✓ Collecting page data using 10 workers in 314ms 
✓ Generating static pages using 10 workers (9/9) in 232ms
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

### 2) 시나리오별 동작 검증
1. **ETA 24시간제 표시 검증**:
   - 시간대가 오전이든 오후이든 상관없이 중앙 ETA 카드에 `14:35 (45분 소요)` 형태로 깔끔하게 렌더링.
   - 단톡방 보고 미리보기 박스 및 복사 텍스트에 `ETA 14:35`로 24시간제 포맷 노출.
2. **담당 승객 카드 및 보고 텍스트 검증**:
   - 거점 칩 목록 상단에 `담당 승객: SOFYAN 외 1명 [수정]` 카드가 단정하게 표시됨.
   - [수정] 클릭 시 프로필 모달이 열려 승객명을 변경할 수 있으며, 변경 즉시 카드와 단톡방 보고 문구에 실시간 반영됨.
   - 단톡방 보고 텍스트: `[4호차] 인천공항 T1 to 신라호텔 출발 / SOFYAN 외 1명 승차 / ETA 14:35` 생성 확인.
3. **네이버 브랜드 컬러 검증**:
   - 헤더의 네이버 'N' 버튼이 공식 `#03C75A` 초록색 배경에 선명한 흰색 텍스트로 렌더링되어 설정 모달의 아이콘과 완벽 일치.

---

## 4. 빌드 및 배포 내역

- **대상 저장소**: `Junebooky/driver-eta-notifier` (`main` 브랜치)
- **빌드 검증**: `npm run build` (0 error, Turbopack 최적화 완료)
- **수정 파일 목록**:
  - `utils/navigation.ts`: 24시간제 변환 함수 `formatEtaTime`, `getEtaString` 구현 및 적용
  - `utils/reportGenerator.ts`: 의전 프로토콜 승객명 및 24h ETA 포맷 개편
  - `utils/kakao.ts`: 카카오 공유용 VIP 리포트 텍스트 포맷 동기화
  - `components/RouteInfoCard.tsx`: 엄격한 24시간제 시간/소요시간 파싱 렌더링
  - `components/Header.tsx`: 네이버 아이콘 공식 브랜드 컬러(`#03C75A`) 통일
  - `components/ActionPanel.tsx`: DriverProfile 속성 바인딩
  - `app/api/route/route.ts`: API 응답 24시간제 ETA 문자열 포맷 통일
  - `app/page.tsx`: 승객 정보 카드 상단 배치, 24시간제 ETA 연동 및 프로필 동기화
  - `docs/REPORT.md`: 작업 내역 및 검증 결과 갱신
- **Git Commit**: `fix: resolve ETA 24h format, display passenger above origin presets, and unify Naver brand color`
- **배포 상태**: `origin/main` 푸시 완료 (Vercel 자동 배포 트리거)
