// 항상 가로. 뷰포트가 세로면 stage 를 90° 눕혀서 폰을 돌리면 가로 게임이 되게 한다 (인스타 인앱은 세로 고정).
// 캔버스는 무대 전체를 덮고, 경기장(논리 1280×720)은 화면 폭에 맞춘다. 화면이 16:9 보다 세로로 길면 위아래 여백에, 아주 길쭉하면 좌우 여백에 경기장 그림이 이어진다
// 화면이 16:9 보다 옆으로 길면(노트북 창·폰) 높이에 맞추지 않고 폭에 맞춰 키운다: 하늘 위쪽과 잔디 아래쪽이 잘리고 선수와 공이 커진다

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
// fit > 0 은 촬영용 화면(shootFit): 경기장을 그 배율로 그리고 발밑 선(논리 y 640)을 화면 높이의 SHOOT_GROUND 에 둔다. 그 아래는 빈 잔디, 남는 옆에는 관중석이 이어진다.
// 85% 까지는 하늘이 다 보이고(top 0) 그보다 크면 하늘 위쪽이 잘린다: 100% 는 경기장이 화면 폭을 꽉 채우고 96 이 잘린다(폭 맞춤 화면의 최대와 같아 HUD·글자 내림·공 화살표가 그대로 맞는다)
export const SHOOT_GROUND = 816 / 1080;
// frame: 촬영용 화면. 화면이 16:9 보다 세로로 길면(아이패드는 4:3 에 가깝다) 가운데 16:9 틀(높이 frameH, 위에서 frameY)만 한 화면으로 본다.
// 편집 때 그 틀만 잘라 쓰면 어느 기기로 찍든 같은 화면이 된다
export function stageMetrics(vw, vh, safeX = 0, fit = 0, frame = false) {
  const rotated = vh > vw;
  const w = rotated ? vh : vw, h = rotated ? vw : vh;
  const fh = frame ? Math.min(h, w * 9 / 16) : h, frameY = (h - fh) / 2;
  const shoot = fit > 0;
  const k = Math.min((w - 2 * safeX) / 1280, fh / (720 - MAX_CROP)) * (shoot ? fit : 1), cw = 1280 * k;
  const cut = 720 - fh / k, top = shoot ? Math.min(MAX_CROP, Math.max(0, 640 - fh * SHOOT_GROUND / k)) : cut > 0 ? cut * 2 / 3 : cut / 2;
  const compact = h < 480;   // 폰 가로 높이: 시트를 폰용 배치로. 큰 아이폰(Plus·Pro Max 428~440)·픽셀 Pro(448)까지
  const sheetH = shoot ? (640 - top) * k : fh;   // 아래 띠 배치(?shoot=1·100): 시트(선택·VS·결과)는 발밑 선(논리 y 640) 위쪽에만 뜬다 — 그 아래 빈 잔디는 편집 때 선수 화면 자리
  return { rotated, w, h, cw, k, bleedX: (w - cw) / 2 / k, top, bottom: top + fh / k, sheetH, frameY, frameH: fh,
    compact, tiny: h < 340,   // tiny = 320px 폭 폰: 썸네일 한 줄, 설명 숨김
    us: sheetZoom(w, sheetH, compact) };
}

// 촬영용 화면: 주소의 ?shoot= 값 → 경기장 배율. 1 이면 0.85, 80·100 처럼 더 큰 수는 퍼센트(50~100), 없거나 엉뚱한 값이면 0(꺼짐 = 평소 화면).
// 선수 촬영 영상을 편집할 때
// 게임 위에 선수 화면을 얹으면 어디든 공·GOAL 글자·필살기 띠를 가린다(점수판 밑은 공의 11%). 경기장을 줄여 위에 붙이면 1920×1080 에서 아래에 빈 잔디 264px 가 남는다.
export function shootFit(v) {
  const n = Number(v);
  if (!v || !(n > 0)) return 0;
  return n > 1 ? Math.min(1, Math.max(0.5, n / 100)) : 0.85;
}

// 촬영용 화면 "선수 창을 위 양쪽에"(?shoot=cam): 편집 때 이름표 바로 밑 양쪽 모서리에 선수 창(1920×1080 기준 457×257: 화면 x 20~477·1443~1900, y 147~404)을 얹는 배치.
// 경기장은 평소 그대로 두고, 필살기 컷인 띠만 그 창에 가리지 않게 창 폭만큼 안쪽으로 옮긴다(두 창 사이, 높이는 그대로).
// 띠를 창 밑으로 내리면 선수 머리가 37%·공이 18% 있는 자리를 띠가 덮는다(지금 자리 3%·9%, 두 창 사이 4%·9%; 모의 132판) → 안쪽으로
export const SHOOT_CAMS = { dx: 306, dy: 0 };

// 촬영용 화면 "두 선수를 위 가운데에"(?shoot=top): 편집 때 화면 위 가운데(논리 x 400~880, y 0~270 = 1920×1080 에서 720×405)에 두 선수를 배경을 뺀 영상으로 얹는다.
// 그 자리에 있던 점수판은 선수들 밑에 까는 받침대(bar)로 바뀐다(render/scene.js drawScoreBar). 가운데 글자는 받침대 밑으로, 필살기 띠는 선수 자리 앞에서 끊는다.
// 선택·VS·결과 화면은 평소 그대로다(받침대 밑에 밀어 넣으면 작게 눌리고 스크롤 막대가 생긴다)
export const SHOOT_TOP = { x: 400, w: 480, bar: { x: 388, y: 270, w: 504, h: 44 } };

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
export function fitStage(stage, canvas, fit = 0, mode = null) {   // mode: 촬영용 화면의 다른 배치 'cam'(SHOOT_CAMS) | 'top'(SHOOT_TOP)
  const safe = safeInsets(), upright = window.innerHeight > window.innerWidth;   // 눕힌 무대의 왼쪽 끝은 화면 위(노치). 아이폰 가로는 양쪽이 같은 값이다
  const m = stageMetrics(window.innerWidth, window.innerHeight, upright ? safe.top : Math.max(safe.left, safe.right), fit, fit > 0 || !!mode), { rotated, w, h, k } = m;
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
  stage.style.setProperty('--oh', Math.round(m.sheetH) + 'px');   // CSS: 촬영용 화면에서 시트 뒤 막(#overlay)의 높이
  stage.style.setProperty('--ot', Math.round(m.frameY) + 'px');   // 그리고 위에서 띄우는 높이(16:9 틀의 위 여백)
  stage.style.setProperty('--fy', Math.round(m.frameY) + 'px');     // CSS: 촬영용 화면의 16:9 틀이 시작하는 높이 (틀 안 버튼의 기준)

  // 캔버스는 무대 전체를 덮는다. 촬영용 화면은 16:9 틀만: 틀 바깥(위·아래)은 무대 바탕색이 보이고, 틀 폭은 1920px 을 넘기지 않는다(최종 영상이 1920×1080 이라 더 그려도 버려진다)
  const shoot = fit > 0 || !!mode, ch = shoot ? m.frameH : h;
  const dpr = Math.min(3, window.devicePixelRatio || 1, Math.sqrt(3.4e6 / (w * ch)), shoot ? Math.max(1, 1920 / w) : 3);   // 픽셀 수에 상한 (약 340만)
  canvas.style.top = (shoot ? m.frameY : 0) + 'px';
  canvas.style.width = w + 'px';
  canvas.style.height = ch + 'px';
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(ch * dpr);
  const s = k * dpr, ox = Math.round(m.bleedX * s), oy = Math.round(-m.top * s);
  canvas.getContext('2d').setTransform(s, 0, 0, s, ox, oy);   // 논리 좌표 1280×720, (0,0) = 경기장 왼쪽 위 (위가 잘리면 화면 밖)
  return { ...m, view: { s, ox, oy, bleedX: m.bleedX, top: m.top, bottom: m.bottom, cutin: mode === 'cam' ? SHOOT_CAMS : null, topBox: mode === 'top' ? SHOOT_TOP : null } };
}
