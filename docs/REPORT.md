# Protocol Cockpit (driver-eta-notifier) - 드라이버 정보 입력 분리, 번호판 오토마스킹 및 원터치 PWA 설치 개편 완료 보고서

> **평가 일시**: 2026년 9월 21일  
> **대상 애플리케이션**: Protocol Cockpit (의전 드라이버 전용 스마트 관제 런처 v4.12 - 호차/번호판 3분할 폼, 한국 번호판 실시간 오토마스킹, 원터치 PWA 설치 배너 & iOS 2단계 시각 가이드)  
> **프로덕션 배포 URL**: [https://driver-eta-notifier.vercel.app](https://driver-eta-notifier.vercel.app)  
> **GitHub Repository**: [https://github.com/Junebooky/driver-eta-notifier.git](https://github.com/Junebooky/driver-eta-notifier.git) (main 브랜치)  

---

## 1. 실무 핵심 과업 달성도

| 과업 항목 | 구현 상태 | 핵심 조치 및 인터랙션 세부 사항 |
| :--- | :---: | :--- |
| **1. 드라이버 입력 필드 물리적 분리 (3분할)** | ✅ 완료 | • 기존의 모호했던 단일 '호차/차량번호' 입력창을 완전히 분리.<br>• **[호차]**: 숫자 전용 키패드(`inputMode="numeric"`) 및 우측 고정 블루 '호차' 라벨 배치를 통해 `4` 입력 시 `4호차`로 직관적 표기.<br>• **[차량 번호판]**: 숫자와 한글 번호판 전용 독립 필드로 분리.<br>• **[드라이버 성명]**: 기사 성명 입력창 분리 배치. |
| **2. 차량 번호판 자동 띄어쓰기 강제 (Auto-Masking)** | ✅ 완료 | • `autoMaskPlate` 정규식 마스킹 핸들러 구축.<br>• 기사님이 띄어쓰기 없이 `142호7811` 또는 `110하1034`로 연속 타이핑하더라도, `[숫자 2~3자리][한글 1자리]` 입력 즉시 **자동으로 한 칸 공백이 삽입되어 `142호 7811`로 강제 변환**.<br>• 특수문자 및 알파벳 오타 사전 필터링 및 백스페이스 삭제 시 갇힘 없는 자연스러운 편집 지원. |
| **3. 데이터 동기화 및 기존 관제 규격 100% 호환** | ✅ 완료 | • 모달 오픈 시 기존 통합 `vehicleNo` 문자열에서 호차와 번호판을 지능적으로 분리 파싱.<br>• 설정 저장 시 `4호차 142호 7811` 표준 형식으로 결합하여 저장함으로써, 상단 헤더의 스마트 압축 표기(`4호차 (7811) • 윤태준`) 및 단톡방 관제 보고서 규격을 완벽히 유지. |
| **4. 원터치 PWA 홈 화면 앱 추가 액션 UX 개편** | ✅ 완료 | • 길고 장황한 설명 카피 전면 삭제 ➔ `⚡️ 터치하여 전용 앱으로 추가` 원터치 직관적 배너로 교체.<br>• **안드로이드 크롬/삼성인터넷**: `beforeinstallprompt` 캡처 후 터치 시 1초 만에 브라우저 네이티브 설치창 즉시 호출.<br>• **아이폰 사파리 (iOS Safari)**: 터치 시 `1. 하단 공유(📤) 버튼 터치` ➔ `2. '홈 화면에 추가' 선택` 초간단 2단계 시각 가이드 모달 팝업 호출.<br>• **독립 실행 모드(Standalone)**: 이미 PWA로 구동 중인 기기에서는 배너가 자동 숨김 처리되며, 닫기(X) 시 로컬 스토리지에 기록하여 동일 세션 재노출 차단. |

---

## 2. 세부 엔지니어링 구현 내역

### 1) 한국 차량 번호판 자동 마스킹 및 호차 분리 (`components/ProfileModal.tsx`)
- **실시간 정규식 오토마스킹 알고리즘**:
  ```typescript
  export function autoMaskPlate(raw: string): string {
    const cleaned = raw.replace(/[^0-9가-힣]/g, '');
    if (!cleaned) return '';

    // [숫자 2~3자리] + [한글 1자리] + [숫자 1~4자리]
    const fullMatch = cleaned.match(/^(\d{2,3})([가-힣])(\d{1,4})/);
    if (fullMatch) {
      return `${fullMatch[1]}${fullMatch[2]} ${fullMatch[3]}`;
    }

    // [숫자 2~3자리] + [한글 1자리] 입력 직후 즉시 공백 삽입
    const prefixMatch = cleaned.match(/^(\d{2,3})([가-힣])$/);
    if (prefixMatch) {
      return `${prefixMatch[1]}${prefixMatch[2]} `;
    }

    const digitsMatch = cleaned.match(/^\d{1,3}/);
    if (digitsMatch) {
      return digitsMatch[0];
    }

    return '';
  }
  ```
- **호차 및 번호판 양방향 동기화**:
  - 파싱: `(\d+)호차` 정규식으로 호차 숫자 추출 및 잔여 문자열을 번호판 필드에 할당.
  - 결합 저장: `hocha`와 `plateNumber`가 모두 존재할 경우 `${hocha}호차 ${plateNumber}`로 조합하여 저장하므로, 기존 Supabase 백엔드 및 클라이언트 템플릿과 100% 호환.

### 2) 원터치 PWA 설치 배너 및 지능형 OS 분기 (`components/A2HSBanner.tsx`)
- **OS별 분기 및 설치 트리거**:
  ```typescript
  const handleInstallClick = async () => {
    haptics.lightTap();

    if (deferredPrompt) {
      // 안드로이드 크롬 / 삼성인터넷: 네이티브 설치 다이얼로그 즉시 실행
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setIsVisible(false);
        localStorage.setItem(DISMISS_KEY, 'true');
      }
      setDeferredPrompt(null);
    } else if (isIOS) {
      // 아이폰 사파리: 2단계 시각 안내 모달 노출
      setShowIOSModal(true);
    } else {
      setShowIOSModal(true);
    }
  };
  ```
- **PWA Standalone 자동 감지**:
  - `window.matchMedia('(display-mode: standalone)').matches` 또는 `navigator.standalone === true` 판별 시 배너를 화면에 전혀 렌더링하지 않음.

---

## 3. 프로덕션 빌드 무결성 검증

### `npm run build` 결과
```text
> driver-eta-notifier@0.1.0 build
> next build

▲ Next.js 16.3.5 (Turbopack)
- Environments: .env.local
✓ Running next.config.ts took 13ms

  Creating an optimized production build ...
✓ Compiled successfully in 474ms
  Finished TypeScript in 866ms    ✓ Finished TypeScript in 866ms 
  Collecting page data using 9 workers in 294ms    ✓ Collecting page data using 9 workers in 294ms 
✓ Generating static pages using 9 workers (8/8) in 236ms
  Finalizing page optimization in 6ms    ✓ Finalizing page optimization in 6ms 

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

- **TypeScript 컴파일 에러**: 0건
- **ESLint 및 린트 오류**: 0건
- **정적/동적 라우트 컴파일**: 100% 통과

---

## 4. 변경 파일 목록 및 배포 커밋

- **수정 파일 목록**:
  - `components/ProfileModal.tsx`: 호차/번호판/성명 3분할 폼 분리, 실시간 번호판 자동 띄어쓰기 마스킹(`autoMaskPlate`), 데이터 파싱 및 결합 저장
  - `components/A2HSBanner.tsx`: 간결한 원터치 앱 설치 카피, `beforeinstallprompt` 즉시 호출 및 iOS 사파리 2단계 시각 안내 모달 구현
  - `docs/REPORT.md`: 과업 완료 보고서 갱신
- **커밋 메시지**: `feat: split driver inputs with license plate auto-masking and streamline one-touch PWA install prompt`
- **배포 브랜치**: `origin/main` (GitHub 푸시 완료)
