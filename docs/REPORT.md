# Protocol Cockpit (driver-eta-notifier) - 실무 2대 기능 및 인터랙션 고도화 완료 보고서

> **평가 일시**: 2026년 9월 21일  
> **대상 애플리케이션**: Protocol Cockpit (의전 드라이버 전용 스마트 관제 런처 v3.2 - TMAP 정확도 랭킹 & 롱프레스 드래그 정렬)  
> **프로덕션 라이브 URL**: [https://driver-eta-notifier.vercel.app](https://driver-eta-notifier.vercel.app)  
> **GitHub Repository**: [https://github.com/Junebooky/driver-eta-notifier.git](https://github.com/Junebooky/driver-eta-notifier.git)  

---

## 1. 실무 2대 기능 및 인터랙션 고도화 과업 달성도 평가

| 과업 항목 | 구현 상태 | 핵심 조치 및 동작 세부 사항 |
| :--- | :---: | :--- |
| **1. TMAP 검색 결과 정확도 재정렬 & 중복 Key 에러 완전 해결** | ✅ 완료 | `app/api/search/route.ts`에 4단계 검색 우선순위 정렬 알고리즘(1순위: 완전 일치, 2순위: 접두사 일치, 3순위: 포함 및 길이 근접도, 4순위: 원본 순)을 구축하여 '어린이대공원역' 등의 검색 정확도 대폭 향상. `components/CustomPresetModal.tsx`에 `key={`${poi.id \|\| 'poi'}-${index}`}` 복합 고유 키를 적용하여 React 중복 Key 콘솔 경고 완전 박멸. |
| **2. 자주 가는 목적지 롱프레스 드래그 앤 드롭 순서 변경** | ✅ 완료 | `components/PresetButtons.tsx` 및 `app/page.tsx`에 350ms 롱프레스 기반 드래그 앤 드롭 구현. 일반 탭은 딜레이 없이 즉시 출발지/목적지로 선택되고, 350ms 누르면 햅틱 진동(`navigator.vibrate(50)`) 및 `scale-105 shadow-xl ring-2 ring-[#1E60F3]` 피드백 제공. 드래그 중 다른 칩들이 유려하게 자리를 비켜주며, 드롭 시 `localStorage`(`protocol_cockpit_ordered_presets_v2`)에 영구 저장. '+ 추가' 버튼은 맨 뒤 고정. |
| **3. 프로덕션 빌드 무결성 검증 및 Git 자동 배포** | ✅ 완료 | `npm run build` 결과 TypeScript 컴파일 0 에러 (417ms 완료), `Junebooky/driver-eta-notifier` `main` 브랜치에 커밋 및 원격 푸시 완료 (Vercel 자동 배포 트리거). |

---

## 2. 세부 구현 내역 및 컴포넌트 아키텍처

### 1) TMAP 검색 결과 정확도 재정렬 및 중복 Key 해결 (`app/api/search/route.ts`, `components/CustomPresetModal.tsx`)
- **검색어 정규화 및 다단계 우선순위 정렬 (Re-ranking)**:
  - TMAP 원본 POI 응답 수신 후, 검색어와 장소명의 공백을 제거하고 소문자로 정규화(`replace(/\s+/g, '').toLowerCase()`).
  - 정렬 알고리즘:
    1. **Tier 1 (완전 일치)**: `normName === normKeyword` (예: '어린이대공원역' 검색 시 '어린이대공원역'이 무조건 최우선 배치).
    2. **Tier 2 (접두사 일치)**: `normName.startsWith(normKeyword)` (예: '어린이대공원역 7호선', '어린이대공원').
    3. **Tier 3 (키워드 포함)**: `normName.includes(normKeyword)` (검색어와의 글자 수 차이가 가장 적은 항목 우선 정렬).
    4. **Tier 4 (기타)**: 원본 TMAP API 반환 인덱스 유지.
- **React 중복 Key 경고 완전 해결**:
  - TMAP API에서 반환하는 POI 중 간혹 동일한 ID가 반환되거나 없는 경우를 대비하여 `key={`${poi.id || 'poi'}-${index}`}` 복합 고유 키를 채택하여 렌더링 안정성 확보.

### 2) 자주 가는 목적지 롱프레스 드래그 앤 드롭 순서 변경 (`components/PresetButtons.tsx`, `app/page.tsx`)
- **탭 vs 롱프레스 분리 (Zero-delay Tap)**:
  - 일반 탭: 사용자가 칩을 가볍게 누르고 떼면 350ms 타이머가 즉시 취소되고 기존과 동일하게 딜레이 없이 즉시 출발지 또는 목적지로 지정.
  - 스크롤 보호: 350ms 도달 전 10px 이상 손가락이 이동하면 스크롤 동작으로 인지하여 롱프레스 타이머 취소.
  - 롱프레스(350ms 유지 시):
    * `navigator.vibrate(50)` 및 `haptics.successPulse()` 동시 발동.
    * 해당 카드가 `scale-105 shadow-xl ring-2 ring-[#1E60F3] z-30 opacity-95 bg-white`로 활성화되어 조작 상태임을 직관적으로 표시.
- **실시간 위치 교환 (Fluid Position Swapping)**:
  - 드래그 중인 손가락/포인터가 다른 거점 카드의 바운딩 렉트(`getBoundingClientRect`) 영역에 진입하면, 배열 내 위치가 즉시 교체되며 다른 카드들이 부드러운 애니메이션(`transition-all duration-200 ease-out`)으로 자리를 비켜줌.
  - 위치 교체 시 가벼운 미세 햅틱(`navigator.vibrate(20)`) 피드백 추가.
- **영구 저장 및 고정 요소 보장**:
  - 드롭(터치 종료) 시 `onReorderPresets`를 통해 `localStorage`의 `protocol_cockpit_ordered_presets_v2` 키에 재배치된 배열이 즉시 직렬화 저장됨.
  - 새로고침이나 앱 재실행 시에도 기사가 원하는 순서가 그대로 유지됨.
  - 맨 마지막 '+ 추가' 칩은 드래그 대상에서 제외되고 항상 3열 그리드의 마지막 위치에 고정.

---

## 3. 실기기 운행 환경 검증 가이드 (Verification Checklist)

1. **TMAP 검색어 정확도 점검**:
   - '+ 추가' 버튼 터치 후 검색창에 '어린이대공원역' 입력.
   - 불필요한 원거리 관련 장소 대신 정확히 일치하는 '어린이대공원역'이 최상단 1순위로 즉시 노출되는지 확인.
   - 콘솔에 `Encountered two children with the same key` 경고가 일절 발생하지 않는지 확인.
2. **거점 일반 탭 점검**:
   - 거점 칩을 가볍게 탭했을 때 아무런 지연 없이 즉시 출발지/목적지로 지정되는지 확인.
3. **거점 롱프레스 드래그 앤 드롭 점검**:
   - 임의의 거점 칩을 약 350ms 이상 누르고 있을 때 진동 햅틱과 함께 카드가 살짝 커지며 코발트 블루 링이 표시되는지 확인.
   - 손가락을 이동했을 때 다른 칩들이 매끄럽게 자리를 비켜주는지 확인.
   - 손을 떼었을 때 변경된 순서가 유지되고, 브라우저를 새로고침해도 그 순서가 온전히 보존되는지 확인.
   - 맨 마지막 '+ 추가' 칩은 드래그되지 않고 제자리를 지키는지 확인.
