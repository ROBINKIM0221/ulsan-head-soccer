// 화면 확인: 데스크톱과 폰 프로필로 스크린샷을 찍고, 회전된 버튼 탭·멀티터치·키보드·복귀 카운트다운·스와이프가 먹는지 검사한다.
// 사용: python -m http.server 8766 을 띄운 뒤  node tools/shots.cjs [out=shots]
const PW = 'C:/Users/robin/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright';
const { chromium, devices } = require(PW);
const fs = require('node:fs');
const BASE = 'http://127.0.0.1:8766/';
const OUT = process.argv[2] || 'shots';
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok, info }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  ' + info : ''}`); };
const setHidden = (page, hidden) => page.evaluate(h => { Object.defineProperty(document, 'hidden', { get: () => h, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }, hidden);

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });

  // (a) 데스크톱 경기 화면 + 키보드 + 교체 버튼 상태 + 복귀 카운트다운 + 결과 화면 루프 정지
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(BASE + '?debug=1');
    await page.waitForFunction(() => window.__debug && window.__debug.match.phase === 'kickoff', null, { timeout: 8000 });
    check('sub button disabled during kickoff', await page.evaluate(() => document.querySelector('[data-btn="sub"]').disabled));
    await page.waitForFunction(() => window.__debug && window.__debug.match.phase === 'play', null, { timeout: 8000 });
    await page.waitForTimeout(100);
    check('sub button enabled during play', await page.evaluate(() => !document.querySelector('[data-btn="sub"]').disabled));
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/desktop-play.png` });
    const x0 = await page.evaluate(() => window.__debug.world.players.L.x);
    await page.keyboard.down('ArrowRight'); await page.waitForTimeout(500); await page.keyboard.up('ArrowRight');
    const x1 = await page.evaluate(() => window.__debug.world.players.L.x);
    check('keyboard ArrowRight moves L', x1 - x0 > 120, `dx=${(x1 - x0).toFixed(0)}`);
    await page.keyboard.press('Space');
    await page.waitForTimeout(120);
    check('keyboard Space jumps', await page.evaluate(() => !window.__debug.world.players.L.onGround));
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/desktop-kb.png` });
    // 백그라운드 → 복귀: 루프가 멈추고, 돌아오면 3초 카운트다운이 보이는 동안 여전히 멈춰 있다가 다시 돈다
    await setHidden(page, true);
    await page.waitForTimeout(100);
    check('loop stops when hidden', await page.evaluate(() => window.__debug.loop && window.__debug.loop.running === false));
    await setHidden(page, false);
    await page.waitForTimeout(150);
    const cd = await page.evaluate(() => ({ n: window.__debug.countdown, running: window.__debug.loop.running }));
    check('resume shows a countdown while the loop is still stopped', cd.n === 3 && cd.running === false, JSON.stringify(cd));
    await page.screenshot({ path: `${OUT}/desktop-countdown.png` });
    await page.waitForTimeout(3200);
    const cd2 = await page.evaluate(() => ({ n: window.__debug.countdown, running: window.__debug.loop.running }));
    check('after the countdown the loop runs again', cd2.n == null && cd2.running === true, JSON.stringify(cd2));
    // 결과 화면에서는 루프가 멈춘다
    await page.goto(BASE + '?debug=result');
    await page.waitForSelector('.sheet.result');
    await page.waitForTimeout(1600);
    check('loop stops on the result screen', await page.evaluate(() => window.__debug.loop.running === false));
    await ctx.close();
  }

  // (b)(c)(d) 아이폰 세로 뷰포트 → 회전된 가로 게임
  {
    const dev = devices['iPhone 13'];
    const ctx = await browser.newContext({ ...dev });
    const page = await ctx.newPage();
    await page.goto(BASE + '?debug=1');
    await page.waitForFunction(() => window.__debug && window.__debug.match.phase === 'play', null, { timeout: 8000 });
    await page.evaluate(() => { window.__debug.world.ball.held = { side: 'R', t: 999 }; });   // 검사 중 골이 나서 킥오프(입력 무시)로 가지 않게 공을 세워 둔다
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/iphone-portrait.png` });
    const rotated = await page.evaluate(() => document.getElementById('stage').dataset.rotated);
    check('stage rotated in portrait viewport', rotated === '1');
    const box = await page.locator('[data-btn="jump"]').boundingBox();
    check('jump button has a hit box', !!box && box.width > 40, JSON.stringify(box));
    const sizes = await page.evaluate(() => [...document.querySelectorAll('.pad .ctl')].map(b => { const r = b.getBoundingClientRect(); return [b.dataset.btn, Math.round(r.width), Math.round(r.height)]; }));
    check('every control button is at least 64px', sizes.every(s => s[1] >= 64 && s[2] >= 64), JSON.stringify(sizes));
    // 모든 터치는 같은 CDP 세션으로 보낸다 (page.touchscreen 과 섞으면 다음 터치 id 가 꼬인다)
    const client = await ctx.newCDPSession(page);
    const pt = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
    const pJ = pt(box);
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...pJ, id: 1 }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(150);
    check('rotated tap hits jump button', await page.evaluate(() => !window.__debug.world.players.L.onGround));
    await page.waitForFunction(() => window.__debug.world.players.L.onGround, null, { timeout: 3000 });   // 앞 점프가 끝난 뒤
    await page.waitForTimeout(200);
    // 멀티터치: ◀ 를 누른 채 점프를 탭
    const left = await page.locator('[data-btn="left"]').boundingBox();
    const pL = pt(left);
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...pL, id: 1 }] });
    await page.waitForTimeout(250);
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...pL, id: 1 }, { ...pJ, id: 2 }] });
    await page.waitForTimeout(120);
    const st = await page.evaluate(() => ({ vx: window.__debug.world.players.L.vx, air: !window.__debug.world.players.L.onGround }));
    check('multitouch move+jump', st.vx < 0 && st.air, JSON.stringify(st));
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.screenshot({ path: `${OUT}/iphone-play.png` });

    // 회전된 선택 화면에서 카드 스와이프(물리적 좌우 = 화면 세로)로 선수가 바뀐다
    await page.goto(BASE);
    await page.waitForSelector('.sheet.select');
    const before = await page.textContent('.who .name');
    const card = await page.locator('.card').boundingBox();
    const cx = card.x + card.width / 2, cy = card.y + card.height / 2;
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 1 }] });
    for (let i = 1; i <= 6; i++) await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx, y: cy + i * 25, id: 1 }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(150);
    const after = await page.textContent('.who .name');
    check('rotated swipe changes the player', before !== after, `${before} → ${after}`);
    await ctx.close();
  }

  await browser.close();
  const fails = results.filter(r => !r.ok);
  console.log(fails.length ? `\n${fails.length} check(s) failed` : '\nall checks passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
