// 필살기 연출 점검: 선수마다 게이지 100 으로 시작해 X 로 발동하고(한 방형은 공 쪽으로 달려가 Z 로 차고) 스크린샷을 찍는다.
// 사용: python -m http.server 8766 을 띄운 뒤  node tools/shots-specials.cjs [out=shots/specials]
const PW = 'C:/Users/robin/AppData/Roaming/npm/node_modules/playwright';
const { chromium } = require(PW);
const fs = require('node:fs');
const BASE = 'http://127.0.0.1:8766/';
const OUT = process.argv[2] || 'shots/specials';
fs.mkdirSync(OUT, { recursive: true });

const PLAYERS = [[10, 'laser'], [11, 'sprint'], [14, 'curve'], [15, 'highjump'], [19, 'giant'], [21, 'catch'], [24, 'magnet'], [26, 'spirit'], [38, 'press'], [55, 'train'], [96, 'slide'], [99, 'cannon']];

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('page error:', e.message));
  for (const [no, id] of PLAYERS) {
    await page.goto(`${BASE}?debug=1&special=1&home=${no}&away=${no === 19 ? 10 : 19}`);
    await page.waitForFunction(() => window.__debug && window.__debug.match.phase === 'play', null, { timeout: 8000 });
    // 공을 내 발 앞에 두고(상대는 멀리) 발동
    await page.evaluate(() => {
      const w = window.__debug.world; const L = w.players.L, R = w.players.R;
      L.x = 560; R.x = 760; R.stun = 3;
      Object.assign(w.ball, { held: null, attached: null, x: 600, y: 500, vx: 0, vy: 0 });
    });
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(250);
    if (['laser', 'curve', 'longthrow'].includes(id)) {
      await page.evaluate(() => { const w = window.__debug.world; Object.assign(w.ball, { x: w.players.L.x + 45, y: 618, vx: 0, vy: 0 }); });
      await page.keyboard.press('KeyZ');
      await page.waitForTimeout(id === 'longthrow' ? 450 : 180);
    } else if (id === 'train') {
      await page.keyboard.down('ArrowRight'); await page.waitForTimeout(350); await page.keyboard.up('ArrowRight');
    } else if (id === 'highjump') {
      await page.keyboard.press('Space'); await page.waitForTimeout(200);
    } else if (id === 'cannon') {
      await page.evaluate(() => { const w = window.__debug.world; const L = w.players.L; Object.assign(w.ball, { x: L.x + 90, y: 515, vx: -600, vy: 0 }); });
      await page.waitForTimeout(200);
    } else {
      await page.waitForTimeout(400);
    }
    const state = await page.evaluate(() => { const L = window.__debug.world.players.L; return { active: L.active && L.active.id, armed: L.active && L.active.armed, flight: window.__debug.world.ball.flight, scale: L.scale }; });
    console.log(no, id, JSON.stringify(state));
    await page.screenshot({ path: `${OUT}/${String(no).padStart(2, '0')}-${id}.png` });
  }
  await browser.close();
  console.log('done');
})().catch(e => { console.error(e); process.exit(1); });
