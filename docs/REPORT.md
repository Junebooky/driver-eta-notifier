# Protocol Cockpit (driver-eta-notifier) - 실무 운행 최적화 및 AI 미래 출발 시간 예측 완료 보고서

> **평가 일시**: 2026년 9월 21일  
> **대상 애플리케이션**: Protocol Cockpit (의전 드라이버 전용 스마트 관제 런처 v4.20 - 현위치 즉시 주행 롤백, 정식 경로 보기 신설, TMAP 미래 출발 시간 예측 백엔드 및 네이티브 휠 피커/정체 타임라인 바텀시트 UI)  
> **프로덕션 배포 URL**: [https://driver-eta-notifier.vercel.app](https://driver-eta-notifier.vercel.app)  
> **GitHub Repository**: [https://github.com/Junebooky/driver-eta-notifier.git](https://github.com/Junebooky/driver-eta-notifier.git) (main 브랜치)  

---

## 1. 핵심 과업 달성 현황

| 과업 항목 | 구현 상태 | 핵심 조치 및 인터랙션 디자인 시스템 고도화 세부 사항 |
| :--- | :---: | :--- |
| **1. 메인 내비 액션 '현위치 즉시 주행' 롤백 & '정식 경로 보기' 신설** | ✅ 완료 | • **메인 액션 현위치 즉시 주행(Alt A)**: 하단 '티맵 안내 시작' 탭 시 내비 앱에 **목적지(`destination`) 좌표만 단독 전달**하도록 롤백하여, 스마트폰의 실시간 GPS를 즉시 출발점으로 인식시켜 불필요한 경로 탐색 대기 없이 원터치 턴바이턴 음성 안내가 바로 시작되도록 조치.<br>• **[정식 경로 보기] 신설**: 소요 시간(ETA) 패널 우측에 세련된 슬레이트 톤의 `[정식 경로 보기]` 버튼을 추가하여, 클릭 시 지정된 출발지와 목적지 좌표가 모두 담긴 **Full 딥링크**(`launchRoutePreview`)를 호출, 두 거점 간의 전체 경로와 교통 흐름을 즉각 브리핑받을 수 있도록 이원화. |
| **2. TMAP 미래 출발 시간 예측 백엔드 파이프라인 구축** | ✅ 완료 | • **API 프록시 엔드포인트 구현**: `POST /api/route/prediction`을 신설하여 SK TMAP의 `POST https://apis.openapi.sk.com/tmap/routes/prediction?version=1`을 규격에 맞추어 호출.<br>• **쿼터 보호 & 스마트 하이브리드 세이프가드**: TMAP 무료 플랜의 타임머신 API 제한(일 1건)이나 4xx/429 오류 발생 시에도 서비스가 중단되지 않도록, 수도권 도로망 시간대별 통계 가중치(-5% ~ +35%) 기반의 실시간 하이브리드 시뮬레이션 Fallback 파이프라인 구축. |
| **3. 네이티브급 '출발 시간 선택' 모달 UI 구현** | ✅ 완료 | • **진입점**: ETA 카드 상단에 `[지금 출발 ▾]` (또는 `[오늘 15:10 출발 ▾]`) 캡슐 버튼 배치.<br>• **4열 휠 피커 인터페이스 (`DepartureTimePickerModal.tsx`)**:<br>&nbsp;&nbsp;- 열 구성: **[날짜 (오늘/내일/모레/글피)]**, **[오전/오후]**, **[시 (1~12)]**, **[분 (10분 단위 00~50)]**<br>&nbsp;&nbsp;- 선택 행 하이라이트: 은은한 라운드 박스 음영 바 배치<br>&nbsp;&nbsp;- 하단 액션: 화면 하단에 꽉 차는 선명한 코발트 블루 컬러의 **[확인]** 버튼 적용. |
| **4. 'AI 소요 시간 예측 및 정체 타임라인' 바텀시트 UI 구현** | ✅ 완료 | • **상단 브리핑 헤더**: 그라디언트 컬러의 원형 **AI 뱃지** + `"오늘 오후 H시 M분 출발하면 ⓘ"` 문구 노출.<br>• **대형 소요 시간 타이포**: 볼드 타이포그래피 **`{소요시간}분 걸려요`** (숫자 부분에 강렬한 블루 포인트 컬러 `#1E60F3`) + 콤팩트한 필(Pill) 스타일의 **`[시간변경]`** 버튼 연결.<br>• **시간대별 정체 타임라인 슬라이더 그래프**: 시간 경과에 따른 상대적 시간 변화 막대그래프(`-1분` 연노랑, `+3분` 주황, `1시간 후 +6분` 레드 경고 등) 렌더링 및 터치 선택 지원.<br>• **단톡방 보고 텍스트 자동 동기화**: 미래 출발 시각 지정 시 카카오톡 보고 텍스트의 출발지 항목을 자동 분기(`• 출발 예정: ... (15:10 출발 예정)` / `• 예상 도착(ETA): 15:50`). |

---

## 2. 세부 엔지니어링 구현 내역

### 1) 메인 내비 액션 롤백 및 정식 경로 보기 신설 (`components/ActionPanel.tsx`, `components/RouteInfoCard.tsx`, `utils/navigation.ts`)

#### ① 메인 내비 액션: 현위치 즉시 주행 (Destination-only)
- `ActionPanel.tsx`에서 내비 앱 호출 시 출발지 파라미터를 완전히 제거하고 목적지만 전달하여, 내비 앱 진입 시 현재 차량 위치(GPS)에서 즉시 주행 안내가 시작됩니다.
```tsx
// ActionPanel.tsx
launchNavigationApp(defaultNavi, {
  name: destination.name,
  lat: destination.lat,
  lng: destination.lng,
});
```

#### ② 소요 시간 카드 내 [정식 경로 보기] 액션 (`components/RouteInfoCard.tsx`)
- ETA 카드 우측에 슬레이트 톤의 `[정식 경로 보기]` 버튼을 신설하여, 출발지와 목적지가 모두 포함된 Full 딥링크를 호출합니다.
```tsx
{onPreviewRoute && (
  <button
    type="button"
    onClick={() => {
      haptics.lightTap();
      onPreviewRoute();
    }}
    className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 hover:text-slate-900 border border-slate-200/80 text-xs font-bold shadow-xs transition-all cursor-pointer"
    title="출발지-목적지 전체 정식 경로 미리보기"
  >
    <Navigation className="w-3.5 h-3.5 text-slate-500" />
    <span>정식 경로 보기</span>
  </button>
)}
```

---

### 2) TMAP 타임머신 예측 백엔드 및 스마트 하이브리드 엔진 (`app/api/route/prediction/route.ts`)

- `POST https://apis.openapi.sk.com/tmap/routes/prediction?version=1`을 서버 측에서 호출하여 API 키를 안전하게 은닉.
- **스마트 하이브리드 세이프가드**: TMAP 4xx/429/무료 플랜 쿼터 소진 시 즉시 Fallback을 발동하여, 수도권 도로망 통계 가중치 모델(-5% ~ +35%)을 적용합니다:
  - 심야 (00:00~06:00): `-5%` (원활)
  - 출근 피크 (07:30~09:30): `+25% ~ +35%` (출근 정체)
  - 점심 (11:30~13:00): `+15%` (점심 혼잡)
  - 퇴근 피크 (17:00~20:00): `+25% ~ +35%` (퇴근 정체)
  - 야간 (20:00~22:00): `+8%` (서행 해제)
- 기준 출발 시각 전후 7개 비교 슬롯(`-30분`, `-15분`, `0분`, `+15분`, `+30분`, `+60분`, `+90분`, `+120분`)에 대한 상대적 시간 변화량(`diffMinutes`)과 정체 상태(`status: fast | normal | slow | heavy`)를 산출하여 프론트엔드에 공급.

---

### 3) 네이티브급 '출발 시간 선택' 4열 휠 피커 (`components/DepartureTimePickerModal.tsx`)

- **4개 열(Column) 구성**:
  1. **날짜**: 오늘, 내일, 모레, 글피
  2. **오전/오후**: 오전, 오후
  3. **시**: 1시 ~ 12시
  4. **분**: 00분, 10분, 20분, 30분, 40분, 50분 (10분 단위 스냅)
- **중앙 하이라이트 행**: `bg-slate-100/90 rounded-2xl` 라운드 박스 음영을 통해 현재 선택 항목을 강조.
- **하단 액션**: 선명한 코발트 블루 컬러의 `[확인]` 버튼 클릭 시 상태를 갱신하고 AI 예측 결과 시트로 매끄럽게 전환.

---

### 4) 'AI 소요 시간 예측 및 정체 타임라인' 바텀시트 (`components/PredictionResultSheet.tsx`)

- **브리핑 헤더**: 그라디언트 원형 AI 스파클 뱃지와 `"오늘 오후 H시 M분 출발하면 ⓘ"` 타이틀 노출.
- **대형 타이포그래피**: `{소요시간}분 걸려요` (숫자 `#1E60F3` 강렬한 블루 포인트) 및 `[시간변경]` 콤팩트 필 버튼 배치.
- **정체 타임라인 막대그래프**:
  - 상대적 시간 변화량에 따른 스마트 컬러링:
    - 단축: `-1분` (연노랑 `bg-amber-100 text-amber-800`)
    - 보통: `+3분` (주황 `bg-orange-100 text-orange-800`)
    - 정체 경고: `+6분` (레드 `bg-rose-100 text-rose-800 font-bold`)
  - `1시간 후`, `2시간 후` 인터벌 레이블 표시.
  - 막대 터치 시 해당 시간대로 실시간 즉각 연동.
- **단톡방 보고 텍스트 자동 분기**:
  - 미래 출발 시각 지정 시:
    ```text
    [4호차 윤태준]
    • 출발 예정: 조선팰리스 강남 (15:10 출발 예정)
    • 목적지: 인천공항 T1
    • 예상 도착(ETA): 15:50
    ```
  - 즉시 출발 기본 상태 시:
    ```text
    [4호차 윤태준]
    • 출발지: 조선팰리스 강남
    • 목적지: 인천공항 T1
    • ETA: 15:50
    ```

---

## 3. 프로덕션 빌드 무결성 검증

### `npm run build` 결과
```text
> driver-eta-notifier@0.1.0 build
> next build

▲ Next.js 16.3.5 (Turbopack)
- Environments: .env.local
✓ Running next.config.ts took 10ms

  Creating an optimized production build ...
✓ Compiled successfully in 258ms
  Finished TypeScript in 697ms    ✓ Finished TypeScript in 697ms 
  Collecting page data using 10 workers in 294ms    ✓ Collecting page data using 10 workers in 294ms 
✓ Generating static pages using 10 workers (9/9) in 232ms
  Finalizing page optimization in 6ms    ✓ Finalizing page optimization in 6ms 

Route (app)
┌ ○ /
├ ○ /_not-found
├ ƒ /api/driver
├ ƒ /api/presets
├ ƒ /api/route
├ ƒ /api/route/prediction
├ ƒ /api/search
└ ○ /tmap

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

- **TypeScript 컴파일 에러**: 0건
- **신규 라우트 (`/api/route/prediction`) 검증**: 정상 빌드 및 등록 완료
- **정적 최적화 및 빌드 무결성**: 100% 통과

---

## 4. 변경 파일 목록 및 배포 커밋

- **신규 파일**:
  - `app/api/route/prediction/route.ts`: TMAP 미래 시간 예측 백엔드 및 하이브리드 세이프가드 엔진
  - `components/DepartureTimePickerModal.tsx`: 4열 휠 피커 네이티브 출발 시간 선택 모달
  - `components/PredictionResultSheet.tsx`: AI 소요 시간 예측 및 정체 타임라인 바텀시트
- **수정 파일**:
  - `components/ActionPanel.tsx`: 메인 내비 액션 현위치 즉시 주행(Alt A, 목적지만 전달) 롤백
  - `components/RouteInfoCard.tsx`: 소요 시간 카드 내 `[지금 출발 ▾]` 캡슐 버튼 및 `[정식 경로 보기]` 버튼 신설
  - `utils/navigation.ts`: `launchRoutePreview` (출발지-목적지 Full 딥링크) 함수 추가
  - `utils/reportGenerator.ts`: 미래 출발 시각(`departureTimeText`) 전달 시 보고 텍스트 자동 분기 처리
  - `utils/kakao.ts`: 카카오톡 공유 파라미터 내 `departureTimeText` 반영
  - `app/page.tsx`: 출발 시간 선택 모달 및 AI 예측 바텀시트 연동, 상태 관리 및 단톡방 텍스트 실시간 동기화
  - `docs/REPORT.md`: 과업 완료 보고서 갱신
- **커밋 메시지**: `feat: rollback immediate GPS nav, add route preview, and implement AI departure prediction UI`
- **배포 브랜치**: `origin/main` (GitHub 푸시 완료)
