// 울산 HD FC 선수 12명. 수치의 출처: docs/superpowers/specs/2026-10-31-head-soccer-design.md 9절.
// kind: buff(지속) | oneshot(다음 한 방, 6초 안에 못 쓰면 소멸) | instant(즉발, 0.35초)
// gaugeRate: 게이지 충전 배율(기본 1). 필살기가 너무 세거나 약할 때 쓰는 밸런스 손잡이.
// desc: 선택 카드의 한 줄 설명. "~다"로 끝내지 않고 짧게 끊는다(감소·상승·미끄러짐; 2026-11-12 형준 "60%로 감소 뭐 이런식으로 말투 고치고"). 지속형은 화면에서 끝에 "(5초)"가 붙는다(ui/text.js specialLine).
const P = (number, name, position, role, special) =>
  ({ number, name, position, role, special, img: `img/${number}.jpg` });

export const PLAYERS = [
  P(10, '이동경', 'MF', 'attack', { id: 'laser', name: '레이저 슛', kind: 'oneshot', duration: 6,
    desc: '상대를 뚫고 날아가는 직선 슛' }),
  P(11, '에릭', 'FW', 'attack', { id: 'sprint', name: '스프린트', kind: 'buff', duration: 6,
    desc: '속도 2배, 킥 강화' }),
  P(14, '이진현', 'MF', 'attack', { id: 'curve', name: '커브 슛', kind: 'oneshot', duration: 6, gaugeRate: 0.45,   // 밸런스 2026-10-31: 커브는 거의 확정골이라 절반 속도로 찬다
    desc: '상대 머리 위로 휘어 들어가는 슛' }),
  P(15, '정승현', 'DF', 'defend', { id: 'highjump', name: '높이뛰기', kind: 'buff', duration: 8, gaugeRate: 2.0,   // 밸런스 2026-10-31 (AI 끼리 20%). 2026-11-02 형준 "게이지 속도 좀만 줄여줘": 2.6→2.0
    desc: '점프 높이 상승, 헤딩 세기 2배. 부딪힌 상대는 미끄러짐' }),
  P(19, '김영권', 'DF', 'defend', { id: 'giant', name: '거인 수비', kind: 'buff', duration: 3.5,
    desc: '몸이 커져 골문 방어. 부딪힌 상대는 미끄러짐' }),
  P(21, '조현우', 'GK', 'defend', { id: 'catch', name: '선방 캐치', kind: 'buff', duration: 5,
    desc: '머리 위로 오는 공을 잡아 멀리 던짐' }),
  P(24, '이규성', 'MF', 'defend', { id: 'magnet', name: '공 자석', kind: 'buff', duration: 6, gaugeRate: 2.0,   // 밸런스 2026-10-31. 2026-11-01 형준: 8→7초, 2026-11-12 "이규성 6초로 바꿔줘": 7→6초
    desc: '가까운 공을 발 앞으로 끌어당김' }),
  P(26, '조현택', 'DF', 'attack', { id: 'spirit', name: '투지 폭발', kind: 'buff', duration: 5,   // 2026-10-31 형준: 롱스로인 → 투지
    desc: '속도·점프 상승, 넘어지지 않음. 부딪힌 상대는 미끄러짐' }),
  P(38, '박용우', 'MF', 'defend', { id: 'press', name: '압박', kind: 'buff', duration: 5,
    desc: '상대의 속도와 점프 60%로 감소' }),
  P(55, '토마스', 'DF', 'defend', { id: 'train', name: '기관차 모드', kind: 'buff', duration: 3.0, gaugeRate: 0.75,   // 밸런스 2026-10-31: 새 물리에서 70%라 빈도로 조절. 2026-11-01 형준: 2→3초
    desc: '기차로 변신, 공과 상대를 골문으로 밀어 넣음' }),
  P(96, '최석현', 'DF', 'defend', { id: 'slide', name: '슬라이딩', kind: 'instant', duration: 0.5,   // 2026-11-02 형준: 0.35→0.5초
    desc: '미끄러지며 공을 걷어내고 상대를 넘어뜨림' }),
  P(99, '야고', 'FW', 'attack', { id: 'cannon', name: '대포 헤딩', kind: 'buff', duration: 7,
    desc: '헤딩 세기 2배. 맞은 상대는 뒤로 날아감' }),
];

export const byNumber = n => PLAYERS.find(p => p.number === n);
