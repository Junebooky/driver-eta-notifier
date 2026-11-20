/**
 * Korean personal-name romanization suggestions (not identity verification).
 * Hangul syllable decomposition + conventional family-name options.
 * Keep approved passport/preferred English spelling untouched.
 */
const INITIAL = ['g','kk','n','d','tt','r','m','b','pp','s','ss','','j','jj','ch','k','t','p','h'];
const VOWEL = ['a','ae','ya','yae','eo','e','yeo','ye','o','wa','wae','oe','yo','u','wo','we','wi','yu','eu','ui','i'];
const FINAL = ['','k','k','ks','n','nj','nh','t','l','lk','lm','lb','ls','lt','lp','lh','m','p','ps','t','t','ng','t','t','k','t','p','t'];
const FAMILY_NAMES: Record<string,string> = {
  '김':'Kim','이':'Lee','박':'Park','최':'Choi','정':'Jung','강':'Kang',
  '조':'Cho','윤':'Yoon','장':'Jang','임':'Lim','한':'Han','오':'Oh',
  '서':'Seo','신':'Shin','권':'Kwon','황':'Hwang','안':'Ahn','송':'Song',
  '홍':'Hong','유':'Yoo','전':'Jeon','배':'Bae','백':'Baek','손':'Son',
  '남':'Nam','문':'Moon','하':'Ha','허':'Heo','고':'Ko','양':'Yang',
  '차':'Cha','노':'Roh','류':'Ryu','심':'Shim','설':'Seol','성':'Sung',
  '주':'Joo','진':'Jin','구':'Koo','변':'Byun','엄':'Eom','원':'Won',
  '민':'Min','곽':'Kwak','탁':'Tak','나':'Na','도':'Do','표':'Pyo',
  '방':'Bang','봉':'Bong','석':'Seok','금':'Geum','지':'Ji','여':'Yeo',
  '남궁':'Namgung','황보':'Hwangbo','제갈':'Jegal','선우':'Seonu','독고':'Dokgo',
};
const DOUBLE_FAMILY = ['남궁','황보','제갈','선우','독고'];

function romanizeSyllable(char:string):string {
  const code=char.charCodeAt(0)-0xac00;
  if(code<0||code>=11172)return '';
  const onset=Math.floor(code/588);
  const vowel=Math.floor((code%588)/28);
  const final=code%28;
  return INITIAL[onset]+VOWEL[vowel]+FINAL[final];
}
function capitalized(value:string):string {
  return value ? value[0].toUpperCase()+value.slice(1) : '';
}
/** Suggestions only: even a common surname has multiple valid personal spellings. */
export function suggestKoreanEnglishNames(input:string):string[] {
  const name=input.replace(/\s+/g,'').trim();
  if(!/^[가-힣]{2,6}$/.test(name))return [];
  const familySize=DOUBLE_FAMILY.some(s=>name.startsWith(s))?2:1;
  if(name.length<=familySize)return [];
  const family=name.slice(0,familySize),given=name.slice(familySize);
  const familyPreferred=FAMILY_NAMES[family]||capitalized([...family].map(romanizeSyllable).join(''));
  const familyRevised=capitalized([...family].map(romanizeSyllable).join(''));
  const givenPieces=[...given].map(romanizeSyllable);
  const givenJoined=capitalized(givenPieces.join(''));
  const givenHyphen=givenPieces.length>1 ? capitalized(givenPieces[0])+'-'+givenPieces.slice(1).join('') : givenJoined;
  // Cards currently display a given-name-first English identity.
  return [...new Set([
    givenJoined+' '+familyPreferred,
    givenHyphen+' '+familyPreferred,
    givenJoined+' '+familyRevised,
  ])].filter(Boolean);
}
