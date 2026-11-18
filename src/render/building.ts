import { CORE_W, FLOOR_H, INNER_WALL, OUTER_WALL, ROOF_H, SLAB } from '../config';
import { mix, shade } from '../core/math';
import { Rng } from '../core/rng';
import type { WorldDefs } from '../data/defs';
import type { Palette } from '../data/schemas';
import type { ApartmentModel, RoomModel } from '../world/layout';
import { digits, rect } from './pixel';
import { drawFurniture } from './sprites/furniture';
import { ctx2d, makeCanvas, type SpriteRegistry } from './sprites/registry';

export const PANEL = '#bdb5a8';
export const PANEL_DARK = '#a39b8e';
export const CONCRETE = '#8e8a84';
const VACANT_PALETTE: Palette = {
  wall: '#cfcac0', floor: '#8a8580', wood: '#8a7a66', textile: '#9a948a', accent: '#a0a0a0', metal: '#9aa4ad', light: '#fff2c8',
};
const CORE_LOW = '#5f8a84';
const CORE_HIGH = '#dcd8cc';

export interface BuildingLayers {
  back: HTMLCanvasElement;
  front: HTMLCanvasElement;
}

export function windowRect(room: RoomModel, levelTop: number): [number, number, number, number] | null {
  if (!room.def.window) return null;
  const rw = room.x1 - room.x0;
  const ww = rw >= 64 ? 22 : rw >= 40 ? 18 : 12;
  const x = Math.round(room.x0 + (rw - ww) / 2);
  return [x, levelTop + 11, ww, 25];
}

export function apartmentPalette(apt: ApartmentModel): Palette {
  return apt.def?.palette ?? VACANT_PALETTE;
}

export function renderBuilding(defs: WorldDefs, sprites: SpriteRegistry): BuildingLayers {
  const L = defs.layout;
  const back = makeCanvas(L.worldW, L.worldH);
  const front = makeCanvas(L.worldW, L.worldH);
  const g = ctx2d(back);
  const gf = ctx2d(front);
  const bx0 = L.buildingX0;
  const bx1 = L.buildingX1;
  const topY = L.levelTop(L.floors);

  // ── крыша
  const roofTop = L.roofY;
  rect(g, bx0 - 2, roofTop + 6, bx1 - bx0 + 4, ROOF_H - 6, CONCRETE);
  rect(g, bx0 - 2, roofTop + 6, bx1 - bx0 + 4, 1, shade(CONCRETE, 0.2));
  rect(g, bx0 - 2, roofTop + 2, 3, 5, CONCRETE); // парапет
  rect(g, bx1 - 1, roofTop + 2, 3, 5, CONCRETE);
  // машинное отделение лифта
  rect(g, L.coreX + 8, roofTop - 12, CORE_W - 16, 18, PANEL);
  rect(g, L.coreX + 8, roofTop - 12, CORE_W - 16, 2, PANEL_DARK);
  rect(g, L.coreX + 14, roofTop - 6, 6, 8, '#6b6156');
  // антенны и вентиляция
  rect(g, bx0 + 40, roofTop - 14, 1, 20, '#55555c');
  rect(g, bx0 + 34, roofTop - 12, 13, 1, '#55555c');
  rect(g, bx0 + 36, roofTop - 8, 9, 1, '#55555c');
  rect(g, bx1 - 70, roofTop - 4, 10, 10, PANEL_DARK);
  rect(g, bx1 - 71, roofTop - 5, 12, 2, CONCRETE);
  rect(g, bx1 - 30, roofTop - 18, 1, 24, '#55555c');
  rect(g, bx1 - 33, roofTop - 16, 7, 1, '#55555c');

  // ── внешние стены (панели)
  for (const wx of [bx0, bx1 - OUTER_WALL]) {
    rect(g, wx, topY, OUTER_WALL, L.groundY - topY + SLAB, PANEL);
    for (let l = 0; l <= L.floors; l++) rect(g, wx, L.levelTop(l), OUTER_WALL, 1, PANEL_DARK);
    rect(g, wx + (wx === bx0 ? 0 : OUTER_WALL - 1), topY, 1, L.groundY - topY + SLAB, PANEL_DARK);
  }

  // ── уровни
  for (let level = 0; level <= L.floors; level++) {
    const lt = L.levelTop(level);
    const fy = L.floorY(level);
    // перекрытие
    rect(g, bx0, fy, bx1 - bx0, SLAB, CONCRETE);
    rect(g, bx0, fy + SLAB - 1, bx1 - bx0, 1, shade(CONCRETE, -0.2));
    drawCore(g, defs, level, lt, fy);
    if (level === 0) drawGroundFloor(g, defs, lt, fy);
  }
  // лестничные марши поверх стен ядра
  drawStairs(g, defs);

  for (const apt of L.apartments) drawApartment(g, gf, defs, apt, sprites);

  // фундамент
  const baseY = L.groundY + SLAB;
  rect(g, bx0 - 2, baseY, bx1 - bx0 + 4, L.worldH - baseY, '#6e6a64');
  rect(g, bx0 - 2, baseY, bx1 - bx0 + 4, 1, '#5a5650');
  // отмостка — вентиляционные окошки подвала
  for (let x = bx0 + 20; x < bx1 - 20; x += 64) rect(g, x, baseY + 6, 8, 4, '#2d2b2a');
  return { back, front };
}

function drawWallpaper(g: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, base: string, kind: string, seed: string) {
  rect(g, x0, y0, w, h, base);
  const p = shade(base, -0.09);
  const p2 = shade(base, 0.08);
  const rng = Rng.fromSeed(seed);
  switch (kind) {
    case 'stripes':
      for (let x = x0 + 2; x < x0 + w; x += 6) rect(g, x, y0, 2, h, p);
      break;
    case 'dots':
      for (let y = y0 + 3; y < y0 + h; y += 6) for (let x = x0 + ((y / 6) % 2 ? 2 : 5); x < x0 + w; x += 6) rect(g, x, y, 1, 1, p);
      break;
    case 'diamonds':
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if ((x - x0 + y - y0) % 8 === 0 || (x - x0 - (y - y0) + 800) % 8 === 0) rect(g, x, y, 1, 1, p);
      break;
    case 'brick':
      for (let y = y0; y < y0 + h; y += 4) {
        rect(g, x0, y, w, 1, shade(base, -0.18));
        const off = ((y - y0) / 4) % 2 ? 4 : 0;
        for (let x = x0 + off; x < x0 + w; x += 8) rect(g, x, y, 1, 4, shade(base, -0.18));
        for (let x = x0 + off + 1; x < x0 + w - 1; x += 8) if (rng.chance(0.3)) rect(g, x, y + 1, 6, 3, shade(base, rng.range(-0.06, 0.06)));
      }
      break;
    case 'tiles':
      for (let y = y0 + h - 18; y < y0 + h; y += 4) for (let x = x0; x < x0 + w; x += 4) {
        rect(g, x, y, 4, 4, mix(base, '#ffffff', 0.45));
        rect(g, x, y, 4, 1, shade(base, 0.05));
        rect(g, x, y, 1, 4, shade(base, 0.05));
      }
      break;
    case 'damask':
      for (let y = y0 + 3; y < y0 + h; y += 8) for (let x = x0 + ((y / 8) % 2 ? 1 : 5); x < x0 + w - 2; x += 8) {
        rect(g, x + 1, y, 1, 1, p);
        rect(g, x, y + 1, 3, 1, p);
        rect(g, x + 1, y + 2, 1, 2, p);
      }
      break;
    case 'panels':
      rect(g, x0, y0 + h - 16, w, 16, shade(base, -0.12));
      rect(g, x0, y0 + h - 16, w, 1, shade(base, 0.12));
      for (let x = x0 + 6; x < x0 + w; x += 10) rect(g, x, y0 + h - 14, 1, 12, shade(base, -0.2));
      break;
    case 'flowers':
      for (let y = y0 + 4; y < y0 + h - 2; y += 9) for (let x = x0 + ((y / 9) % 2 ? 2 : 7); x < x0 + w - 2; x += 10) {
        rect(g, x, y, 1, 1, p2);
        rect(g, x - 1, y + 1, 3, 1, shade(base, -0.12));
        rect(g, x, y + 2, 1, 1, p2);
      }
      break;
    case 'soviet': {
      // советские обои: широкие полосы с ромбиком-цветком и тонкими линиями по краям
      const dark = shade(base, -0.2);
      const band = mix(base, '#8a4a2a', 0.18);
      const flower = mix(base, '#7a2a20', 0.45);
      const leaf = mix(base, '#4a5a2a', 0.4);
      for (let x = x0; x < x0 + w; x += 12) {
        rect(g, x, y0, 6, h, band);
        rect(g, x, y0, 1, h, dark);
        rect(g, x + 5, y0, 1, h, dark);
        for (let y = y0 + 2 + ((x - x0) / 12 % 2) * 5; y < y0 + h - 3; y += 10) {
          rect(g, x + 2, y, 2, 1, flower);
          rect(g, x + 1, y + 1, 4, 1, flower);
          rect(g, x + 2, y + 2, 2, 1, flower);
          rect(g, x + 2, y + 4, 1, 1, leaf);
          rect(g, x + 3, y + 5, 1, 1, leaf);
        }
        for (let y = y0 + 5; y < y0 + h - 2; y += 10) rect(g, x + 9, y, 1, 1, p);
      }
      // выцвело у потолка, протёрлось у пола
      rect(g, x0, y0, w, 1, shade(base, 0.1));
      break;
    }
    case 'oilpaint': {
      // крашеная масляной краской панель, сверху — побелка, между ними — бордюр
      const top = Math.round(h * 0.42);
      rect(g, x0, y0, w, top, '#e6e1d2');
      for (let i = 0; i < w * top * 0.02; i++) rect(g, x0 + rng.int(0, w - 1), y0 + rng.int(0, top - 1), 1, 1, '#d8d2c0');
      rect(g, x0, y0 + top, w, 1, shade(base, -0.35));
      // блики глянцевой краски и потёки
      for (let x = x0 + 3; x < x0 + w; x += 11) rect(g, x, y0 + top + 3, 1, h - top - 6, p2);
      for (let i = 0; i < w / 14; i++) rect(g, x0 + rng.int(0, w - 1), y0 + top + 1, 1, rng.int(2, 4), shade(base, -0.06));
      break;
    }
    default:
      for (let i = 0; i < w * h * 0.01; i++) rect(g, x0 + rng.int(0, w - 1), y0 + rng.int(0, h - 1), 1, 1, p);
  }
}

function drawFloor(g: CanvasRenderingContext2D, x0: number, fy: number, w: number, color: string, kind: string) {
  rect(g, x0, fy, w, 2, color);
  const d = shade(color, -0.18);
  const l = shade(color, 0.12);
  switch (kind) {
    case 'parquet':
    case 'herringbone':
      for (let x = x0; x < x0 + w; x += 4) rect(g, x, fy + ((x / 4) % 2 ? 0 : 1), 2, 1, kind === 'herringbone' ? d : l);
      break;
    case 'boards':
      for (let x = x0 + 3; x < x0 + w; x += 9) rect(g, x, fy, 1, 2, d);
      break;
    case 'tiles':
      for (let x = x0; x < x0 + w; x += 4) rect(g, x, fy, 1, 2, l);
      break;
    case 'carpet':
      rect(g, x0, fy, w, 1, l);
      break;
    case 'linoleum':
      for (let x = x0 + 2; x < x0 + w; x += 7) rect(g, x, fy + 1, 2, 1, d);
      break;
    default:
      break;
  }
  rect(g, x0, fy, w, 1, l);
}

type Curtains = 'none' | 'drapes' | 'lace' | 'blinds' | 'valance';

function curtainsFor(style: string): Curtains {
  switch (style) {
    case 'soviet':
      return 'lace';
    case 'scandi':
    case 'minimal':
      return 'blinds';
    case 'loft':
    case 'vacant':
      return 'none';
    case 'classic':
      return 'valance';
    case 'student':
      return 'blinds';
    default:
      return 'drapes';
  }
}

function drawWindow(g: CanvasRenderingContext2D, wr: [number, number, number, number], frame: string, curtains: Curtains, pal: Palette) {
  const [x, y, w, h] = wr;
  rect(g, x - 1, y - 1, w + 2, h + 2, frame);
  g.clearRect(x, y, w, h); // стекло — прозрачное: сквозь него видно небо
  rect(g, x + Math.floor(w / 2), y, 1, h, frame);
  rect(g, x, y + 6, w, 1, frame);
  rect(g, x - 2, y + h + 1, w + 4, 2, shade(frame, -0.05)); // подоконник
  rect(g, x - 2, y + h + 2, w + 4, 1, shade(frame, -0.25));
  const c = pal.textile;
  const drapes = (color: string) => {
    rect(g, x - 4, y - 3, w + 8, 1, '#7a7a7a'); // карниз
    rect(g, x - 4, y - 2, 3, h + 4, color);
    rect(g, x + w + 1, y - 2, 3, h + 4, color);
    rect(g, x - 3, y - 2, 1, h + 4, shade(color, -0.2));
    rect(g, x + w + 2, y - 2, 1, h + 4, shade(color, -0.2));
  };
  switch (curtains) {
    case 'drapes':
      drapes(c);
      break;
    case 'valance':
      drapes(c);
      rect(g, x - 4, y - 2, w + 8, 3, shade(c, 0.1));
      for (let i = x - 3; i < x + w + 4; i += 3) rect(g, i, y + 1, 2, 1, shade(c, 0.1));
      break;
    case 'lace':
      // тюль: полупрозрачная сетка + плотные шторы по бокам
      g.globalAlpha = 0.35;
      rect(g, x, y, w, h, '#f6f3ea');
      g.globalAlpha = 1;
      for (let yy = y + 1; yy < y + h; yy += 3) for (let xx = x + ((yy - y) % 2); xx < x + w; xx += 3) rect(g, xx, yy, 1, 1, '#f6f3ea');
      drapes(c);
      break;
    case 'blinds':
      rect(g, x - 1, y - 2, w + 2, 2, '#d8d4cc');
      for (let yy = y; yy < y + 6; yy += 2) rect(g, x, yy, w, 1, '#e8e4dc');
      break;
    case 'none':
      break;
  }
}

function drawLamp(g: CanvasRenderingContext2D, lx: number, lt: number, style: string, pal: Palette) {
  switch (style) {
    case 'vacant':
      rect(g, lx, lt + 2, 1, 3, '#555');
      rect(g, lx - 1, lt + 5, 3, 2, '#e8e2c8');
      break;
    case 'loft':
    case 'student':
      rect(g, lx, lt + 2, 1, 6, '#222');
      rect(g, lx - 1, lt + 8, 3, 3, '#ffe6a0');
      break;
    case 'soviet':
    case 'classic': {
      // люстра с рожками
      rect(g, lx, lt + 2, 1, 3, '#8a7a50');
      rect(g, lx - 5, lt + 5, 11, 1, '#b8a060');
      for (const dx of [-5, 0, 5]) {
        rect(g, lx + dx, lt + 6, 1, 1, '#b8a060');
        rect(g, lx + dx - 1, lt + 7, 3, 2, '#f4ecd0');
      }
      if (style === 'soviet') for (const dx of [-3, 2]) rect(g, lx + dx, lt + 9, 1, 2, '#cfe4f0'); // хрусталь
      break;
    }
    case 'scandi':
    case 'minimal':
      rect(g, lx, lt + 2, 1, 5, '#444');
      rect(g, lx - 3, lt + 7, 7, 2, style === 'scandi' ? '#f4f1ea' : '#2a2a2a');
      rect(g, lx - 4, lt + 9, 9, 1, style === 'scandi' ? '#d8d4cc' : '#2a2a2a');
      break;
    case 'boho':
      rect(g, lx, lt + 2, 1, 3, '#7a5a3a');
      rect(g, lx - 4, lt + 5, 9, 3, '#c49a5a');
      for (let i = lx - 4; i <= lx + 4; i += 2) rect(g, i, lt + 6, 1, 1, '#8a6a3a');
      break;
    default:
      rect(g, lx, lt + 2, 1, 3, '#555');
      rect(g, lx - 3, lt + 5, 7, 2, pal.accent);
      rect(g, lx - 2, lt + 7, 5, 1, shade(pal.accent, -0.2));
  }
}

function drawApartment(
  g: CanvasRenderingContext2D,
  gf: CanvasRenderingContext2D,
  defs: WorldDefs,
  apt: ApartmentModel,
  sprites: SpriteRegistry,
) {
  const L = defs.layout;
  const lt = L.levelTop(apt.level);
  const fy = L.floorY(apt.level);
  const pal = apartmentPalette(apt);
  const h = fy - lt;
  const def = apt.def;
  for (const room of apt.rooms) {
    const w = room.x1 - room.x0;
    const wallColor = room.def.wall ?? pal.wall;
    const wallpaper = apt.vacant ? 'plain' : room.def.wallpaper ?? def?.wallpaper ?? 'plain';
    const reno = !!def?.renovation;
    if (reno) drawRenovationWalls(g, room.x0, lt, w, h, wallColor, wallpaper, pal, `${apt.id}:${room.index}`);
    else drawWallpaper(g, room.x0, lt, w, h, wallColor, wallpaper, `${apt.id}:${room.index}`);
    rect(g, room.x0, lt, w, 2, shade(reno ? '#cfc8bb' : wallColor, -0.2)); // тень у потолка
    if (!reno) rect(g, room.x0, fy - 2, w, 2, apt.vacant ? '#8a8580' : shade(pal.wood, -0.1)); // плинтус
    drawFloor(g, room.x0, fy, w, reno ? '#8a8580' : pal.floor, apt.vacant || reno ? 'concrete' : room.def.flooring ?? def?.flooring ?? 'boards');
    if (reno) {
      const dust = Rng.fromSeed(`dust:${apt.id}:${room.index}`);
      for (let i = 0; i < w / 2; i++) rect(g, room.x0 + dust.int(0, w - 1), fy - dust.int(0, 1), 1, 1, dust.pick(['#d8d2c6', '#b8b0a2', '#c8a890']));
      // кучи строительного мусора
      const piles = dust.int(1, 2);
      for (let p = 0; p < piles; p++) {
        const px = room.x0 + dust.int(4, Math.max(5, w - 18));
        const pw = dust.int(8, 14);
        for (let i = 0; i < pw; i++) {
          const hh = Math.max(1, Math.round(4 - Math.abs(i - pw / 2) * (8 / pw)));
          rect(g, px + i, fy - hh, 1, hh, dust.pick(['#a89a88', '#c8baa6', '#8a7a6a', '#b8584a']));
        }
      }
      // кабель змейкой по полу
      for (let x = room.x0 + 2; x < room.x1 - 2; x++) if ((x + room.index) % 9 < 6) rect(g, x, fy - 1 - (Math.floor(x / 5) % 2), 1, 1, '#2a2a30');
    }
    const wr = windowRect(room, lt);
    const style = apt.vacant || reno ? 'vacant' : def?.style ?? 'plain';
    if (wr) {
      drawWindow(g, wr, apt.vacant || reno ? '#d0ccc4' : style === 'loft' ? '#3a3a40' : '#efece4', curtainsFor(style), pal);
      if (reno) {
        // малярный скотч крест-накрест
        for (let i = 0; i < wr[2]; i++) {
          rect(g, wr[0] + i, wr[1] + Math.round((i * wr[3]) / wr[2]), 1, 1, 'rgba(230,210,150,0.8)');
          rect(g, wr[0] + i, wr[1] + wr[3] - 1 - Math.round((i * wr[3]) / wr[2]), 1, 1, 'rgba(230,210,150,0.8)');
        }
      }
      // батарея под окном (на ремонте — снята, торчат обрезки труб)
      const rx = wr[0] + 2;
      const rw2 = wr[2] - 4;
      if (reno) {
        rect(g, rx, fy - 14, 1, 12, '#7a6a5a');
        rect(g, rx + rw2 - 1, fy - 14, 1, 12, '#7a6a5a');
        rect(g, rx - 1, fy - 14, 3, 1, '#5a4a3a');
        rect(g, rx + rw2 - 2, fy - 14, 3, 1, '#5a4a3a');
        // плёнка на окне
        g.fillStyle = 'rgba(235,240,244,0.45)';
        g.fillRect(wr[0] - 2, wr[1] - 2, wr[2] + 4, wr[3] + 4);
        rect(g, wr[0] - 2, wr[1] - 2, wr[2] + 4, 1, 'rgba(200,190,150,0.9)');
      } else {
        rect(g, rx, fy - 15, rw2, 9, '#e6e2d8');
        for (let x = rx + 1; x < rx + rw2 - 1; x += 3) rect(g, x, fy - 15, 1, 9, '#c8c2b4');
        rect(g, rx + rw2 - 1, fy - 6, 1, 4, '#9a968c');
      }
    }
    if (!apt.vacant && !reno) {
      rect(g, room.x0 + 4, fy - 9, 2, 2, '#f4f2ec'); // розетка
      rect(g, room.x0 + 5, fy - 8, 1, 1, '#888');
      rect(g, room.x1 - 6, fy - 32, 2, 3, '#f4f2ec'); // выключатель
    }
    if (reno) {
      // провода вместо люстры и подрозетники
      const lx = Math.round((room.x0 + room.x1) / 2);
      rect(g, lx, lt + 2, 1, 7, '#333');
      rect(g, lx + 1, lt + 8, 1, 2, '#c8402e');
      rect(g, room.x0 + 6, fy - 10, 3, 3, '#5a5650');
      rect(g, room.x1 - 9, fy - 33, 3, 3, '#5a5650');
      continue;
    }
    // лепнина под потолком
    if (style === 'classic' || style === 'soviet') {
      rect(g, room.x0, lt + 2, w, 1, shade(wallColor, 0.25));
      rect(g, room.x0, lt + 3, w, 1, shade(wallColor, -0.12));
    }
    // гирлянда
    if (style === 'cozy' || style === 'boho') {
      const colors = ['#ffd27a', '#ff8a6a', '#8fd0ff', '#b8f08a'];
      for (let x = room.x0 + 3, i = 0; x < room.x1 - 3; x += 4, i++) rect(g, x, lt + 4 + (i % 2), 1, 1, colors[i % colors.length]);
    }
    if (room.type === 'bathroom' && w < 40) {
      // в тесном туалете — голая лампочка в патроне
      const lx = Math.round((room.x0 + room.x1) / 2);
      rect(g, lx, lt + 2, 1, 4, '#555');
      rect(g, lx - 1, lt + 6, 3, 3, '#f4ecd0');
    } else drawLamp(g, Math.round((room.x0 + room.x1) / 2), lt, style, pal);
  }
  // мебель
  for (const room of apt.rooms) {
    for (const f of room.furniture) {
      const key = `furniture:${f.def.id}`;
      const sprite = sprites.hasOverride(key) ? sprites.get(key, () => makeCanvas(1, 1)) : undefined;
      drawFurniture(f.def.layer === 'front' ? gf : g, f, pal, def?.style ?? 'plain', sprite);
    }
  }
  // межкомнатные стены с проёмами
  for (const [i, wx] of L.innerWalls(apt).entries()) {
    const x = Math.round(wx);
    if (def?.renovation) {
      // перегородку разбирают: кирпичная кладка с рваным краем
      const rng = Rng.fromSeed(`wall:${apt.id}:${i}`);
      const keep = i % 2 === 0 ? h - 26 : rng.int(8, 20);
      for (let y = lt; y < lt + keep; y++) {
        const row = Math.floor((y - lt) / 3);
        rect(g, x - 1, y, 4, 1, (y - lt) % 3 === 2 ? '#c8b8a0' : row % 2 ? '#a85a4a' : '#9a4e40');
      }
      for (let k = 0; k < 4; k++) rect(g, x - 2 + rng.int(0, 4), lt + keep + k, 1, 1, '#9a4e40'); // рваный край
      rect(g, x - 5, fy - 3, 12, 3, '#a89a88'); // кирпичи внизу
      rect(g, x - 3, fy - 5, 4, 2, '#a85a4a');
      rect(g, x + 2, fy - 4, 3, 1, '#9a4e40');
      continue;
    }
    rect(g, x, lt, INNER_WALL, h - 26, '#d9d3c7');
    rect(g, x, lt, 1, h - 26, '#c4bdb0');
    rect(g, x - 1, fy - 27, INNER_WALL + 2, 1, apt.vacant ? '#bbb' : shade(pal.wood, 0.1)); // наличник
  }
  // стена с входной дверью у лестничной клетки
  const dx = apt.side === 'left' ? apt.x1 - 1 : apt.x0 - 2;
  rect(g, dx, lt, 3, h - 26, '#c8c1b4');
  rect(g, dx, fy - 26, 3, 1, '#7a6a5a');
  if (apt.level === 0) {
    // окошко консьержки в холл
    rect(g, dx - 1, fy - 46, 5, 14, '#8a7a6a');
    rect(g, dx, fy - 45, 3, 12, '#bcd8e4');
    rect(g, dx + 1, fy - 44, 1, 4, '#ffffff');
    rect(g, dx - 3, fy - 32, 9, 2, '#8a6a4a'); // полочка
  }
}

/** Стены квартиры на ремонте: содранные обои, штукатурка, свежая краска */
function drawRenovationWalls(g: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, oldWall: string, oldPaper: string, pal: Palette, seed: string) {
  const rng = Rng.fromSeed(`reno:${seed}`);
  rect(g, x0, y0, w, h, '#cfc8bb'); // штукатурка
  for (let i = 0; i < (w * h) / 40; i++) rect(g, x0 + rng.int(0, w - 1), y0 + rng.int(0, h - 1), 1, 1, rng.pick(['#c4bcae', '#d8d2c6']));
  // остатки старых обоев — рваными кусками
  const pieces = rng.int(1, 3);
  for (let p = 0; p < pieces; p++) {
    const pw = rng.int(10, Math.max(12, Math.floor(w / 2)));
    const px = x0 + rng.int(0, Math.max(0, w - pw));
    const top = y0 + rng.int(4, 18);
    const old = document.createElement('canvas');
    old.width = pw;
    old.height = h;
    const og = old.getContext('2d')!;
    drawWallpaper(og, 0, 0, pw, h, oldWall, oldPaper === 'plain' ? 'flowers' : oldPaper, `${seed}:${p}`);
    for (let x = 0; x < pw; x++) {
      const t = top + Math.round(Math.sin(x * 0.9 + p) * 2 + rng.range(0, 3));
      g.drawImage(old, x, t - y0, 1, y0 + h - t, px + x, t, 1, y0 + h - t);
    }
  }
  // полоса свежей краски, валиком
  if (rng.chance(0.7)) {
    const bw = rng.int(14, Math.max(16, Math.floor(w / 2)));
    const bx = x0 + rng.int(0, Math.max(0, w - bw));
    const ph = rng.int(Math.floor(h / 2), h);
    const paint = mix(pal.accent, '#ffffff', 0.55);
    rect(g, bx, y0 + h - ph, bw, ph, paint);
    for (let x = bx; x < bx + bw; x += 5) rect(g, x, y0 + h - ph, 1, ph, shade(paint, -0.04));
    for (let x = bx; x < bx + bw; x++) if (rng.chance(0.4)) rect(g, x, y0 + h - ph - 1, 1, 1, paint);
  }
  // участок, сбитый до кирпича
  if (rng.chance(0.8)) {
    const bw = rng.int(12, 24);
    const bh = rng.int(10, 22);
    const bx = x0 + rng.int(2, Math.max(3, w - bw - 2));
    const by = y0 + rng.int(6, Math.max(7, h - bh - 4));
    for (let yy = 0; yy < bh; yy++) {
      const off = Math.floor(yy / 3) % 2 ? 3 : 0;
      for (let xx = 0; xx < bw; xx++) {
        const edge = (xx === 0 || xx === bw - 1 || yy === 0 || yy === bh - 1) && rng.chance(0.5);
        if (edge) continue;
        const mortar = yy % 3 === 2 || (xx + off) % 6 === 5;
        rect(g, bx + xx, by + yy, 1, 1, mortar ? '#c8b8a0' : (xx + yy) % 7 === 0 ? '#9a4e40' : '#a85a4a');
      }
    }
  }
  // пятна и потёки под потолком
  for (let i = 0; i < 3; i++) rect(g, x0 + rng.int(0, Math.max(1, w - 8)), y0 + 2, rng.int(3, 8), rng.int(1, 3), '#b8b0a0');
  // карандашные пометки разметки
  rect(g, x0 + rng.int(4, Math.max(5, w - 12)), y0 + rng.int(14, 30), 7, 1, '#7a7a80');
}

/** Закрытая входная дверь (рисуется динамически, т.к. открывается) */
export function drawApartmentDoor(g: CanvasRenderingContext2D, apt: ApartmentModel, fy: number, open: boolean) {
  const dx = apt.side === 'left' ? apt.x1 - 1 : apt.x0 - 2;
  if (open) {
    rect(g, dx, fy - 25, 3, 25, 'rgba(40,30,25,0.35)');
    const leafX = apt.side === 'left' ? dx - 9 : dx + 3;
    rect(g, leafX, fy - 25, 9, 25, '#5a2f24');
    rect(g, leafX + (apt.side === 'left' ? 1 : 7), fy - 13, 1, 2, '#d6c38a');
  } else {
    rect(g, dx, fy - 25, 3, 25, '#5a2f24');
    rect(g, dx + 1, fy - 24, 1, 23, '#6e3a2c');
  }
}

function drawCore(g: CanvasRenderingContext2D, defs: WorldDefs, level: number, lt: number, fy: number) {
  const L = defs.layout;
  const x0 = L.coreX;
  const h = fy - lt;
  rect(g, x0, lt, CORE_W, h, CORE_HIGH);
  rect(g, x0, fy - 18, CORE_W, 18, CORE_LOW);
  rect(g, x0, fy - 19, CORE_W, 1, shade(CORE_LOW, -0.25));
  // потёртости и надписи
  const rng = Rng.fromSeed(`core${level}`);
  for (let i = 0; i < 6; i++) rect(g, x0 + rng.int(2, CORE_W - 4), fy - rng.int(4, 16), rng.int(1, 3), 1, shade(CORE_LOW, -0.12));
  rect(g, x0, fy, CORE_W, 2, '#8c7f73');
  rect(g, x0, fy, CORE_W, 1, '#a39587');
  // шахта лифта
  const ex0 = L.elevator.x0;
  const ex1 = L.elevator.x1;
  rect(g, ex0 - 1, lt, ex1 - ex0 + 2, h, '#4a4a52');
  rect(g, ex0, lt, ex1 - ex0, h, '#2f3036');
  rect(g, ex0 + 3, lt, 1, h, '#55565e');
  rect(g, ex1 - 4, lt, 1, h, '#55565e');
  rect(g, Math.round((ex0 + ex1) / 2), lt, 1, h, '#1d1d22');
  // проём дверей лифта
  rect(g, ex0 - 2, fy - 26, ex1 - ex0 + 4, 2, '#7a7b84');
  rect(g, ex0 - 2, fy - 24, 1, 24, '#7a7b84');
  rect(g, ex1 + 1, fy - 24, 1, 24, '#7a7b84');
  rect(g, ex1 + 2, fy - 15, 2, 3, '#d8d0b8'); // кнопка
  rect(g, ex1 + 2, fy - 14, 1, 1, '#d84a3a');
  // номер этажа — краской на стене шахты, как в настоящих подъездах
  digits(g, String(level + 1), ex0 + 8, fy - 33, '#8a8a92');
  // лампа подъезда
  rect(g, x0 + 22, lt + 2, 6, 2, '#e8e2c8');
  rect(g, x0 + 23, lt + 4, 4, 1, '#cfc8ae');
}

function drawStairs(g: CanvasRenderingContext2D, defs: WorldDefs) {
  const L = defs.layout;
  const foot = L.stairs.footX;
  const land = L.stairs.landingX;
  const stepColor = '#9a948a';
  const stepTop = '#b8b0a4';
  const under = '#7e786f';
  const rail = '#5a4a3e';
  const flight = (xa: number, ya: number, xb: number, yb: number, behind: boolean) => {
    // ступени: «лесенка» от (xa,ya) до (xb,yb), ya > yb (идём вверх)
    const n = Math.round((ya - yb) / 3);
    const dirX = Math.sign(xb - xa);
    for (let i = 0; i < n; i++) {
      const sx = Math.round(xa + ((xb - xa) * i) / n);
      const sy = Math.round(ya - ((ya - yb) * (i + 1)) / n);
      const sw = Math.max(2, Math.round(Math.abs(xb - xa) / n) + 1);
      const x = dirX > 0 ? sx : sx - sw + 1;
      rect(g, x, sy, sw, ya - sy + 2, behind ? shade(stepColor, -0.15) : stepColor);
      rect(g, x, sy, sw, 1, behind ? shade(stepTop, -0.15) : stepTop);
    }
    // косоур
    for (let i = 0; i <= Math.abs(xb - xa); i++) {
      const x = xa + dirX * i;
      const y = Math.round(ya + 3 - ((ya - yb) * i) / Math.abs(xb - xa));
      rect(g, x, y, 1, 2, under);
    }
    // перила
    for (let i = 0; i <= Math.abs(xb - xa); i++) {
      const x = xa + dirX * i;
      const y = Math.round(ya - 9 - ((ya - yb) * i) / Math.abs(xb - xa));
      rect(g, x, y, 1, 1, rail);
      if (i % 4 === 0) rect(g, x, y + 1, 1, 8, behind ? '#6a6a6a' : '#5b5b5b');
    }
  };
  for (let level = 0; level < L.floors; level++) {
    const fy = L.floorY(level);
    const midY = fy - FLOOR_H / 2;
    // площадка между этажами
    rect(g, land - 4, midY, L.stairs.x1 - land + 4, 3, CONCRETE);
    rect(g, land - 4, midY, L.stairs.x1 - land + 4, 1, stepTop);
    // верхний марш (дальний) — от площадки к следующему этажу
    flight(land - 2, midY, foot, L.floorY(level + 1), true);
    // нижний марш (ближний)
    flight(foot, fy, land - 2, midY, false);
  }
}

function drawGroundFloor(g: CanvasRenderingContext2D, defs: WorldDefs, lt: number, fy: number) {
  const L = defs.layout;
  const h = fy - lt;
  const lx0 = L.buildingX0 + OUTER_WALL;
  const lx1 = L.coreX;
  const rx0 = L.coreX + CORE_W;
  const rx1 = L.buildingX1 - OUTER_WALL;
  const rng = Rng.fromSeed('ground');

  // слева — комната консьержки (рисуется как квартира), иначе — кладовка
  if (!L.aptById.has('apt-1-left')) {
    drawWallpaper(g, lx0, lt, lx1 - lx0, h, '#cdc7b9', 'panels', 'ground-left');
    rect(g, lx0, fy, lx1 - lx0, 2, '#8c7f73');
    rect(g, lx0, lt + 4, lx1 - lx0, 2, '#7a6a5e');
  }

  // справа — колясочная, велосипеды, почта, выход во двор
  drawWallpaper(g, rx0, lt, rx1 - rx0, h, '#cfd4c4', 'panels', 'ground-right');
  rect(g, rx0, lt, rx1 - rx0, 2, shade('#cfd4c4', -0.2));
  rect(g, rx0, fy, rx1 - rx0, 2, '#8c7f73');
  for (let x = rx0; x < rx1; x += 6) rect(g, x, fy, 3, 1, '#9a8c7e'); // плитка
  // трубы под потолком
  rect(g, rx0, lt + 4, rx1 - rx0, 2, '#7a6a5e');
  rect(g, rx0, lt + 7, rx1 - rx0, 1, '#9a8a7e');
  // лампы дневного света
  for (const x of [rx0 + 40, rx0 + 150]) {
    rect(g, x, lt + 8, 22, 2, '#d8d8d2');
    rect(g, x + 1, lt + 10, 20, 1, '#f4f8f0');
  }
  // почтовые ящики: 3 ряда по 6
  const mx = rx0 + 8;
  const my = fy - 46;
  rect(g, mx - 1, my - 1, 40, 22, '#3a5070');
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 6; col++) {
      const x = mx + col * 6.5;
      const y = my + row * 7;
      rect(g, x, y, 6, 6, '#5f7c9e');
      rect(g, x + 1, y + 1, 4, 1, '#2a3a50');
      if (rng.chance(0.4)) rect(g, x + 1, y + 2, 3, 1, '#f3f1ea'); // торчит газета
      rect(g, x + 4, y + 4, 1, 1, '#d6c38a');
    }
  // столик для «ненужной» почты и рекламы
  rect(g, mx + 4, fy - 14, 28, 2, '#8a6a4a');
  rect(g, mx + 6, fy - 12, 1, 12, '#6a4a3a');
  rect(g, mx + 30, fy - 12, 1, 12, '#6a4a3a');
  rect(g, mx + 8, fy - 16, 8, 2, '#f3f1ea');
  rect(g, mx + 18, fy - 15, 6, 1, '#e8b040');
  // стенд «Жильцы дома» — список квартир под стеклом
  const rb = residentsBoardRect(defs);
  rect(g, rb.x - 1, rb.y - 1, rb.w + 2, rb.h + 2, '#6a4a2a');
  rect(g, rb.x, rb.y, rb.w, rb.h, '#efe8d4');
  rect(g, rb.x + 2, rb.y + 1, rb.w - 4, 2, '#7a2a2a'); // заголовок
  for (let yy = rb.y + 5; yy < rb.y + rb.h - 2; yy += 3) {
    rect(g, rb.x + 2, yy, 3, 1, '#3a3530');
    rect(g, rb.x + 7, yy, rb.w - 10 - ((yy * 7) % 5), 1, '#8a8478');
  }
  rect(g, rb.x + 1, rb.y + 1, 1, rb.h - 4, 'rgba(255,255,255,0.6)'); // блик стекла
  // доска объявлений
  const nb = rx0 + 58;
  rect(g, nb, fy - 50, 30, 20, '#b08a5a');
  rect(g, nb + 2, fy - 48, 8, 9, '#f0ece0');
  rect(g, nb + 12, fy - 47, 7, 8, '#f6e6a0');
  rect(g, nb + 21, fy - 48, 7, 6, '#dfe9f0');
  rect(g, nb + 3, fy - 37, 12, 5, '#f0ece0');
  rect(g, nb + 18, fy - 40, 9, 8, '#ffd0d0');
  for (const [x, y] of [[nb + 5, fy - 48], [nb + 15, fy - 47], [nb + 24, fy - 48]]) rect(g, x, y, 1, 1, '#c8402e');
  // велопарковка: стойка и два велосипеда
  const bx = rx0 + 98;
  rect(g, bx - 2, fy - 8, 56, 2, '#7a7d84');
  for (let x = bx; x < bx + 54; x += 9) rect(g, x, fy - 12, 1, 6, '#7a7d84');
  const bikeAt = (x: number, frame: string) => {
    for (const cx of [x, x + 18]) {
      rect(g, cx - 5, fy - 11, 11, 1, '#2a2a2e');
      rect(g, cx - 5, fy - 1, 11, 1, '#2a2a2e');
      rect(g, cx - 6, fy - 10, 1, 9, '#2a2a2e');
      rect(g, cx + 6, fy - 10, 1, 9, '#2a2a2e');
      rect(g, cx, fy - 6, 1, 1, '#999');
    }
    rect(g, x, fy - 7, 18, 1, frame);
    rect(g, x + 7, fy - 14, 1, 7, frame);
    rect(g, x + 5, fy - 15, 5, 1, '#222');
    rect(g, x + 16, fy - 16, 1, 9, frame);
    rect(g, x + 14, fy - 17, 5, 1, '#444');
  };
  bikeAt(bx + 4, '#b03a3a');
  bikeAt(bx + 30, '#3a7ab0');
  // коляски
  const st = rx0 + 162;
  rect(g, st, fy - 16, 18, 9, '#5f7d95');
  rect(g, st + 11, fy - 21, 7, 6, '#4a6580');
  rect(g, st + 2, fy - 5, 4, 4, '#222');
  rect(g, st + 12, fy - 5, 4, 4, '#222');
  rect(g, st - 3, fy - 23, 1, 9, '#888');
  rect(g, st - 4, fy - 23, 3, 1, '#888');
  const st2 = st + 26;
  rect(g, st2, fy - 13, 14, 6, '#c86a6a'); // прогулочная
  rect(g, st2 + 1, fy - 18, 4, 5, '#c86a6a');
  rect(g, st2 + 1, fy - 5, 3, 3, '#222');
  rect(g, st2 + 10, fy - 5, 3, 3, '#222');
  rect(g, st2 + 12, fy - 22, 1, 10, '#888');
  // санки на стене
  rect(g, st + 4, fy - 44, 18, 2, '#c8402e');
  rect(g, st + 4, fy - 42, 1, 3, '#888');
  rect(g, st + 21, fy - 42, 1, 3, '#888');
  // радиатор
  rect(g, rx1 - 64, fy - 13, 18, 9, '#d8d4c8');
  for (let x = rx1 - 63; x < rx1 - 47; x += 3) rect(g, x, fy - 13, 1, 9, '#bdb7a8');
  // коврик и внутренняя тамбурная дверь
  rect(g, rx1 - 30, fy - 1, 22, 1, '#5a4a3e');
  rect(g, rx1 - 40, lt, 3, h - 30, '#c8c1b4');
  rect(g, rx1 - 40, fy - 30, 3, 1, '#7a6a5a');
  rect(g, rx1 - 42, fy - 29, 1, 29, '#7a6a5a'); // распахнутая створка
  // проём наружной двери
  rect(g, L.buildingX1 - OUTER_WALL, fy - 30, OUTER_WALL, 30, '#3a2f2a');
}

/** Где на стене висит стенд «Жильцы дома» (рядом с почтовыми ящиками) */
export function residentsBoardRect(defs: WorldDefs): { x: number; y: number; w: number; h: number } {
  const L = defs.layout;
  const fy = L.floorY(0);
  return { x: L.coreX + CORE_W + 96, y: fy - 54, w: 22, h: 26 };
}

/** Наружная дверь подъезда и козырёк (поверх, со стороны двора) */
export function drawEntrance(g: CanvasRenderingContext2D, defs: WorldDefs, open: boolean) {
  const L = defs.layout;
  const fy = L.floorY(0);
  const x = L.buildingX1;
  if (!open) rect(g, x - OUTER_WALL, fy - 25, OUTER_WALL, 25, '#6b4a34');
  // козырёк
  rect(g, x, fy - 32, 22, 3, '#8a847c');
  rect(g, x, fy - 29, 22, 1, '#6e6a64');
  rect(g, x + 20, fy - 29, 1, 29, '#7a756e');
  // фонарь над дверью
  rect(g, x + 2, fy - 36, 4, 3, '#444');
  rect(g, x + 3, fy - 33, 2, 1, '#ffe6a0');
  // ступенька
  rect(g, x, fy - 1, 16, 1, '#a39b8e');
}
