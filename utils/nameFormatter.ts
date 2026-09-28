export interface AbbreviationResult {
  primary: string; // 기본 채움값 (최대 8자)
  candidates: string[]; // 추천 칩 목록 (최대 8자, 중복 제외)
}

/**
 * Generates smart display names and 2~3 candidate abbreviation chips
 * preserving key location identifiers (e.g. T1/T2, exit numbers) within 8 characters.
 */
export function generateSmartDisplayName(fullName: string): AbbreviationResult {
  const name = fullName.trim();
  if (!name) {
    return { primary: '', candidates: [] };
  }

  const candidates: string[] = [];

  // 1단계: 공항 터미널 및 교통 거점 정규화
  // 예: "인천국제공항 제2여객터미널" -> "인천공항 T2", "인천공항 제1여객터미널" -> "인천공항 T1"
  // 예: "김포국제공항 국내선" -> "김포공항 국내", "김포공항 국제선" -> "김포공항 국제"
  // 예: "광교중앙역 신분당선 1번출구" -> "광교중앙역 1번"
  const normalized = name
    .replace(/인천국제공항/g, '인천공항')
    .replace(/김포국제공항/g, '김포공항')
    .replace(/제([1-2])여객터미널/g, 'T$1')
    .replace(/제([1-2])터미널/g, 'T$1')
    .replace(/국내선/g, '국내')
    .replace(/국제선/g, '국제')
    .replace(/\((.*?)\)/g, '') // 괄호 안 부가 정보 제거
    .replace(/\s*(신분당선|수인분당선|경의중앙선|1호선|2호선|3호선|4호선|5호선|7호선|9호선|공항철도)\s*/g, ' ')
    .replace(/([0-9]+)번\s*출구/g, '$1번')
    .replace(/\s+/g, ' ')
    .trim();

  // 2단계: 어절 단위(단어 경계) 분리 및 후보 생성
  const words = normalized.split(/\s+/).filter(Boolean);

  // 후보 A: 첫 번째 어절이 8자 이내인 경우 (예: "포시즌스호텔 서울" -> "포시즌스호텔")
  if (words[0] && words[0].length <= 8) {
    candidates.push(words[0]);
  }

  // 후보 B: 터미널이나 출구가 포함된 결합형 (예: "인천공항 T2", "광교중앙역 1번")
  if (words.length >= 2) {
    const combined = `${words[0]} ${words[1]}`;
    if (combined.length <= 8) {
      candidates.unshift(combined); // 결합형을 최우선으로 배치
    }
  }

  // 후보 C: 단일 긴 단어의 경우 8자에서 안전하게 자름
  if (candidates.length === 0) {
    candidates.push(normalized.slice(0, 8));
  }

  // 원본의 앞 8자도 필요 시 대안 후보로 등록 (중복 제거)
  const rawSliced = name.replace(/\s+/g, ' ').slice(0, 8).trim();
  if (rawSliced.length > 0) {
    candidates.push(rawSliced);
  }

  const uniqueCandidates = Array.from(new Set(candidates))
    .map((c) => c.slice(0, 8).trim())
    .filter(Boolean)
    .slice(0, 3);

  return {
    primary: uniqueCandidates[0] || name.slice(0, 8),
    candidates: uniqueCandidates,
  };
}
