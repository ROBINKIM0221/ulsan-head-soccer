// 화면 확인: 데스크톱과 폰 프로필로 스크린샷을 찍고, 회전된 버튼 탭·멀티터치·키보드가 먹는지 검사한다.
// 사용: python -m http.server 8766 을 띄운 뒤  node tools/shots.cjs [out=shots]
const PW = 'C:/Users/robin/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright';
const { chromium, devices } = require(PW);
const fs = require('node:fs');
const BASE = 'http://127.0.0.1:8766/';
const OUT = process.argv[2] || 'shots';
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok, info }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  ' + info : ''}`); };

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });

  // (a) 데스크톱 경기 화면
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(BASE + '?debug=1');
    await page.waitForFunction(() => window.__debug && window.__debug.match.phase === 'play', null, { timeout: 8000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/desktop-play.png` });
    // (e) 키보드 오른쪽 0.5초 → L.x 증가
    const x0 = await page.evaluate(() => window.__debug.world.players.L.x);
    await page.keyboard.down('ArrowRight'); await page.waitForTimeout(500); await page.keyboard.up('ArrowRight');
    const x1 = await page.evaluate(() => window.__debug.world.players.L.x);
    check('keyboard ArrowRight moves L', x1 - x0 > 120, `dx=${(x1 - x0).toFixed(0)}`);
    await page.keyboard.press('Space');
    await page.waitForTimeout(120);
    check('keyboard Space jumps', await page.evaluate(() => !window.__debug.world.players.L.onGround));
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/desktop-kb.png` });
    await ctx.close();
  }

  // (b)(c)(d) 아이폰 세로 뷰포트 → 회전된 가로 게임
  {
    const dev = devices['iPhone 13'];
    const ctx = await browser.newContext({ ...dev });
    const page = await ctx.newPage();
    await page.goto(BASE + '?debug=1');
    await page.waitForFunction(() => window.__debug && window.__debug.match.phase === 'play', null, { timeout: 8000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/iphone-portrait.png` });
    const rotated = await page.evaluate(() => document.getElementById('stage').dataset.rotated);
    check('stage rotated in portrait viewport', rotated === '1');
    // 회전된 점프 버튼의 화면 좌표를 탭
    const box = await page.locator('[data-btn="jump"]').boundingBox();
    check('jump button has a hit box', !!box && box.width > 40, JSON.stringify(box));
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(150);
    check('rotated tap hits jump button', await page.evaluate(() => !window.__debug.world.players.L.onGround));
    await page.waitForTimeout(900);
    // 멀티터치: ◀ 를 누른 채 점프를 탭
    const left = await page.locator('[data-btn="left"]').boundingBox();
    const client = await ctx.newCDPSession(page);
    const pt = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
    const pL = pt(left), pJ = pt(box);
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...pL, id: 1 }] });
    await page.waitForTimeout(250);
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...pL, id: 1 }, { ...pJ, id: 2 }] });
    await page.waitForTimeout(100);
    const st = await page.evaluate(() => ({ vx: window.__debug.world.players.L.vx, air: !window.__debug.world.players.L.onGround }));
    check('multitouch move+jump', st.vx < 0 && st.air, JSON.stringify(st));
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.screenshot({ path: `${OUT}/iphone-play.png` });
    await ctx.close();
  }

  await browser.close();
  const fails = results.filter(r => !r.ok);
  console.log(fails.length ? `\n${fails.length} check(s) failed` : '\nall checks passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
