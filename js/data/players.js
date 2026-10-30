// 울산 HD FC 선수 12명. 수치의 출처: docs/superpowers/specs/2026-10-31-head-soccer-design.md 9절.
// kind: buff(지속) | oneshot(다음 한 방, 6초 안에 못 쓰면 소멸) | instant(즉발, 0.35초)
const P = (number, name, position, role, special) =>
  ({ number, name, position, role, special, img: `img/${number}.jpg` });

export const PLAYERS = [
  P(10, '이동경', 'MF', 'attack', { id: 'laser', name: '레이저 슛', kind: 'oneshot', duration: 6,
    desc: '다음 킥이 번개처럼 직선으로 날아가 상대 몸을 뚫고 지나간다' }),
  P(11, '에릭', 'FW', 'attack', { id: 'sprint', name: '스프린트', kind: 'buff', duration: 5,
    desc: '5초 동안 이동 속도가 두 배 가까이 빨라진다' }),
  P(14, '이진현', 'MF', 'attack', { id: 'curve', name: '커브 슛', kind: 'oneshot', duration: 6,
    desc: '다음 킥이 상대 머리 위로 크게 휘어 골문 구석으로 떨어진다' }),
  P(15, '정승현', 'DF', 'defend', { id: 'highjump', name: '높이뛰기', kind: 'buff', duration: 5,
    desc: '5초 동안 점프가 훨씬 높아져 공중볼을 전부 따낸다' }),
  P(19, '김영권', 'DF', 'defend', { id: 'giant', name: '거인 수비', kind: 'buff', duration: 5,
    desc: '5초 동안 몸이 두 배 가까이 커져 골문 앞을 막는다' }),
  P(21, '조현우', 'GK', 'defend', { id: 'catch', name: '선방 캐치', kind: 'buff', duration: 5,
    desc: '5초 동안 머리 위로 넘어가는 공을 손으로 잡아 멀리 던진다' }),
  P(24, '이규성', 'MF', 'defend', { id: 'magnet', name: '공 자석', kind: 'buff', duration: 5,
    desc: '5초 동안 가까운 공이 자기 쪽으로 끌려온다' }),
  P(26, '조현택', 'DF', 'attack', { id: 'longthrow', name: '롱스로인', kind: 'oneshot', duration: 6,
    desc: '다음 터치 때 공을 집어 상대 골문 앞으로 높고 멀리 던진다' }),
  P(38, '박용우', 'MF', 'defend', { id: 'press', name: '압박', kind: 'buff', duration: 5,
    desc: '5초 동안 상대의 이동 속도와 점프가 60%로 떨어진다' }),
  P(55, '토마스', 'DF', 'defend', { id: 'train', name: '기관차 모드', kind: 'buff', duration: 3,
    desc: '3초 동안 증기기관차가 되어 공과 상대를 한꺼번에 골문으로 밀어 넣는다' }),
  P(96, '최석현', 'DF', 'defend', { id: 'slide', name: '슬라이딩', kind: 'instant', duration: 0.35,
    desc: '앞으로 미끄러지며 공을 걷어내고 부딪힌 상대를 넘어뜨린다' }),
  P(99, '야고', 'FW', 'attack', { id: 'cannon', name: '대포 헤딩', kind: 'buff', duration: 5,
    desc: '5초 동안 헤딩이 두 배로 세지고 맞은 상대는 뒤로 밀려난다' }),
];

export const byNumber = n => PLAYERS.find(p => p.number === n);
