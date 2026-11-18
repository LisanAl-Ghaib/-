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
  const ww = rw >= 64 ? 20 : rw >= 40 ? 16 : 10;
  const x = Math.round(room.x0 + (rw - ww) / 2);
  return [x, levelTop + 9, ww, 17];
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

function drawWindow(g: CanvasRenderingContext2D, wr: [number, number, number, number], frame: string, curtain: string | null) {
  const [x, y, w, h] = wr;
  rect(g, x - 1, y - 1, w + 2, h + 2, frame);
  g.clearRect(x, y, w, h); // стекло — прозрачное: сквозь него видно небо
  rect(g, x + Math.floor(w / 2), y, 1, h, frame);
  rect(g, x, y + 6, w, 1, frame);
  rect(g, x - 2, y + h + 1, w + 4, 2, shade(frame, -0.05)); // подоконник
  rect(g, x - 2, y + h + 2, w + 4, 1, shade(frame, -0.25));
  if (curtain) {
    rect(g, x - 4, y - 3, w + 8, 1, '#7a7a7a'); // карниз
    rect(g, x - 4, y - 2, 3, h + 4, curtain);
    rect(g, x + w + 1, y - 2, 3, h + 4, curtain);
    rect(g, x - 3, y - 2, 1, h + 4, shade(curtain, -0.2));
    rect(g, x + w + 2, y - 2, 1, h + 4, shade(curtain, -0.2));
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
    drawWallpaper(g, room.x0, lt, w, h, wallColor, wallpaper, `${apt.id}:${room.index}`);
    rect(g, room.x0, lt, w, 2, shade(wallColor, -0.2)); // тень у потолка
    rect(g, room.x0, fy - 2, w, 2, apt.vacant ? '#8a8580' : shade(pal.wood, -0.1)); // плинтус
    drawFloor(g, room.x0, fy, w, pal.floor, apt.vacant ? 'concrete' : room.def.flooring ?? def?.flooring ?? 'boards');
    const wr = windowRect(room, lt);
    if (wr) drawWindow(g, wr, apt.vacant ? '#d0ccc4' : '#efece4', apt.vacant ? null : pal.textile);
    // люстра/лампа
    const lx = Math.round((room.x0 + room.x1) / 2);
    rect(g, lx, lt + 2, 1, 3, '#555');
    if (apt.vacant) rect(g, lx - 1, lt + 5, 3, 2, '#e8e2c8');
    else {
      rect(g, lx - 3, lt + 5, 7, 2, pal.accent);
      rect(g, lx - 2, lt + 7, 5, 1, shade(pal.accent, -0.2));
    }
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
  for (const wx of L.innerWalls(apt)) {
    const x = Math.round(wx);
    rect(g, x, lt, INNER_WALL, h - 26, '#d9d3c7');
    rect(g, x, lt, 1, h - 26, '#c4bdb0');
    rect(g, x - 1, fy - 27, INNER_WALL + 2, 1, apt.vacant ? '#bbb' : shade(pal.wood, 0.1)); // наличник
  }
  // стена с входной дверью у лестничной клетки
  const dx = apt.side === 'left' ? apt.x1 - 1 : apt.x0 - 2;
  rect(g, dx, lt, 3, h - 26, '#c8c1b4');
  rect(g, dx, fy - 26, 3, 1, '#7a6a5a');
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
  if (level > 0) digits(g, String(level), ex0 + 8, fy - 33, '#8a8a92');
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
  // колясочная (слева)
  drawWallpaper(g, lx0, lt, lx1 - lx0, h, '#cdc7b9', 'panels', 'ground-left');
  rect(g, lx0, fy, lx1 - lx0, 2, '#8c7f73');
  // трубы
  rect(g, lx0, lt + 4, lx1 - lx0, 2, '#7a6a5e');
  rect(g, lx0 + 30, lt + 4, 2, h - 4, '#7a6a5e');
  // велосипед
  const bx = lx0 + 40;
  for (const [cx] of [[bx], [bx + 18]]) {
    rect(g, cx - 4, fy - 9, 9, 1, '#333');
    rect(g, cx - 4, fy - 1, 9, 1, '#333');
    rect(g, cx - 5, fy - 8, 1, 7, '#333');
    rect(g, cx + 5, fy - 8, 1, 7, '#333');
  }
  rect(g, bx, fy - 9, 18, 1, '#b03a3a');
  rect(g, bx + 8, fy - 13, 1, 5, '#b03a3a');
  rect(g, bx + 6, fy - 14, 5, 1, '#222');
  // коляска
  const sx = lx0 + 90;
  rect(g, sx, fy - 14, 16, 8, '#3f6e9e');
  rect(g, sx + 10, fy - 18, 6, 5, '#2f5a85');
  rect(g, sx + 2, fy - 4, 3, 3, '#222');
  rect(g, sx + 11, fy - 4, 3, 3, '#222');
  rect(g, sx - 3, fy - 20, 1, 8, '#888');
  // санки, лыжи
  rect(g, lx0 + 130, fy - 30, 2, 28, '#c84a3a');
  rect(g, lx0 + 133, fy - 30, 2, 28, '#c84a3a');
  rect(g, lx0 + 150, fy - 5, 16, 2, '#b8742e');
  rect(g, lx0 + 150, fy - 3, 1, 3, '#666');
  rect(g, lx0 + 165, fy - 3, 1, 3, '#666');

  // лобби: почтовые ящики на стене ядра
  const mx = L.coreX + 4;
  rect(g, mx, fy - 30, 14, 9, '#5f7c9e');
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) rect(g, mx + 1 + i * 4, fy - 29 + j * 4, 3, 3, '#4a6585');

  // тамбур (справа): доска объявлений, коврик, дверь на улицу
  drawWallpaper(g, rx0, lt, rx1 - rx0, h, '#cfd4c4', 'panels', 'ground-right');
  rect(g, rx0, fy, rx1 - rx0, 2, '#8c7f73');
  rect(g, rx0 + 24, fy - 32, 22, 14, '#b08a5a');
  rect(g, rx0 + 26, fy - 30, 6, 7, '#f0ece0');
  rect(g, rx0 + 34, fy - 29, 5, 6, '#f6e6a0');
  rect(g, rx0 + 40, fy - 30, 4, 5, '#dfe9f0');
  rect(g, rx0 + 28, fy - 22, 9, 3, '#f0ece0');
  rect(g, rx1 - 30, fy - 1, 20, 1, '#5a4a3e'); // коврик
  // радиатор
  rect(g, rx0 + 60, fy - 12, 18, 9, '#d8d4c8');
  for (let x = rx0 + 61; x < rx0 + 77; x += 3) rect(g, x, fy - 12, 1, 9, '#bdb7a8');
  // внутренняя тамбурная дверь
  rect(g, rx1 - 50, lt, 3, h - 26, '#c8c1b4');
  rect(g, rx1 - 50, fy - 26, 3, 1, '#7a6a5a');
  // проём наружной двери
  rect(g, L.buildingX1 - OUTER_WALL, fy - 26, OUTER_WALL, 26, '#3a2f2a');
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
