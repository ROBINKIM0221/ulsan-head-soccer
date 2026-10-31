// 울산 HD FC 유니폼. 필드 선수는 2026 시즌 4종(홈·어웨이·서드 '미드나이트 웨이브'·포스 'ULSAN 052'),
// 골키퍼 조현우는 GK 유니폼 4종(2026 홈·원정, 2025 홈·원정). 2026-10-31 형준 요청.
// 색은 공개 사진(구단 샵·나무위키·Footy Headlines)에서 뽑은 근사값. 콩알 몸에는 상의·트림 줄·등번호·반바지·운동화 다섯 색만 쓴다.
export const KITS = [
  { id: 'home',   name: '홈',     jersey: '#004098', trim: '#FFC72C', number: '#FFFFFF', shorts: '#002B6B', shoe: '#004098' },
  { id: 'away',   name: '어웨이', jersey: '#FFFFFF', trim: '#8CCBF2', number: '#004098', shorts: '#D7E1F2', shoe: '#002B6B' },
  { id: 'third',  name: '서드',   jersey: '#16213A', trim: '#CDB57C', number: '#CDB57C', shorts: '#16213A', shoe: '#0E1526' },
  { id: 'fourth', name: '포스',   jersey: '#CFD4DC', trim: '#15234A', number: '#15234A', shorts: '#15234A', shoe: '#15234A' },
];
export const GK_KITS = [
  { id: 'gk26h', name: '26 홈',  gk: true, jersey: '#D7297F', trim: '#C9DD35', number: '#FFFFFF', shorts: '#B21C66', shoe: '#1A1A1A' },
  { id: 'gk26a', name: '26 원정', gk: true, jersey: '#C8DD35', trim: '#E8368F', number: '#D7297F', shorts: '#AFC42A', shoe: '#1A1A1A' },
  { id: 'gk25h', name: '25 홈',  gk: true, jersey: '#F2B13D', trim: '#7B1E2B', number: '#7B1E2B', shorts: '#E9A530', shoe: '#1A1A1A' },
  { id: 'gk25a', name: '25 원정', gk: true, jersey: '#7A1230', trim: '#F2C230', number: '#F2C230', shorts: '#7A1230', shoe: '#1A1A1A' },
];
const ALL = [...KITS, ...GK_KITS];

export const kitById = id => ALL.find(k => k.id === id);
export const kitsFor = def => (def.position === 'GK' ? GK_KITS : KITS);

// 양쪽 유니폼. 필드용·GK용을 다 정해 두고, 그리는 순간 선수 포지션에 맞는 쪽을 입는다 (교체로 조현우가 들어와도 자연스럽게).
// 상대(AI): 내가 홈이면 어웨이, 아니면 홈. GK 는 내 것과 다른 첫 번째.
export function sideKits(kitId) {
  const mine = kitById(kitId) || KITS[0];
  const L = mine.gk ? { field: KITS[0], gk: mine } : { field: mine, gk: GK_KITS[0] };
  const R = { field: L.field === KITS[0] ? KITS[1] : KITS[0], gk: GK_KITS.find(k => k !== L.gk) };
  return { L, R };
}
export const wornKit = (kits, def) => (def.position === 'GK' ? kits.gk : kits.field);
