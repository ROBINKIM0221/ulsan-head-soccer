// 화면 흐름 스크린샷: 선택(스와이프 포함)·VS·교체·결과를 아이폰(회전)·Pixel·데스크톱에서 찍는다.
// 사용: python -m http.server 8766 을 띄운 뒤  node tools/shots-screens.cjs [out=shots]
const PW = 'C:/Users/robin/AppData/Roaming/npm/node_modules/playwright';
const { chromium, devices } = require(PW);
const fs = require('node:fs');
const BASE = 'http://127.0.0.1:8766/';
const OUT = process.argv[2] || 'shots';
fs.mkdirSync(OUT, { recursive: true });

const targets = [
  ['iphone13', { ...devices['iPhone 13'] }],
  ['pixel7', { ...devices['Pixel 7'] }],
  ['desktop', { viewport: { width: 1280, height: 800 } }],
];

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  for (const [name, opts] of targets) {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    page.on('pageerror', e => console.log(`[${name}] page error:`, e.message));
    await page.goto(BASE);
    await page.waitForSelector('.sheet.select');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/${name}-select.png` });
    const overflow = await page.evaluate(() => { const o = document.getElementById('overlay'); return o.scrollHeight - o.clientHeight; });
    console.log(`${name} select overflow: ${overflow}px`);
    // 다음 선수 두 번 → 세 번째 선수
    await page.click('.arrow.next'); await page.click('.arrow.next');
    const third = await page.textContent('.who .name');
    console.log(`${name} third player: ${third}`);
    await page.screenshot({ path: `${OUT}/${name}-select-3.png` });
    // 시작 → VS
    await page.click('.action');
    await page.waitForSelector('.sheet.vs');
    await page.screenshot({ path: `${OUT}/${name}-vs.png` });
    await ctx.close();
  }
  // 교체 오버레이와 결과 화면 (아이폰 회전)
  {
    const ctx = await browser.newContext({ ...devices['iPhone 13'] });
    const page = await ctx.newPage();
    await page.goto(BASE + '?debug=sub');
    await page.waitForSelector('.sheet.sub-select', { timeout: 8000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/iphone13-sub.png` });
    await page.goto(BASE + '?debug=result');
    await page.waitForSelector('.sheet.result', { timeout: 8000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/iphone13-result.png` });
    await ctx.close();
  }
  await browser.close();
  console.log('done');
})().catch(e => { console.error(e); process.exit(1); });
