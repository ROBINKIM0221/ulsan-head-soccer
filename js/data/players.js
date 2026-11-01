// 울산 HD FC 선수 12명. 수치의 출처: docs/superpowers/specs/2026-10-31-head-soccer-design.md 9절.
// kind: buff(지속) | oneshot(다음 한 방, 6초 안에 못 쓰면 소멸) | instant(즉발, 0.35초)
// gaugeRate: 게이지 충전 배율(기본 1). 필살기가 너무 세거나 약할 때 쓰는 밸런스 손잡이.
const P = (number, name, position, role, special) =>
  ({ number, name, position, role, special, img: `img/${number}.jpg` });

export const PLAYERS = [
  P(10, '이동경', 'MF', 'attack', { id: 'laser', name: '레이저 슛', kind: 'oneshot', duration: 6,
    desc: '번개 같은 직선 슛, 상대를 그대로 뚫고 지나간다' }),
  P(11, '에릭', 'FW', 'attack', { id: 'sprint', name: '스프린트', kind: 'buff', duration: 6,
    desc: '두 배로 빨라지고 달리는 기세로 킥이 세진다' }),
  P(14, '이진현', 'MF', 'attack', { id: 'curve', name: '커브 슛', kind: 'oneshot', duration: 6, gaugeRate: 0.45,   // 밸런스 2026-10-31: 커브는 거의 확정골이라 절반 속도로 찬다
    desc: '상대 머리 위로 휘어 넘어가 골문 구석에 떨어진다' }),
  P(15, '정승현', 'DF', 'defend', { id: 'highjump', name: '높이뛰기', kind: 'buff', duration: 8, gaugeRate: 2.6,   // 밸런스 2026-10-31 (AI 끼리 20%)
    desc: '더 높이 뛰고 헤딩은 두 배, 부딪힌 상대는 미끄러진다' }),
  P(19, '김영권', 'DF', 'defend', { id: 'giant', name: '거인 수비', kind: 'buff', duration: 3.5,
    desc: '몸이 거대해져 골문을 막아서고, 부딪힌 상대는 미끄러진다' }),
  P(21, '조현우', 'GK', 'defend', { id: 'catch', name: '선방 캐치', kind: 'buff', duration: 5,
    desc: '머리 위로 넘어가는 공을 낚아채 멀리 던진다' }),
  P(24, '이규성', 'MF', 'defend', { id: 'magnet', name: '공 자석', kind: 'buff', duration: 8, gaugeRate: 2.0,   // 밸런스 2026-10-31
    desc: '가까이 온 공이 발밑으로 끌려온다' }),
  P(26, '조현택', 'DF', 'attack', { id: 'spirit', name: '투지 폭발', kind: 'buff', duration: 5,   // 2026-10-31 형준: 롱스로인 → 투지
    desc: '빠르고 높게 뛰며 넘어지지 않고, 부딪힌 상대는 미끄러진다' }),
  P(38, '박용우', 'MF', 'defend', { id: 'press', name: '압박', kind: 'buff', duration: 5,
    desc: '상대의 발이 무거워져 속도와 점프가 60%로 떨어진다' }),
  P(55, '토마스', 'DF', 'defend', { id: 'train', name: '기관차 모드', kind: 'buff', duration: 3.0, gaugeRate: 0.75,   // 밸런스 2026-10-31: 새 물리에서 70%라 빈도로 조절. 2026-11-01 형준: 2→3초
    desc: '증기기관차로 변신해 공과 상대를 한꺼번에 골문으로 밀어 넣는다' }),
  P(96, '최석현', 'DF', 'defend', { id: 'slide', name: '슬라이딩', kind: 'instant', duration: 0.35,
    desc: '미끄러지며 공을 걷어내고 부딪힌 상대를 넘어뜨린다' }),
  P(99, '야고', 'FW', 'attack', { id: 'cannon', name: '대포 헤딩', kind: 'buff', duration: 7,
    desc: '헤딩이 두 배로 세지고 맞은 상대는 뒤로 날아간다' }),
];

export const byNumber = n => PLAYERS.find(p => p.number === n);
