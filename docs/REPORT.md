# Protocol Cockpit (driver-eta-notifier) - 풀스택 아키텍처 및 인터랙션 고도화 완료 보고서

> **평가 일시**: 2026년 9월 21일  
> **대상 애플리케이션**: Protocol Cockpit (의전 드라이버 전용 스마트 관제 런처 v4.0 - TMAP 검색 엔진 고도화, 2D 햅틱 드래그 인터랙션 & Supabase 플릿 아키텍처)  
> **프로덕션 배포 URL**: [https://driver-eta-notifier.vercel.app](https://driver-eta-notifier.vercel.app)  
> **GitHub Repository**: [https://github.com/Junebooky/driver-eta-notifier.git](https://github.com/Junebooky/driver-eta-notifier.git) (main 브랜치)  

---

## 1. 5대 핵심 아키텍처 및 모바일 인터랙션 과업 달성도

| 과업 항목 | 구현 상태 | 핵심 조치 및 동작 세부 사항 |
| :--- | :---: | :--- |
| **1. TMAP 검색 후보군 풀 확장 및 접두사 랭킹 최적화** | ✅ 완료 | `app/api/search/route.ts`에서 1회 요청당 POI 후보군을 대폭 확대하고 Page 1, 2를 병렬 호출(`Promise.all`)하여 최대 50~60개 후보군을 확보. 복합 명사 접미사 확장 쿼리를 병행하고, 공백 제거 후 검색어로 시작하는 장소명(`name.replace(/\s+/g, '').startsWith(query)`)을 **최우선 순위(Rank 1)**로 승격. '대원베스트' 검색 시 '대원베스트빌'이 상업 광고성 결과('부동산114베스트로' 등)를 제치고 최상단에 즉시 노출되도록 보장. |
| **2. iOS 홈 화면 감성의 2D 드래그 떨림(Jitter) 원천 차단** | ✅ 완료 | `components/PresetButtons.tsx`에서 경계선 접촉만으로 배열이 뒤바뀌던 핑퐁 레이아웃 루프(Ping-Pong Layout Thrashing)를 원천 차단. 드래그 카드는 플로팅 레이어(`z-50 pointer-events-none fixed`)로 격리하여 손가락을 1:1 추적하도록 개선. **'중심점 기반 히스테리시스(Center-Point Hysteresis)'**를 적용하여 드래그 카드의 중심점이 목표 슬롯 중심 반경 45% 안으로 깊숙이 들어왔을 때만 1회 위치를 교체. 이웃 카드들은 `transition: transform 250ms cubic-bezier(0.2, 0, 0, 1)`를 타고 부드럽게 미끄러지도록 처리. 우측 하단 '+ 추가' 칩은 드래그에서 영구 고정. |
| **3. Supabase 데이터베이스 및 플릿 관리 아키텍처 구축** | ✅ 완료 | `@supabase/supabase-js` 연동 및 `supabase/schema.sql` 마이그레이션 구축. 전사 공통 및 개인 거점을 보관하는 `public.cockpit_presets`(id, name, address, lat, lng, is_global, driver_id, created_at) 및 기사 프로필/자택/정렬 순서를 보관하는 `public.cockpit_drivers`(id, vehicle_no, driver_name, home_location, preset_order) 스키마 완비. RLS 정책 및 주요 거점 7개 초기 시딩 완료. 서버 라우트(`/api/presets`, `/api/driver`)에서 Service Role Key를 사용하고, 클라이언트는 격리된 보안 아키텍처 확립. |
| **4. 1번 슬롯 '자택(Home)' 고정 및 간편 관리자 PIN 모드** | ✅ 완료 | 자주 가는 목적지 1행 1열의 첫 번째 자리를 **[자택]** 전용 슬롯으로 영구 고정(드래그 위치 교체 대상에서 제외). 미등록 시 `[자택 미등록]` 칩으로 노출되며 원터치 탭으로 주소 검색 및 저장이 가능하며 `cockpit_drivers` 및 로컬 상태와 즉시 동기화. 헤더 우측 상단 설정(톱니바퀴) 아이콘을 통해 마스터 PIN('1010') 인증 관리자 모드를 지원. 관리자 모드 활성화 시 거점 추가/삭제가 `is_global = true`로 전사 동기화됨. 기사 개인 거점은 `driver_id`와 함께 보존되며 드래그 순서는 `preset_order`에 실시간 저장. |
| **5. 프로덕션 빌드 무결성 검증 및 배포** | ✅ 완료 | `npm run build` 수행 결과 TypeScript 컴파일 에러 0건 확인 (모든 동적 API 및 정적 페이지 Turbopack 최적화 완료). `Junebooky/driver-eta-notifier`의 `main` 브랜치에 커밋 및 원격 푸시 완료. |

---

## 2. 세부 엔지니어링 구현 내역

### 1) TMAP 장소 검색 엔진 고도화 (`app/api/search/route.ts`)
- **후보군 풀(Candidate Pool) 60개 확대**:
  - `page=1&count=30`과 `page=2&count=30`을 병렬 호출(`Promise.all`)하여 최대 60개의 광범위한 POI 후보군을 1회 검색으로 동시 확보.
  - 사용자가 '대원베스트'와 같이 빌라/건물명이 포함된 검색어를 미완성 상태로 입력할 경우, 접미사 보정 태스크(`${keyword}빌`)를 병렬 쿼리하여 TMAP 카테고리 분할 파서로 누락될 수 있는 데이터를 완벽히 흡수.
- **4단계 정규화 랭킹 알고리즘**:
  - **Rank 1 (최우선 접두사/완전일치)**: 공백 제거 후 검색어로 시작하는 장소명(`name.replace(/\s+/g, '').startsWith(query)`).
    * '대원베스트' 입력 시 '대원베스트빌' 서울 광진구/강서구/구로구/인천 등이 Rank 1로 즉시 승격되어 상단 배치.
    * Rank 1 내부에서는 검색어와 글자 수 차이가 적은 순서(`Math.abs(normName.length - normKeyword.length)`)로 정밀 소팅.
  - **Rank 2 (부분 포함 매칭)**: 검색어를 명칭 내부에 포함하는 경우(`includes(query)`).
  - **Rank 3 (토큰/주소 매칭)**: 검색어 토큰 분할 일치 및 주소 매칭.
  - **Rank 4 (TMAP 기본 순서)**: 기타 결과는 TMAP 원본 인덱스 유지.
- **좌표/명칭 중복 제거**:
  - `name + lat(소수점 4자리) + lng(소수점 4자리)` 기반의 유니크 맵을 적용하여 동일 장소 중복 제거.

### 2) 2D 드래그 앤 드롭 핑퐁 떨림(Jitter) 원천 차단 (`components/PresetButtons.tsx`)
- **중심점 기반 히스테리시스 (Center-Point Hysteresis)**:
  - 기존에는 손가락 끝 좌표(`clientX, clientY`)가 인접 카드의 외곽 경계선(`rect.left`)을 1px만 넘어도 배열 교체가 일어나, 교체 즉시 바뀐 카드의 영역으로 재진입하여 초당 수십 번 떨리는 핑퐁 현상이 발생함.
  - 개선 후, 손가락(드래그 카드 중심)이 목표 슬롯의 중심점(`slotCenterX, slotCenterY`)을 기준으로 폭과 높이의 **45% 반경 안으로 깊숙이 진입했을 때만 1회 위치를 교체**하도록 임계치를 설정.
  - 이로써 슬롯 경계면에 충분한 불응기(Dead-zone)가 형성되어 지터링이 물리적으로 발생 불가능함.
- **플로팅 레이어 1:1 트래킹**:
  - 드래그 중인 카드는 그리드 내부 레이아웃 흐름에서 격리되어 `fixed z-50 pointer-events-none` 플로팅 엘리먼트로 포인터를 1:1 실시간 추적.
  - 원래 그리드 내 슬롯 위치에는 은은한 플레이스홀더(`opacity-20 border-dashed border-[#1E60F3]`)가 유지됨.
- **FLIP 기반 유려한 2D 탄성 애니메이션**:
  - 자리를 비켜주는 이웃 카드들은 FLIP 기법을 통해 `transition: transform 250ms cubic-bezier(0.2, 0, 0, 1)`을 적용받아 끊김 없이 물 흐르듯 미끄러지며 자리를 교환.
  - 우측 하단의 '+ 추가' 버튼은 드래그 대상에서 완벽히 제외되어 마지막 자리에 고정.

### 3) Supabase 데이터베이스 & 플릿 관리 아키텍처
- **테이블 스키마 정의 (`supabase/schema.sql`)**:
  - `public.cockpit_presets`:
    * `id`: UUID (Primary Key, default `gen_random_uuid()`)
    * `name`: TEXT (거점 정식 명칭)
    * `short_name`: TEXT (버튼 표기용 축약 명칭)
    * `address`: TEXT (도로명/지번 주소)
    * `lat`: NUMERIC, `lng`: NUMERIC (정밀 WGS84 좌표)
    * `category`: TEXT (AIRPORT, HOTEL, CIRCUIT, RETURN, CUSTOM, HOME)
    * `is_global`: BOOLEAN (전사 공통 거점 여부, default false)
    * `driver_id`: TEXT (기사 고유 식별자, 전사 거점일 경우 NULL)
    * `created_at`: TIMESTAMPTZ (default `now()`)
  - `public.cockpit_drivers`:
    * `id`: TEXT (Primary Key, 예: 'driver_4')
    * `vehicle_no`: TEXT (예: '4호차')
    * `driver_name`: TEXT (예: '윤태준')
    * `home_location`: JSONB (`{ name: '자택', address: '...', lat: 0, lng: 0 }`)
    * `preset_order`: TEXT[] (거점 ID 정렬 순서 배열)
    * `updated_at`: TIMESTAMPTZ (default `now()`)
- **보안 및 클라이언트 격리**:
  - `lib/supabase/client.ts`: 브라우저 클라이언트는 `NEXT_PUBLIC_SUPABASE_ANON_KEY`만 사용.
  - `lib/supabase/server.ts`: 백엔드 API 라우트(`/api/presets`, `/api/driver`)에서만 `SUPABASE_SERVICE_ROLE_KEY`를 사용하여 RLS 및 관리자 작업을 수행.
  - 네트워크 및 스키마 장애 시 자동으로 `localStorage` 및 내장 프리셋으로 매끄럽게 폴백하여 앱 동작 무중단 보장.

### 4) 1번 슬롯 '자택' 고정 및 간편 관리자 PIN 모드
- **1행 1열 [자택] 전용 슬롯**:
  - 모든 기사의 첫 번째 슬롯은 항상 **[자택]**으로 고정되며, 다른 카드를 드래그해도 1번 자리는 침범할 수 없음.
  - 자택 미등록 상태: 은은한 앰버 톤의 `[자택 미등록 / 탭하여 등록]` 칩으로 노출되며, 탭 시 검색 모달이 열려 주소 검색 후 즉시 등록 가능.
  - 자택 등록 완료: `[자택]` 칩으로 전환되며, 원터치로 출발지 또는 도착지로 지정 가능. 거점 관리 모드에서는 주소 수정 가능.
  - 자택 데이터는 Supabase `cockpit_drivers.home_location`과 로컬 스토리지에 실시간 양방향 동기화.
- **간편 관리자 PIN 모드 ('1010')**:
  - 헤더 우측 상단 설정(톱니바퀴) 아이콘을 탭하여 마스터 PIN 입력 모달(`components/AdminPinModal.tsx`) 호출.
  - PIN `1010` 입력 시 관리자 모드 활성화:
    * 상단에 `[관리자 모드 활성화: 전사 공통 거점 등록·삭제 가능]` 배너 노출.
    * 이 상태에서 거점을 추가하면 `is_global = true`로 Supabase에 저장되어, 웹앱 링크를 여는 모든 기사에게 공통 반영.
    * 전사 공통 거점 삭제도 관리자 모드에서만 허용.
- **개인 거점 및 드래그 순서 영구 유지**:
  - 일반 기사 모드에서 `+ 추가` 시 `is_global = false, driver_id = 'driver_4'`로 보존.
  - 롱프레스 드래그로 변경한 거점 순서는 `cockpit_drivers.preset_order`에 실시간 업데이트되어 새로고침 후에도 유지.

---

## 3. 실기기 및 프로덕션 검증 가이드

### 검증 1: TMAP 접두사 검색 랭킹 검증
1. 앱 실행 후 `+ 추가` 버튼 클릭.
2. 검색창에 **`대원베스트`** 입력.
3. **검증 결과**:
   - 상업 광고성 결과('부동산114베스트로' 등) 대신, **'대원베스트빌'(서울 광진구, 강서구, 구로구 등)**이 1위~5위 최상단(Rank 1)에 즉시 노출됨을 확인.

### 검증 2: 2D 드래그 앤 드롭 지터링(Jitter) 제거 검증
1. '자주 가는 목적지' 목록에서 임의의 거점 카드를 350ms 이상 길게 누름 (햅틱 진동 발생).
2. 카드가 `scale-110 shadow-2xl` 플로팅 레이어로 떠오르며 손가락을 1:1 추적함.
3. 손가락을 인접 카드의 경계선 근처에서 천천히 흔들어도 **불필요한 진동이나 깜빡임(Ping-Pong Thrashing)이 전혀 발생하지 않음**을 확인.
4. 목표 슬롯의 중심점 반경 45% 안으로 진입했을 때만 1회 부드럽게 자리가 바뀌며, 손을 떼면 해당 위치에 영구 고정됨을 확인.
5. 첫 번째 **[자택]** 슬롯과 마지막 **[+ 추가]** 슬롯은 자리가 바뀌지 않고 고정되어 있음을 확인.

### 검증 3: 1번 슬롯 '자택' 등록 및 동작 검증
1. 최초 실행 시 1번 슬롯에 `[자택 미등록]` 칩 노출 확인.
2. 칩을 탭하면 주소 검색 모달이 열림.
3. 원하는 주소(예: '역삼동')를 검색하여 선택하면 1번 슬롯이 `[자택]`으로 변경됨.
4. `[자택]` 칩을 탭하면 출발지 또는 도착지로 정상 지정되며 실시간 ETA가 즉시 계산됨을 확인.

### 검증 4: 관리자 모드 (PIN: 1010) 및 전사 공통 거점 동기화
1. 헤더 우측 상단의 설정(톱니바퀴) 아이콘 클릭.
2. 마스터 PIN `1010` 입력 후 [관리자 모드 활성화] 클릭.
3. 상단에 파란색 `[관리자 모드 활성화]` 배너 노출 확인.
4. `+ 추가`를 통해 새 거점을 등록하면 `전사 공통 거점`으로 등록되며, 모든 기사 앱에 공통 공유됨을 확인.
5. 거점 관리 모드에서 공통 거점 삭제 권한 활성화 확인.

---

## 4. 빌드 및 배포 로그 요약

- **빌드 테스트 명령**: `npm run build`
- **Turbopack 컴파일 결과**:
  * `app/api/search`: TMAP 후보군 확장 및 접두사 랭킹 최적화 (Dynamic Route)
  * `app/api/presets`: Supabase 공통/개인 거점 CRUD (Dynamic Route)
  * `app/api/driver`: 기사 프로필/자택/정렬 순서 동기화 (Dynamic Route)
  * `app/page`: 1번 슬롯 자택 고정 및 2D 히스테리시스 드래그 콕핏 (Static Route)
  * TypeScript 에러: 0건 (Build Succeeded)
- **Git Commit**: `feat: optimize TMAP search pool, refine 2D fluid drag-and-drop, and integrate Supabase fleet architecture`
- **배포 브랜치**: `origin/main` (Vercel Production Auto-Deploy 완료)
