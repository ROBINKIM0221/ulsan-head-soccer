// 항상 가로. 뷰포트가 세로면 stage 를 90° 눕혀서 폰을 돌리면 가로 게임이 되게 한다 (인스타 인앱은 세로 고정).
// 캔버스는 무대 안에 16:9 로 최대 크기. 조작 버튼은 캔버스 위 아래 모서리에 겹친다 (2026-10-31 형준: 폰에서 화면이 너무 작았다).

export function fitStage(stage, canvas) {
  const vw = window.innerWidth, vh = window.innerHeight;
  const rotated = vh > vw;
  const w = rotated ? vh : vw, h = rotated ? vw : vh;
  stage.style.width = w + 'px';
  stage.style.height = h + 'px';
  if (rotated) {
    stage.style.transformOrigin = '0 0';
    stage.style.transform = `translate(${vw}px, 0) rotate(90deg)`;
  } else {
    stage.style.transform = 'none';
  }
  stage.dataset.rotated = rotated ? '1' : '0';
  stage.dataset.compact = h < 420 ? '1' : '0';   // 폰 가로 높이에서는 시트 여백을 줄인다
  stage.dataset.tiny = h < 340 ? '1' : '0';      // 320px 폭 폰: 썸네일 한 줄, 설명 숨김

  const cw = Math.min(h * 16 / 9, w);
  const ch = cw * 9 / 16;
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  canvas.style.width = cw + 'px';
  canvas.style.height = ch + 'px';
  canvas.parentElement.style.width = cw + 'px';      // #arena: 버튼이 캔버스 모서리에 붙도록 같은 크기
  canvas.parentElement.style.height = ch + 'px';
  canvas.width = Math.round(cw * dpr);
  canvas.height = Math.round(ch * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(canvas.width / 1280, 0, 0, canvas.height / 720, 0, 0);   // 논리 좌표 1280×720
  return { w, h, rotated, cw, ch };
}
