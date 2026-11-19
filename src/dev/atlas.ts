import { hashString } from '../core/rng';
import type { WorldDefs } from '../data/defs';
import type { ResidentDef } from '../data/schemas';
import { LIBRARY } from '../render/anim/library';
import { personalOf } from '../render/anim/personal';
import type { Place, Pose, Scene } from '../render/anim/types';
import { animatePose } from '../render/animation';
import { cigaretteTip, drawCover, drawProp, eyesOf } from '../render/props';
import { rect } from '../render/pixel';
import { CELL_H, CELL_W, FRAME, generateCharacterSheet } from '../render/sprites/character';
import { drawFurniture } from '../render/sprites/furniture';
import type { ResidentState } from '../sim/state';
import type { FurnitureInstance } from '../world/layout';

/**
 * Атлас анимаций (?atlas=1): каждая базовая сцена из anim/library.ts — на каждом жильце,
 * вживую. Строка — занятие в месте (одинаковая схема), столбец — жилец (его личные добавки).
 * Инструмент разработки: в мире его нет.
 */

/** Какой предмет поставить в клетку для места */
const PROP_FOR: Partial<Record<Place, string>> = {
  bed: 'bed_single', bath: 'bathtub', shower: 'shower', basin: 'washbasin', toilet: 'toilet',
  table: 'kitchen_table', desk: 'desk', seat: 'armchair', recliner: 'recliner',
  stove: 'stove', sink: 'kitchen_counter', fridge: 'fridge', window: 'window_plants', plant: 'plant_big',
  aquarium: 'aquarium', bowls: 'cat_bowls', piano: 'digital_piano', amp: 'eguitar_amp', bar: 'pullup_bar',
  mat: 'exercise_mat', bike: 'exercise_bike', easel: 'easel',
};
/** запасные сцены по позе — на чём сидеть/лежать */
const POSTURE_PROP: Record<string, string | undefined> = { sit: 'armchair', lie: 'bed_single', stand: undefined };

const CW = 64; // ширина клетки в пикселях мира
const CH = 54;
const FLOOR = 46;
const SCALE = 3;

interface Row {
  key: string;
  id: string;
  place: string;
  scene: Scene;
}

export function runAtlas(defs: WorldDefs, only?: string[]): void {
  const rows: Row[] = [];
  for (const [id, act] of Object.entries(LIBRARY)) if (!only?.length || only.includes(id)) for (const [place, scene] of Object.entries(act)) if (scene) rows.push({ key: `${id}@${place}`, id, place, scene });
  const residents = defs.residents;

  document.body.innerHTML = '';
  document.body.style.cssText = 'margin:0;background:#1b1a20;color:#ddd;font:13px/1.35 system-ui,sans-serif;overflow:auto;height:auto';
  const head = document.createElement('div');
  head.style.cssText = 'padding:12px 16px;position:sticky;top:0;background:#1b1a20;z-index:2;border-bottom:1px solid #333';
  head.innerHTML = `<b>Атлас анимаций</b> — ${rows.length} базовых сцен × ${residents.length} жильцов. Строка — общая схема (одинакова для всех), столбец — личные добавки жильца.
    <div style="opacity:.7;margin-top:4px">${residents.map((d) => `<b>${d.name.short}</b>: ${personalOf(d).mannerisms.join(', ') || '—'}`).join(' · ')}</div>`;
  document.body.append(head);

  const table = document.createElement('table');
  table.style.cssText = 'border-collapse:collapse;margin:8px 16px';
  const cells: { canvas: HTMLCanvasElement; row: Row; def: ResidentDef }[] = [];
  const th = document.createElement('tr');
  th.innerHTML = `<th></th>${residents.map((d) => `<th style="padding:4px">${d.name.short}</th>`).join('')}`;
  table.append(th);
  for (const row of rows) {
    const tr = document.createElement('tr');
    const label = document.createElement('td');
    label.style.cssText = 'max-width:320px;padding:4px 10px;vertical-align:middle;border-top:1px solid #2c2b33';
    label.innerHTML = `<code style="color:#9fd3ef">${row.key}</code><br><span style="opacity:.8">${row.scene.note}</span>`;
    tr.append(label);
    for (const def of residents) {
      const td = document.createElement('td');
      td.style.cssText = 'padding:2px;border-top:1px solid #2c2b33';
      const c = document.createElement('canvas');
      c.width = CW;
      c.height = CH;
      c.style.cssText = `width:${CW * SCALE}px;height:${CH * SCALE}px;image-rendering:pixelated;display:block`;
      td.append(c);
      tr.append(td);
      cells.push({ canvas: c, row, def });
    }
    table.append(tr);
  }
  document.body.append(table);

  const sheets = new Map<string, HTMLCanvasElement>();
  const sheetOf = (def: ResidentDef, glass: boolean) => {
    const k = def.id + (glass ? ':g' : '');
    let s = sheets.get(k);
    if (!s) {
      const app = glass ? { ...def.appearance, outfit: { ...def.appearance.outfit, top: def.appearance.skin, bottom: def.appearance.skin, coat: undefined, pattern: undefined }, accessories: [] } : def.appearance;
      s = generateCharacterSheet(app as ResidentDef['appearance']);
      sheets.set(k, s);
    }
    return s;
  };

  const t0 = performance.now();
  const frame = () => {
    const now = performance.now() - t0;
    const tGame = 8 * 3600 + now * 0.06; // 1 с = 1 игровая минута
    for (const cell of cells) drawCell(defs, cell.canvas, cell.row, cell.def, now, tGame, sheetOf);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function drawCell(defs: WorldDefs, canvas: HTMLCanvasElement, row: Row, def: ResidentDef, nowMs: number, tGame: number, sheetOf: (d: ResidentDef, glass: boolean) => HTMLCanvasElement) {
  const g = canvas.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  const apt = defs.apartments.find((a) => a.id === def.apartment);
  const pal = apt?.palette ?? defs.apartments[0].palette;
  const outdoor = row.place === 'outdoor';
  rect(g, 0, 0, CW, CH, outdoor ? '#9cc4dc' : pal.wall);
  rect(g, 0, FLOOR, CW, CH - FLOOR, outdoor ? '#7a7a72' : pal.floor);

  // предмет мебели
  const draw = PROP_FOR[row.place as Place] ?? POSTURE_PROP[row.place];
  const fd = draw ? defs.catalog.get(draw) ?? [...defs.catalog.values()].find((f) => f.draw === draw) : undefined;
  let x = CW / 2;
  let y = FLOOR;
  let pose = row.scene.posture;
  let facing: 1 | -1 = 1;
  let front = false;
  let pullup: number | undefined;
  if (fd) {
    const fx = Math.round(CW / 2 - fd.w / 2);
    const inst: FurnitureInstance = { uid: `atlas:${draw}`, def: fd, x: fx, y: FLOOR, w: fd.w, h: fd.h, flip: false, slots: [], roomIndex: 0 };
    if (row.place === 'window') rect(g, fx - 2, FLOOR - 40, fd.w + 4, 26, '#cfe6f4');
    drawFurniture(g, inst, pal, apt?.style ?? 'soviet');
    const slot = fd.slots.find((s) => s.pose === pose) ?? fd.slots[0];
    if (slot) {
      x = fx + slot.dx;
      y = FLOOR - (slot.dy ?? 0);
      front = slot.face === 0 && slot.pose !== 'lie';
      if (slot.face) facing = slot.face as 1 | -1;
    }
    if (fd.draw === 'pullup_bar') pullup = FLOOR - fd.h + 1;
  }
  if (outdoor && pose === 'sit') {
    // лавочка у подъезда
    rect(g, x - 12, FLOOR - 6, 24, 2, '#8a5a32');
    rect(g, x - 10, FLOOR - 4, 2, 4, '#4a4a4a');
    rect(g, x + 8, FLOOR - 4, 2, 4, '#4a4a4a');
    y = FLOOR - 5;
    front = true;
  }
  if (row.place === 'bar') {
    // турник висит на стене
    pullup = FLOOR - 33;
    rect(g, x - 7, pullup, 14, 2, '#5a5a62');
  }
  if (row.place === 'window' || row.place === 'aquarium' || row.place === 'stove' || row.place === 'sink' || row.place === 'basin' || row.place === 'fridge') front = false;

  const r = {
    id: def.id,
    x,
    y,
    level: 1,
    facing,
    front,
    pose,
    path: [],
    interaction: null,
    gesture: null,
    action: { id: row.id.startsWith('together:') ? 'together' : row.id, phase: 'perform', data: { kind: row.id.split(':')[1], lead: true }, target: { level: 1, x } },
  } as unknown as ResidentState;
  const p: Pose = animatePose(r, def, tGame, nowMs, { place: row.place as Place, pullup, faceToX: row.id === 'watch_tv' ? x - 30 : undefined });
  if (p.hidden === 'door') {
    rect(g, x - 6, FLOOR - 32, 12, 32, '#b8a888');
    rect(g, x - 5, FLOOR - 36, 10, 3, '#ffe9a0');
    rect(g, x + 3, FLOOR - 16, 1, 2, '#6a5a3a');
    return;
  }
  void pose;
  const sheet = sheetOf(def, !!p.glass);
  const fr = p.frame;
  let top = Math.round(y) - CELL_H;
  if (r.pose === 'lie') top += 1;
  else if (r.pose === 'sit') top = Math.round(y) - 21;
  top -= p.bob ?? 0;
  const sx = Math.round(x) + (p.dx ?? 0);
  const FRONTISH = new Set<number>([FRAME.frontStand, FRAME.frontSit, FRAME.frontTalk, FRAME.frontWave, FRAME.frontSitHands, FRAME.frontSitHandUp, FRAME.frontSitSlouch, FRAME.standHandUp, FRAME.backStand, FRAME.backSit, FRAME.backWork, FRAME.backSitWork, FRAME.frontSitCross, FRAME.frontSmoke, FRAME.frontHold, FRAME.frontHang]);
  const face = p.facing ?? facing;
  let flip = fr === FRAME.lie ? facing < 0 : face < 0 && !FRONTISH.has(fr);
  if (p.turn) flip = !flip;
  g.save();
  if (flip) {
    g.translate(sx + CELL_W / 2, top);
    g.scale(-1, 1);
    g.drawImage(sheet, fr * CELL_W, 0, CELL_W, CELL_H, 0, 0, CELL_W, CELL_H);
  } else g.drawImage(sheet, fr * CELL_W, 0, CELL_W, CELL_H, sx - CELL_W / 2, top, CELL_W, CELL_H);
  g.restore();
  if (p.glass) {
    g.globalAlpha = 0.5;
    rect(g, x - 5, FLOOR - 33, 10, 31, '#e6f0f4');
    g.globalAlpha = 1;
  }
  if (p.blink && !p.glass) for (const [ex, ey] of eyesOf(def.appearance, fr)) rect(g, flip ? sx + CELL_W / 2 - 1 - ex : sx - CELL_W / 2 + ex, top + ey, 1, 1, def.appearance.skin);
  const seed = hashString(def.id);
  const propFlip = flip && !FRONTISH.has(fr);
  if (p.cover && fr === FRAME.lie) {
    drawCover(g, p.cover, def.appearance, Math.round(x), Math.round(y), flip, pal.textile, nowMs, seed);
    if (p.prop) drawProp(g, def.appearance, fr, p.prop.kind, p.prop.at, sx, top, flip, nowMs, seed);
  } else if (p.prop) drawProp(g, def.appearance, fr, p.prop.kind, p.prop.at, sx, top, propFlip, nowMs, seed);
  if (p.prop?.kind === 'cigarette') {
    const [tx, ty] = cigaretteTip(def.appearance, fr, sx, top, propFlip);
    if (Math.floor(nowMs / 300) % 3) rect(g, tx, ty - 2 - (Math.floor(nowMs / 300) % 3), 1, 1, 'rgba(230,230,230,0.8)');
  }
}
