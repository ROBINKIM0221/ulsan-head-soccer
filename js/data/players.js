// 울산 HD FC 선수 12명.
// kind: buff(지속) | oneshot(다음 한 방: 슛이나 몸통 아래쪽에 맞아 나갈 때까지 기다린다. duration 은 쓰이지 않는다)
// gaugeRate: 게이지 충전 배율(기본 1). 필살기가 너무 세거나 약할 때 쓰는 밸런스 손잡이.
// desc: 선택 카드의 한 줄 설명. "~다"로 끝내지 않고 짧게 끊는다(감소·상승·미끄러짐). 지속형은 화면에서 끝에 "(5초)"가 붙는다(ui/text.js specialLine).
const P = (number, name, position, role, special) =>
  ({ number, name, position, role, special, img: `img/${number}.jpg` });

export const PLAYERS = [
  P(10, '이동경', 'MF', 'attack', { id: 'laser', name: '레이저 슛', kind: 'oneshot', duration: 6, gaugeRate: 0.53,   // 골문을 조준해 AI 끼리 슛의 대부분이 골이라 게이지를 천천히 채운다 (AI 끼리 경기당 약 1.8번)
    desc: '상대를 뚫고 날아가는 레이저 슛' }),
  P(11, '에릭', 'FW', 'attack', { id: 'sprint', name: '스프린트', kind: 'buff', duration: 6,
    desc: '속도 2배, 킥 강화' }),
  P(14, '이진현', 'MF', 'attack', { id: 'curve', name: '감아차기', kind: 'oneshot', duration: 6, gaugeRate: 0.7,   // id 는 curve(주석의 "커브 슛"). 날아가는 내내 상대를 통과해 슛의 72%가 골이라 게이지 0.7배 (AI 끼리 경기당 약 2.6번)
    desc: '상대를 뚫고 휘어 들어가는 감아차기' }),
  P(15, '정승현', 'DF', 'defend', { id: 'highjump', name: '제공권 장악', kind: 'buff', duration: 8, gaugeRate: 2.0,   // id 는 highjump(주석의 "높이뛰기")
    desc: '높은 점프, 헤딩 2배. 부딪힌 상대는 미끄러짐' }),   // 설명은 카드 칸(296px)에 한 줄로 들어가야 "(8초)"가 둘째 줄로 넘어가지 않는다 (266px)
  P(19, '김영권', 'DF', 'defend', { id: 'giant', name: '거인 수비', kind: 'buff', duration: 3.5,
    desc: '몸이 커져 골문 방어. 부딪힌 상대는 미끄러짐' }),
  P(21, '조현우', 'GK', 'defend', { id: 'catch', name: '선방 캐치', kind: 'buff', duration: 5,
    desc: '머리 위로 오는 공을 잡아 멀리 던짐' }),
  P(24, '이규성', 'MF', 'defend', { id: 'magnet', name: '볼 키핑', kind: 'buff', duration: 6, gaugeRate: 2.0,   // id 는 magnet(주석의 "공 자석"·"자석")
    desc: '가까운 공을 발 앞으로 끌어당김' }),
  P(26, '조현택', 'DF', 'attack', { id: 'spirit', name: '투지 폭발', kind: 'buff', duration: 5,
    desc: '속도·점프 상승. 부딪힌 상대는 미끄러짐' }),   // 카드에서 한 줄에 들어가게 "넘어지지 않음"은 설명에서 생략한다(효과는 있다)
  P(38, '박용우', 'MF', 'defend', { id: 'press', name: '압박', kind: 'buff', duration: 5,
    desc: '상대의 속도와 점프 60%로 감소' }),
  P(55, '토마스', 'DF', 'defend', { id: 'train', name: '기관차 모드', kind: 'buff', duration: 3.0, gaugeRate: 0.75,
    desc: '기차로 변신, 공과 상대를 골문으로 밀어 넣음' }),
  P(96, '최석현', 'DF', 'defend', { id: 'offside', name: '오프사이드 트랩', kind: 'buff', duration: 1.5,
    desc: '부심 깃발이 올라가고 상대는 그 자리에 정지' }),
  P(99, '야고', 'FW', 'attack', { id: 'cannon', name: '대포 헤딩', kind: 'buff', duration: 7,
    desc: '헤딩 세기 2배. 맞은 상대는 뒤로 날아감' }),
];

export const byNumber = n => PLAYERS.find(p => p.number === n);
