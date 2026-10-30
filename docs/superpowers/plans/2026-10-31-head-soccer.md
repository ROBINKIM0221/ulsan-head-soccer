# ULSAN HD FC 일대일축구 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 울산 HD FC 선수 12명으로 AI 와 1대1 헤드 사커를 하는 정적 웹 게임(GitHub Pages)을 만든다.

**Architecture:** 물리·경기 규칙·필살기·AI 는 DOM 을 전혀 모르는 순수 ES 모듈(`js/sim/`)로 만들어 Node 의 `node --test` 로 검증하고, 같은 모듈을 셀프 플레이 밸런스 스크립트에서 재사용한다. 브라우저 쪽(`js/render/`, `js/ui/`, `js/main.js`)은 그 상태를 캔버스에 그리고 입력을 모으기만 한다. 고정 시간 간격 1/120초 물리 + rAF 렌더.

**Tech Stack:** HTML5 Canvas 2D, 바닐라 JS(ES modules, 빌드 없음), CSS. 글꼴 Pretendard(jsdelivr)·Teko(Google Fonts). 테스트 Node 24 `node --test` + `node:assert`. 화면 검증은 Playwright(`C:/Users/robin/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright`, `chromium.launch({channel:'chrome'})`). 사진 오려내기 PowerShell System.Drawing.

**Spec:** `docs/superpowers/specs/2026-10-31-head-soccer-design.md` — 수치의 출처는 전부 이 문서다. 이 계획에 적힌 숫자와 설계서가 다르면 설계서가 맞다.

## Global Constraints

- 정적 파일만. 외부 라이브러리 없음. 글꼴 CDN 만 허용, 글꼴 실패 시 시스템 글꼴로 동작.
- 캔버스 논리 해상도 1280×720. 바닥 y=640. 좌우 골문 안쪽 폭 80, 골대 높이 230, 크로스바 두께 10.
- 색: 블루 `#004098`, 네이비 `#002B6B`, 골드 `#FFC72C`, 흰색, 보조 `#B9CBE8`. UI 에 빨강 금지(관중석 띠만).
- 글꼴: UI Pretendard 800/700/600, 숫자 Teko 600.
- 항상 가로. 세로 뷰포트면 최상위 래퍼를 90° 회전. 가로 안내 화면 없음(2초 힌트만).
- 플레이어 왼쪽(`'L'`), AI 오른쪽(`'R'`).
- 실제 캐릭터·상표 그림 금지(기차는 일반 파란 증기기관차).
- 게임 이름 "ULSAN HD FC 일대일축구". 저장소 `ulsan-head-soccer`.
- 커밋 메시지 끝에 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` (앞 두 게임과 같은 형식).

## Review Focus

설계서가 말하지 않지만 실제 플레이어가 반드시 만나는 입력. 각 줄의 테스트는 해당 태스크에 들어 있다.

1. 공이 선수와 벽·골포스트 사이에 끼었을 때 — 0.5초 안에 빠져나와야 한다. (Task 2 `physics.test.js` "ball wedged between player and wall escapes")
2. 폰에서 ◀ 를 누른 채 점프를 탭하는 두 손가락 입력 — 둘 다 동시에 먹어야 한다. (Task 9 Playwright "multitouch move+jump")
3. 탭을 백그라운드로 보냈다 돌아왔을 때 — 시계가 한꺼번에 뛰거나 공이 순간이동하면 안 된다. (Task 9 `loop.test.js` "accumulator caps at 0.25s")
4. 세로 뷰포트(인스타 인앱)에서 회전된 버튼을 탭했을 때 — 눌린 자리의 버튼이 실제로 반응해야 한다. (Task 9 Playwright "rotated tap hits jump button")
5. 게이지가 100 이 아닐 때 필살기, 이미 쓴 교체 버튼, 발동 중 재발동 — 모두 무시되고 상태가 변하지 않아야 한다. (Task 4 `match.test.js` "special ignored when gauge < 100", "second substitution ignored"; Task 5 "activate while active is ignored")

---

## Shared Interfaces (모든 태스크가 공유하는 이름)

파일별 책임과, 태스크 사이에서 호출하는 정확한 이름. 이 절에 없는 이름을 다른 태스크가 쓰면 버그다.

```
ulsan-head-soccer/
  index.html                 화면 뼈대, 모듈 로드
  css/style.css              화면·버튼·카드 스타일
  img/{번호}.jpg             선수 얼굴 12장 (256×256)
  js/data/players.js         PLAYERS, byNumber(n)
  js/sim/constants.js        FIELD, PHYS, GAUGE, MATCH, DT, DIFFICULTY
  js/sim/rng.js              mulberry32(seed) -> () => number
  js/sim/physics.js          createPlayer, createBall, stepPhysics
  js/sim/specials.js         SPECIALS, activateSpecial, updateSpecials
  js/sim/ai.js               createAiState, decide, shouldSubstitute, pickSubstitute
  js/sim/match.js            createMatch, stepMatch, requestSubstitute, resumeFromSub
  js/render/stadium.js       drawStadium
  js/render/characters.js    drawPlayer, drawBall
  js/render/scene.js         createFx, drawFrame
  js/ui/input.js             createInput
  js/ui/orientation.js       fitStage
  js/ui/screens.js           showSelect, showVs, showSubSelect, showGoal, showResult, hideOverlay
  js/main.js                 부팅, 루프
  tools/crop-faces.ps1       원본 배너 -> img/
  tools/selfplay.js          AI vs AI 승률표
  test/*.test.js             node --test
  package.json               {"type":"module","scripts":{"test":"node --test test/","selfplay":"node tools/selfplay.js"}}
```

**좌표.** x 오른쪽 +, y 아래 +. 선수의 `x` 는 몸 가로 중심, `y` 는 발바닥(바닥에 서면 `FIELD.GROUND` = 640). 머리 중심 = `(x, y - (PHYS.BODY_H + PHYS.HEAD_R) * p.scale)`. 몸 사각형 = 폭 `PHYS.BODY_W * scale`, 높이 `PHYS.BODY_H * scale`, 아래변이 `y`.

**플레이어 정의 (`PlayerDef`)** — `js/data/players.js` 의 원소:
```js
{ number: 10, name: '이동경', position: 'MF', role: 'attack'|'defend',
  special: { id: 'laser', name: '레이저 슛', kind: 'oneshot'|'buff'|'instant', duration: 6,
             desc: '다음 킥이 번개처럼 직선으로 날아가고 상대 몸을 뚫고 지나간다' },
  img: 'img/10.jpg' }
```

**선수 몸 (`Body`)** — `createPlayer(def, side)` 가 만든다:
```js
{ side: 'L'|'R', def, x, y, vx, vy, onGround: true, facing: 1|-1, scale: 1,
  kickCooldown: 0, kickAnim: 0, stun: 0, pinned: false, lastTouchT: -1,
  gauge: 0, active: null,            // active: { id, t (남은 초), armed: bool, data: {} }
  mods: { speed: 1, jump: 1, headPow: 1, canJump: true, catchArmed: false, magnet: false, press: false } }
```
`mods` 는 매 틱 `updateSpecials` 가 기본값으로 되돌린 뒤 다시 채운다(누적 금지).

**공 (`Ball`)**:
```js
{ x, y, vx, vy, r: 22, noGravityT: 0, passThrough: null|'L'|'R', flight: null|'laser'|'curve'|'throw',
  curveAx: 0, held: null|{ side, t }, attached: null|'L'|'R', lastTouch: null|{ side, t } }
```

**입력 (`Inputs`)**: `{ left, right, jump, kick, special, sub }` 모두 boolean. `kick`·`special`·`sub` 는 "이 틱에 눌림"(edge) 이다. 빈 입력 상수 `NO_INPUT`.

**물리 상태 (`World`)**: `{ players: { L: Body, R: Body }, ball: Ball, t: 0 }`.

**이벤트**: `stepPhysics`·`stepMatch` 가 돌려주는 배열의 원소. 타입과 필드:
`{type:'touch', side, perfect:boolean}` `{type:'kick', side}` `{type:'goal', scorer:'L'|'R'}` `{type:'special', side, id}` `{type:'specialEnd', side, id}` `{type:'sub', side, out:number, in:number}` `{type:'phase', phase}` `{type:'catch', side}` `{type:'throw', side}` `{type:'knockdown', side}`. 소리는 나중에 이 이벤트에 붙는다.

**경기 (`Match`)**: `createMatch({ home: PlayerDef, away: PlayerDef, difficulty: 'youth'|'first'|'legend', rng })`:
```js
{ world, clock: 90, phase: 'kickoff'|'play'|'goal'|'sub'|'golden'|'over', phaseT: 0,
  scores: { L: 0, R: 0 }, subUsed: { L: false, R: false }, used: { L: [def], R: [def] },
  difficulty, rng, ai: AiState, result: null|'win'|'lose'|'draw', pendingSub: null }
```
`stepMatch(match, inputsL, dt) -> Event[]` 는 AI 입력을 스스로 계산한다. `phase === 'sub'` 또는 `'over'` 이면 아무것도 진행하지 않고 `[]`.

**난이도 (`DIFFICULTY`)** in constants.js:
```js
{ youth:  { reaction: .35, error: 120, speed: .85, specialDelay: 3, smart: false },
  first:  { reaction: .18, error: 50,  speed: 1.0, specialDelay: 0, smart: false },
  legend: { reaction: .08, error: 15,  speed: 1.05, specialDelay: 0, smart: true } }
```

---

### Task 1: 저장소 뼈대, 선수 데이터, 얼굴 사진

**Files:**
- Create: `package.json`, `.gitignore`, `README.md`, `js/data/players.js`, `js/sim/rng.js`, `tools/crop-faces.ps1`, `img/*.jpg`(12)
- Test: `test/players.test.js`, `test/rng.test.js`

**Interfaces:**
- Produces: `PLAYERS: PlayerDef[]`(번호 오름차순 12명), `byNumber(n) -> PlayerDef|undefined`, `mulberry32(seed) -> () => number` (0 이상 1 미만, 같은 seed 면 같은 수열).

- [ ] **Step 1: 저장소 초기화**

`C:\Users\robin\ulsan-head-soccer` 에서 `git init -b main`. `package.json` 은 Shared Interfaces 의 내용 그대로(`"private": true` 추가). `.gitignore` 에 `node_modules/`, `.playwright/`, `docs/balance-*.json`.

- [ ] **Step 2: 실패하는 테스트 작성** — `test/players.test.js`

```js
import { test } from 'node:test'; import assert from 'node:assert/strict';
import { PLAYERS, byNumber } from '../js/data/players.js';
test('12 players, unique numbers, ascending', () => {
  assert.equal(PLAYERS.length, 12);
  const nums = PLAYERS.map(p => p.number);
  assert.deepEqual(nums, [...new Set(nums)].sort((a, b) => a - b));
  assert.deepEqual(nums, [10, 11, 14, 15, 19, 21, 24, 26, 38, 55, 96, 99]);
});
test('every player has a special with kind and desc', () => {
  for (const p of PLAYERS) {
    assert.ok(['oneshot', 'buff', 'instant'].includes(p.special.kind), p.name);
    assert.ok(p.special.desc.length > 8, p.name);
    assert.ok(['attack', 'defend'].includes(p.role), p.name);
    assert.equal(p.img, `img/${p.number}.jpg`);
  }
});
test('roles match spec', () => {
  const attack = PLAYERS.filter(p => p.role === 'attack').map(p => p.number);
  assert.deepEqual(attack, [10, 11, 14, 26, 99]);
  assert.equal(byNumber(55).special.id, 'train');
  assert.equal(byNumber(38).special.id, 'press');
});
```
`test/rng.test.js`: 같은 seed 두 번 → 처음 5개 값이 같다; 1000개 전부 `0 <= v < 1`.

- [ ] **Step 3: 실패 확인** — `npm test` → `Cannot find module` 로 FAIL.

- [ ] **Step 4: `js/data/players.js` 작성**

설계서 9절 표를 그대로 옮긴다. special id 는 이 이름을 쓴다(다른 태스크가 참조): `laser`(10), `sprint`(11), `curve`(14), `highjump`(15), `giant`(19), `catch`(21), `magnet`(24), `longthrow`(26), `press`(38), `train`(55), `slide`(96), `cannon`(99). `kind`: laser·curve·longthrow = `oneshot`(duration 6), slide = `instant`(duration .35), train = `buff`(duration 3), 나머지 `buff`(duration 5). position: 이동경·이진현·이규성·박용우 `MF`, 에릭·야고 `FW`, 정승현·김영권·조현택·토마스·최석현 `DF`, 조현우 `GK`. `desc` 는 설계서의 "효과" 를 한 줄(40자 안팎)로 줄인 문장.

- [ ] **Step 5: `js/sim/rng.js`** — `export function mulberry32(seed)` 표준 구현.

- [ ] **Step 6: 얼굴 사진** — `tools/crop-faces.ps1`

입력 폴더 `C:\Users\robin\Desktop\울산 선수 프로필`. 파일명→번호 표: `10_이동경, 11_에릭, 14_이진현, 15_정승현, 19_김영권, 21_조현우, 24_이규성, 99_야고` 는 그대로, `조현택→26, 박용우→38, 토마스→55, 최석현→96`. 원본 박스 `(120, 0, 250, 250)` 을 `256×256` 으로 리샘플(HighQualityBicubic), JPEG 품질 85 로 `img/{번호}.jpg` 저장. 스크립트를 실행하고 12장이 생겼는지 `ls img` 로 확인, 두 장(10, 55)을 열어 머리카락부터 턱까지 들어가는지 눈으로 본다. 어긋나면 박스를 선수별로 조정(스크립트 안 해시테이블).

- [ ] **Step 7: 테스트 통과 확인** — `npm test` → 전부 PASS.

- [ ] **Step 8: README.md** — 게임 이름, 한 줄 설명, 플레이 주소(미정 표시), 사진 출처 "울산 HD FC 공식 홈페이지 (uhdfc.com)", 로컬 실행법(`python -m http.server`).

- [ ] **Step 9: Commit** — `git add -A && git commit -m "선수 12명 데이터와 얼굴 사진, 저장소 뼈대"` (+ Co-Authored-By 줄).

---

### Task 2: 물리 — 선수·공·충돌·킥·골

**Files:**
- Create: `js/sim/constants.js`, `js/sim/physics.js`
- Test: `test/physics.test.js`

**Interfaces:**
- Produces:
  - `constants.js`: `FIELD = { W:1280, H:720, GROUND:640, GOAL_DEPTH:80, GOAL_H:230, BAR_T:10 }`, `PHYS = { GRAVITY:2200, MOVE:420, JUMP:760, BALL_R:22, HEAD_R:55, BODY_W:56, BODY_H:70, BALL_MAX:1600, BOUNCE_GROUND:.72, BOUNCE_WALL:.8, BOUNCE_BODY:.5, DRAG:.999, KICK_RANGE:70, KICK_SPEED:900, KICK_ANGLE_DEG:35, KICK_COOLDOWN:.3, HEAD_CARRY:.6, PERFECT_MIN_REL:500, PERFECT_MULT:1.35, TOUCH_DEBOUNCE:.25 }`, `GAUGE = { TOUCH:10, PERFECT:35, CONCEDE:15, MAX:100, ONESHOT_TTL:6 }`, `MATCH = { LEN:90, GOLDEN:30, GOAL_PAUSE:1, AI_SUB_AFTER:45 }`, `DT = 1/120`, `DIFFICULTY`(위 표), `NO_INPUT`.
  - `physics.js`: `createPlayer(def, side) -> Body` (L 은 x=320, R 은 x=960, facing 은 상대 쪽), `createBall() -> Ball` (x=640, y=300, 정지), `createWorld(defL, defR) -> World`, `stepPhysics(world, inputs: {L: Inputs, R: Inputs}, dt) -> Event[]`, `headCenter(body) -> {x, y, r}`, `bodyRect(body) -> {x, y, w, h}`, `resetKickoff(world)` (선수 시작 위치·공 센터 위·속도 0).
- `stepPhysics` 가 지키는 것(설계서 7절): 이동 `MOVE * mods.speed`(stun>0 또는 pinned 면 입력 무시), 점프 `JUMP * mods.jump`(onGround 이고 `mods.canJump`), 중력, 바닥, 선수는 골라인(`GOAL_DEPTH` ~ `W-GOAL_DEPTH`) 안에서만, 공은 벽·천장·바닥·골대(포스트와 크로스바 사각형)에 반발, 공 최고 속도 제한, 머리 원 충돌(법선 반사 + 선수 속도×HEAD_CARRY, headPow 곱), 몸 사각 충돌(반발 .5), 선수끼리 분리, 킥(앞쪽 반원 `KICK_RANGE` 안의 공에 `KICK_SPEED` 를 각 35° 로, 쿨타임), 퍼펙트 판정, 터치 디바운스, 골 판정(공 전체가 `x < GOAL_DEPTH` 또는 `x > W - GOAL_DEPTH`, 그리고 `y > GROUND - GOAL_H`). `ball.passThrough === side` 이면 그 side 선수와 충돌하지 않음. `ball.attached`/`ball.held` 가 있으면 공은 자유 운동하지 않는다(위치는 specials 가 정함). `ball.noGravityT > 0` 이면 중력 없음. `ball.curveAx` 는 가로 가속으로 더한다.

- [ ] **Step 1: 실패하는 테스트 작성** — `test/physics.test.js` (헬퍼 `run(world, seconds, inputs)` 가 `DT` 로 반복 호출하며 이벤트를 모은다)

```js
test('ball falls and bounces with restitution 0.72', () => {
  const w = createWorld(P10, P99); w.ball.x = 640; w.ball.y = 300;  // 선수 멀리 치우기: w.players.L.x = 150; w.players.R.x = 1130
  run(w, 2);
  assert.ok(w.ball.y <= FIELD.GROUND - PHYS.BALL_R + 0.01);
  // 첫 바운스 직후 속도 크기 비율 확인: 접지 직전 vy 를 기록해 두는 훅 대신 최고 높이 비율로 검증
  assert.ok(peakAfterFirstBounce(w) / 300 > 0.45 && peakAfterFirstBounce(w) / 300 < 0.58); // 0.72² ≈ 0.52
});
test('ball speed never exceeds BALL_MAX', () => { /* vx=5000 주고 1틱 뒤 hypot <= 1600 */ });
test('player cannot leave the pitch or enter the goal mouth', () => { /* L 에 left 입력 3초 → x >= GOAL_DEPTH + BODY_W/2 */ });
test('jump reaches about 131px and lands', () => { /* v²/2g = 760²/4400 ≈ 131; 최고점 오차 ±3, 1초 뒤 onGround */ });
test('kick launches the ball at 900px/s and 35 degrees', () => { /* 공을 발 앞 50px 에 놓고 kick 1틱 → |v|≈900±5, 각도 35°±1 */ });
test('kick has 0.3s cooldown', () => { /* 두 번째 kick 이 0.2초 뒤면 공 속도 변화 없음 */ });
test('head collision reflects the ball upward', () => { /* 공을 머리 위에서 떨어뜨림 → vy < 0 으로 바뀜, touch 이벤트 1개 */ });
test('touch events debounce within 0.25s', () => { /* 공이 머리에 연속 접촉해도 0.25초 안에는 touch 1개 */ });
test('perfect header: airborne, upper-front 60deg, rel speed >= 500', () => { /* 점프 중 머리 위앞쪽에서 빠른 공 → perfect:true, 속도 ×1.35 */ });
test('not perfect when standing', () => { /* 같은 상황 onGround → perfect:false */ });
test('goal when whole ball crosses the line under the bar', () => { /* 공 x=1190, vx=600, y=600 → goal scorer 'L' 1개; y=350(바 위) → goal 없음, 뒤 벽에서 튕김 */ });
test('ball wedged between player and wall escapes within 0.5s', () => { /* 공을 L 선수와 왼쪽 벽 사이에 겹치게 놓음 → 0.5초 뒤 공과 선수·벽 모두 겹침 없음, 공 속도 유한 */ });
test('passThrough side ignores collision', () => { /* ball.passThrough='R', 공이 R 머리를 통과 → touch 없음, 궤적 직선 */ });
test('players separate without bouncing', () => { /* 겹치게 놓은 두 선수 1틱 뒤 분리, 속도 0 유지 */ });
```

- [ ] **Step 2: 실패 확인** — `npm test` → FAIL (module not found).

- [ ] **Step 3: `constants.js` 작성** — Interfaces 값 그대로.

- [ ] **Step 4: `physics.js` 작성**

서브스텝 순서: (1) mods·stun·pinned 반영한 입력 → 선수 속도, (2) 선수 중력·이동·바닥·경계, (3) 선수끼리 분리, (4) 공 가속(중력, curveAx, 저항), 이동, (5) 공–벽·천장·바닥·골대 충돌(포스트: 폭 10 세로 사각, 크로스바: `GOAL_DEPTH` 폭 가로 사각, 둘 다 `BOUNCE_WALL`), (6) 공–선수 충돌(머리 원 우선, 이어서 몸 사각; passThrough·attached·held 예외), (7) 킥 처리, (8) 속도 제한, (9) 골 판정. 끼임 방지: 공–선수 충돌에서 겹침을 법선 방향으로 완전히 밀어내고, 그 결과 벽 안으로 들어가면 벽 반대 방향으로 재배치하며 선수 쪽으로 최소 속도 120px/s 를 준다.

- [ ] **Step 5: 통과 확인** — `npm test` → PASS. 실패하는 수치 테스트는 구현이 아니라 기대값 계산을 먼저 의심하되, 설계서 수치는 바꾸지 않는다.

- [ ] **Step 6: Commit** — `"물리: 선수·공·충돌·킥·골 판정"`.

---

### Task 3: AI 결정

**Files:**
- Create: `js/sim/ai.js`
- Test: `test/ai.test.js`

**Interfaces:**
- Consumes: `World`, `Body`, `Ball`, `DIFFICULTY`, `rng`.
- Produces: `createAiState(difficulty, rng) -> AiState` (`{ difficulty, rng, reactT: 0, target: null, specialHoldT: 0, subDone: false }`), `decide(world, side, aiState, dt) -> Inputs`, `predictLanding(ball, horizonSec) -> {x, y}` (중력·바닥·벽 반사 포함 단순 적분), `shouldSubstitute(match) -> boolean`, `pickSubstitute(match, rng) -> PlayerDef`.
- `decide` 규칙(설계서 10절): `reactT` 가 `reaction` 초마다 0 이 될 때 `predictLanding(ball, 1)` 에 `±error` 균등 난수를 더한 x 를 `target` 으로 갱신. 자기 골문 쪽으로 공이 오고 공이 자기보다 골문에 가까우면 target 을 공과 골문 사이(공 x 와 골라인의 중점)로. target 과 x 차이가 12 초과면 그쪽으로 이동. 공 머리 위 근처(수평 거리 < HEAD_R+BALL_R+20, 공 y 가 머리 중심보다 위 0~220)면 jump. 공이 앞쪽 KICK_RANGE 안이고 상대 골문 방향이면 kick. special: `gauge >= 100` 이면 `specialDelay` 초 뒤 true. `smart` 면 공격형 필살기(laser/curve/longthrow/cannon/sprint/train/slide)는 자기 x 가 상대 골문 쪽 40% 안(`side==='R'` 이면 `x < 512`)일 때만, 수비형(giant/catch/magnet/highjump/press)은 공이 자기 진영에 있을 때만. `speed` 배율은 decide 가 아니라 match 가 Body.mods.speed 에 곱한다(Task 4).
- `shouldSubstitute`: `clock <= MATCH.LEN - AI_SUB_AFTER`(45초 경과) 이고 `!subUsed.R` 이고 공 x 가 자기 골라인에서 400 이상 떨어져 있을 때. `pickSubstitute`: 지고 있으면 `role==='attack'`, 아니면 `'defend'` 중에서, 현재 두 선수를 뺀 후보에서 rng 로 하나.

- [ ] **Step 1: 실패하는 테스트** — `test/ai.test.js`
```js
test('predictLanding returns ground point within horizon', ...)   // 공 (640,300,vx=300,vy=0) → y≈GROUND-BALL_R, x≈640+300*t_fall
test('AI moves toward predicted landing after reaction delay', ...) // first: 0.18초 전엔 left/right 모두 false, 이후 공 쪽 입력
test('youth has larger target error than legend (statistical)', ...) // 200회 샘플 표준편차 비교
test('AI jumps when ball is above head', ...)
test('AI kicks when ball is in front within range', ...)
test('AI uses special when gauge is 100 (first: immediately, youth: after 3s)', ...)
test('legend only fires attacking specials inside the final 40%', ...)
test('shouldSubstitute after 45s, once, ball far from own goal; pickSubstitute role by score', ...)
```

- [ ] **Step 2: 실패 확인** — FAIL.
- [ ] **Step 3: `ai.js` 작성** — 위 규칙대로. `Match` 객체는 Task 4 에서 오지만 `shouldSubstitute/pickSubstitute` 는 `{ clock, subUsed, scores, world, used }` 필드만 읽으므로 테스트에서는 그 모양의 객체를 손으로 만든다.
- [ ] **Step 4: 통과 확인** — PASS.
- [ ] **Step 5: Commit** — `"AI: 낙하점 예측, 난이도, 필살기·교체 규칙"`.

---

### Task 4: 경기 규칙 — 시계, 득점, 게이지, 교체, 결과

**Files:**
- Create: `js/sim/match.js`
- Modify: `js/sim/ai.js`(필요 시 export 추가만)
- Test: `test/match.test.js`

**Interfaces:**
- Consumes: `createWorld`, `stepPhysics`, `resetKickoff`, `createAiState`, `decide`, `shouldSubstitute`, `pickSubstitute`, `activateSpecial`, `updateSpecials`(Task 5 — 이 태스크에서는 `specials.js` 가 아직 없으므로 `match.js` 는 `import` 만 해 두고 Task 5 가 채운다; 그 전까지 테스트가 돌도록 Task 4 에서 `specials.js` 에 **빈 구현** `activateSpecial(){return false}`, `updateSpecials(){return []}` 를 만들어 둔다).
- Produces: `createMatch(opts) -> Match`, `stepMatch(match, inputsL, dt) -> Event[]`, `requestSubstitute(match, side) -> boolean`(L 이 교체 버튼을 눌렀을 때: 조건 되면 `phase='sub'`, 시계 정지, true), `resumeFromSub(match, newDef|null)`(null 이면 교체 없이 복귀, 횟수 유지), `substitute(match, side, newDef) -> Event`(몸 교체: `x,y,vx,vy,facing,gauge` 유지, `active=null`, `mods` 초기화, `subUsed[side]=true`, `used[side].push(newDef)`), `currentDefs(match) -> {L, R}`.
- 규칙(설계서 5·8절): phase 전이 `kickoff`(1초, 입력 무시) → `play` → 골이면 `goal`(1초 연출, 그동안 물리 정지) → `kickoff`. `clock` 은 `play`·`golden` 에서만 감소. 0 이 되면 동점이 아니면 `over`, 동점이면 `golden` 으로 `clock = 30`; golden 에서 골 나면 즉시 `over`; golden 도 0 이면 `over`(무승부). `result` 는 L 기준 `win/lose/draw`. 게이지: touch +10, perfect +35, 실점한 쪽 +15, 최대 100. 필살기 입력: `gauge >= 100` 이고 `active === null` 일 때만 `activateSpecial` 호출 후 `gauge = 0`, 이벤트 `special`. AI 쪽은 `decide` 결과를 `inputsR` 로 쓰고, `mods.speed *= DIFFICULTY.speed` 를 `updateSpecials` 뒤에 곱한다. AI 교체: `shouldSubstitute` 면 `substitute(match,'R', pickSubstitute(...))` 즉시(연출은 UI 몫, 이벤트로 알림).

- [ ] **Step 1: 실패하는 테스트** — `test/match.test.js`
```js
test('kickoff lasts 1s then play; clock does not run during kickoff', ...)
test('clock counts down 90s and ends with a result', ...)               // 공 정지시킨 채 91초 → phase 'over', result 'draw'? → 동점이면 golden 먼저
test('tie at 90s goes to golden goal for up to 30s then draw', ...)
test('goal in golden ends the match immediately', ...)
test('goal pauses 1s, resets kickoff, updates score', ...)             // 공을 R 골문으로 밀어 넣는 상황 조작
test('gauge: +10 touch, +35 perfect, +15 on conceding, capped at 100', ...)
test('special ignored when gauge < 100', ...)
test('requestSubstitute pauses clock and phase sub; resumeFromSub(null) keeps the substitution available', ...)
test('substitute keeps gauge and position, clears active special, marks used', ...)
test('second substitution ignored', ...)
test('AI substitutes once after 45s choosing role by score', ...)
test('stepMatch returns [] and changes nothing in sub/over phases', ...)
```

- [ ] **Step 2: 실패 확인** — FAIL.
- [ ] **Step 3: `specials.js` 빈 구현 + `match.js` 작성.**
- [ ] **Step 4: 통과 확인** — PASS. `npm test` 전체도 PASS.
- [ ] **Step 5: Commit** — `"경기 규칙: 시계·득점·게이지·교체·골든골"`.

---

### Task 5: 필살기 (1) 지속형 여섯 — sprint, highjump, giant, press, cannon, magnet

**Files:**
- Modify: `js/sim/specials.js`(빈 구현을 채움), `js/sim/physics.js`(headPow·magnet·press 훅 반영이 필요한 곳만)
- Test: `test/specials-buff.test.js`

**Interfaces:**
- Produces: `SPECIALS: { [id]: { kind, duration, activate(match, side), update(match, side, dt) -> Event[], onKick?(match, side) -> boolean, onBallTouch?(match, side, info) -> void } }`, `activateSpecial(match, side) -> boolean`(정의를 찾아 `body.active = { id, t: duration, armed: kind==='oneshot', data:{} }` 설정 후 `activate` 호출), `updateSpecials(match, dt) -> Event[]`(양쪽 `mods` 를 기본값으로 리셋 → active 있으면 `t -= dt`, `update` 호출, `t <= 0` 이면 `active = null` 과 `specialEnd` 이벤트).
- 효과 수치(설계서 9절): `sprint` speed ×1.8 / `highjump` jump ×1.5 / `giant` scale 1.7, speed ×.85, headPow ×1.2 / `press` 상대 mods.speed ×.6, jump ×.6 / `cannon` headPow ×2.0, 그 헤딩에 맞은 상대(공이 0.5초 안에 상대 몸·머리에 닿으면) vx += 400 × 방향, stun .4 / `magnet` 공이 머리 중심에서 220 안이고 `ball.flight === null` 이면 가속 1800 × (1 - d/220) 을 머리 쪽으로.

- [ ] **Step 1: 실패하는 테스트** — 각 필살기당 하나 이상:
```js
test('sprint: speed mod 1.8 for 5s then back to 1', ...)
test('highjump: jump apex ×~2.25 (v²)', ...)
test('giant: scale 1.7, speed .85, head bounce ×1.2, ends after 5s with scale 1', ...)
test('press: opponent speed and jump ×0.6, own unchanged', ...)
test('cannon: header speed doubled; opponent hit is knocked back 400 and stunned .4', ...)
test('magnet: ball within 220 accelerates toward head; laser-flight ball is ignored', ...)
test('activate while active is ignored (returns false, gauge unchanged)', ...)
test('mods reset every tick (no accumulation after two updates)', ...)
```
- [ ] **Step 2: 실패 확인** — FAIL.
- [ ] **Step 3: 구현.** `physics.js` 에 필요한 훅: 머리 충돌 시 `headPow` 곱(이미 Task 2), `stun` 처리(이미), magnet 은 `updateSpecials` 가 공 속도를 직접 바꾼다(physics 수정 없음), cannon 의 "맞은 상대 밀림"은 `active.data.lastCannonT` 와 `touch` 이벤트를 `update` 에서 읽어 처리.
- [ ] **Step 4: 통과 확인** — PASS (전체).
- [ ] **Step 5: Commit** — `"필살기: 스프린트·높이뛰기·거인·압박·대포·자석"`.

---

### Task 6: 필살기 (2) 한 방형·즉발 — laser, curve, longthrow, slide

**Files:**
- Modify: `js/sim/specials.js`, `js/sim/physics.js`(킥 직전 `onKick` 훅, 터치 직후 `onBallTouch` 훅 호출 지점)
- Test: `test/specials-shot.test.js`

**Interfaces:**
- `stepPhysics` 는 킥 조건이 성립한 순간 `hooks.onKick(side)` 를 먼저 부르고 true 를 돌려받으면 기본 킥을 건너뛴다. 머리·몸 터치 직후 `hooks.onBallTouch(side, {perfect})` 를 부른다. 이를 위해 `stepPhysics(world, inputs, dt, hooks = {})` 로 서명 확장(기본 빈 객체라 기존 테스트 유지). `match.js` 가 hooks 를 `SPECIALS` 에서 만들어 넘긴다.
- 수치: `laser` 다음 킥 → `ball.flight='laser'`, 속도 1500 을 상대 골문 쪽 수평(약간 위 3°), `noGravityT=.8`, `passThrough=상대 side`; .8초 뒤 또는 벽·골대·바닥 접촉 시 flight/passThrough 해제. / `curve` 다음 킥 → 각 62°, 1000, `flight='curve'`, `curveAx = 900 × 상대 골문 방향`; 바닥·골대 접촉 또는 2.5초 뒤 해제. / `longthrow` 다음 터치 → `ball.held={side,t:.3}`, 공은 머리 위에 고정, .3초 뒤 상대 골라인 앞 60px 지점에 떨어지도록 초속 역산(최고 1300, 발사각 55° 고정 후 속도 계산), `flight='throw'`, 땅에 닿으면 해제. / `slide` 즉발 .35초: 선수 vx = ±(180/.35), onGround 유지, `active.data.hit=false`; 공 접촉 시 앞·위(35°) 1000 킥 1회; 상대 접촉 시 상대 `stun=1`, `knockdown` 이벤트 1회.
- 한 방형은 `active.armed` 가 true 인 동안 기다리고, 발동 후 `armed=false`, 효과 끝나면 `active=null`. 6초 지나도 `armed` 면 그냥 해제(`specialEnd`).

- [ ] **Step 1: 실패하는 테스트**
```js
test('laser: next kick → 1500px/s, no gravity .8s, passes through opponent, then normal', ...)
test('laser: expires unarmed after 6s without kick', ...)
test('curve: next kick 62deg/1000 with horizontal accel 900 toward goal', ...)
test('longthrow: holds .3s then lands within ±40px of (goalLine - 60)', ...)
test('slide: moves 180px in .35s; kicks ball once; knocks opponent down 1s', ...)
test('oneshot ball ignores magnet and catch (flight set)', ...)   // catch 는 Task 7 전이라 flight 플래그만 확인
```
- [ ] **Step 2: 실패 확인** — FAIL.
- [ ] **Step 3: 구현** (physics hooks + specials).
- [ ] **Step 4: 통과 확인** — PASS (전체).
- [ ] **Step 5: Commit** — `"필살기: 레이저·커브·롱스로인·슬라이딩"`.

---

### Task 7: 필살기 (3) — catch(조현우), train(토마스)

**Files:**
- Modify: `js/sim/specials.js`, `js/sim/physics.js`(pinned 선수 위치를 밀어내는 처리, `attached` 공 위치)
- Test: `test/specials-catch-train.test.js`

**Interfaces:**
- `catch` 지속 5초: 매 틱, 공이 자기 골문 쪽으로 움직이고(`vx` 부호) `flight===null` 이며 머리 중심 위 150 안 수평 ±(HEAD_R+BALL_R)+40 이면 `ball.held={side,t:.4}`(공은 머리 위 고정, 속도 0), `catch` 이벤트; .4초 뒤 상대 골문 방향 각 40°, 초속 1100 으로 발사(`throw` 이벤트). 한 번 잡으면 지속 중 다시 잡을 수 있다.
- `train` 지속 3초: `activate` 시 `scale=1.4`, `mods.canJump=false`, speed ×1.5, `data.charging=false`. 공이 기관차 앞면(몸 사각 앞쪽 + 머리 원) 에 닿으면 `ball.attached=side`, `data.charging=true`; 이후 매 틱 `vx = 700 × 방향`(입력 무시), 공은 몸 앞 `BODY_W*scale/2 + BALL_R` 지점 바닥 위에 고정. 상대가 기관차 앞면(공 포함) x 범위에 들어오면 `opp.pinned=true` 로 함께 이동(`opp.x = ball.x + BALL_R + opp 반폭`), 골라인에 닿으면 상대는 멈추되 공은 계속 전진 → 골 판정은 Task 2 규칙 그대로(공이 선수와 충돌하지 않도록 attached 동안 공–상대 충돌 끔). 3초 끝 또는 골: `scale=1`, `attached=null`, `pinned=false`, 공은 그 자리에서 자유 낙하. 점프해서 넘어가는 상대: pinned 판정은 상대 발 `y > GROUND - BODY_H*1.4` 일 때만(공중에 있으면 안 잡힘).
- 우선순위(설계서 8절): 밀기는 상대 scale·slide·cannon 과 무관. `attached` 공은 magnet·catch 무시.

- [ ] **Step 1: 실패하는 테스트**
```js
test('catch: ball heading to own goal above head is held .4s then thrown at 40deg/1100', ...)
test('catch ignores laser-flight ball', ...)
test('train: scale 1.4, cannot jump, speed 1.5 for 3s', ...)
test('train: ball touching front attaches and train charges at 700 toward goal', ...)
test('train: grounded opponent in path is pinned and carried; airborne opponent is not', ...)
test('train: reaching goal line scores even with pinned opponent at the line', ...)
test('train: after 3s everything resets and ball is free', ...)
test('train push ignores giant scale and slide', ...)
```
- [ ] **Step 2: 실패 확인** — FAIL.
- [ ] **Step 3: 구현.**
- [ ] **Step 4: 통과 확인** — PASS (전체 `npm test`).
- [ ] **Step 5: Commit** — `"필살기: 선방 캐치·기관차 모드"`.

---

### Task 8: 셀프 플레이 스크립트와 1차 밸런스

**Files:**
- Create: `tools/selfplay.js`
- Test: `test/selfplay.test.js`

**Interfaces:**
- Produces: `simulateMatch(defL, defR, difficulty, seed) -> { L, R, result }`(양쪽 모두 AI: `decide` 로 inputsL 도 만든다; 교체 없음; 실시간이 아니라 `DT` 로 바로 돌림), `runTable({ games, difficulty, seed }) -> { cells: number[12][12] (L 승률, 무승부 .5), avg: number[12] }`, CLI: `node tools/selfplay.js [games=200] [difficulty=first]` 가 마크다운 표를 stdout 에 찍고 `docs/balance-<date>.md` 에 저장(`.gitignore` 의 json 과 별개로 md 는 커밋).

- [ ] **Step 1: 실패하는 테스트**
```js
test('simulateMatch is deterministic for a seed and finishes with a result', ...)
test('runTable with games=2 returns 12x12 cells in [0,1] and 12 averages', ...)
```
- [ ] **Step 2: 실패 확인** — FAIL.
- [ ] **Step 3: 구현.** 12×11×200 판 × 최대 120초 × 120틱 = 약 1.9억 틱이 너무 느리면 `games` 를 60 으로 시작하고 체감 시간을 적는다.
- [ ] **Step 4: 통과 확인** — PASS.
- [ ] **Step 5: 1차 밸런스 실행** — `npm run selfplay -- 100 first`. 선수별 평균 승률이 35–65% 밖이면 설계서 "밸런스 원칙" 범위 안에서 해당 필살기 수치(지속 시간, 배율)만 조정하고, 바꾼 값은 `constants.js` 가 아니라 `players.js`/`specials.js` 의 해당 항목에 주석 `// 밸런스 2026-10-31: 4.5s (was 5)` 로 남긴다. 설계서 9절 표도 같은 값으로 고친다. 두 번 돌려도 안 들어오면 그 선수 이름과 승률을 보고에 남기고 다음 태스크로 간다(시각 작업 뒤 재조정).
- [ ] **Step 6: Commit** — `"셀프 플레이 밸런스 스크립트와 1차 조정"`.

---

### Task 9: 브라우저 셸 — 캔버스 그리기, 입력, 회전, 루프 (경기 화면이 실제로 돌아감)

**Files:**
- Create: `index.html`, `css/style.css`, `js/render/stadium.js`, `js/render/characters.js`, `js/render/scene.js`, `js/ui/input.js`, `js/ui/orientation.js`, `js/main.js`, `js/loop.js`
- Test: `test/loop.test.js`, 수동 검증 `tools/shots.js`(Playwright)

**Interfaces:**
- `js/loop.js`: `createLoop({ step(dt), render(alpha), now }) -> { start(), stop(), tick(t) }`. 고정 `DT` 누적기, 한 프레임 누적 상한 `0.25`초(초과분 버림). 순수 모듈이라 Node 테스트 가능.
- `render/stadium.js`: `drawStadium(ctx, t)` — 설계서 11절 다섯 층. 정적 층(하늘·지붕·관중석·잔디)은 첫 호출 때 오프스크린 캔버스에 그려 캐시, LED 띠 글자만 `t` 로 흐른다. 관중석 가운데 블록에 흰 좌석으로 "울산".
- `render/characters.js`: `drawPlayer(ctx, body, img, { away: boolean, t })` — 머리 원형 클립 사진 + 흰 테두리 2, 몸(홈: 블루+골드 트림, 흰 번호 / 어웨이: 흰+블루 번호), 다리·신발, `kickAnim` 다리 뻗기, `stun>0` 이면 비틀거림(기울기), `pinned` 면 뒤로 젖힘, `active.id` 별 겉모습: giant 는 scale 로 자동, train 은 몸 대신 파란 기관차(굴뚝·보일러·바퀴 둘)와 홍조(머리 위에 반투명 분홍 원 두 개), catch 는 장갑 두 개, sprint 잔상은 scene 이, press 그물은 scene 이. `drawBall(ctx, ball)` 흑백 오각형 무늬 + 회전(`x` 변화량 기반).
- `render/scene.js`: `createFx() -> Fx`(입자·텍스트 팝·화면 흔들림 큐), `drawFrame(ctx, match, imgs, fx, t)` — 순서: stadium → 압박 그물(press 상대 발밑) → 자석 점선 원 → 롱스로인 낙하 그림자 → 선수 둘 → 공 → 레이저 빛줄기·증기 입자·잔상 → HUD(점수 Teko 72px 중앙, 시간 Teko 40px, 좌우 이름·번호 Pretendard 700, R 쪽 게이지 가는 막대) → 텍스트 팝("PERFECT", "GOAL", 필살기 이름). `pushEvents(fx, events, match)` 가 이벤트를 연출로 바꾼다.
- `ui/input.js`: `createInput(root) -> { read(): {L: Inputs}, attach(), detach() }`. `root` 안의 `[data-btn=left|right|jump|kick|special|sub]` 버튼에 포인터 이벤트(`pointerdown/up/cancel`, `setPointerCapture`), 동시 여러 포인터 지원, edge 플래그는 `read()` 가 호출되면 소비. 키보드: ←→↑Space / Z K / X L / C / WASD. 키보드 입력이 들어오면 `root.classList.add('kb')`.
- `ui/orientation.js`: `fitStage(stage) -> { w, h, rotated }`. 뷰포트가 세로(`innerHeight > innerWidth`)면 `stage` 에 `rotate(90deg)`, `width=innerHeight`, `height=innerWidth`, `transform-origin` 과 `translate` 로 좌상단 맞춤; 가로면 그대로. 호출은 `resize`/`orientationchange` 와 시작 시. 캔버스는 stage 안에서 16:9 레터박스로 최대 크기, 좌우 버튼 영역을 뺀 폭 기준(16:9 폰이면 캔버스 폭 = stage 폭 − 2×버튼열 폭 150).
- `js/main.js`: 이미지 12장 프리로드(`Promise.all`), `createMatch` → `createLoop` 로 `stepMatch`/`drawFrame`, `visibilitychange` 로 숨기면 `stop()`, 돌아오면 3초 카운트다운 텍스트 팝 후 `start()`. 이 태스크에서는 선택 화면 없이 `?debug=1` 이면 이동경 vs 야고(1군)로 바로 시작하고, 아니면 Task 10 의 선택 화면을 부른다(아직 없으니 debug 경로만).
- `index.html` 뼈대: `<div id="stage"><canvas id="game"></canvas><div class="pad left"><button data-btn="left">…</button><button data-btn="right">…</button></div><div class="pad right"><button data-btn="jump">점프</button><button data-btn="kick">킥</button><button data-btn="special" class="special"><i class="ring"></i>필살기</button></div><button data-btn="sub" class="sub">교체</button><div id="overlay"></div><div id="hint">폰을 돌려 주세요</div></div>`. 버튼 지름 ≥ 64px, `touch-action: none`, 전체 `touch-action: manipulation; user-select: none`. 글꼴 링크는 메모리 게임과 같은 두 URL.

- [ ] **Step 1: 실패하는 테스트** — `test/loop.test.js`
```js
test('fixed step: 1s of wall time produces 120 steps', ...)
test('accumulator caps at 0.25s after a long pause (no catch-up burst)', ...)   // tick 간격 5초 → step 호출 ≤ 30회
test('render receives alpha in [0,1)', ...)
```
- [ ] **Step 2: 실패 확인** — FAIL.
- [ ] **Step 3: `loop.js` 구현 → 테스트 PASS.**
- [ ] **Step 4: `index.html`, `css/style.css`, `orientation.js`, `input.js` 작성.**
- [ ] **Step 5: `stadium.js`, `characters.js`, `scene.js`, `main.js` 작성.** 글자는 모두 한국어 UI 문구(`점프`, `킥`, `필살기`, `교체`).
- [ ] **Step 6: 수동 검증 스크립트 `tools/shots.js`** (Playwright, 로컬 `python -m http.server 8766` 띄운 뒤): (a) 1280×720 데스크톱 `?debug=1` 로 2초 뒤 스크린샷 `shots/desktop-play.png`; (b) `devices['iPhone 13']` 세로 그대로 열어 스크린샷 `shots/iphone-portrait.png` — 회전된 가로 게임이 보여야 함; (c) 같은 페이지에서 `page.touchscreen.tap()` 을 회전된 점프 버튼의 화면 좌표에 보내고 0.2초 뒤 `window.__debug.world.players.L.onGround === false` 확인("rotated tap hits jump button"); (d) 두 포인터: 왼쪽 ◀ 를 `pointerdown` 유지한 채 점프를 탭 → L 의 vx < 0 이고 공중("multitouch move+jump"); (e) 키보드 ArrowRight 0.5초 → L.x 증가. `main.js` 는 `?debug=1` 일 때만 `window.__debug = { match, world }` 를 노출한다. 결과를 눈으로 보고 설계서 11절과 다른 점을 고친다.
- [ ] **Step 7: Commit** — `"캔버스 경기 화면, 터치·키보드 입력, 가로 회전, 고정 스텝 루프"`.

---

### Task 10: 화면 흐름 — 선수 선택(넘겨보기), VS, 교체 선택, 골, 결과, 공유

**Files:**
- Create: `js/ui/screens.js`
- Modify: `js/main.js`(흐름 연결), `css/style.css`, `index.html`(오버레이 템플릿)
- Test: 수동 검증 `tools/shots.js` 확장

**Interfaces:**
- `showSelect({ players, drawCard(canvas, def), initialIndex, difficulty, onStart(def, difficulty) })` — 설계서 4절 1번. 큰 카드는 `<canvas>` 에 `drawPlayer` 로 게임 속 모습 그대로(홈 유니폼, 서 있는 자세), 아래 `이름 · 번호 · 포지션`, 필살기 이름(골드, 700)과 `desc`. 좌우 화살표 버튼 + 가로 스와이프(포인터 이동 40px 이상). 썸네일 줄: 12개 원형 `<button>`(사진), 현재는 골드 테두리 3px, 탭하면 그 선수. 난이도 트랙은 메모리 게임의 `.levels/.level/.dot` 마크업·CSS 를 그대로 복사해 3단계(유스·1군·레전드). "경기 시작" 알약(`.action`). 마지막 선택과 난이도는 `localStorage('uhd11.select')` 에 기억(실패해도 무시).
- `showVs(homeDef, awayDef, ms=1000) -> Promise` — 두 얼굴과 "VS", 이름.
- `showSubSelect({ players, exclude: [number, number], onPick(def), onCancel })` — 선택 화면과 같은 카드 UI 를 반투명 배경 위에, 버튼은 "교체"와 "닫기".
- `showGoal(scorerName, ms=1200) -> Promise` — "GOAL" Teko 160px 골드 + 이름.
- `showSubBoard(outNumber, inNumber, ms=800) -> Promise` — 교체 보드(위 빨강 금지 → OUT 은 네이비 바탕 흰 숫자, IN 은 골드 바탕 네이비 숫자).
- `showResult({ match, defsL, defsR, onAgain, onChange })` — 승/패/무(승 골드), 점수 Teko, 내 선수(들)·상대 선수(들) 얼굴, "다시 하기", "선수 바꾸기", `navigator.share` 있으면 "결과 공유"(문구: `ULSAN HD FC 일대일축구에서 {내 선수}(으)로 {상대}를 {L}:{R}로 이겼다!` / 졌다 / 비겼다 + `location.href`).
- `hideOverlay()`.
- `main.js` 흐름: 선택 → VS → 경기(이벤트: `goal` → `showGoal` 동안 match 는 이미 `goal` phase 로 멈춤; `sub` 이벤트(AI) → `showSubBoard`; L 의 교체 버튼 → `requestSubstitute` 가 true 면 `showSubSelect` → `resumeFromSub(def)` → `showSubBoard`) → `over` → `showResult`. "다시 하기"는 같은 선발·같은 난이도·새 무작위 상대. 상대 무작위는 `rng` 가 아니라 `Math.random`(경기 자체의 rng 는 `mulberry32(Date.now())`).
- 세로 힌트: 시작 시 `rotated` 면 `#hint` 2초 표시 후 사라짐.

- [ ] **Step 1: `screens.js` 작성, `main.js` 연결, 스타일.**
- [ ] **Step 2: `tools/shots.js` 확장** — iPhone 13(세로 뷰포트, 회전된 상태)과 Pixel 7, 데스크톱 1280×800 에서: 선택 화면(카드 + 썸네일 + 트랙 + 버튼이 한 화면에, 스크롤 없음), 스와이프 두 번 뒤 세 번째 선수 카드, VS 화면, 교체 선택 오버레이, 결과 화면(`?debug=result` 로 가짜 종료 상태). 각 스크린샷을 눈으로 보고 설계서 11절(색·글꼴·알약·트랙)과 맞춘다.
- [ ] **Step 3: 메모리 게임과 나란히 보기** — `https://robinkim0221.github.io/ulsan-hd-memory/` 선택 화면 스크린샷과 이 게임 선택 화면을 나란히 놓고 같은 식구로 보이는지 확인(색, 알약 버튼, 트랙, 글꼴 크기).
- [ ] **Step 4: Commit** — `"선수 선택 넘겨보기, VS·교체·골·결과 화면, 공유"`.

---

### Task 11: 필살기 연출과 손맛 마무리

**Files:**
- Modify: `js/render/scene.js`, `js/render/characters.js`, `css/style.css`

- [ ] **Step 1: 연출 점검표를 하나씩 눈으로 확인** (`?debug=1&special=<id>` 로 L 게이지를 100 으로 시작): laser 빛줄기(골드, 공 뒤 200px, 0.8초), curve 공 잔상 점선, longthrow 낙하 그림자(타원, 떨어질 자리), sprint 발밑 잔상 3장, highjump 점프 시 발밑 먼지, giant 커질 때 화면 흔들림 0.3초(`prefers-reduced-motion` 이면 없음), catch 장갑 + 잡는 순간 "CATCH" 팝, magnet 점선 원 220, press 상대 발밑 그물 무늬, train 증기 입자(흰 원, 위로 올라가며 커지고 사라짐)·홍조·기관차 몸체, slide 바닥 잔디 튀는 입자, cannon 맞은 상대 "!" 팝. 발동 순간 중앙에 `{이름} {필살기명}` 0.8초.
- [ ] **Step 2: 게이지 100 일 때 필살기 버튼 링 골드 + 맥동**, 쓰면 링 비움. 교체 버튼은 쓰고 나면 `disabled` + 흐림.
- [ ] **Step 3: 한 판 직접 플레이**(키보드) 하며 끼임·튕김·속도감이 설계서 수치에서 어색한 곳을 메모. 수치를 바꾸면 설계서 9절과 `constants.js` 주석을 같이 고치고 `npm test` 와 `npm run selfplay -- 60 first` 를 다시 돌린다.
- [ ] **Step 4: Commit** — `"필살기 연출과 손맛 조정"`.

---

### Task 12: 기기 확인, 접근성, 배포

**Files:**
- Modify: `README.md`, `tools/shots.js`

- [ ] **Step 1: 기기 스크린샷** — `tools/shots.js` 로 iPhone SE·iPhone 13·Pixel 7·Galaxy S9+(모두 세로 뷰포트 → 회전된 화면) 선택·경기·결과 세 장씩. 버튼이 엄지 영역(양끝 150px)에 있고 캔버스와 겹치지 않는지, 글자가 잘리지 않는지 확인.
- [ ] **Step 2: 접근성** — 모든 `<button>` 에 `aria-label`, 키보드만으로 선택 → 경기 → 결과까지 진행되는지 Playwright 로 Tab/Enter/화살표 시나리오 1회. `prefers-reduced-motion: reduce` 에뮬레이션으로 입자·흔들림이 꺼지는지 확인.
- [ ] **Step 3: 최종 밸런스표** — `npm run selfplay -- 200 first` 결과를 `docs/balance-2026-10-31.md` 로 저장하고 커밋. 선수별 평균 35–65% 확인, 벗어난 선수는 README "알려진 점" 에 적는다.
- [ ] **Step 4: 배포** — `gh repo create ROBINKIM0221/ulsan-head-soccer --public --source . --push`, Pages 는 `gh api -X POST repos/ROBINKIM0221/ulsan-head-soccer/pages -f build_type=legacy -f "source[branch]=main" -f "source[path]=/"`. README 의 플레이 주소를 `https://robinkim0221.github.io/ulsan-head-soccer/` 로 채우고 공유 문구 링크 확인. 배포 뒤 iPhone 13 프로필로 실제 주소를 열어 선택 화면 스크린샷 한 장.
- [ ] **Step 5: Commit & push** — `"기기 확인, 접근성, 배포 주소"`.

---

## Self-Review 결과

- **설계서 대조:** 1절 성공 기준(인앱 세로 → Task 9 회전, 30초 안 시작 → Task 10 기억된 선택·두 번 탭), 4절 화면 다섯 → Task 10, 5절 규칙 → Task 4, 6절 조작 → Task 9, 7절 물리 → Task 2, 8절 게이지·우선순위 → Task 4·5·6·7, 9절 12명 → Task 1·5·6·7, 밸런스 → Task 8·12, 10절 AI → Task 3, 11절 시각 → Task 9·10·11, 12절 접근성 → Task 12, 14절 2차(소리 훅) → 이벤트 배열로 준비됨. 빠진 것 없음.
- **이름 일관성:** `stepPhysics(world, inputs, dt, hooks)` 는 Task 2 에서 3개 인자로 시작해 Task 6 에서 4번째(기본값)를 더한다 — 명시함. `active.armed`, `ball.flight`, `ball.attached`, `ball.held`, `body.pinned`, `mods.*` 는 Shared Interfaces 에만 정의하고 각 태스크가 참조한다.
- **Review Focus 다섯 항목의 테스트 위치:** 1→Task 2, 2·3·4→Task 9, 5→Task 4·5. 모두 들어 있음.
- **비율:** 계획은 설계서의 약 두 배 분량이며 코드 본문 없이 서명·수치·테스트 이름만 적었다.
