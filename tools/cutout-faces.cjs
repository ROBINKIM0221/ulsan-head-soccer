// 얼굴 사진(img/N.jpg, 밝은 회색 무늬 배경)에서 배경을 빼 img/Nc.png 로 저장한다 (경기 화면용 컷아웃).
// 밝고 채도 낮은 픽셀을 가장자리에서부터 번져 가며 지우고, 아래쪽(어깨)은 서서히 투명하게 한다.
// 사용: python -m http.server 8766 을 띄운 뒤  node tools/cutout-faces.cjs
const PW = 'C:/Users/robin/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright';
const { chromium } = require(PW);
const fs = require('node:fs');
const NUMBERS = [10, 11, 14, 15, 19, 21, 24, 26, 38, 55, 96, 99];

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:8766/');
  for (const n of NUMBERS) {
    const dataUrl = await page.evaluate(async (n) => {
      const img = new Image(); img.src = `img/${n}.jpg`; await img.decode();
      const w = img.width, h = img.height;
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, w, h), px = d.data;
      const isBg = i => { const r = px[i], g = px[i + 1], b = px[i + 2]; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx > 135 && mx - mn < 55; };
      // 머리가 들어가는 타원: 중심 (0.5w, 0.55h), 반지름 (0.42w, 0.5h). 밖은 무조건 배경.
      const cx = 0.5 * w, cy = 0.55 * h, rx = 0.42 * w, ry = 0.5 * h;
      const outside = (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 > 1;
      const mark = new Uint8Array(w * h); const q = [];
      const push = (x, y) => { const k = y * w + x; if (mark[k] || !isBg(k * 4)) return; mark[k] = 1; q.push(k); };
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (!outside(x, y)) continue;
        mark[y * w + x] = 1;
        // 타원 바로 안쪽 이웃에서 번지기 시작
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < w && ny < h && !outside(nx, ny)) push(nx, ny); }
      }
      while (q.length) { const k = q.pop(); const x = k % w, y = (k / w) | 0; if (x > 0) push(x - 1, y); if (x < w - 1) push(x + 1, y); if (y > 0) push(x, y - 1); if (y < h - 1) push(x, y + 1); }
      // 가장자리 부드럽게: 배경과 맞닿은 픽셀은 반투명
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const k = y * w + x;
        if (mark[k]) { px[k * 4 + 3] = 0; continue; }
        const nb = (x > 0 && mark[k - 1]) || (x < w - 1 && mark[k + 1]) || (y > 0 && mark[k - w]) || (y < h - 1 && mark[k + w]);
        if (nb) px[k * 4 + 3] = 150;
      }
      // 아래 어깨는 서서히 사라진다 (몸 그림이 덮는다)
      for (let y = Math.floor(h * 0.8); y < h; y++) { const f = 1 - (y - h * 0.8) / (h * 0.2); for (let x = 0; x < w; x++) px[(y * w + x) * 4 + 3] = Math.round(px[(y * w + x) * 4 + 3] * f); }
      ctx.putImageData(d, 0, 0);
      return c.toDataURL('image/png');
    }, n);
    fs.writeFileSync(`img/${n}c.png`, Buffer.from(dataUrl.split(',')[1], 'base64'));
    console.log(`img/${n}c.png`);
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
