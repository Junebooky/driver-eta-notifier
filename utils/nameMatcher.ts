/**
 * 한글/영문 기사명 다형성 생성 엔진 (utils/nameMatcher.ts)
 * 
 * 글로벌 VIP 의전 배차표(DRIVER NAME 열)의 다양한 영문/한글 표기 방식에 대응하여
 * 기사 한글 성명으로부터 가능한 모든 표기 후보군(Candidates)을 자동 생성합니다.
 */

// 주요 성씨 로마자 매핑 테이블 (복수 표기 포함)
const SURNAME_MAP: Record<string, string[]> = {
  '윤': ['Yoon', 'Yun'],
  '김': ['Kim', 'Gim'],
  '박': ['Park', 'Bak'],
  '이': ['Lee', 'Yi', 'Rhee'],
  '정': ['Jung', 'Jeong', 'Chung'],
  '최': ['Choi', 'Choe'],
  '조': ['Cho', 'Jo'],
  '강': ['Kang', 'Gang'],
  '장': ['Jang', 'Chang'],
  '임': ['Lim', 'Im'],
  '한': ['Han'],
  '오': ['Oh', 'O'],
  '서': ['Seo', 'Suh'],
  '신': ['Shin', 'Sin'],
  '권': ['Kwon', 'Gwon'],
  '황': ['Hwang'],
  '안': ['Ahn', 'An'],
  '송': ['Song'],
  '전': ['Jeon', 'Jun', 'Chun'],
  '홍': ['Hong'],
  '유': ['Yoo', 'Yu'],
  '고': ['Ko', 'Koh', 'Go'],
  '문': ['Moon', 'Mun'],
  '양': ['Yang'],
  '손': ['Son', 'Sohn'],
  '배': ['Bae', 'Bai'],
  '백': ['Baek', 'Paik'],
  '허': ['Heo', 'Hur'],
  '남': ['Nam'],
  '심': ['Shim', 'Sim'],
  '노': ['Noh', 'Roh', 'No'],
  '하': ['Ha'],
  '곽': ['Kwak', 'Gwak'],
  '성': ['Sung', 'Seong'],
  '차': ['Cha'],
  '주': ['Joo', 'Ju'],
  '우': ['Woo', 'Wu'],
  '구': ['Koo', 'Ku', 'Gu'],
};

// 이름 음절 주요 로마자 표기 매핑
const SYLLABLE_MAP: Record<string, string[]> = {
  '태': ['Tae'],
  '준': ['Jun', 'Joon'],
  '의': ['Eui', 'Ui'],
  '전': ['Jeon', 'Jun'],
  '민': ['Min'],
  '수': ['Soo', 'Su'],
  '진': ['Jin'],
  '영': ['Young', 'Yeong'],
  '우': ['Woo', 'Wu'],
  '현': ['Hyun', 'Hyeon'],
  '성': ['Sung', 'Seong'],
  '호': ['Ho'],
  '원': ['Won'],
  '석': ['Seok', 'Suk'],
  '훈': ['Hoon', 'Hun'],
  '철': ['Chul', 'Cheol'],
  '희': ['Hee', 'Hui'],
  '동': ['Dong'],
  '혁': ['Hyuk', 'Hyeok'],
  '재': ['Jae'],
  '광': ['Kwang', 'Gwang'],
  '상': ['Sang'],
  '식': ['Sik', 'Shik'],
  '환': ['Hwan'],
  '용': ['Yong'],
  '창': ['Chang'],
  '대': ['Dae'],
  '기': ['Ki', 'Gi'],
  '섭': ['Seob', 'Sub'],
  '균': ['Kyun', 'Gyun'],
  '일': ['Il'],
  '승': ['Seung'],
  '종': ['Jong'],
  '찬': ['Chan'],
};

// 한글 음절 분해를 위한 자음/모음 기본 로마자 (Fallback)
const CHOSEONG = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'];
const JUNGSEONG = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i'];
const JONGSEONG = ['', 'k', 'k', 'ks', 'n', 'nj', 'nh', 't', 'l', 'lg', 'lm', 'lb', 'ls', 'lt', 'lp', 'lh', 'm', 'p', 'bs', 's', 'ss', 'ng', 't', 't', 'k', 't', 'p', 'h'];

export function romanizeSyllable(char: string): string[] {
  if (SYLLABLE_MAP[char]) {
    return SYLLABLE_MAP[char];
  }
  const code = char.charCodeAt(0) - 0xAC00;
  if (code < 0 || code > 11171) {
    return [char];
  }
  const cho = Math.floor(code / 588);
  const jung = Math.floor((code % 588) / 28);
  const jong = code % 28;

  let base = CHOSEONG[cho] + JUNGSEONG[jung] + JONGSEONG[jong];
  // Capitalize first letter
  if (base.length > 0) {
    base = base.charAt(0).toUpperCase() + base.slice(1);
  }
  return [base];
}

/**
 * 기사의 한글 성명으로부터 배차표에 등장할 수 있는 모든 영문/한글 표기 후보군을 생성합니다.
 * @param koreanName 한글 성명 (예: '윤태준')
 * @returns 중복 제거된 후보군 배열 (예: ['윤태준', 'Yoon Tae Jun', 'Tae Jun Yoon', 'Taejun Yoon', ...])
 */
export function generateNameCandidates(koreanName?: string): string[] {
  if (!koreanName || !koreanName.trim()) return [];

  const raw = koreanName.trim();
  const candidates = new Set<string>();

  // 1. 한글 원형
  candidates.add(raw);
  candidates.add(raw.replace(/\s+/g, ''));

  // 한글이 아닌 경우 영문 원본 정규화 추가
  if (!/^[가-힣]+$/.test(raw)) {
    candidates.add(raw.toUpperCase());
    candidates.add(raw.replace(/[\s,_-]+/g, '').toUpperCase());
    return Array.from(candidates);
  }

  // 2. 한글 성명 분석 (일반적으로 3글자: 1글자 성 + 2글자 이름, 2글자: 1글자 성 + 1글자 이름)
  const surnameChar = raw.charAt(0);
  const givenChars = raw.slice(1);

  const surnameVariants = SURNAME_MAP[surnameChar] || romanizeSyllable(surnameChar);

  // 이름 음절별 표기군
  const givenSyllableVariants: string[][] = [];
  for (let i = 0; i < givenChars.length; i++) {
    const c = givenChars.charAt(i);
    const variants = SYLLABLE_MAP[c] || romanizeSyllable(c);
    givenSyllableVariants.push(variants);
  }

  // 조합 생성
  for (const sVariant of surnameVariants) {
    if (givenSyllableVariants.length === 2) {
      for (const g1 of givenSyllableVariants[0]) {
        for (const g2 of givenSyllableVariants[1]) {
          // Eastern: Surname First (e.g. Yoon Tae Jun, Yoon Taejun, Yoon, Tae Jun, Yoon Tae-Jun)
          candidates.add(`${sVariant} ${g1} ${g2}`);
          candidates.add(`${sVariant} ${g1}${g2}`);
          candidates.add(`${sVariant}, ${g1} ${g2}`);
          candidates.add(`${sVariant}, ${g1}${g2}`);
          candidates.add(`${sVariant} ${g1}-${g2}`);

          // Western: Given name First (e.g. Tae Jun Yoon, Taejun Yoon, Tae-Jun Yoon)
          candidates.add(`${g1} ${g2} ${sVariant}`);
          candidates.add(`${g1}${g2} ${sVariant}`);
          candidates.add(`${g1}-${g2} ${sVariant}`);
        }
      }
    } else if (givenSyllableVariants.length === 1) {
      for (const g of givenSyllableVariants[0]) {
        candidates.add(`${sVariant} ${g}`);
        candidates.add(`${g} ${sVariant}`);
      }
    }
  }

  // 3. 대문자 및 공백 제거 정규화 후보군 추가
  const currentList = Array.from(candidates);
  for (const item of currentList) {
    candidates.add(item.toUpperCase());
    candidates.add(item.replace(/[\s,_-]+/g, '').toUpperCase());
  }

  return Array.from(candidates);
}

/**
 * 텍스트나 표의 기사명 셀에 대상 후보군 중 하나가 포함되어 있는지 검증
 */
export function matchDriverName(cellText: string, candidates: string[]): boolean {
  if (!cellText) return false;
  const normalizedCell = cellText.replace(/[\s,_-]+/g, '').toUpperCase();
  return candidates.some((cand) => {
    const normalizedCand = cand.replace(/[\s,_-]+/g, '').toUpperCase();
    return normalizedCell.includes(normalizedCand) || normalizedCand.includes(normalizedCell);
  });
}
