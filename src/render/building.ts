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

/** Стройка этажа для отрисовки: уровень и готовность 0..1 (null — стройки нет или закончена) */
export interface ConstructionView {
  level: number;
  progress: number;
}

/** Как далеко жильцы продвинулись с комнатой отдыха (null — готова или её нет) */
export interface CommonBuildView {
  /** 0 — хлам, 1 — стены, 2 — пол, 3 — свет, 4 — сносят мебель */
  stage: number;
  progress: number;
}

export function renderBuilding(defs: WorldDefs, sprites: SpriteRegistry, con: ConstructionView | null = null, build: CommonBuildView | null = null): BuildingLayers {
  const L = defs.layout;
  const back = makeCanvas(L.worldW, L.worldH);
  const front = makeCanvas(L.worldW, L.worldH);
  const g = ctx2d(back);
  const gf = ctx2d(front);
  const bx0 = L.buildingX0;
  const bx1 = L.buildingX1;
  const topY = L.levelTop(L.floors);

  // ── крыша (на стройке её поднимают наверх, когда новый этаж накрыт перекрытием)
  const roofTop = L.roofY;
  const roofOn = !con || con.progress >= 0.5;
  if (roofOn) {
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
  }

  // ── внешние стены (панели)
  // (строящийся этаж — без готовых панелей: там своя кладка)
  const wallTop = con ? L.levelTop(con.level - 1) : topY;
  for (const wx of [bx0, bx1 - OUTER_WALL]) {
    rect(g, wx, wallTop, OUTER_WALL, L.groundY - wallTop + SLAB, PANEL);
    for (let l = 0; l <= L.floors; l++) if (!con || l !== con.level) rect(g, wx, L.levelTop(l), OUTER_WALL, 1, PANEL_DARK);
    rect(g, wx + (wx === bx0 ? 0 : OUTER_WALL - 1), wallTop, 1, L.groundY - wallTop + SLAB, PANEL_DARK);
  }

  // подвал (под перекрытием первого этажа): кладовки, котельная, спуск по лестнице, справа — комната отдыха
  drawBasement(g, defs);

  // ── уровни
  for (let level = 0; level <= L.floors; level++) {
    const lt = L.levelTop(level);
    const fy = L.floorY(level);
    // перекрытие
    rect(g, bx0, fy, bx1 - bx0, SLAB, CONCRETE);
    rect(g, bx0, fy + SLAB - 1, bx1 - bx0, 1, shade(CONCRETE, -0.2));
    if (con && level === con.level) drawConstruction(g, defs, level, con.progress);
    else drawCore(g, defs, level, lt, fy);
    if (level === 0) drawGroundFloor(g, defs, lt, fy);
  }
  // лестничные марши поверх стен ядра
  drawStairs(g, defs);

  for (const apt of L.apartments) if (!con || apt.level !== con.level) drawApartment(g, gf, defs, apt, sprites, apt === L.commonRoom ? build : null);
  for (const apt of L.apartments) if (!con || apt.level !== con.level) drawBalcony(g, gf, defs, apt);
  if (con) drawScaffolding(gf, defs, con.level, con.progress);

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
  build: CommonBuildView | null = null,
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
    // подвал ещё обустраивают: до проводки света — голая лампочка-переноска на проводе
    if (build && build.stage < 4) {
      if (room.index === 0) {
        const lx = Math.round((room.x0 + room.x1) / 2);
        rect(g, lx, lt + 2, 1, 9, '#333');
        rect(g, lx - 1, lt + 11, 3, 3, '#f2e6b0');
      }
      continue;
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
  if (build && build.stage < 4) drawCommonBuild(g, apt, lt, fy, build);
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
  // окно в торцевой стене — прямо над входом в подъезд (над балконной дверью)
  if (def?.entranceWindow && apt.side === 'right') {
    const wx = L.buildingX1 - OUTER_WALL;
    const wy = fy - 44;
    rect(g, wx, wy - 1, OUTER_WALL, 16, '#efece4'); // рама
    rect(g, wx + 1, wy, OUTER_WALL - 2, 14, '#9ccbe0'); // стекло
    rect(g, wx + 1, wy + 2, 1, 6, '#e4f4fb'); // блик
    rect(g, wx, wy + 7, OUTER_WALL, 1, '#efece4'); // перекладина
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

/**
 * Подвал в разрезе: высотой с этаж (уровень -1). Слева — кладовки жильцов за деревянными решётками
 * и котельная, посередине — лестница вниз и приямок лифта (лифт в подвал не ходит), справа —
 * общая комната (рисуется как квартира) или просто кладовки, если её нет. Ниже — фундамент.
 */
function drawBasement(g: CanvasRenderingContext2D, defs: WorldDefs) {
  const L = defs.layout;
  const bx0 = L.buildingX0;
  const bx1 = L.buildingX1;
  const lt = L.groundY + SLAB;
  const fy = lt + FLOOR_H - SLAB;
  const common = L.commonRoom;
  rect(g, bx0 - 2, lt, bx1 - bx0 + 4, fy - lt + SLAB, '#6e6a64'); // бетонные стены
  rect(g, bx0 - 2, lt, bx1 - bx0 + 4, 1, '#5a5650');
  const innerX0 = bx0 + 2;
  const storeX1 = common ? L.coreX : bx1 - 2;
  rect(g, innerX0, lt + 2, storeX1 - innerX0, fy - lt - 2, '#3a3734'); // помещение
  rect(g, innerX0, fy - 1, storeX1 - innerX0, 1, '#4a4642'); // пол
  // трубы: отопление (подача и обратка), холодная вода
  rect(g, bx0 + 4, lt + 4, storeX1 - bx0 - 8, 2, '#8a3a2e');
  rect(g, bx0 + 4, lt + 7, storeX1 - bx0 - 8, 2, '#3a5a8a');
  rect(g, bx0 + 4, lt + 10, storeX1 - bx0 - 8, 1, '#6a6a72');
  for (let x = bx0 + 30; x < storeX1 - 10; x += 48) rect(g, x, lt + 3, 3, 8, '#6a6a72'); // хомуты и стояки
  // кладовки жильцов: деревянные решётки, внутри — банки, лыжи, коробки
  const rng = Rng.fromSeed('basement');
  const boilerX = common ? L.coreX - 46 : L.coreX + CORE_W + 10;
  for (let x = bx0 + 12; x < storeX1 - 30; x += 34) {
    if (x > boilerX - 30 && x < boilerX + 40) continue;
    if (x > L.coreX - 30 && x < L.coreX + CORE_W) continue;
    const top = fy - 38;
    for (let i = 0; i < 22; i += 3) rect(g, x + i, top, 1, fy - top, '#7a6040');
    rect(g, x, top, 22, 1, '#7a6040');
    rect(g, x + 3, fy - 8, 6, 7, rng.pick(['#8a6a4a', '#6a5a4a']));
    if (rng.chance(0.6)) for (let i = 0; i < 3; i++) rect(g, x + 12 + i * 3, fy - 6, 2, 5, rng.pick(['#c84a3a', '#d8b860', '#7ab060']));
    if (rng.chance(0.4)) rect(g, x + 17, top + 2, 1, fy - top - 4, '#3a6ab0');
  }
  // котельная: котёл с манометром и бойлер
  rect(g, boilerX, fy - 34, 18, 33, '#5a5a62');
  rect(g, boilerX + 2, fy - 32, 14, 1, '#6a6a72');
  rect(g, boilerX + 5, fy - 28, 5, 5, '#d8d4cc');
  rect(g, boilerX + 7, fy - 27, 1, 2, '#c8402e');
  rect(g, boilerX + 22, fy - 22, 14, 21, '#4a5a4a');
  rect(g, boilerX + 8, lt + 11, 2, fy - 34 - lt - 11, '#8a3a2e'); // труба от котла
  // лестничная клетка: крашеная стена, лампочка, приямок лифта за сеткой
  rect(g, L.coreX, lt + 2, CORE_W, fy - lt - 2, '#8a847a');
  rect(g, L.coreX, fy - 14, CORE_W, 13, '#6e6a62'); // панель снизу
  rect(g, L.coreX, fy - 15, CORE_W, 1, '#5a564e');
  rect(g, L.elevator.x0, lt + 2, L.elevator.x1 - L.elevator.x0, fy - lt - 2, '#4a4844'); // приямок
  for (let y = lt + 4; y < fy - 2; y += 4) rect(g, L.elevator.x0, y, L.elevator.x1 - L.elevator.x0, 1, '#5e5c58');
  for (let x = L.elevator.x0; x < L.elevator.x1; x += 4) rect(g, x, lt + 2, 1, fy - lt - 3, '#5e5c58');
  rect(g, L.stairs.x0 + 20, lt + 2, 1, 4, '#3a3a3a'); // лампочка на проводе
  rect(g, L.stairs.x0 + 19, lt + 6, 3, 3, '#f2e6b0');
  if (common) {
    // дверь в комнату отдыха — открыта настежь, на ней табличка
    const dx = common.x0 - 2;
    rect(g, dx - 12, fy - 31, 10, 6, '#f2ead6');
    rect(g, dx - 11, fy - 29, 8, 1, '#7a5a3e');
    rect(g, dx - 11, fy - 27, 6, 1, '#7a5a3e');
  }
  // перекрытие подвала и фундаментная подушка
  rect(g, bx0 - 2, fy, bx1 - bx0 + 4, SLAB, CONCRETE);
  rect(g, bx0 - 6, fy + SLAB, bx1 - bx0 + 12, 6, '#8a8680');
  rect(g, bx0 - 6, fy + SLAB, bx1 - bx0 + 12, 1, '#a39f98');
  // окошки подвала у самой земли (в кладовках)
  for (let x = bx0 + 20; x < storeX1 - 20; x += 64) rect(g, x, lt + 1, 8, 3, '#2d2b2a');
}

/**
 * Подвал ещё обустраивают: где не покрашено — голый бетон с подтёками, где не постелено — бетонный пол,
 * хлам (до расчистки), стремянка и банки с краской, стопка досок, моток провода.
 */
function drawCommonBuild(g: CanvasRenderingContext2D, apt: ApartmentModel, lt: number, fy: number, b: CommonBuildView) {
  const x0 = apt.x0;
  const x1 = apt.x1;
  const span = x1 - x0;
  const painted = b.stage < 1 ? x0 : b.stage === 1 ? x0 + Math.round(span * b.progress) : x1;
  const floored = b.stage < 2 ? x0 : b.stage === 2 ? x0 + Math.round(span * b.progress) : x1;
  const rng = Rng.fromSeed('commonbuild');
  // голый бетон: стены
  if (painted < x1) {
    rect(g, painted, lt, x1 - painted, fy - lt, '#77726b');
    rect(g, painted, lt, x1 - painted, 2, '#625e58');
    for (let i = 0; i < (x1 - painted) / 3; i++) rect(g, painted + rng.int(0, x1 - painted - 1), lt + rng.int(2, fy - lt - 4), 1, rng.int(1, 4), rng.pick(['#6a665f', '#827d75', '#5e6a5e']));
    // кирпич проступает сквозь штукатурку
    for (let k = 0; k < 6; k++) {
      const bx = painted + rng.int(0, Math.max(1, x1 - painted - 10));
      const by = lt + rng.int(6, fy - lt - 20);
      rect(g, bx, by, 8, 3, '#8a5a4a');
      rect(g, bx, by + 1, 8, 1, '#6e4a3e');
    }
  }
  // бетонный пол
  if (floored < x1) {
    rect(g, floored, fy, x1 - floored, 4, '#8a8580');
    rect(g, floored, fy - 2, x1 - floored, 2, '#6a665f');
  }
  if (b.stage === 0) {
    // хлам: чем дальше расчистка, тем меньше куч
    const piles = Math.ceil((1 - b.progress) * 9);
    const prng = Rng.fromSeed('junk');
    for (let i = 0; i < 9; i++) {
      const px = x0 + 8 + Math.floor(((span - 30) * i) / 9) + prng.int(0, 6);
      const kind = prng.int(0, 4);
      if (i >= piles) continue;
      if (kind === 0) {
        // коробки штабелем
        rect(g, px, fy - 10, 12, 10, '#a8865a');
        rect(g, px + 2, fy - 18, 10, 8, '#9a7a50');
        rect(g, px, fy - 10, 12, 1, '#c0a070');
      } else if (kind === 1) {
        // старые покрышки
        rect(g, px, fy - 5, 12, 5, '#2a2a2a');
        rect(g, px + 1, fy - 10, 10, 5, '#333');
        rect(g, px + 4, fy - 9, 4, 3, '#555');
      } else if (kind === 2) {
        // доски, прислонённые к стене
        for (let k = 0; k < 4; k++) rect(g, px + k * 2, fy - 26 + k, 2, 26 - k, k % 2 ? '#8a6a48' : '#7a5a3c');
      } else if (kind === 3) {
        // сломанный стул и мешок
        rect(g, px, fy - 8, 9, 2, '#6a4a30');
        rect(g, px, fy - 6, 1, 6, '#6a4a30');
        rect(g, px + 8, fy - 14, 1, 14, '#6a4a30');
        rect(g, px + 10, fy - 7, 8, 7, '#8a8a70');
      } else {
        // старый матрас свёрнут
        rect(g, px, fy - 9, 16, 9, '#b0a890');
        rect(g, px, fy - 6, 16, 1, '#8a8470');
      }
    }
  }
  if (b.stage === 1) {
    // стремянка у границы покраски, ведро и валик
    const lx = Math.min(x1 - 14, Math.max(x0 + 4, painted - 4));
    for (let k = 0; k < 6; k++) rect(g, lx + 1, fy - 4 - k * 5, 8, 1, '#b8b8b0');
    rect(g, lx, fy - 30, 1, 30, '#a8a8a0');
    rect(g, lx + 9, fy - 30, 1, 30, '#a8a8a0');
    rect(g, lx + 12, fy - 7, 6, 7, '#d8d8d0');
    rect(g, lx + 12, fy - 7, 6, 2, '#c9a27e');
  }
  if (b.stage === 2) {
    // стопка досок там, где ещё стелят
    const sx = Math.min(x1 - 34, Math.max(x0 + 2, floored + 4));
    for (let k = 0; k < 4; k++) rect(g, sx, fy - 3 - k * 2, 30, 2, k % 2 ? '#9a7450' : '#8a6a48');
  }
  if (b.stage === 3) {
    // стремянка посередине, моток провода
    const lx = Math.round((x0 + x1) / 2) - 18;
    for (let k = 0; k < 6; k++) rect(g, lx + 1, fy - 4 - k * 5, 8, 1, '#b8b8b0');
    rect(g, lx, fy - 30, 1, 30, '#a8a8a0');
    rect(g, lx + 9, fy - 30, 1, 30, '#a8a8a0');
    rect(g, lx + 14, fy - 5, 6, 5, '#2a2a2a');
    rect(g, lx + 16, fy - 4, 2, 3, '#c8402e');
    // провод вдоль потолка — докуда дотянули
    rect(g, x0 + 4, lt + 3, Math.round((span - 8) * b.progress), 1, '#2a2a2a');
  }
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
  // в подвал — тоже по лестнице (если там есть куда спускаться)
  for (let level = L.commonRoom ? -1 : 0; level < L.floors; level++) {
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

// ───────────────────────────── стройка нового этажа

const BRICK = '#a85a4a';
const BRICK_D = '#94503f';
const MORTAR = '#c8b8a0';
const CONC = '#a8a49c';

/** Окна будущих квартир: три проёма на каждую сторону */
export function constructionWindows(defs: WorldDefs, level: number): [number, number, number, number][] {
  const L = defs.layout;
  const lt = L.levelTop(level);
  const out: [number, number, number, number][] = [];
  for (const ax of [L.buildingX0 + OUTER_WALL, L.coreX + CORE_W]) for (const dx of [36, 117, 198]) out.push([ax + dx, lt + 11, 22, 25]);
  return out;
}

/**
 * Этаж в работе. По готовности p:
 *  0–0.15 — колонны растут, торчит арматура, на перекрытии поддоны с кирпичом;
 *  0.15–0.45 — кирпичные стены поднимаются, оставляя проёмы окон;
 *  ≥0.5 — сверху перекрытие и крыша (её рисует renderBuilding);
 *  ≥0.6 — перегородки будущих квартир; ≥0.72 — окна в плёнке, штукатурка слева направо;
 *  ≥0.85 — лампочки на проводах.
 */
function drawConstruction(g: CanvasRenderingContext2D, defs: WorldDefs, level: number, p: number) {
  const L = defs.layout;
  const lt = L.levelTop(level);
  const fy = L.floorY(level);
  const h = fy - lt;
  const bx0 = L.buildingX0;
  const bx1 = L.buildingX1;
  const rng = Rng.fromSeed(`build${level}`);
  const clamp = (x: number) => Math.max(0, Math.min(1, x));
  const wins = constructionWindows(defs, level);
  const inWin = (x: number, y: number) => wins.some(([wx, wy, ww, wh]) => x >= wx && x < wx + ww && y >= wy && y < wy + wh);

  // кирпичные стены (задняя стена разреза) — растут снизу вверх
  const hw = Math.round(clamp((p - 0.15) / 0.3) * h);
  const spans: [number, number][] = [[bx0 + OUTER_WALL, L.coreX], [L.coreX + CORE_W, bx1 - OUTER_WALL]];
  if (hw > 0) {
    for (const [x0, x1] of spans) {
      for (let y = fy - hw; y < fy; y++) {
        const row = Math.floor((fy - y) / 3);
        if ((fy - y) % 3 === 0) {
          for (let x = x0; x < x1; x++) if (!inWin(x, y)) rect(g, x, y, 1, 1, MORTAR);
          continue;
        }
        const off = row % 2 ? 4 : 0;
        let x = x0;
        while (x < x1) {
          const end = Math.min(x1, x + 8 - ((x - x0 + off) % 8));
          if (!inWin(x, y)) rect(g, x, y, end - x, 1, (Math.floor((x - x0 + off) / 8) + row) % 5 === 0 ? BRICK_D : BRICK);
          if (!inWin(end - 1, y) && end < x1) rect(g, end - 1, y, 1, 1, MORTAR);
          x = end;
        }
      }
      // неровный верх кладки, пока стена растёт
      if (hw < h) for (let x = x0; x < x1; x += 8) if (rng.chance(0.5)) rect(g, x, fy - hw - 2, 7, 2, BRICK);
    }
    // стены лестничной клетки — бетонные блоки
    rect(g, L.coreX, fy - hw, CORE_W, hw, '#9a9690');
    for (let y = fy - 6; y > fy - hw; y -= 6) rect(g, L.coreX, y, CORE_W, 1, '#8a8680');
  }
  // шахта лифта — бетон с первого дня
  rect(g, L.elevator.x0 - 1, lt, L.elevator.x1 - L.elevator.x0 + 2, h, '#4a4a52');
  rect(g, L.elevator.x0, lt, L.elevator.x1 - L.elevator.x0, h, '#2f3036');
  rect(g, L.elevator.x0 - 2, fy - 26, L.elevator.x1 - L.elevator.x0 + 4, 2, '#7a7b84');
  if (p < 0.72) {
    // проём без дверей, заграждён лентой
    for (let x = L.elevator.x0; x < L.elevator.x1; x += 2) rect(g, x, fy - 12, 1, 1, (x / 2) % 2 ? '#e8c040' : '#c8402e');
  }

  // колонны: растут в первые дни, сверху торчит арматура
  const hc = Math.round(clamp(p / 0.15) * h);
  const cols = [bx0, L.coreX - 3, L.coreX + CORE_W, bx1 - OUTER_WALL, bx0 + OUTER_WALL + Math.round(L.aptW / 2) - 2, L.coreX + CORE_W + Math.round(L.aptW / 2) - 2];
  for (const cx of cols) {
    const w = cx === bx0 || cx === bx1 - OUTER_WALL ? OUTER_WALL : 4;
    rect(g, cx, fy - hc, w, hc, CONC);
    rect(g, cx, fy - hc, 1, hc, shade(CONC, 0.12));
    if (p < 0.5) for (let i = 0; i < w; i += 2) rect(g, cx + i, fy - hc - 4, 1, 4, '#5a4a3e');
  }

  // перекрытие сверху — когда этаж накрыли
  if (p >= 0.5) {
    rect(g, bx0, lt, bx1 - bx0, 3, CONC);
    rect(g, bx0, lt + 3, bx1 - bx0, 1, shade(CONC, -0.2));
  }

  // перегородки будущих квартир (гипсокартон)
  if (p >= 0.6) {
    const ph = Math.round(clamp((p - 0.6) / 0.12) * (h - 26));
    for (const ax of [bx0 + OUTER_WALL, L.coreX + CORE_W]) {
      for (const dx of [96, 176]) {
        rect(g, ax + dx, lt + (h - 26) - ph + (p >= 0.5 ? 4 : 0), 2, ph, '#d8d4cc');
        rect(g, ax + dx, fy - 26, 2, 1, '#b8b4ac');
      }
    }
  }

  // штукатурка: слева направо по мере готовности
  if (p >= 0.72) {
    const f = clamp((p - 0.72) / 0.28);
    for (const [x0, x1] of spans) {
      const xe = Math.round(x0 + (x1 - x0) * f);
      for (let x = x0; x < xe; x++)
        for (let y = lt + 4; y < fy; y += 1) {
          if (inWin(x, y)) continue;
          // длинными вертикальными полосами — быстрее, чем по пикселю
          let y2 = y;
          while (y2 < fy && !inWin(x, y2)) y2++;
          rect(g, x, y, 1, y2 - y, (x + Math.floor(y / 7)) % 9 === 0 ? '#c8c4bc' : '#d6d2ca');
          y = y2;
        }
    }
  }

  // окна: с крышей — проёмы, потом рамы в защитной плёнке
  for (const [wx, wy, ww, wh] of wins) {
    if (hw < fy - wy) continue; // стена ещё не дошла
    if (p >= 0.72) {
      rect(g, wx - 1, wy - 1, ww + 2, wh + 2, '#efece4');
      g.clearRect(wx, wy, ww, wh);
      g.fillStyle = 'rgba(220,232,236,0.55)';
      g.fillRect(wx, wy, ww, wh);
      rect(g, wx + Math.floor(ww / 2), wy, 1, wh, '#efece4');
      for (let i = 0; i < ww; i++) rect(g, wx + i, wy + Math.round((i * wh) / ww), 1, 1, 'rgba(230,210,150,0.8)'); // малярный скотч
      rect(g, wx - 2, wy + wh + 1, ww + 4, 2, '#d8d4cc');
    } else {
      // голый проём с перемычкой
      rect(g, wx - 2, wy - 3, ww + 4, 3, CONC);
    }
  }

  // лампочки на проводах
  if (p >= 0.85) for (const [wx] of wins) {
    rect(g, wx + 11, lt + 4, 1, 6, '#333');
    rect(g, wx + 10, lt + 10, 3, 3, '#f4ecd0');
  }

  // пол: стяжка, мусор, материалы
  rect(g, bx0 + OUTER_WALL, fy - 1, bx1 - bx0 - 2 * OUTER_WALL, 1, p >= 0.6 ? '#b8b2a6' : '#8e8a82');
  const left = bx0 + OUTER_WALL;
  const right = L.coreX + CORE_W;
  if (p < 0.6) {
    // поддоны с кирпичом убывают по мере кладки
    const stack = Math.max(1, Math.round((1 - clamp(p / 0.5)) * 4));
    for (const px0 of [left + 8, right + L.aptW - 34]) {
      rect(g, px0, fy - 2, 18, 2, '#8a6a4a');
      for (let i = 0; i < stack; i++) {
        rect(g, px0 + 1, fy - 5 - i * 3, 16, 3, BRICK);
        rect(g, px0 + 1, fy - 5 - i * 3, 16, 1, MORTAR);
      }
    }
    // мешки с цементом и корыто с раствором
    for (let i = 0; i < 3; i++) rect(g, L.coreX - 30 + i * 7, fy - 5, 6, 4, '#c8c2b0');
    rect(g, right + 20, fy - 4, 16, 3, '#5a5650');
    rect(g, right + 21, fy - 4, 14, 1, '#9a948a');
    // тачка
    rect(g, right + 60, fy - 6, 10, 4, '#3f6f8a');
    rect(g, right + 70, fy - 4, 6, 1, '#555');
    rect(g, right + 63, fy - 2, 2, 2, '#222');
  } else {
    // вёдра со штукатуркой, моток кабеля, стремянка
    rect(g, left + 30, fy - 6, 5, 5, '#e8e4dc');
    rect(g, left + 37, fy - 6, 5, 5, '#e8e4dc');
    rect(g, right + 40, fy - 4, 6, 3, '#c8402e');
    for (let i = 0; i < 12; i++) rect(g, right + 120 + Math.round(i / 2), fy - 1 - i, 1, 1, '#9a7a5a');
    for (let i = 0; i < 12; i++) rect(g, right + 128 - Math.round(i / 2), fy - 1 - i, 1, 1, '#9a7a5a');
  }
  // строительный мусор
  for (let i = 0; i < 14; i++) rect(g, bx0 + 8 + rng.int(0, bx1 - bx0 - 16), fy - 1, rng.int(1, 3), 1, rng.pick(['#a89a88', '#8a7a6a', BRICK, '#c8c2b0']));
}

/** Строительные леса снаружи и кран на перекрытии (слой «перед»: леса закрывают стену) */
function drawScaffolding(g: CanvasRenderingContext2D, defs: WorldDefs, level: number, p: number) {
  const L = defs.layout;
  const lt = L.levelTop(level);
  const fy = L.floorY(level);
  if (p < 0.85) {
    for (const [x0, dir] of [[L.buildingX0 - 12, 1], [L.buildingX1 + 2, 1]] as const) {
      void dir;
      for (const x of [x0, x0 + 9]) rect(g, x, lt - 4, 1, fy - lt + 4 + 2, '#7a7b84');
      for (let y = fy; y > lt - 4; y -= 16) {
        rect(g, x0, y, 10, 2, '#b8956a'); // настил
        rect(g, x0, y - 8, 10, 1, '#7a7b84'); // перекладина
      }
      // сетка
      g.fillStyle = 'rgba(60,140,90,0.18)';
      g.fillRect(x0, lt - 4, 10, fy - lt + 4);
    }
  }
  // кран: стоит на перекрытии, пока этаж не накрыт
  if (p < 0.5) {
    const mx = L.buildingX0 + 70;
    const top = lt - 34;
    for (let y = top; y < fy; y += 4) {
      rect(g, mx, y, 1, 4, '#e8b040');
      rect(g, mx + 4, y, 1, 4, '#e8b040');
      rect(g, mx + 1, y + 1, 3, 1, '#c8902a');
    }
    rect(g, mx - 22, top - 2, 110, 2, '#e8b040'); // стрела
    for (let x = mx - 22; x < mx + 88; x += 4) rect(g, x, top, 1, 2, '#c8902a');
    rect(g, mx - 22, top, 12, 6, '#7a7b84'); // противовес
    rect(g, mx - 2, top - 8, 8, 6, '#3a3a42'); // кабина
    rect(g, mx - 1, top - 7, 3, 2, '#9ccbe0');
  }
}

/**
 * Балкон в торцевой стене: бетонная плита на консолях, балконная дверь в стене,
 * перила (в переднем слое — перед жильцом) и вещи хозяев: цветы, стул, сушилка с бельём, коробки…
 */
function drawBalcony(g: CanvasRenderingContext2D, gf: CanvasRenderingContext2D, defs: WorldDefs, apt: ApartmentModel) {
  const b = apt.balcony;
  if (!b) return;
  const L = defs.layout;
  const fy = L.floorY(apt.level);
  const left = apt.side === 'left';
  const w = b.x1 - b.x0;
  // плита и консоль
  rect(g, b.x0, fy, w, SLAB - 1, CONCRETE);
  rect(g, b.x0, fy, w, 1, shade(CONCRETE, 0.2));
  rect(g, b.x0, fy + SLAB - 1, w, 1, shade(CONCRETE, -0.25));
  const bx = left ? b.x1 - 4 : b.x0;
  rect(g, bx, fy + SLAB - 1, 4, 3, shade(CONCRETE, -0.15));
  // балконная дверь в торцевой стене: рама, стекло наверху, филёнка внизу
  const wx = left ? L.buildingX0 : L.buildingX1 - OUTER_WALL;
  rect(g, wx, fy - 28, OUTER_WALL, 28, '#efece4');
  rect(g, wx + 1, fy - 27, OUTER_WALL - 2, 14, '#9ccbe0');
  rect(g, wx + 1, fy - 25, 1, 5, '#e4f4fb');
  rect(g, wx + 1, fy - 12, OUTER_WALL - 2, 11, '#d8d2c4');
  // фонарь на стене у балконной двери
  const lx = left ? L.buildingX0 - 2 : L.buildingX1 + 1;
  rect(g, left ? lx + 1 : lx - 1, fy - 32, 1, 2, '#5a5a62'); // кронштейн
  rect(g, lx, fy - 31, 1, 3, '#e8e2c8'); // плафон
  // задняя стенка экрана балкона (видна сквозь перила)
  rect(g, b.x0, fy - 12, w, 1, shade(PANEL, -0.1));
  // вещи на балконе
  const items = apt.def?.balcony.items ?? [];
  const pal = apartmentPalette(apt);
  const far = left ? b.x0 + 1 : b.x1 - 1; // у дальнего края
  const dir = left ? 1 : -1; // от дальнего края к стене
  const at = (dx: number, ww: number) => (left ? far + dx : far - dx - ww + 1);
  let used = 0;
  for (const it of items) {
    switch (it) {
      case 'plants': {
        const x = at(used, 4);
        rect(g, x, fy - 3, 4, 3, '#b8653a');
        rect(g, x - 1, fy - 7, 6, 4, '#4f8a55');
        rect(g, x + 1, fy - 8, 2, 1, '#d8343a');
        used += 5;
        break;
      }
      case 'chair': {
        const x = at(used, 5);
        rect(g, x, fy - 6, 5, 1, pal.wood);
        rect(g, x + (left ? 0 : 4), fy - 11, 1, 6, pal.wood);
        rect(g, x, fy - 5, 1, 5, shade(pal.wood, -0.2));
        rect(g, x + 4, fy - 5, 1, 5, shade(pal.wood, -0.2));
        used += 6;
        break;
      }
      case 'laundry': {
        // сушилка на двух стойках у перил, на верёвке — бельё на прищепках
        rect(g, b.x0 + 1, fy - 24, 1, 12, '#a8a49c');
        rect(g, b.x1 - 2, fy - 24, 1, 12, '#a8a49c');
        rect(g, b.x0 + 1, fy - 24, w - 2, 1, '#d8d4cc');
        const colors = ['#f4f2ec', '#8fc0e0', '#e8a0a8', '#f0d070'];
        for (let i = 0; i < 3; i++) rect(g, b.x0 + 3 + i * 3, fy - 23, 2, 4 + (i % 2) * 2, colors[(i + apt.level) % colors.length]);
        break;
      }
      case 'boxes': {
        const x = at(used, 6);
        rect(g, x, fy - 5, 6, 5, '#b8956a');
        rect(g, x + 1, fy - 9, 4, 4, '#a8855a');
        rect(g, x, fy - 3, 6, 1, '#8a7048');
        used += 7;
        break;
      }
      case 'skis': {
        const x = left ? b.x0 + 1 + used : b.x1 - 2 - used;
        rect(g, x, fy - 24, 1, 24, '#c84a3a');
        rect(g, x + dir, fy - 22, 1, 22, '#3a6ab0');
        used += 3;
        break;
      }
      case 'bike': {
        const x = at(0, 12);
        rect(g, x, fy - 5, 4, 4, '#3a3a40');
        rect(g, x + 8, fy - 5, 4, 4, '#3a3a40');
        rect(g, x + 2, fy - 7, 8, 1, '#c84a3a');
        used += 12;
        break;
      }
      case 'ashtray': {
        // пепельница на перилах — рисуется спереди
        break;
      }
      case 'jars': {
        const x = at(used, 5);
        for (let i = 0; i < 3; i++) rect(g, x + i * 2, fy - 4, 2, 4, i === 1 ? '#c84a3a' : '#7aa05a');
        used += 6;
        break;
      }
      case 'books': {
        const x = at(used, 5);
        for (let i = 0; i < 3; i++) rect(g, x, fy - 2 - i * 2, 5, 2, ['#8a2a2a', '#2a4a7a', '#7a5a2a'][i]);
        used += 6;
        break;
      }
    }
  }
  // перила (перед жильцом): поручень, стойки, боковина
  const rail = shade(PANEL, -0.35);
  rect(gf, b.x0, fy - 12, w, 2, rail);
  rect(gf, b.x0, fy - 12, w, 1, shade(rail, 0.3));
  for (let x = b.x0 + 1; x < b.x1; x += 3) rect(gf, x, fy - 10, 1, 10, rail);
  rect(gf, left ? b.x0 : b.x1 - 1, fy - 12, 1, 12, rail);
  if (items.includes('ashtray')) rect(gf, left ? b.x0 + 2 : b.x1 - 5, fy - 14, 3, 2, '#8a8a92');
}
