# Protocol Cockpit (driver-eta-notifier) - 프로덕션 라이브 API 통합 평가 보고서

> **평가 일시**: 2026년 9월 20일  
> **대상 애플리케이션**: Protocol Cockpit (의전 드라이버 전용 스마트 관제 런처 v2.0 - TMAP & Kakao 실시간 API 연동)  
> **프로덕션 라이브 URL**: [https://driver-eta-notifier.vercel.app](https://driver-eta-notifier.vercel.app)  
> **GitHub Repository**: [https://github.com/Junebooky/driver-eta-notifier.git](https://github.com/Junebooky/driver-eta-notifier.git)  

---

## 1. 프롬프트 요구사항 달성도 평가 (프로덕션 API 고도화)

| 요구 항목 | 구현 상태 | 동작 세부 사항 |
| :--- | :---: | :--- |
| **API 키 적용 및 Mock 해제 현황** | ✅ 완료 | `TMAP_API_KEY`, `KAKAO_REST_API_KEY`, `NEXT_PUBLIC_KAKAO_JS_KEY`, `NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY` 적용 및 `NEXT_PUBLIC_USE_MOCK=false`로 상용 모드 전환 완료. |
| **TMAP API 키 보안 프록시 아키텍처** | ✅ 완료 | `TMAP_API_KEY`가 클라이언트 번들에 노출되지 않도록 서버사이드 API 라우트(`/api/route`) 경유 구조로 일원화 (SK Open API 자동차 경로 탐색 연동). |
| **3분 쿼터 방어 캐시 (1,000건 무료 한도 보호)** | ✅ 완료 | 출발지 좌표(소수점 3자리 반올림, 약 100m 정밀도) + 목적지 좌표 기준 3분(180초) 백엔드 인메모리 캐싱 적용 (`isCached: true` 반환). |
| **지하 음영 지역 및 통신/에러 폴백 (Graceful Degradation)** | ✅ 완료 | 지하 주차장 통신 두절, 429(할당량 초과), 500 에러 시 Haversine 직선거리 기반 추정치 전환, `isFallback: true` 및 "네트워크 지연으로 추정 소요시간 표시 중" 경고 배너 표출. |
| **Kakao SDK Hydration-Safe 초기화 & 공유** | ✅ 완료 | `NEXT_PUBLIC_KAKAO_JS_KEY` 및 `NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY` 듀얼 지원, `window.Kakao.isInitialized()` 멱등성 검사 및 브라우저 네이티브 Web Share / 클립보드 복사 3단계 폴백. |
| **무결성 빌드 & Git 푸시 자동 배포** | ✅ 완료 | `npm run build` TypeScript 컴파일 0 에러 통과, `Junebooky/driver-eta-notifier`의 `main` 브랜치에 푸시하여 Vercel 자동 배포 트리거. |

---

## 2. 세부 구현 내역

### 1) API 키 적용 및 Mock 해제 현황
- **로컬 환경 (.env.local)**:
  - `NEXT_PUBLIC_USE_MOCK=false`: 기존 가상 모드를 해제하고 실제 외부 라우팅 API를 호출하도록 전환.
  - `TMAP_API_KEY`: SK Open API 콘솔 발급 키(`MkktTaZlo05KUKKl6HhrS94MdyBZIwjc46BGWPrv`)를 서버 환경 변수로 주입.
  - `KAKAO_REST_API_KEY`: `d4c9ae91e300dff950c9895baa5723db`
  - `NEXT_PUBLIC_KAKAO_JS_KEY`: `d4c9ae91e300dff950c9895baa5723db` (및 `NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY` 동시 지원)
- **Vercel 프로덕션 환경**:
  - `junebookys-projects/driver-eta-notifier` Scope의 Production, Preview, Development 전 환경에 해당 키들을 등록/동기화 완료.

### 2) 보안 프록시 및 3분 인메모리 캐싱 구현 내역
- **보안 프록시 (`app/api/route/route.ts`)**:
  - 클라이언트 브라우저에서 직접 SK TMAP API를 호출하지 않고, 내부 `/api/route` POST 핸들러에서만 `TMAP_API_KEY`를 헤더(`appKey`)에 담아 `https://apis.openapi.sk.com/tmap/routes?version=1&format=json`를 호출하도록 구성.
  - 이를 통해 브라우저 소스코드 및 네트워크 탭에서 API Key가 탈취되는 보안 취약점을 원천 차단.
- **3분 쿼터 방어 캐시**:
  - 기사의 화면 연타나 단시간 내 동일 거점 반복 선택으로 인한 일일 무료 쿼터(1,000건) 소진을 방지하기 위해 서버 인메모리 캐시(`routeCache`)를 구축.
  - 캐시 키: `(startLat.toFixed(3), startLng.toFixed(3)) -> (endLat.toFixed(3), endLng.toFixed(3))`
    - 위경도 소수점 3자리 반올림은 지표면 기준 약 100m 오차 반경에 해당하여 거점 주변 미세 위치 변화에도 캐시를 적중시킴.
  - TTL: 180초(3분). 유효 시간 내 요청 시 외부 API 호출 없이 직전 계산된 소요 시간을 즉시 반환하며, 현재 시각을 기준으로 ETA 시각 문자열을 실시간 갱신하여 반환.

### 3) 지하 음영 지역 및 에러 폴백 (Graceful Degradation) 검증
- **장애 상황 대응 설계**:
  - 지하 주차장 또는 터널 내 셀룰러 통신 두절, TMAP 서버 429 Too Many Requests (일일 한도 초과), 500 서버 장애, 4.5초 타임아웃 발생 시 catch 블록 및 비정상 응답 분기에서 `calculateHaversineEstimate`로 즉각 전환.
  - 응답 데이터에 `isFallback: true` 및 `fallbackNotice: '네트워크 지연으로 추정 소요시간 표시 중'` 플래그를 포함.
- **클라이언트 및 프론트엔드 연동**:
  - `components/RouteInfoCard.tsx`에서 `routeEstimate.isFallback` 감지 시 주황색 경고 뱃지(`[네트워크 지연으로 추정 소요시간 표시 중]`) 노출.
  - 클라이언트 브라우저 네트워크 단절 시에도 `app/page.tsx`의 fetch catch 블록에서 동일한 Haversine 추정 로직을 실행하여 앱이 중단되지 않고 예상 ETA를 지속 표시.

### 4) 'npm run build' 결과 및 깃 푸시 상태
- **빌드 검증**:
  - Next.js 16.3.5 (Turbopack) 기반 프로덕션 빌드 실행 결과:
    - TypeScript 컴파일 0 에러 (755ms)
    - Static/Dynamic 라우트 최적화 정상 완료 (`/api/route` Dynamic Route 확인)
    - Exit Code 0 (Build Success)
- **Git 푸시 및 원격 배포**:
  - 작업 대상 저장소: `Junebooky/driver-eta-notifier` (main 브랜치)
  - 커밋 메시지: `feat: integrate TMAP live routing API, 3-min quota defense cache, and graceful degradation fallback`
  - GitHub `origin/main` 푸시 완료 → Vercel Git Integration을 통해 프로덕션 자동 배포 파이프라인 트리거.

---

## 3. 잘된 점 (What Went Well)

1. **완벽한 시크릿 은닉 및 프로덕션 보안 아키텍처**:
   - TMAP API 키가 번들링 과정에서 클라이언트로 유출되는 것을 차단하고 서버사이드 프록시를 통해서만 호출되도록 격리했습니다.
2. **무료 1,000건 쿼터 세이프가드**:
   - 100m 정밀도의 3분 인메모리 캐시로 드라이버의 거점 탭 반복이나 다중 새로고침 시에도 TMAP 트래픽을 최소화했습니다.
3. **네트워크 단절 및 쿼터 초과 시 무중단 서비스**:
   - 의전 기사가 지하 2~3층 주차장에 진입하여 GPS나 통신이 불안정해지더라도 Haversine 거리 계산과 안내 문구가 작동하여 업무 보고를 지체 없이 진행할 수 있습니다.
4. **빌드 안정성 및 Vercel 환경 변수 동기화**:
   - Vercel CLI를 통해 프로덕션/프리뷰/개발 환경 변수를 사전 주입하고 빌드 타임 컴파일 오류 0건을 확인했습니다.

---

## 4. 미흡하거나 주의할 점 (Edge Cases & Limitations)

1. **Serverless 인스턴스 콜드 스타트 시 인메모리 캐시 재설정**:
   - Vercel Serverless Function 특성상 유휴 상태 후 새 컨테이너가 뜰 때 인메모리 캐시가 리셋될 수 있습니다. (추후 트래픽 증가 시 Upstash Redis 등 영속적 분산 캐시로 확장 권장).
2. **카카오 개발자 콘솔 Web 도메인 등록 필요**:
   - 카카오톡 링크 카드 공유 기능을 정식으로 사용하려면 카카오 개발자 콘솔 > 플랫폼 > Web 도메인 목록에 `https://driver-eta-notifier.vercel.app`이 등록되어 있어야 합니다. (미등록 시 브라우저 내장 공유/클립보드 복사로 자동 대체).

---

## 5. 다음 권장 점검 사항 (Next Recommendations)

1. **[운영] 카카오 개발자 콘솔 플랫폼 웹 도메인 추가**:
   - `https://driver-eta-notifier.vercel.app`을 카카오 개발자 사이트 [내 애플리케이션] > [플랫폼] > [Web]에 등록.
2. **[UI/UX] 야간 의전 운행 특화 OLED 완전 블랙 테마**:
   - 야간 VIP 수송 시 운전자의 전방 시야 방해를 최소화하기 위한 순수 블랙(OLED Pure Black, `#000000`) 토글 모드 추가.
3. **[성능] 분산 캐시 레이어 (Upstash Redis) 고려**:
   - 다수의 차량 드라이버가 동시 운행할 경우를 대비하여 서버리스 인스턴스 간 캐시 공유가 가능한 분산 Redis 도입 검토.
