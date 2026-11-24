## 변경

최신 A02 `fix/comprehensive-repo-audit` (`1cccdeb`) 기준으로 PR #44 (`bd1aa25`)의 카카오톡 → Excel 기능을 독립 메뉴로 통합했습니다. 기존 HQ 화면의 구조/기능을 유지하고 새 워크스페이스에 #1E60F3와 흰색·슬레이트 스타일을 적용했습니다. A01의 추출·전체 번호판 매핑·A~L 검토·중복 검사·브라우저 파일 흐름을 재사용했습니다.

Excel 저장은 전체 파일 재직렬화 대신 ZIP/XML의 대상 시트에만 행을 추가합니다. 월별 승인 템플릿이 없으면 임의 양식을 만들지 않고 확인을 요구합니다. 기간·복수 차량·익일 시각의 임의 추정을 차단하고, 확인 체크·PC 파일 외부 변경 검사·저장 후 재열기 검증을 추가했습니다. 경비 상세/신규 열/DB 저장/외부 발송은 추가하지 않았습니다.

## 검증

- 새 기능 회귀 테스트 8개 통과, 변경 파일 ESLint 통과.
- 실제 제공된 회사 Excel **사본**: `4월!A1:X468`을 보존하고 469행 A~L 영역만 추가. 기존 대상 시트의 XML 내용과 다른 모든 ZIP 문서 보존 확인. 중복·누락 월 템플릿 차단. 원본 변경 없음, 사적 장부는 커밋하지 않음.
- Chromium 실컴포넌트 1440/390px: 실제 사본 업로드→검토→추가→다운로드 통과. 다운로드 파일 보존도 독립 XML/ZIP 비교 통과. PC 파일 핸들 test double의 외부 변경 차단 및 저장/재열기 통과.
- 전체 로컬 suite **40/50 파일 통과**, 나머지 10개는 기존 HiPass/정산 경로의 `xlsx` 로딩 차단. TypeScript는 기존 xlsx 관련 TS2307 두 건. 빌드는 SheetJS/Google Fonts 네트워크 차단으로 실패. 전체 lint 470 errors/383 warnings. 완료/green CI로 주장하지 않음.
- 전체 인증 HQ E2E, 실제 OS 파일 권한 UI, Safari, Excel 데스크톱 렌더링·계산 및 OneDrive 충돌은 추가 검증 필요. DB/HTTP suite는 미실행.

검증 상세/재현: `docs/KAKAO_EXCEL_INTEGRATION_QA.md`, `scripts/verify-kakao-workbook.ts`.
스크린샷: `docs/qa/kakao-excel/desktop.png`, `mobile.png`.

이 PR은 A02 위에 쌓은 통합 Draft입니다. 의존성/네트워크 및 남은 검증을 해결하기 전 병합하지 마세요. main 병합·운영 DB 수정·배포는 수행하지 않았습니다.
