import { clamp01, lerp, mix } from '../core/math';
import { hashString, Rng } from '../core/rng';
import type { CalendarInfo } from '../core/time';
import { sunAltitude } from '../sim/env/sun';
import { disc, rect } from './pixel';
import { ctx2d, makeCanvas } from './sprites/registry';

interface SkyColors {
  top: string;
  bottom: string;
}

const NIGHT: SkyColors = { top: '#0a0f2c', bottom: '#1d2752' };
const TWILIGHT: SkyColors = { top: '#2b3170', bottom: '#e5875a' };
const DAY: SkyColors = { top: '#4f93dd', bottom: '#b9def3' };
const OVERCAST: SkyColors = { top: '#7d8a99', bottom: '#b6bec6' };

export function skyColors(c: CalendarInfo, overcast: number): SkyColors {
  const alt = sunAltitude(c);
  let s: SkyColors;
  if (alt < -8) s = NIGHT;
  else if (alt < 0) {
    const t = (alt + 8) / 8;
    s = { top: mix(NIGHT.top, TWILIGHT.top, t), bottom: mix(NIGHT.bottom, TWILIGHT.bottom, t) };
  } else if (alt < 10) {
    const t = alt / 10;
    s = { top: mix(TWILIGHT.top, DAY.top, t), bottom: mix(TWILIGHT.bottom, DAY.bottom, t) };
  } else s = DAY;
  if (overcast > 0) {
    const dayness = clamp01((alt + 6) / 16);
    const oc = { top: mix(NIGHT.top, OVERCAST.top, dayness), bottom: mix(NIGHT.bottom, OVERCAST.bottom, dayness) };
    s = { top: mix(s.top, oc.top, overcast * 0.85), bottom: mix(s.bottom, oc.bottom, overcast * 0.85) };
  }
  return s;
}

/** Небо полосами по 4 px — ретро-градиент */
export function drawSkyGradient(g: CanvasRenderingContext2D, w: number, h: number, colors: SkyColors): void {
  const band = 4;
  for (let y = 0; y < h; y += band) {
    rect(g, 0, y, w, band, mix(colors.top, colors.bottom, y / h));
  }
}

export interface Star {
  x: number;
  y: number;
  b: number;
}

export function makeStars(w: number, h: number, seed = 'stars'): Star[] {
  const rng = Rng.fromSeed(seed);
  return Array.from({ length: 90 }, () => ({ x: rng.int(0, w - 1), y: rng.int(0, Math.floor(h * 0.75)), b: rng.range(0.3, 1) }));
}

export function drawStars(g: CanvasRenderingContext2D, stars: Star[], visibility: number, twinkleT: number): void {
  if (visibility <= 0.02) return;
  for (const s of stars) {
    const tw = 0.75 + 0.25 * Math.sin(twinkleT * 0.002 + s.x * 13.1 + s.y);
    g.globalAlpha = clamp01(visibility * s.b * tw);
    rect(g, s.x, s.y, 1, 1, '#ffffff');
  }
  g.globalAlpha = 1;
}

export function drawSunMoon(g: CanvasRenderingContext2D, c: CalendarInfo, w: number, horizonY: number, overcast: number): void {
  const alt = sunAltitude(c);
  const arcH = horizonY - 14;
  // солнце
  if (alt > -4) {
    const t = clamp01((c.hourOfDay - 5) / 15);
    const x = lerp(30, w - 30, t);
    const y = horizonY - Math.max(-6, (alt / 50) * arcH) - 6;
    g.globalAlpha = 1 - overcast * 0.8;
    disc(g, x, y, 6, alt < 6 ? '#ffb46a' : '#fff1b8');
    disc(g, x, y, 4, alt < 6 ? '#ffd08a' : '#fffbe6');
    g.globalAlpha = 1;
  }
  // луна (ночью, по противоположной дуге)
  if (alt < 2) {
    const nh = (c.hourOfDay + 12) % 24;
    const t = clamp01((nh - 5) / 15);
    const x = lerp(40, w - 40, t);
    const y = 18 + Math.abs(t - 0.5) * 30;
    g.globalAlpha = 1 - overcast * 0.85;
    disc(g, x, y, 5, '#f2efe0');
    disc(g, x + 2, y - 1, 4, mix('#0a0f2c', '#1d2752', 0.3));
    disc(g, x - 1, y, 1, '#d9d4bd');
    g.globalAlpha = 1;
  }
}

/** Облако — набор пиксельных «шаров» */
export function makeCloud(seed: string, w: number, h: number): HTMLCanvasElement {
  const c = makeCanvas(w, h);
  const g = ctx2d(c);
  const rng = Rng.fromSeed(seed);
  const n = 5 + rng.int(0, 4);
  for (let i = 0; i < n; i++) {
    const r = rng.int(4, Math.min(9, Math.floor(h / 2) - 1));
    const x = rng.int(r + 1, w - r - 2);
    const y = h - r - 1 - rng.int(0, Math.max(0, Math.floor(h / 2) - r));
    disc(g, x, y, r, '#ffffff');
  }
  // подложка-тень снизу
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = 'rgba(160,170,190,0.35)';
  g.fillRect(0, h - 4, w, 4);
  return c;
}

/** Силуэт дальнего города с окнами (рисуется один раз) */
export function makeCity(w: number, h: number): { base: HTMLCanvasElement; windows: { x: number; y: number; k: number }[] } {
  const c = makeCanvas(w, h);
  const g = ctx2d(c);
  const rng = Rng.fromSeed('city');
  const windows: { x: number; y: number; k: number }[] = [];
  // дальний ряд
  let x = -4;
  while (x < w) {
    const bw = rng.int(14, 34);
    const bh = rng.int(18, 46);
    rect(g, x, h - bh, bw, bh, '#5b6a86');
    x += bw + rng.int(-2, 3);
  }
  // ближний ряд
  x = -6;
  while (x < w) {
    const bw = rng.int(18, 40);
    const bh = rng.int(26, 64);
    const col = rng.pick(['#4a5672', '#525e7b', '#46516b']);
    rect(g, x, h - bh, bw, bh, col);
    if (rng.chance(0.25)) rect(g, x + Math.floor(bw / 2), h - bh - 6, 1, 6, col);
    for (let wy = h - bh + 4; wy < h - 4; wy += 5) {
      for (let wx = x + 3; wx < x + bw - 3; wx += 4) {
        rect(g, wx, wy, 2, 2, '#6d7894');
        windows.push({ x: wx, y: wy, k: hashString(`${wx}:${wy}`) });
      }
    }
    x += bw + rng.int(0, 4);
  }
  return { base: c, windows };
}
