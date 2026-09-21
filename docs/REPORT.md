# Protocol Cockpit (driver-eta-notifier) - Route API 405 에러 해결 및 실시간 경로 연동 보고서

> **평가 일시**: 2026년 9월 21일  
> **대상 애플리케이션**: Protocol Cockpit (의전 드라이버 전용 스마트 관제 런처 v4.2 - Route API GET 메서드 지원 및 실시간 TMAP 교통 연동 정상화)  
> **프로덕션 배포 URL**: [https://driver-eta-notifier.vercel.app](https://driver-eta-notifier.vercel.app)  
> **GitHub Repository**: [https://github.com/Junebooky/driver-eta-notifier.git](https://github.com/Junebooky/driver-eta-notifier.git) (main 브랜치)  

---

## 1. 이슈 개요 및 핵심 진단

### 1) 발생 오류 로그
```text
[browser] Falling back to haversine estimate: Route API error 405 (app/page.tsx:318:17)
```

### 2) 근본 원인 분석 (Root Cause)
- **클라이언트 호출 방식 (`app/page.tsx:282-293`)**:
  - `fetchRouteEstimate` 함수에서 `/api/route?startX=...&startY=...&endX=...&endY=...` 형태로 쿼리 파라미터를 붙여 표준 `fetch(url)`를 호출.
  - 별도의 `method` 옵션이 지정되지 않아 브라우저는 기본값인 **`GET` 요청**을 전송함.
- **서버 API 라우트 핸들러 (`app/api/route/route.ts`)**:
  - 기존 코드에서는 오직 `export async function POST(req: NextRequest)`만 구현되어 있었음.
  - Next.js App Router는 정의되지 않은 HTTP 메서드 호출에 대해 엄격하게 **HTTP 405 (Method Not Allowed)**를 반환.
- **영향 및 부작용**:
  - 매번 거점이나 출발지를 변경할 때마다 405 에러가 발생하여 catch 블록으로 진입.
  - TMAP 실시간 교통 정보 대신 단순 직선거리 기반의 `calculateHaversineEstimate`로 강제 폴백(Fallback)되어 실제 소요 시간 및 정확한 ETA가 계산되지 못하고 콘솔 경고가 지속 누적됨.

---

## 2. 세부 엔지니어링 구현 내역

### 1) `app/api/route/route.ts` GET & POST 듀얼 메서드 완벽 지원
- **통합 경로 연산 코어 함수 (`handleRouteCalculation`) 분리**:
  - `startLat`, `startLng`, `endLat`, `endLng`을 매개변수로 받아 캐시 검사, Mock 검사, TMAP OpenAPI 호출, 실패 시 안전 폴백까지 일관되게 처리하도록 공통화.
- **GET 라우트 핸들러 추가 (`export async function GET`)**:
  - URL Query Parameters로부터 `startX`, `startY`, `endX`, `endY` 또는 `startLng`, `startLat`, `endLng`, `endLat`을 안전하게 파싱 (`searchParams.get`).
  - 클라이언트(`app/page.tsx`)의 `fetch('/api/route?startX=...&startY=...&endX=...&endY=...')` 호출을 즉시 수용하여 405 에러를 원천 차단.
- **POST 라우트 핸들러 유지 (`export async function POST`)**:
  - 기존 JSON 페이로드 기반 호출 체계와의 하위 호환성을 완벽히 유지.
  - Body 내 `startLat/startLng` 및 `startX/startY` 형태 모두 파싱 지원.

### 2) 쿼터 방어 3분 메모리 캐시 및 고가용성 폴백 유지
- **3분 캐시 시스템 (`routeCache`)**:
  - 동일한 출발지/목적지 좌표(소수점 4자리 기준 키 생성)에 대한 중복 호출 시, TMAP 쿼터를 소모하지 않고 즉시 메모리 캐시에서 응답 반환 (`isCached: true`).
  - 캐시 히트 시에도 현재 디바이스 시각에 맞추어 `etaFormatted`를 실시간 재연산하여 제공.
- **TMAP API 보안 및 타임아웃 방어**:
  - 서버 사이드 환경변수 `TMAP_API_KEY`를 서버 내부에서만 소비하여 클라이언트에 API 키가 절대 노출되지 않도록 엄격 격리.
  - 4.5초 `AbortController` 타임아웃을 적용하여 네트워크 지연 시 블로킹 없이 Haversine 추정 데이터로 우아하게 폴백 처리.

---

## 3. 검증 및 테스트 결과

### 1) API 엔드포인트 직접 호출 검증 (`curl`)
- **요청 1 (신규 요청 - 강남역 ↔ 인천공항 T1)**:
  ```bash
  curl -i "http://localhost:3034/api/route?startX=127.0425&startY=37.5042&endX=126.4512&endY=37.4495"
  ```
  - **응답 상태**: `HTTP/1.1 200 OK`
  - **응답 데이터**:
    ```json
    {
      "distanceKm": 67.6,
      "durationMinutes": 64,
      "etaFormatted": "11:55 (64분 소요)",
      "trafficSummary": "실시간 교통 반영 (TMAP)",
      "isMock": false,
      "isFallback": false,
      "isCached": false
    }
    ```
- **요청 2 (캐시 재요청)**:
  - **응답 상태**: `HTTP/1.1 200 OK`
  - **응답 데이터**: `isCached: true` 확인 (TMAP 추가 호출 없이 1ms 내 즉시 응답).

### 2) 브라우저 및 빌드 무결성 검증
- 브라우저 콘솔의 `Falling back to haversine estimate: Route API error 405` 경고 완전 소멸.
- `npm run build` 결과:
  - Turbopack 기반 9개 라우트 정상 컴파일 (TypeScript 에러 0건).
  - `/api/route`가 Dynamic Route(`ƒ`)로 정상 등록 및 서빙 확인.

---

## 4. 빌드 및 배포 내역

- **대상 저장소**: `Junebooky/driver-eta-notifier` (`main` 브랜치)
- **빌드 테스트 명령**: `npm run build` (결과: 0 error, build succeeded)
- **수정 파일**:
  - `app/api/route/route.ts`: GET/POST 듀얼 핸들러 및 쿼리 파라미터 파싱 구현
  - `docs/REPORT.md`: 에러 원인 및 엔지니어링 해결 내역 갱신
- **Git Commit**: `fix: resolve Route API 405 error by supporting GET handler and query params`
- **배포 상태**: `origin/main` 푸시 완료 (Vercel 자동 배포 트리거)
