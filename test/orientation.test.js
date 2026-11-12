import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stageMetrics, sheetZoom } from '../js/ui/orientation.js';

const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

// 2026-11-12 형준 "UI랑 게임 최대한 예뻐보이게": 경기장(16:9) 바깥 여백을 단색 띠로 두지 않고 경기장 그림을 이어 그린다.
// stageMetrics 는 뷰포트에서 배율 k(논리 1280×720 → CSS px)와 바깥 여백(논리 px)을 계산한다.
test('stageMetrics: a 16:9 viewport has no bleed and scale = width / 1280', () => {
  const m = stageMetrics(1280, 720);
  assert.equal(m.rotated, false); near(m.k, 1); near(m.cw, 1280); near(m.ch, 720); near(m.bleedX, 0); near(m.bleedY, 0);
  assert.equal(m.compact, false); assert.equal(m.tiny, false);
});

test('stageMetrics: a wide phone fits the height and bleeds sideways (logical px)', () => {
  const m = stageMetrics(844, 390);
  near(m.k, 390 / 720); near(m.cw, 390 * 16 / 9); near(m.ch, 390);
  near(m.bleedX, (844 - 390 * 16 / 9) / 2 / (390 / 720)); near(m.bleedY, 0);
  assert.equal(m.compact, true); assert.equal(m.tiny, false);
  assert.equal(stageMetrics(658, 320).tiny, true);
});

test('stageMetrics: a tall viewport (tablet, 16:10 laptop) fits the width and bleeds up and down', () => {
  const m = stageMetrics(1024, 768);
  near(m.k, 0.8); near(m.cw, 1024); near(m.ch, 576); near(m.bleedX, 0); near(m.bleedY, 96 / 0.8);
});

test('stageMetrics: a portrait viewport is the same stage lying on its side', () => {
  const p = stageMetrics(390, 844), l = stageMetrics(844, 390);
  assert.equal(p.rotated, true); assert.equal(l.rotated, false);
  for (const key of ['w', 'h', 'k', 'cw', 'ch', 'bleedX', 'bleedY', 'compact', 'tiny', 'us']) assert.equal(p[key], l[key], key);
});

// 2026-11-12 출시 전 점검: 아이폰 Plus·Pro Max(높이 428~440), 픽셀 Pro(448)는 높이가 420 을 넘어 큰 화면 배치가 그려졌고 선택 화면이 화면 밖으로 넘쳤다.
test('stageMetrics: phones up to 480px tall get the compact sheet layout (iPhone Plus/Pro Max, Pixel Pro), tiny below 340', () => {
  for (const [w, h] of [[844, 390], [926, 428], [932, 430], [956, 440], [998, 448]]) assert.equal(stageMetrics(w, h).compact, true, w + 'x' + h);
  assert.equal(stageMetrics(430, 932).compact, true, 'Pro Max held upright (Instagram in-app browser): the stage lies on its side');
  assert.equal(stageMetrics(1024, 480).compact, false);
  assert.equal(stageMetrics(658, 320).tiny, true); assert.equal(stageMetrics(800, 360).tiny, false);
  assert.equal(stageMetrics(932, 430).us, sheetZoom(932, 430, true));
});

// 시트 배율: 가장 큰 시트는 2인 선택 화면 — 폰 배치 358px, 큰 화면 배치 577px (scratchpad fit-sweep 으로 브라우저에서 잰 값). 어느 높이에서도 96% 안에 들어와야 한다.
test('sheetZoom: grows on big screens, shrinks on short or narrow windows, and the tallest sheet always fits', () => {
  near(sheetZoom(1920, 1080, false), 1.459, 0.001); near(sheetZoom(1366, 657, false), 1); near(sheetZoom(1024, 768, false), 1);
  near(sheetZoom(3840, 2160, false), 1.6);   // 상한
  near(sheetZoom(960, 540, false), 540 / 610, 0.001); near(sheetZoom(800, 600, false), 0.8);   // 낮은 창, 좁은 창
  for (const h of [340, 360, 375, 390, 412, 430, 448, 479]) { const z = sheetZoom(h * 2.1, h, true); assert.ok(358 * z <= h * 0.96 && z >= 0.9 && z <= 1.2, `compact ${h}: ${z}`); }
  for (const h of [480, 540, 600, 657, 720, 768, 900, 1080]) { const z = sheetZoom(h * 16 / 9, h, false); assert.ok(577 * z <= h * 0.96, `full ${h}: ${z}`); }
  near(sheetZoom(667, 375, true), 667 / 700, 0.001);   // 16:9 폰은 폭이 먼저 모자란다
  near(sheetZoom(658, 320, true), 1);                  // tiny 배치는 320px 에 맞춰 둔 그대로
});
