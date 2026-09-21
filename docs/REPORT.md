# Protocol Cockpit (driver-eta-notifier) - ETA 카드 우측 버튼 수직 재배치 및 배경 도로 그래픽 가림 현상 해결 완료 보고서

> **평가 일시**: 2026년 9월 22일  
> **대상 애플리케이션**: Protocol Cockpit (의전 드라이버 전용 스마트 관제 런처 v4.50 - ETA 메인 카드 우측 버튼을 수평 가로 정렬에서 상하 수직 스택(`flex-col`)으로 재배치하여 배경 차량/도로 그래픽 완전 노출, 둥근 모서리(`rounded-2xl`) 및 그림자 미세 조정)  
> **프로덕션 배포 URL**: [https://driver-eta-notifier.vercel.app](https://driver-eta-notifier.vercel.app)  
> **GitHub Repository**: [https://github.com/Junebooky/driver-eta-notifier.git](https://github.com/Junebooky/driver-eta-notifier.git) (`main` 브랜치)  

---

## 1. 핵심 과업 달성 현황

| 과업 항목 | 구현 상태 | 핵심 조치 및 엔지니어링 구현 세부 사항 |
| :--- | :---: | :--- |
| **1. ETA 카드 우측 버튼 수직 스택 전환 (`RouteInfoCard.tsx`)** | ✅ 완료 | • 기존 수평 가로 정렬(`flex items-center gap-2`)로 인해 좌측의 예상 출발시간(CalendarClock) 버튼이 배경 일러스트의 도로 위 주행 차량 그래픽을 침범하여 가리던 결함 해결.<br>• **상하 수직 스택(`flex flex-col items-center gap-2 shrink-0`)**으로 전환하여 버튼 군집의 가로 폭을 절반(~48px)으로 축소.<br>• 상단: **예상 출발시간 버튼** (화이트/소프트 섀도우, `CalendarClock` 아이콘)<br>• 하단: **ETA 재계산/새로고침 버튼** (시그니처 코발트 블루, `RefreshCw` 아이콘) |
| **2. 버튼 조형미 및 카드 곡률 조화 (`rounded-2xl`)** | ✅ 완료 | • 레퍼런스 스크린샷과 1:1로 일치하도록 두 버튼 모두 카드 라운드에 맞춘 `rounded-2xl` 및 `shadow`를 적용.<br>• 상단 예상 출발시간 버튼: `bg-white/90 hover:bg-white border border-slate-200/70 text-slate-700 shadow-[0_2px_8px_rgba(0,0,0,0.04)]`<br>• 하단 재계산 버튼: `bg-[#1E60F3] hover:bg-[#1346D8] text-white shadow-[0_4px_12px_rgba(30,96,243,0.3)]` |
| **3. 빌드 무결성** | ✅ 완료 | • `npm run build` TypeScript 컴파일 에러 **0건**, Turbopack 최적화 빌드 완료. |

---

## 2. 주요 코드 변경 요약 ([`components/RouteInfoCard.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/RouteInfoCard.tsx))

```tsx
{/* Right Actions: Vertical Stack (Clock/Schedule Button Top + Refresh Button Bottom) */}
<div className="flex flex-col items-center gap-2 shrink-0">
  {onOpenTimePicker && (
    <button
      type="button"
      onClick={() => {
        haptics.lightTap();
        onOpenTimePicker();
      }}
      className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-white/90 hover:bg-white border border-slate-200/70 text-slate-700 hover:text-slate-900 flex items-center justify-center transition-all duration-150 active:scale-95 cursor-pointer shadow-[0_2px_8px_rgba(0,0,0,0.04)] backdrop-blur-xs"
      title="출발 시간별 소요 시간 예측 (미래 조회)"
      aria-label="출발 시간 선택"
    >
      <CalendarClock className="w-5 h-5 text-slate-700" />
    </button>
  )}

  {/* Refresh Button */}
  <button
    type="button"
    onClick={() => {
      haptics.lightTap();
      onRefreshRoute();
    }}
    disabled={isLoadingRoute}
    className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-[#1E60F3] hover:bg-[#1346D8] hover:scale-105 active:scale-[0.97] text-white shadow-[0_4px_12px_rgba(30,96,243,0.3)] flex items-center justify-center transition-all duration-150 ease-out disabled:opacity-50 cursor-pointer shrink-0 group"
    title="ETA 재계산"
    aria-label="경로 새로고침"
  >
    <RefreshCw
      className={`w-5 h-5 text-white transition-transform duration-500 ${
        isLoadingRoute ? 'animate-spin' : 'group-hover:rotate-180'
      }`}
    />
  </button>
</div>
```

---

## 3. 검증 결과

1. **시각적 완성도 (레퍼런스 1:1 일치)**:
   - 좌측: `ETA 09:37 (74분 소요)`, `이동 거리: 68.8 km (실시간 교통 반영 (TMAP))` 텍스트가 시원하게 가독성 확보.
   - 중앙-우측: 배경 일러스트의 도로 위 주행 중인 화이트 세단 자동차가 가림 없이 온전히 노출됨.
   - 우측 끝: 상단 캘린더시계 버튼(화이트)과 하단 새로고침 버튼(코발트 블루)이 단정하게 수직으로 2단 정렬되어 조작성과 심미성을 동시 달성.
2. **빌드 검증**:
   - `npm run build` 결과 11/11 라우트 전체 컴파일 성공 (TypeScript 에러 0건).
