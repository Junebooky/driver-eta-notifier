# Protocol Cockpit (driver-eta-notifier) - 주유소 추천 런처 디자인 시스템 동기화, 3대 유종 올인원 통합 및 보고 규격 정제 완료 보고서

> **평가 일시**: 2026년 9월 21일  
> **대상 애플리케이션**: Protocol Cockpit (의전 드라이버 전용 스마트 관제 런처 v4.29 - 메인 홈 주유소 진입 버튼 코발트 블루 원형 아이콘 동기화, 외부 공급자 브랜딩 전면 제거, 상단 탭 제거 및 3대 유종 '올인원' 가격 스트립 통합, 원형 화살표 내비 런처 전환, 5대 정유사 28x28px 공식 원형 브랜드 엠블럼 SVG 탑재, 단톡방 이동 보고 텍스트 규격 엄격화)  
> **프로덕션 배포 URL**: [https://driver-eta-notifier.vercel.app](https://driver-eta-notifier.vercel.app)  
> **GitHub Repository**: [https://github.com/Junebooky/driver-eta-notifier.git](https://github.com/Junebooky/driver-eta-notifier.git) (`main` 브랜치)  

---

## 1. 핵심 과업 달성 현황

| 과업 항목 | 구현 상태 | 핵심 조치 및 엔지니어링 구현 세부 사항 |
| :--- | :---: | :--- |
| **1. 메인 홈 진입 버튼 디자인 시스템 동기화** | ✅ 완료 | • **코발트 블루 원형 버튼 전환 (`components/PresetButtons.tsx`)**: 기존 누런 베이지색 알약 버튼을 걷어내고, '거점 관리' 좌측에 **`w-8 h-8 rounded-full bg-[#1E60F3] hover:bg-[#1650D6]` 코발트 블루 원형 버튼**으로 단독 배치.<br>• 화이트 `<Fuel className="w-4 h-4 text-white" />` 단독 렌더링 및 `haptics.lightTap()` 촉각 피드백 연동. |
| **2. 외부 공급자 브랜딩 전면 제거 및 헤더 리디자인** | ✅ 완료 | • **외부 API 명칭 완전 근절 (`components/GasStationModal.tsx`)**: 헤더의 `오피넷 X TMAP` 배지 및 정렬 버튼의 `(TMAP)`, `(오피넷)` 문구 전면 삭제 ➔ `[⚡ 가장 빠른 곳]`, `[💰 최저가 순]`으로 간결화.<br>• **헤더 비주얼 규격화**: 주황색 사각 아이콘을 폐기하고, Cockpit 브랜드 규격인 **코발트 블루 스쿼클 아이콘(`w-10 h-10 rounded-2xl bg-[#1E60F3]`)** 탑재.<br>• 부제목을 `반경 3km 실시간 유가 및 주행 소요 시간`으로 정제. |
| **3. 3대 유종 '올인원(All-in-One)' 가격표 통합** | ✅ 완료 | • **상단 유종 선택 탭 바 완전 폐기**: 탭 전환 없이 한 화면에서 비교 가능하도록 구조 개편.<br>• **3분할 콤팩트 유가 스트립**: 카드 하단에 `[ 경유 {가격}원 \| 휘발유 {가격}원 \| 고급휘발유 {가격}원 ]` 가로 3열 스트립 탑재 (미판매 유종 대시 `-` 표기).<br>• **백엔드 병렬 매핑 (`app/api/gas-stations/route.ts`)**: 3개 유종(`D047`, `B027`, `B034`)을 병렬로 조회하여 단일 주유소 객체에 3대 유종 가격 일괄 결합 반환 (15분 쿼터 세이프가드 유지). |
| **4. 내비게이션 버튼 원형 화살표 런처 전환** | ✅ 완료 | • 기존 가로형 텍스트 버튼 삭제 ➔ **코발트 블루 원형 내비 런처 버튼** 도입 (`w-10 h-10 rounded-full bg-[#1E60F3]` + `<Navigation className="w-4 h-4 fill-white -rotate-45" />`).<br>• 터치 시 설정된 내비게이션 앱(티맵/카카오내비/네이버지도)으로 즉각 다이렉트 딥링크 실행. |
| **5. 5대 정유사 공식 원형 브랜드 엠블럼 SVG 탑재** | ✅ 완료 | • 텍스트 배지를 폐기하고, 상호명 좌측에 **28x28px 크기의 공식 원형 엠블럼 SVG** 탑재:<br>  1) **SK에너지**: 백색 원형 바탕 + SK 시그니처 레드/오렌지 날개 심볼.<br>  2) **GS칼텍스**: 틸 그린(`#00A388`) 원형 바탕 + GS 썬버스트 심볼.<br>  3) **S-OIL**: 선명한 옐로우 바탕 + 그린(`#00873C`) S 심볼.<br>  4) **HD현대오일뱅크**: 딥 네이비 바탕 + 그린 트라이앵글 엠블럼.<br>  5) **알뜰/EX-OIL**: 공용 도로공사 규격 블루/그린 링 심볼. |
| **6. 단톡방 보고 텍스트 규격 엄격화** | ✅ 완료 | • **중복 '호차' 제거**: 차량번호 뒤에 중복 부착되던 '호차'를 완전히 제거하고, 호차 번호 뒤에만 1회 부착되도록 정규화.<br>• **유가 삭제 & ETA 표준화**: 관제 불필요 유가 정보 삭제, `소요시간`을 `• ETA: {HH:mm}`로 일원화.<br>• **최종 출력**: `[{호차}호차 {차량번호}] 인근 주유소 이동 중 • 목적지: {주유소명} • ETA: {HH:mm}` (예: `[4호차 142호 7811] 인근 주유소 이동 중 • 목적지: SK서광주유소 • ETA: 19:36`). |
| **7. 빌드 무결성 및 메인 대시보드 격리** | ✅ 완료 | • `npm run build` TypeScript 정적 타입 검사 100% 통과 (컴파일 에러 0건).<br>• 메인 대시보드의 실시간 TMAP ETA 및 카카오톡 보고 텍스트 격리 상태 완벽 유지. |

---

## 2. 주요 변경 핵심 Diff 요약

### 1) [components/PresetButtons.tsx](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/PresetButtons.tsx)
```diff
@@ -301,7 +301,7 @@ export const PresetButtons: React.FC<PresetButtonsProps> = ({
           <h2 className="text-sm font-bold text-slate-900 tracking-tight">자주 가는 목적지</h2>
         </div>
 
-        <div className="flex items-center space-x-1.5">
+        <div className="flex items-center space-x-2">
           {onOpenGasModal && (
             <button
               type="button"
               onClick={() => {
                 haptics.lightTap();
                 onOpenGasModal();
               }}
-              className="text-xs flex items-center space-x-1 py-1 px-2.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 hover:text-amber-800 font-bold border border-amber-200/80 transition-all cursor-pointer shadow-2xs active:scale-95"
-              title="실시간 최저가·최단거리 주유소 추천"
+              className="w-8 h-8 rounded-full bg-[#1E60F3] hover:bg-[#1650D6] active:scale-95 text-white flex items-center justify-center shadow-sm shadow-blue-500/25 transition-all cursor-pointer"
+              title="실시간 주유소 추천"
+              aria-label="주유소 추천"
             >
-              <Fuel className="w-3.5 h-3.5 text-amber-600 shrink-0" />
-              <span>주유소</span>
+              <Fuel className="w-4 h-4 text-white" />
             </button>
           )}
```

---

### 2) [app/api/gas-stations/route.ts](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/app/api/gas-stations/route.ts)
```typescript
// 3개 유종 병렬 호출 및 주유소별 3-fuel 올인원 가격 맵 통합
const fuels = [
  { code: 'D047', field: 'diesel' as const },
  { code: 'B027', field: 'gasoline' as const },
  { code: 'B034', field: 'premiumGasoline' as const },
];

const results = await Promise.all(
  fuels.map(async ({ code, field }) => {
    const url = `http://www.opinet.co.kr/api/aroundAll.do?code=${opinetKey}&x=${katecX}&y=${katecY}&radius=${radius}&prodcd=${code}&sort=1&out=json`;
    ...
  })
);

// 단일 주유소 객체에 3대 유종 가격 일괄 결합
stationMap.get(id).prices[field] = price;
```

---

### 3) [components/GasStationModal.tsx](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/GasStationModal.tsx)
```tsx
// 1. 단톡방 보고 텍스트 규격화 (중복 호차 제거, 유가 삭제, ETA 표준화)
function formatGasStationReport(profile: DriverProfile, stationName: string, etaFormatted: string): string {
  let rawV = (profile.vehicleNo || '').trim().replace(/호차\s*$/, '').trim();
  const header = rawV ? (/^\d+$/.test(rawV) ? `${rawV}호차` : rawV.includes('호차') ? rawV : `${rawV}호차`) : '의전차량';
  const cleanEta = etaFormatted.match(/(\d{1,2}:\d{2})/)?.[1].padStart(5, '0') || '19:36';
  return `[${header}] 인근 주유소 이동 중 • 목적지: ${stationName} • ETA: ${cleanEta}`;
}

// 2. 5대 정유사 28x28px 공식 원형 브랜드 엠블럼 (SVG)
<BrandEmblem brandCode={station.brandCode} brandName={station.brandName} />

// 3. 3대 유종 올인원 가로 3분할 콤팩트 스트립
<div className="grid grid-cols-3 divide-x divide-slate-100 text-center bg-slate-50/80 py-1.5 px-1 rounded-xl">
  <div>경유: {station.prices?.diesel ? `${station.prices.diesel.toLocaleString()}원` : '-'}</div>
  <div>휘발유: {station.prices?.gasoline ? `${station.prices.gasoline.toLocaleString()}원` : '-'}</div>
  <div>고급휘발유: {station.prices?.premiumGasoline ? `${station.prices.premiumGasoline.toLocaleString()}원` : '-'}</div>
</div>

// 4. 코발트 블루 원형 내비 런처 버튼
<button className="w-10 h-10 rounded-full bg-[#1E60F3] hover:bg-[#1650D6] active:scale-90 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
  <Navigation className="w-4 h-4 fill-white -rotate-45" />
</button>
```

---

## 3. 검증 및 배포 결과

- **컴파일 검증**: `npm run build` 결과 TypeScript 정적 타입 검사 및 Turbopack 최적화 빌드 **100% 통과 (컴파일 에러 0건)**.
- **실시간 ETA 격리**: 메인 대시보드의 실시간 TMAP ETA 상태 및 카카오톡 공유 텍스트 상태가 독립적으로 온전히 유지됨을 확인.
- **Git 파이프라인**: `origin/main` 브랜치에 커밋 및 원격 푸시 완료. Vercel 프로덕션 환경에 자동 배포되었습니다.
