// 기기 확인: 폰 4기종(세로 뷰포트 → 회전된 화면)에서 선택·경기·결과 세 장씩, 데스크톱 키보드만으로 흐름 1회, 움직임 줄이기 설정.
// 사용: python -m http.server 8766 을 띄운 뒤  node tools/shots-devices.cjs [out=shots/devices]
const PW = 'C:/Users/robin/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright';
const { chromium, devices } = require(PW);
const fs = require('node:fs');
const BASE = 'http://127.0.0.1:8766/';
const OUT = process.argv[2] || 'shots/devices';
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, info = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  ' + info : ''}`); };

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  for (const name of ['iPhone SE', 'iPhone 13', 'Pixel 7', 'Galaxy S9+']) {
    const slug = name.replace(/[^a-z0-9]+/gi, '').toLowerCase();
    const ctx = await browser.newContext({ ...devices[name] });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE); await page.waitForSelector('.sheet.select'); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(300);
    const m = await page.evaluate(() => {
      const st = document.getElementById('stage').getBoundingClientRect(), o = document.getElementById('overlay');
      const btns = [...document.querySelectorAll('.pad .ctl')].map(b => b.getBoundingClientRect());
      const cv = document.getElementById('game').getBoundingClientRect();
      const overlap = btns.some(b => b.left < cv.right && b.right > cv.left && b.top < cv.bottom && b.bottom > cv.top);
      return { rotated: document.getElementById('stage').dataset.rotated, overflow: o.scrollHeight - o.clientHeight, overlap, stage: [Math.round(st.width), Math.round(st.height)] };
    });
    check(`${name} select fits (rotated=${m.rotated})`, m.overflow <= 0 && m.rotated === '1', `overflow ${m.overflow}px, stage ${m.stage}`);
    check(`${name} buttons do not overlap the canvas`, !m.overlap);
    await page.screenshot({ path: `${OUT}/${slug}-select.png` });
    await page.goto(BASE + '?debug=1'); await page.waitForFunction(() => window.__debug && window.__debug.match.phase === 'play', null, { timeout: 8000 }); await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/${slug}-play.png` });
    await page.goto(BASE + '?debug=result'); await page.waitForSelector('.sheet.result'); await page.waitForTimeout(300);
    const ov = await page.evaluate(() => { const o = document.getElementById('overlay'); return o.scrollHeight - o.clientHeight; });
    check(`${name} result fits`, ov <= 0, `overflow ${ov}px`);
    await page.screenshot({ path: `${OUT}/${slug}-result.png` });
    check(`${name} no page errors`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // 키보드만으로: Enter(경기 시작) → 경기 → 시계 단축 → 결과 → Tab/Enter(다시 하기) → VS
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(BASE); await page.waitForSelector('.sheet.select');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.sheet.vs');
    await page.waitForFunction(() => document.getElementById('overlay').hidden, null, { timeout: 5000 });
    await page.waitForFunction(() => window.__debug && window.__debug.match.phase === 'play', null, { timeout: 5000 });
    await page.keyboard.down('ArrowRight'); await page.waitForTimeout(300); await page.keyboard.up('ArrowRight');
    await page.keyboard.press('Space'); await page.keyboard.press('KeyZ');
    await page.evaluate(() => { window.__debug.match.clock = 1.5; window.__debug.match.scores.L = 2; });
    await page.waitForSelector('.sheet.result', { timeout: 15000 });
    const focused = await page.evaluate(() => document.activeElement && document.activeElement.textContent);
    check('keyboard flow reaches the result screen with focus on 다시 하기', focused === '다시 하기', `focus=${focused}`);
    await page.keyboard.press('Enter');
    await page.waitForSelector('.sheet.vs', { timeout: 5000 });
    check('Enter on 다시 하기 starts a new match', true);
    await ctx.close();
  }

  // 움직임 줄이기: 입자·흔들림이 쌓이지 않는다
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto(BASE + '?debug=1&special=1&home=55');
    await page.waitForFunction(() => window.__debug && window.__debug.match.phase === 'play', null, { timeout: 8000 });
    await page.keyboard.press('KeyX'); await page.waitForTimeout(600);
    const st = await page.evaluate(() => ({ reduce: window.__debug.fx.reduceMotion, particles: window.__debug.fx.particles.length, ghosts: window.__debug.fx.ghosts.length }));
    check('reduced motion: no particles or ghosts', st.reduce === true && st.particles === 0 && st.ghosts === 0, JSON.stringify(st));
    await ctx.close();
  }
  // aria-label 전수
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(BASE); await page.waitForSelector('.sheet.select');
    const missing = await page.evaluate(() => [...document.querySelectorAll('button')].filter(b => !(b.getAttribute('aria-label') || b.textContent.trim())).length);
    check('every button has a name', missing === 0, `${missing} unnamed`);
    await ctx.close();
  }
  await browser.close();
  const fails = results.filter(r => !r).length;
  console.log(fails ? `\n${fails} check(s) failed` : '\nall checks passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
