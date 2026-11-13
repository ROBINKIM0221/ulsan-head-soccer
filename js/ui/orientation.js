// 항상 가로. 뷰포트가 세로면 stage 를 90° 눕혀서 폰을 돌리면 가로 게임이 되게 한다 (인스타 인앱은 세로 고정).
// 캔버스는 무대 전체를 덮고, 경기장(논리 1280×720)은 화면 폭에 맞춘다. 화면이 16:9 보다 세로로 길면 위아래 여백에, 아주 길쭉하면 좌우 여백에 경기장 그림이 이어진다
// (2026-11-12 형준 "UI랑 게임 최대한 예뻐보이게": 전엔 여백이 단색 파란 띠였다).
// 화면이 16:9 보다 옆으로 길면(노트북 창·폰) 높이에 맞추지 않고 폭에 맞춰 키운다: 하늘 위쪽과 잔디 아래쪽이 잘리고 선수와 공이 커진다
// (2026-11-13 형준 "왼쪽오른쪽 여백이 너무 많이 남는 것 같은데" → "추천대로 ㄱㄱ"; 전엔 높이에 맞춘 16:9 경기장 양옆에 빈 잔디가 남았다).

// 시트(선택·교체·일시정지·결과)를 화면에 맞추는 배율 (CSS --us → zoom). 가장 큰 시트는 2인 선택 화면: 폰 배치 358px, 큰 화면 배치 597px(설명이 두 줄인 선수일 때; 브라우저에서 잰 값).
// 폰(compact)은 높이의 94% 에 맞추고(0.9~1.2배), 큰 화면은 넉넉하면 키우고(최대 1.6배) 낮거나 좁은 창이면 넘치지 않게 줄인다.
export function sheetZoom(w, h, compact) {
  if (h < 340) return 1;   // tiny 배치는 320px 높이에 맞춰 둔 그대로
  if (compact) return Math.max(0.9, Math.min(h / 380, w / 700, 1.2));
  return Math.max(Math.min(1, h / 640, w / 1000), Math.min(w / 1180, h / 740, 1.6));
}

// 폭에 맞춰 키울 때 잘라도 되는 높이(논리 px): 720 중 576 은 늘 보인다. 20:9 폰까지 폭이 꽉 차고, 그보다 길쭉하면 좌우 여백이 남는다.
// 자를 땐 하늘 쪽을 두 배로(위 96 : 아래 48): 발밑 잔디는 32px 남고, 위로 나간 공은 scene.js 가 화살표로 알린다.
export const MAX_CROP = 144;

// 순수 계산: 뷰포트 → 무대 크기(w×h), 경기장 폭(cw), 배율 k(논리 px → CSS px), 좌우 여백 bleedX, 화면 위·아래 끝의 논리 y(top·bottom), 시트 배치(compact·tiny)와 배율(us)
// top < 0 이면 경기장 위로 하늘이 더 보이고(위아래 반반), top > 0 이면 그만큼 잘린 것. safeX: 무대 좌우 끝에서 노치가 가리는 폭(CSS px) — 경기장은 그 안쪽에 맞춘다
export function stageMetrics(vw, vh, safeX = 0) {
  const rotated = vh > vw;
  const w = rotated ? vh : vw, h = rotated ? vw : vh;
  const k = Math.min((w - 2 * safeX) / 1280, h / (720 - MAX_CROP)), cw = 1280 * k;
  const cut = 720 - h / k, top = cut > 0 ? cut * 2 / 3 : cut / 2;
  const compact = h < 480;   // 폰 가로 높이: 시트를 폰용 배치로. 큰 아이폰(Plus·Pro Max 428~440)·픽셀 Pro(448)까지 — 전엔 420 미만이라 이 폰들에서 큰 화면 배치가 넘쳤다
  return { rotated, w, h, cw, k, bleedX: (w - cw) / 2 / k, top, bottom: top + h / k,
    compact, tiny: h < 340,   // tiny = 320px 폭 폰: 썸네일 한 줄, 설명 숨김
    us: sheetZoom(w, h, compact) };
}

// 노치가 가리는 폭(CSS px). CSS env(safe-area-inset-*) 를 숨은 요소의 padding 으로 읽는다 (env 를 모르는 브라우저는 0)
let probe = null;
function safeInsets() {
  if (!probe) {
    probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) 0 env(safe-area-inset-left,0px)';
    document.body.appendChild(probe);
  }
  const cs = getComputedStyle(probe), px = v => parseFloat(v) || 0;
  return { top: px(cs.paddingTop), right: px(cs.paddingRight), left: px(cs.paddingLeft) };
}

// 무대와 캔버스 크기를 맞추고, 그릴 때 쓸 시야(view)를 돌려준다.
// view = { s: 논리 px → 캔버스 px 배율, ox·oy: 논리 (0,0)의 캔버스 px 위치, bleedX: 경기장 좌우 바깥으로 보이는 폭, top·bottom: 화면 위·아래 끝의 논리 y }
export function fitStage(stage, canvas) {
  const safe = safeInsets(), upright = window.innerHeight > window.innerWidth;   // 눕힌 무대의 왼쪽 끝은 화면 위(노치). 아이폰 가로는 양쪽이 같은 값이다
  const m = stageMetrics(window.innerWidth, window.innerHeight, upright ? safe.top : Math.max(safe.left, safe.right)), { rotated, w, h, k } = m;
  stage.style.width = w + 'px';
  stage.style.height = h + 'px';
  if (rotated) {
    stage.style.transformOrigin = '0 0';
    stage.style.transform = `translate(${window.innerWidth}px, 0) rotate(90deg)`;
  } else {
    stage.style.transform = 'none';
  }
  stage.dataset.rotated = rotated ? '1' : '0';
  stage.dataset.compact = m.compact ? '1' : '0';
  stage.dataset.tiny = m.tiny ? '1' : '0';
  stage.style.setProperty('--k', k.toFixed(4));   // CSS: 점수판 옆 버튼이 경기장 배율을 따라간다 (캔버스의 HUD 와 같이 화면 맨 위에 붙는다)
  stage.style.setProperty('--sh', h + 'px');      // CSS: 조작 버튼 크기는 무대 높이에 맞춘다
  stage.style.setProperty('--us', m.us.toFixed(3));   // CSS: 시트를 화면에 맞추는 배율 (sheetZoom)

  const dpr = Math.min(3, window.devicePixelRatio || 1, Math.sqrt(3.4e6 / (w * h)));   // 화면 전체를 덮으니 픽셀 수에 상한 (약 340만)
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const s = k * dpr, ox = Math.round(m.bleedX * s), oy = Math.round(-m.top * s);
  canvas.getContext('2d').setTransform(s, 0, 0, s, ox, oy);   // 논리 좌표 1280×720, (0,0) = 경기장 왼쪽 위 (위가 잘리면 화면 밖)
  return { ...m, view: { s, ox, oy, bleedX: m.bleedX, top: m.top, bottom: m.bottom } };
}
