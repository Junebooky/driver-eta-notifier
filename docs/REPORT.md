# Protocol Cockpit (driver-eta-notifier) - 주유소 선택 시 메인 홈 출발지 거점 보존 및 목적지 단독 갱신 완료 보고서

> **평가 일시**: 2026년 9월 21일  
> **대상 애플리케이션**: Protocol Cockpit (의전 드라이버 전용 스마트 관제 런처 v4.33 - 주유소 선택 및 원스톱 내비 실행 시 메인 대시보드 출발지(Origin) 거점 100% 보존, 목적지 단독 갱신(`id: 'custom_gas_station'`), 자동 마운트 GPS 덮어쓰기 원천 차단 및 상태 격리)  
> **프로덕션 배포 URL**: [https://driver-eta-notifier.vercel.app](https://driver-eta-notifier.vercel.app)  
> **GitHub Repository**: [https://github.com/Junebooky/driver-eta-notifier.git](https://github.com/Junebooky/driver-eta-notifier.git) (`main` 브랜치)  

---

## 1. 핵심 과업 달성 현황

| 과업 항목 | 구현 상태 | 핵심 조치 및 엔지니어링 구현 세부 사항 |
| :--- | :---: | :--- |
| **1. 출발지(Origin) 상태 불변성 보장** | ✅ 완료 | • **출발지 덮어쓰기 원천 차단**: 페이지 마운트 시 무조건 `requestGpsLocation()`을 호출하여 기존 설정 출발지(자택, 본사 등)를 '현위치'로 강제 치환하던 백그라운드 효과를 완전 제거.<br>• 주유소 모달 선택 시 `origin` 및 `originId` 상태를 일체 변경하지 않고 기존 거점 값 100% 보존. |
| **2. 목적지만 단독 치환 (Destination Only)** | ✅ 완료 | • **목적지 단독 갱신**: `handleSelectGasStation` 핸들러에서 오직 `destination`만 선택된 주유소의 정보(`id: 'custom_gas_station'`, 상호명, 정밀 위경도)로 단독 치환.<br>• `saveRecentPreset(gasPreset)`을 제거하여 목적지 주유소가 출발지 최근 거점 폴백으로 오염되는 현상 원천 방지.<br>• 선택 모드를 `'destination'`으로 확실히 복귀. |
| **3. 내비게이션 실행 로직 무결성 유지** | ✅ 완료 | • 스마트폰 3사 내비게이션(티맵, 카카오내비, 네이버지도) 앱 실행 시 단말 자체 GPS가 출발점이 되므로, 메인 홈의 출발지 상태를 전혀 변경하지 않고도 안전하게 주유소 길안내 실행.<br>• 주유 보고서 클립보드 자동 복사 및 즉시 내비 실행(원스톱 런처) 파이프라인 무결성 100% 유지. |
| **4. 빌드 무결성 및 No Regression** | ✅ 완료 | • `npm run build` TypeScript 정적 타입 검사 100% 통과 (에러 0건). |

---

## 2. 주요 변경 핵심 Diff 요약

### [`app/page.tsx`](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/app/page.tsx)
```diff
@@ -81,11 +81,6 @@ export default function Home() {
     setPresets(DEFAULT_PRESET_LOCATIONS);
   }, []);
 
-  // Auto-acquire real GPS location on mount (기존 거점 덮어쓰기 결함 원인 제거)
-  useEffect(() => {
-    requestGpsLocation();
-  }, [requestGpsLocation]);
-
   // Supabase Fleet Architecture Data Synchronization
   useEffect(() => {
     const driverId = profile.id || getOrCreateDeviceUuid();
@@ -421,10 +416,10 @@ export default function Home() {
     }
   };
 
-  // Select gas station as destination and trigger ETA calculation
+  // Select gas station as destination (출발지 100% 보존 & 목적지 단독 갱신)
   const handleSelectGasStation = (station: GasStation) => {
     const gasPreset: LocationPreset = {
-      id: `gas_${station.id}`,
+      id: 'custom_gas_station',
       name: station.name,
       shortName: station.name.replace(/주유소$/, '').trim().slice(0, 8),
       lat: station.lat,
@@ -433,7 +428,7 @@ export default function Home() {
     };
 
     setDestination(gasPreset);
-    saveRecentPreset(gasPreset);
+    setSelectionTarget('destination');
     if (origin) {
       fetchRouteEstimate(origin, gasPreset);
     }
```

---

## 3. 검증 시나리오 결과

1. **출발지 보존 및 목적지 갱신 검증**:
   - 출발지를 임의의 거점(예: '자택', '조선팰리스 강남')으로 지정하고 목적지를 '본사'로 설정한 상태에서 주유소 모달 진입.
   - 임의의 주유소에서 길안내(내비 실행) 터치 및 선택 완료.
   - **출발지**: 기존 설정된 '자택'(또는 '조선팰리스 강남')이 그대로 100% 유지됨을 확인 (절대 '현위치'로 변경되지 않음).
   - **목적지**: 선택한 주유소 명칭과 정밀 좌표(`id: 'custom_gas_station'`)로 정상 치환됨을 확인.
2. **빌드 검증**:
   - `npm run build` 결과 TypeScript 컴파일 에러 **0건**, Turbopack 최적화 빌드 완료.
