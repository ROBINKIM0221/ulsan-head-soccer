// 선수 공식 배너(1024×576, 얼굴이 왼쪽, 흰 종이 배경 + 오른쪽 파란 패널)에서 얼굴을 찾아
//   img/N.jpg  — 선택 화면용 정사각 256 (얼굴이 가운데, 모두 같은 크기, 배경은 구단 파랑으로 통일)
//   img/Nc.png — 경기용 컷아웃 256 (배경·유니폼 제거, 턱 아래는 서서히 투명)
// 를 만든다. 얼굴 위치·크기는 피부색 픽셀로 자동 측정한다 (배너마다 서 있는 자리가 달라 고정 박스로는 치우친다).
// 사용: node tools/faces.cjs [--sheet out.png]   (서버 필요 없음)
const PW = 'C:/Users/robin/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright';
const { chromium } = require(PW);
const fs = require('node:fs');
const path = require('node:path');
const SRC = 'C:/Users/robin/Desktop/울산 선수 프로필';
const IMG = path.join(__dirname, '..', 'img');
const MAP = { 10: '10_이동경', 11: '11_에릭', 14: '14_이진현', 15: '15_정승현', 19: '19_김영권', 21: '21_조현우', 24: '24_이규성', 99: '99_야고', 26: '조현택', 38: '박용우', 55: '토마스', 96: '최석현' };
const SIZE = 256;
const sheetAt = process.argv.indexOf('--sheet');
const SHEET = sheetAt > 0 ? process.argv[sheetAt + 1] : null;

// 브라우저 안에서 도는 부분: 배너 → { jpg, png, box }
function processBanner({ dataUrl, SIZE }) {
  return (async () => {
    const img = new Image(); img.src = dataUrl; await img.decode();
    const W = img.width, H = img.height;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
    const px = ctx.getImageData(0, 0, W, H).data;
    const at = (x, y) => (y * W + x) * 4;
    // 종이 배경: 아주 밝고 완전히 무채색인 픽셀만 (그늘진 피부는 회색빛이어도 붉은 기가 남아 r-b 로 걸러진다)
    const light = i => { const r = px[i], g = px[i + 1], b = px[i + 2]; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx > 170 && mx - mn < 24 && r - b < 16; };
    const lightLoose = i => { const r = px[i], g = px[i + 1], b = px[i + 2]; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx > 150 && mx - mn < 30 && r - b < 25; };   // 머리 꼭대기 줄 찾기용
    const blue = i => { const r = px[i], g = px[i + 1], b = px[i + 2]; return b > r + 40 && b > g + 5 && b > 90; };
    const skin = i => { const r = px[i], g = px[i + 1], b = px[i + 2]; return r > 95 && g > 40 && b > 20 && r > g && g > b && r - b > 15 && Math.abs(r - g) > 15 && !(r > 200 && g > 150 && b < 110); };   // 마지막 조건: 유니폼 노란 띠 제외

    // 1) 머리 꼭대기: 왼쪽 절반에서 배경(흰 종이·파랑)이 아닌 픽셀이 처음 나오는 줄
    const SX0 = 40, SX1 = Math.floor(W * 0.6);
    let headTop = -1;
    for (let y = 0; y < H && headTop < 0; y++) {
      let n = 0;
      for (let x = SX0; x < SX1; x++) { const i = at(x, y); if (!lightLoose(i) && !blue(i)) n++; }
      if (n >= 12) headTop = y;
    }
    // 2) 얼굴: 줄마다 피부색 구간(6px 미만 잡티 제외)의 전체 범위. 폭은 상위 5% 값, 중심은 폭이 넓은 줄(이마·볼)의 중앙값
    const runs = [];
    for (let y = headTop + 30; y < Math.min(H, headTop + 230); y++) {
      let x0 = -1, x1 = -1, n = 0, cur = null;
      const close = () => { if (cur && cur.x1 - cur.x0 >= 6) { if (x0 < 0) x0 = cur.x0; x1 = cur.x1; n += cur.x1 - cur.x0 + 1; } cur = null; };
      for (let x = SX0; x <= SX1; x++) {
        if (x < SX1 && skin(at(x, y))) { if (cur) cur.x1 = x; else cur = { x0: x, x1: x }; }
        else close();
      }
      if (n >= 25) runs.push({ y, x0, x1, w: x1 - x0 });
    }
    const widths = runs.map(r => r.w).sort((a, b) => a - b);
    const faceW = widths[Math.floor(widths.length * 0.95)];
    const centers = runs.filter(r => r.w >= faceW * 0.8).map(r => (r.x0 + r.x1) / 2).sort((a, b) => a - b);
    const cx = centers[Math.floor(centers.length / 2)];
    // 크롭 사각형 (임시 → 최종). 피부 폭은 피부색·수염에 따라 들쭉날쭉해서 머리 덩어리(머리카락 포함) 폭으로 크기를 정한다
    let S, sx, sy;
    const setCrop = (centerX, side) => { S = Math.round(side); sx = Math.round(centerX - S / 2); sy = Math.round(headTop - S * 0.08); };
    const inside = (x, y) => x >= sx && x < sx + S && y >= sy && y < sy + S && x >= 0 && y >= 0 && x < W && y < H;

    // 테두리에서 번지는 배경 마스크 (크롭 사각형 안, 원본 좌표)
    function flood(isBg) {
      const mark = new Uint8Array(W * H); const q = [];
      const seed = (x, y) => { if (!inside(x, y)) return; const k = y * W + x; if (mark[k] || !isBg(k * 4, k)) return; mark[k] = 1; q.push(k); };
      for (let x = sx; x < sx + S; x++) { seed(x, sy); seed(x, sy + S - 1); }
      for (let y = sy; y < sy + S; y++) { seed(sx, y); seed(sx + S - 1, y); }
      while (q.length) { const k = q.pop(); const x = k % W, y = (k / W) | 0; seed(x - 1, y); seed(x + 1, y); seed(x, y - 1); seed(x, y + 1); }
      return open(mark, 2);
    }
    // 열림: 반지름 r 로 깎았다가 다시 불린다. 2r 보다 가는 배경 가지(귀 하이라이트로 새어 든 것)가 사라진다. 크롭 밖은 배경으로 친다.
    function open(mask, r) {
      const x0 = Math.max(0, sx), x1 = Math.min(W, sx + S), y0 = Math.max(0, sy), y1 = Math.min(H, sy + S);
      const er = new Uint8Array(W * H), out = new Uint8Array(W * H);
      const get = (x, y) => (x < x0 || x >= x1 || y < y0 || y >= y1) ? 1 : mask[y * W + x];
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        let all = 1; for (let dy = -r; dy <= r && all; dy++) for (let dx = -r; dx <= r; dx++) if (!get(x + dx, y + dy)) { all = 0; break; }
        er[y * W + x] = all;
      }
      const getE = (x, y) => (x < x0 || x >= x1 || y < y0 || y >= y1) ? 1 : er[y * W + x];
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        let any = 0; for (let dy = -r; dy <= r && !any; dy++) for (let dx = -r; dx <= r; dx++) if (getE(x + dx, y + dy)) { any = 1; break; }
        out[y * W + x] = any;
      }
      return out;
    }
    // 배경이 아닌 픽셀을 연결 덩어리로 나누고 가장 큰 것의 번호를 돌려준다
    function components(bg) {
      const label = new Int32Array(W * H); let bestId = 0, bestN = 0, nextId = 0;
      for (let y = Math.max(0, sy); y < Math.min(H, sy + S); y++) for (let x = Math.max(0, sx); x < Math.min(W, sx + S); x++) {
        const k0 = y * W + x; if (bg[k0] || label[k0]) continue;
        const id = ++nextId; let n = 0; const st = [k0]; label[k0] = id;
        while (st.length) { const k = st.pop(); n++; const kx = k % W, ky = (k / W) | 0;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = kx + dx, ny = ky + dy; if (!inside(nx, ny)) continue; const nk = ny * W + nx; if (bg[nk] || label[nk]) continue; label[nk] = id; st.push(nk); } }
        if (n > bestN) { bestN = n; bestId = id; }
      }
      return { label, bestId };
    }
    const scaled = (draw) => { const o = document.createElement('canvas'); o.width = SIZE; o.height = SIZE; const g = o.getContext('2d'); g.imageSmoothingQuality = 'high'; draw(g); return o; };

    // 머리 덩어리: 종이·파랑(유니폼·패널)을 테두리에서 지운 뒤 가장 큰 연결 덩어리. 턱 위 줄에서 잰 가로 범위가 머리 폭.
    function headBlob(chin) {
      const bg = flood(i => light(i) || blue(i));
      const { label, bestId } = components(bg);
      let hx0 = W, hx1 = 0;
      for (let y = Math.max(0, sy); y < Math.min(H, chin); y++) for (let x = Math.max(0, sx); x < Math.min(W, sx + S); x++) if (label[y * W + x] === bestId) { hx0 = Math.min(hx0, x); hx1 = Math.max(hx1, x); }
      return { bg, label, bestId, hx0, hx1 };
    }
    setCrop(cx, faceW * 2.3);                                   // 임시 크롭(넉넉히)
    const first = headBlob(headTop + faceW * 1.3);
    const headW = first.hx1 - first.hx0, headCx = (first.hx0 + first.hx1) / 2;
    const chin = headTop + headW * 1.3;
    setCrop((cx + headCx) / 2, headW * 1.85);                   // 최종: 얼굴 중심과 머리 중심의 중간, 한 변 = 머리 폭 × 1.85
    const { bg, label, bestId, hx0, hx1 } = headBlob(chin);
    // 3) 선택 화면용: 종이를 지우면 머리+유니폼이 가장 큰 덩어리(사람)로 남는다. 사람이 아닌 것(종이, 찢어진 가장자리 섬유, 종이 그늘 조각)은 전부 구단 파랑
    const bgJ = flood(i => light(i)), person = components(bgJ);
    const paper = new Uint8Array(W * H);
    for (let y = Math.max(0, sy); y < Math.min(H, sy + S); y++) for (let x = Math.max(0, sx); x < Math.min(W, sx + S); x++) { const k = y * W + x; paper[k] = bgJ[k] || person.label[k] !== person.bestId ? 1 : 0; }
    const jpgSrc = document.createElement('canvas'); jpgSrc.width = S; jpgSrc.height = S;
    const jctx = jpgSrc.getContext('2d');
    jctx.fillStyle = '#004098'; jctx.fillRect(0, 0, S, S);
    jctx.drawImage(c, sx, sy, S, S, 0, 0, S, S);
    const jd = jctx.getImageData(0, 0, S, S), jp = jd.data;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const X = sx + x, Y = sy + y, o = (y * S + x) * 4;
      if (!inside(X, Y) || paper[Y * W + X]) { jp[o] = 0; jp[o + 1] = 64; jp[o + 2] = 152; }
    }
    jctx.putImageData(jd, 0, 0);
    const jpg = scaled(g => g.drawImage(jpgSrc, 0, 0, SIZE, SIZE)).toDataURL('image/jpeg', 0.9);

    const cut = document.createElement('canvas'); cut.width = S; cut.height = S;
    const cctx = cut.getContext('2d');
    cctx.drawImage(c, sx, sy, S, S, 0, 0, S, S);
    const cd = cctx.getImageData(0, 0, S, S), cp = cd.data;
    const fadeFrom = chin - sy - headW * 0.03, fadeTo = chin - sy + headW * 0.15;   // 턱 바로 아래에서 목이 사라진다 (몸 그림이 덮는다)
    const neck0 = (hx0 + hx1) / 2 - headW * 0.28, neck1 = (hx0 + hx1) / 2 + headW * 0.28;   // 턱 아래 줄은 목 폭만 남긴다
    // 턱 아래 목 폭 안쪽은 경기 화면에서 몸통(46px)이 덮으므로 빠르게 페이드만 한다. 턱 옆(목 폭 밖)에 걸린 옷깃만 유니폼 색으로 지운다.
    const kitLike = i => { const r = px[i], g = px[i + 1], b = px[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const h = mx === mn ? 0 : mx === r ? (60 * (g - b) / (mx - mn) + 360) % 360 : mx === g ? 60 * (2 + (b - r) / (mx - mn)) : 60 * (4 + (r - g) / (mx - mn));
      return (b > r + 50 && b > g + 20 && b > 90) || (mx > 150 && (mx - mn) / mx > 0.15 && h > 40 && h < 75) || (r > 180 && g < 140 && b > 120); };   // 유니폼 파랑(턱 그늘의 푸른 기는 제외)·노란 띠(연한 것 포함, 색상각 40~75°; 피부는 10~35°)·GK 분홍
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const X = sx + x, Y = sy + y, o = (y * S + x) * 4;
      let a = 255;
      if (!inside(X, Y) || label[Y * W + X] !== bestId || X < hx0 - 3 || X > hx1 + 3) a = 0;
      else if (Y > chin && (X < neck0 || X > neck1)) a = 0;
      else if (Y > chin - headW * 0.15 && (X < neck0 || X > neck1) && kitLike((Y * W + X) * 4)) a = 0;
      else {
        const nb = (X > 0 && bg[Y * W + X - 1]) || (X < W - 1 && bg[Y * W + X + 1]) || (Y > 0 && bg[(Y - 1) * W + X]) || (Y < H - 1 && bg[(Y + 1) * W + X]);
        if (nb) a = 140;                                                         // 가장자리 한 픽셀은 반투명 (JPEG 테두리 완화)
        if (y > fadeFrom) a = Math.round(a * Math.max(0, 1 - (y - fadeFrom) / (fadeTo - fadeFrom)));
      }
      cp[o + 3] = a;
    }
    cctx.putImageData(cd, 0, 0);
    const png = scaled(g => g.drawImage(cut, 0, 0, SIZE, SIZE)).toDataURL('image/png');
    return { jpg, png, box: { sx, sy, S, headTop, faceW, headW, cx: Math.round(cx), head: [hx0, hx1] } };
  })();
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const b64 = f => 'data:image/jpeg;base64,' + fs.readFileSync(f).toString('base64');
  const rows = [];
  for (const [n, name] of Object.entries(MAP)) {
    const src = b64(path.join(SRC, name + '.jpg'));
    const r = await page.evaluate(processBanner, { dataUrl: src, SIZE }).catch(e => { throw new Error(`${name}: ${e.message}`); });
    fs.writeFileSync(path.join(IMG, `${n}.jpg`), Buffer.from(r.jpg.split(',')[1], 'base64'));
    fs.writeFileSync(path.join(IMG, `${n}c.png`), Buffer.from(r.png.split(',')[1], 'base64'));
    console.log(`${String(n).padStart(2)} ${name.padEnd(8)} headTop=${r.box.headTop} faceW=${r.box.faceW} cx=${r.box.cx} headW=${r.box.headW} crop=(${r.box.sx},${r.box.sy},${r.box.S}) head=${r.box.head}`);
    rows.push({ n, name, src, ...r });
  }
  if (SHEET) {
    await page.setContent(`<style>body{margin:0;background:#004098;font:12px sans-serif;color:#fff}
    .g{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;padding:8px}
    .c{display:flex;gap:8px;align-items:center;background:#0b2a66;padding:6px;border-radius:8px}
    .b{position:relative;width:384px;height:216px}.b img{width:100%;height:100%;outline:1px solid #fff5}
    .b i{position:absolute;border:2px solid #FFC72C;box-sizing:border-box}
    .r{width:128px;height:128px;border-radius:50%;outline:3px solid #fff;object-fit:cover}
    .k{width:128px;height:128px;background:repeating-conic-gradient(#2a5 0 25%,#1a3 0 50%) 0 0/16px 16px}
    .k img{width:128px;height:128px}</style>
    <div class="g">${rows.map(r => { const k = 384 / 1024; const b = r.box; return `<div class="c"><div><b>${r.n}</b><br>${r.name}</div><div class="b"><img src="${r.src}"><i style="left:${b.sx * k}px;top:${b.sy * k}px;width:${b.S * k}px;height:${b.S * k}px"></i></div><img class="r" src="${r.jpg}"><div class="k"><img src="${r.png}"></div></div>`; }).join('')}</div>`);
    await page.screenshot({ path: SHEET, fullPage: true });
    console.log(SHEET);
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
