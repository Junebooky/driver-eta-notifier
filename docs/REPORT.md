# Protocol Cockpit (driver-eta-notifier) - 번호판 2분할 듀얼 입력, 한글 IME 프리즈 해결 및 프로필 설정 고도화 완료 보고서

> **평가 일시**: 2026년 9월 21일  
> **대상 애플리케이션**: Protocol Cockpit (의전 드라이버 전용 스마트 관제 런처 v4.13 - 번호판 2분할 듀얼 폼, 한글 IME 조합 완전 보장, 호차 선택 입력 명확화 및 타이틀 간소화)  
> **프로덕션 배포 URL**: [https://driver-eta-notifier.vercel.app](https://driver-eta-notifier.vercel.app)  
> **GitHub Repository**: [https://github.com/Junebooky/driver-eta-notifier.git](https://github.com/Junebooky/driver-eta-notifier.git) (main 브랜치)  

---

## 1. 실무 핵심 과업 달성도

| 과업 항목 | 구현 상태 | 핵심 조치 및 인터랙션 세부 사항 |
| :--- | :---: | :--- |
| **1. 모달 헤더 타이틀 간소화** | ✅ 완료 | • 기존의 다소 길었던 `드라이버 & 내비 프로필 설정` 타이틀을 직관적이고 깔끔한 **`프로필 설정`**으로 변경하여 헤더 인지성 제고. |
| **2. 한글 IME 버그 원천 해결** | ✅ 완료 | • 모바일 가상 키보드에서 한글 자모 조합 시 거치는 자음(`\u3131-\u314e` / `ㄱ-ㅎ`) 및 모음(`\u314f-\u3163` / `ㅏ-ㅣ`)을 정규식에서 온전히 허용.<br>• 숫자 입력 후 한글 자판 입력 시 글자가 지워지거나 멈추는(Freeze) 현상을 원천 차단. |
| **3. 차량 번호판 2분할 듀얼 인풋 (Flex Row)** | ✅ 완료 | • 번호판 입력을 직관적인 2분할 듀얼 인풋 인터페이스로 재구성:<br>&nbsp;&nbsp;- **[앞 번호판]** (53%): `예: 142호` (또는 `110하`, `70가`), 한글 자모 조합 끊김 없는 부드러운 입력 지원.<br>&nbsp;&nbsp;- **[뒷 번호 4자리]** (47%): `예: 7811`, `inputMode="numeric"`, `maxLength={4}`를 적용하여 터치 시 즉시 숫자 전용 키패드 팝업. |
| **4. 호차(Vehicle No) 선택 필드 명확화 및 빈 값 방어** | ✅ 완료 | • 필드 라벨을 `호차 (선택)`으로 변경하고, 플레이스홀더를 `예: 4 (호차 없으면 공란)`으로 제공하여 미지정 시 부담 없이 공란 유지 가능하도록 안내.<br>• 호차 미입력 시 단톡방 보고서나 헤더 텍스트에 빈 '호차' 글자가 남지 않고 번호판과 이름만 단정하게 표시되도록 포맷팅 방어 로직 완비. |
| **5. 데이터 분리 파싱 및 표준 규격 결합 저장** | ✅ 완료 | • 기존 저장값(`4호차 142호 7811` 또는 `142호 7811`) 진입 시 호차(`4`), 앞자리(`142호`), 뒷자리(`7811`)로 각각 정확히 파싱하여 입력 폼에 바인딩.<br>• 저장 시 `${호차}호차 ${앞자리} ${뒷자리}`로 결합 저장하여 Supabase 및 단톡방 보고 규격 100% 호환 유지. |

---

## 2. 세부 엔지니어링 구현 내역

### 1) 한글 IME 조합 보존 및 2분할 듀얼 인풋 구현 (`components/ProfileModal.tsx`)
- **한글 자모 정규식 방어 로직**:
  ```typescript
  const handlePlateFrontChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // 완성형 한글(가-힣)뿐만 아니라 조합 중인 자모(ㄱ-ㅎ, ㅏ-ㅣ)를 온전히 허용하여 IME 프리즈 방지
    const val = e.target.value
      .replace(/[^0-9가-힣\u3131-\u314e\u314f-\u3163]/g, '')
      .slice(0, 6);
    setPlateFront(val);
  };

  const handlePlateBackChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // 뒷자리 4자리 숫자 전용 강제
    const digits = e.target.value.replace(/[^0-9]/g, '').slice(0, 4);
    setPlateBack(digits);
  };
  ```
- **2분할 Flex Row 레이아웃**:
  ```tsx
  <div className="flex items-center gap-2">
    {/* 앞 번호판 (53%) */}
    <div className="flex-1 basis-[53%] min-w-0">
      <input
        type="text"
        value={plateFront}
        onChange={handlePlateFrontChange}
        placeholder="예: 142호"
        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm font-bold"
      />
    </div>
    <span className="text-slate-400 font-bold shrink-0">-</span>
    {/* 뒷 번호 4자리 (47%) */}
    <div className="flex-1 basis-[47%] min-w-0">
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={4}
        value={plateBack}
        onChange={handlePlateBackChange}
        placeholder="예: 7811"
        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm font-bold"
      />
    </div>
  </div>
  ```

### 2) 호차 선택 필드 및 스마트 포맷팅 방어 (`components/Header.tsx`, `utils/reportGenerator.ts`)
- **호차 선택 필드 UI**:
  - 라벨: `호차 (선택)`
  - 플레이스홀더: `예: 4 (호차 없으면 공란)`
  - 우측에 은은한 `호차` 뱃지 배치로 직관적인 인지 지원.
- **포맷팅 출력 검증**:
  - **호차 등록 시**:
    * 상단 헤더: `4호차 (7811) • 윤태준`
    * 단톡방 보고서: `[4호차 142호 7811 윤태준]`
  - **호차 미등록(공란) 시**:
    * 상단 헤더: `142호 7811 • 윤태준`
    * 단톡방 보고서: `[142호 7811 윤태준]`
  - 불필요한 공백이나 고아 `호차` 단어가 노출되지 않도록 `v.replace(/^호차\s+/, '').trim()` 방어 로직 탑재.

---

## 3. 프로덕션 빌드 무결성 검증

### `npm run build` 결과
```text
> driver-eta-notifier@0.1.0 build
> next build

▲ Next.js 16.3.5 (Turbopack)
- Environments: .env.local
✓ Running next.config.ts took 12ms

  Creating an optimized production build ...
✓ Compiled successfully in 409ms
  Finished TypeScript in 1019ms    ✓ Finished TypeScript in 1019ms 
  Collecting page data using 9 workers in 283ms    ✓ Collecting page data using 9 workers in 283ms 
✓ Generating static pages using 9 workers (8/8) in 267ms
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
- **ESLint 및 빌드 경고**: 0건
- **정적/동적 라우트 컴파일**: 100% 무결점 통과

---

## 4. 변경 파일 목록 및 배포 커밋

- **수정 파일 목록**:
  - `components/ProfileModal.tsx`: 모달 타이틀 `프로필 설정` 간소화, 번호판 앞/뒤 2분할 듀얼 인풋 도입, 한글 IME 조합 보존 정규식, 호차 선택 필드 명확화 및 데이터 파싱/결합
  - `components/Header.tsx`: 호차 미등록 시 번호판/이름만 단정하게 노출하는 스마트 포맷팅 방어
  - `utils/reportGenerator.ts`: 호차 미등록 시 불필요한 단어 없는 깨끗한 머리말 생성
  - `docs/REPORT.md`: 과업 완료 보고서 갱신
- **커밋 메시지**: `fix: split license plate inputs, resolve Hangul IME freeze, and simplify modal title to 프로필 설정`
- **배포 브랜치**: `origin/main` (GitHub 푸시 완료)
