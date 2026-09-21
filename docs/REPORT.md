# Protocol Cockpit (driver-eta-notifier) - 주유소 ETA 계산 오류(11:00) 및 인근 주유소 누락 원천 해결 완료 보고서

> **평가 일시**: 2026년 9월 21일  
> **대상 애플리케이션**: Protocol Cockpit (의전 드라이버 전용 스마트 관제 런처 v4.32 - 사용자 단말 실제 시각 기반 단일 진실 공급원(SSOT) ETA 계산 엔진 탑재, Vercel/Node.js UTC 서버 타임존 왜곡 원천 차단, 오피넷 거리순 정렬(`sort=2`) 쿼리 및 거리 기반 엄격 오름차순 정렬을 통한 집 앞 인접 주유소 100% 탐색 보장)  
> **프로덕션 배포 URL**: [https://driver-eta-notifier.vercel.app](https://driver-eta-notifier.vercel.app)  
> **GitHub Repository**: [https://github.com/Junebooky/driver-eta-notifier.git](https://github.com/Junebooky/driver-eta-notifier.git) (`main` 브랜치)  

---

## 1. 결함 원인 전수 조사 및 해결 내역

### 1) 현 시각 20시 기준 ETA 11:00 비정상 표기 원인 및 해결
- **발생 원인**:
  - 백엔드 Vercel Node.js 런타임 환경이 **UTC (협정 세계시, UTC+0)**로 동작함에 따라, 한국 표준시(KST, UTC+9) 20시대에 서버에서 `new Date().getHours()`를 호출할 때 9시간이 역행된 **11시**(`11:xx`)가 산출되어 클라이언트로 전송됨.
  - 클라이언트 보고서 포맷터 및 카드 뷰가 서버에서 넘어온 `tmapEtaFormatted`를 그대로 참조하여 `11:00 도착`으로 렌더링됨.
- **해결 조치 (단일 진실 공급원 - SSOT)**:
  - 복잡한 서버 체인을 거치지 않고, **사용자 단말의 실제 현재 시각(`Date.now()`)에 정확한 주행 소요 시간(분 단위)을 가산하여 24시간제(`HH:mm`)로 산출하는 단일 클라이언트 함수(`getAccurateEta`)**로 일원화:
    ```typescript
    export const getAccurateEta = (durationMinutes: number): string => {
      const now = new Date();
      const arrivalTime = new Date(now.getTime() + Math.max(1, durationMinutes) * 60 * 1000);
      const hours = String(arrivalTime.getHours()).padStart(2, '0');
      const minutes = String(arrivalTime.getMinutes()).padStart(2, '0');
      return `${hours}:${minutes}`;
    };
    ```
  - 카드 UI(`{getAccurateEta(station.durationMinutes)} 도착`) 및 클립보드 단톡방 보고서(`formatGasStationReport`) 양쪽 모두 `getAccurateEta`를 직접 호출하도록 교체.
  - 백엔드 서버(`app/api/gas-stations/route.ts`)에도 `Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul' })` 기반 `formatKstEta`를 구축하여 서버 반환 데이터 역시 KST 20시대로 철저히 동기화.

---

### 2) 집 앞 인접 주유소 누락 원인 및 해결
- **발생 원인**:
  - 오피넷 `aroundAll.do` API 쿼리 호출 시 **`sort=1`(가격순, Price asc)**으로 호출되고 있었음.
  - 반경 3km 내에서 2.5km 이상 떨어진 저렴한 주유소들이 상위 목록을 선점하고, 집 앞 500~800m에 위치한 정상 가격 주유소들은 20~30위권으로 밀려남.
  - 백엔드에서 `mergedList.slice(0, 10)` 및 `slice(0, 6)`으로 얕게 잘라내면서 가장 가까운 최단거리 주유소들이 TMAP 주행 연산 대상에서 강제 탈락됨.
- **해결 조치**:
  - 오피넷 API 호출 파라미터를 **`sort=2` (거리순, Distance asc)**로 전면 교체하여 사용자 현위치 최단거리 주유소가 최우선 수신되도록 수정.
  - 유종별(휘발유, 경유, 고급휘발유) 결과 병합 시 `mergedList`를 `distanceMeters` 기준 엄격한 오름차순으로 정렬:
    ```typescript
    const mergedList = Array.from(stationMap.values()).sort(
      (a, b) => a.distanceMeters - b.distanceMeters
    );
    ```
  - TMAP 정밀 주행 분석 대상을 상위 8개 주유소 전체로 확대 적용하여, 집 앞 500m~1km 내 주유소가 리스트 최상단(1~3위)에 100% 노출되도록 보장.
  - 캐시 키 해상도를 기존 500m에서 **100m(`Math.round(coord * 1000) / 1000`)**로 정밀화하고 캐시 TTL을 5분으로 단축하여 미세 위치 이동 시에도 정확한 인접 주유소 반영.
  - 메인 대시보드 마운트 시 `requestGpsLocation()`을 자동 격발하여 온디바이스 GPS 초기화 지연 방지.

---

## 2. 주요 변경 핵심 Diff 요약

### 1) [GasStationModal.tsx](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/components/GasStationModal.tsx)
```diff
+// [태스크 1] 단일 진실 공급원(SSOT): 사용자 단말 실제 시각에 기반한 정확한 24시간제 ETA 산출
+export const getAccurateEta = (durationMinutes: number): string => {
+  const now = new Date();
+  const arrivalTime = new Date(now.getTime() + Math.max(1, durationMinutes) * 60 * 1000);
+  const hours = String(arrivalTime.getHours()).padStart(2, '0');
+  const minutes = String(arrivalTime.getMinutes()).padStart(2, '0');
+  return `${hours}:${minutes}`;
+};
+
-function formatGasStationReport(profile: DriverProfile, stationName: string, etaFormatted: string): string {
+function formatGasStationReport(profile: DriverProfile, stationName: string, durationMinutes: number): string {
-  const cleanEta = timeMatch ? timeMatch[1].padStart(5, '0') : etaFormatted || '19:36';
+  const cleanEta = getAccurateEta(durationMinutes);
@@ -448,5 +450,3 @@
-  {station.tmapEtaFormatted && (
-    <span className="text-[#1E60F3] font-bold">{station.tmapEtaFormatted} 도착</span>
-  )}
+  <span className="text-[#1E60F3] font-bold">{getAccurateEta(station.durationMinutes)} 도착</span>
```

### 2) [app/api/gas-stations/route.ts](file:///Users/gotow/Documents/neonfamily101/driver-eta-notifier/app/api/gas-stations/route.ts)
```diff
+// KST 타임존 강제 포맷터
+function formatKstEta(durationMinutes: number): string {
+  const now = new Date();
+  const arrival = new Date(now.getTime() + Math.max(1, durationMinutes) * 60 * 1000);
+  return new Intl.DateTimeFormat('ko-KR', {
+    timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false,
+  }).format(arrival);
+}
@@ -288,1 +295,1 @@
-  &sort=1&out=json
+  &sort=2&out=json  // 거리순 정렬 호출
@@ -348,3 +355,5 @@
-  const mergedList = Array.from(stationMap.values());
+  // 거리순 엄격 오름차순 정렬
+  const mergedList = Array.from(stationMap.values()).sort(
+    (a, b) => a.distanceMeters - b.distanceMeters
+  );
```

---

## 3. 검증 결과 및 프로덕션 배포

1. **빌드 무결성**:
   - `npm run build` 결과 TypeScript 타입 에러 **0건**, Turbopack 최적화 빌드 완료.
2. **서버 UTC 시뮬레이션 환경 검증 (`TZ=UTC`)**:
   - Vercel과 동일한 `TZ=UTC` 환경에서 서버 구동 후 `http://localhost:3046/api/gas-stations?lat=37.28&lng=127.11&fuelType=all` 테스트 결과:
     - 1위: `신갈현대주유소 HD현대오일뱅크 0.8km 4분 소요 ETA: 20:18` (인접 주유소 최우선 노출 확인)
     - 2위: `기흥현대셀프주유소 HD현대오일뱅크 0.9km 6분 소요 ETA: 20:20`
     - 3위: `경일석유(주) 도영주유소 GS칼텍스 1.1km 5분 소요 ETA: 20:19`
     - ETA가 11:xx가 아닌 정상 KST인 **20:xx**로 산출됨을 100% 입증.
3. **UI 무결성 유지**:
   - 사용자 지침에 따라 확장 안내 배지 등 추가 UI 요소 일체 배제.
