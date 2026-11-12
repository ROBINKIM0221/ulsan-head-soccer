// 항상 가로. 뷰포트가 세로면 stage 를 90° 눕혀서 폰을 돌리면 가로 게임이 되게 한다 (인스타 인앱은 세로 고정).
// 경기장(논리 1280×720, 16:9)은 무대 한가운데 최대 크기로 놓고, 캔버스는 무대 전체를 덮는다: 16:9 바깥 여백(bleed)에도 경기장 그림이 이어진다
// (2026-11-12 형준 "UI랑 게임 최대한 예뻐보이게": 전엔 여백이 단색 파란 띠였다). 조작 버튼은 무대 모서리, 점수판 옆 버튼은 경기장(#arena) 기준.

// 시트(선택·교체·일시정지·결과)를 화면에 맞추는 배율 (CSS --us → zoom). 가장 큰 시트는 2인 선택 화면: 폰 배치 358px, 큰 화면 배치 597px(설명이 두 줄인 선수일 때; 브라우저에서 잰 값).
// 폰(compact)은 높이의 94% 에 맞추고(0.9~1.2배), 큰 화면은 넉넉하면 키우고(최대 1.6배) 낮거나 좁은 창이면 넘치지 않게 줄인다.
export function sheetZoom(w, h, compact) {
  if (h < 340) return 1;   // tiny 배치는 320px 높이에 맞춰 둔 그대로
  if (compact) return Math.max(0.9, Math.min(h / 380, w / 700, 1.2));
  return Math.max(Math.min(1, h / 640, w / 1000), Math.min(w / 1180, h / 740, 1.6));
}

// 순수 계산: 뷰포트 → 무대 크기(w×h), 경기장 크기(cw×ch), 배율 k(논리 px → CSS px), 16:9 바깥 여백(논리 px), 시트 배치(compact·tiny)와 배율(us)
export function stageMetrics(vw, vh) {
  const rotated = vh > vw;
  const w = rotated ? vh : vw, h = rotated ? vw : vh;
  const cw = Math.min(h * 16 / 9, w), ch = cw * 9 / 16, k = cw / 1280;
  const compact = h < 480;   // 폰 가로 높이: 시트를 폰용 배치로. 큰 아이폰(Plus·Pro Max 428~440)·픽셀 Pro(448)까지 — 전엔 420 미만이라 이 폰들에서 큰 화면 배치가 넘쳤다
  return { rotated, w, h, cw, ch, k, bleedX: (w - cw) / 2 / k, bleedY: (h - ch) / 2 / k,
    compact, tiny: h < 340,   // tiny = 320px 폭 폰: 썸네일 한 줄, 설명 숨김
    us: sheetZoom(w, h, compact) };
}

// 무대와 캔버스 크기를 맞추고, 그릴 때 쓸 시야(view)를 돌려준다.
// view = { s: 논리 px → 캔버스 px 배율, ox·oy: 논리 (0,0)의 캔버스 px 위치, bleedX·bleedY: 경기장 바깥으로 보이는 폭(논리 px) }
export function fitStage(stage, canvas) {
  const m = stageMetrics(window.innerWidth, window.innerHeight), { rotated, w, h, cw, ch, k } = m;
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
  stage.style.setProperty('--k', k.toFixed(4));   // CSS: 점수판 옆 버튼이 경기장 배율을 따라간다
  stage.style.setProperty('--sh', h + 'px');      // CSS: 조작 버튼 크기는 무대 높이에 맞춘다
  stage.style.setProperty('--us', m.us.toFixed(3));   // CSS: 시트를 화면에 맞추는 배율 (sheetZoom)

  const arena = canvas.parentElement;             // #arena: 16:9 경기장 자리. 점수판 옆 버튼·키 안내가 여기에 붙는다
  arena.style.width = cw + 'px';
  arena.style.height = ch + 'px';
  const padX = (w - cw) / 2, padY = (h - ch) / 2;
  stage.style.setProperty('--by', padY + 'px');   // CSS: 경기장 위 여백. 점수판 옆 버튼을 HUD 와 같이 화면 맨 위로 올린다
  const dpr = Math.min(3, window.devicePixelRatio || 1, Math.sqrt(3.4e6 / (w * h)));   // 화면 전체를 덮으니 픽셀 수에 상한 (약 340만)
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  canvas.style.left = -padX + 'px';
  canvas.style.top = -padY + 'px';
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const s = k * dpr, ox = Math.round(padX * dpr), oy = Math.round(padY * dpr);
  canvas.getContext('2d').setTransform(s, 0, 0, s, ox, oy);   // 논리 좌표 1280×720, (0,0) = 경기장 왼쪽 위
  return { ...m, view: { s, ox, oy, bleedX: m.bleedX, bleedY: m.bleedY } };
}
