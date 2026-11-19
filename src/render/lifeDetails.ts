import { mix, shade } from '../core/math';
import { hashString } from '../core/rng';
import type { WorldDefs } from '../data/defs';
import type { ResidentDef } from '../data/schemas';
import type { Simulation } from '../sim/simulation';
import { sitesOf, workersAt } from '../sim/workers';
import { CORE_W } from '../config';
import type { ApartmentModel, FurnitureInstance } from '../world/layout';
import { rect } from './pixel';
import { CELL_H, CELL_W, FRAME, generateCharacterSheet } from './sprites/character';
import type { SpriteRegistry } from './sprites/registry';

/**
 * «Следы жизни» в квартирах: по ним можно догадаться, что происходит, без всяких цифр.
 * Немытая посуда, незаправленная кровать, пакеты из магазина, мусор у двери, ремонт.
 */
type Appearance = ResidentDef['appearance'];

export class LifeDetails {
  private furnByUid = new Map<string, FurnitureInstance>();

  constructor(private defs: WorldDefs, private sim: Simulation, private sprites: SpriteRegistry) {
    for (const apt of defs.layout.apartments) for (const room of apt.rooms) for (const f of room.allFurniture) this.furnByUid.set(f.uid, f);
  }

  /** Всё, что лежит/стоит в квартирах (рисуется до жильцов) */
  draw(g: CanvasRenderingContext2D): void {
    for (const apt of this.defs.layout.apartments) {
      if (!apt.def || apt.def.renovation) continue;
      const st = this.sim.state.apartments[apt.id];
      if (!st) continue;
      if (st.dishes > 0) this.drawDishes(g, apt, st.dishes);
      for (const key of st.unmade) this.drawUnmade(g, key);
      const fy = this.defs.layout.floorY(apt.level);
      const doorIn = apt.side === 'left' ? apt.x1 - 12 : apt.x0 + 6;
      const dir = apt.side === 'left' ? -1 : 1;
      if (st.bags > 0) {
        drawShoppingBag(g, doorIn + dir * 2, fy, '#f4f2ec', '#c8402e');
        if (st.bags > 1) drawPaperBag(g, doorIn + dir * 9, fy);
      }
      if (st.trash >= 1) {
        const tx = doorIn + dir * (st.bags > 0 ? 16 : 3);
        drawTrashBag(g, tx, fy, st.trash >= 2.5);
      }
    }
  }

  private drawDishes(g: CanvasRenderingContext2D, apt: ApartmentModel, n: number) {
    // где моют посуду на кухне — туда её и складывают
    const slot = apt.slots.find((s) => s.use.includes('wash') && apt.rooms[s.roomIndex].type !== 'bathroom');
    const f = slot ? this.furnByUid.get(slot.furnitureUid) : undefined;
    let x: number;
    let y: number;
    if (f) {
      const top = f.def.draw === 'kitchen_counter' ? 13 : f.def.draw === 'sink_small' ? 12 : f.h;
      x = Math.round(f.x + f.w / 2 + (f.flip ? -6 : 2));
      y = f.y - top;
    } else {
      const t = apt.slots.find((s) => s.use.includes('eat'));
      const tf = t ? this.furnByUid.get(t.furnitureUid) : undefined;
      if (!tf) return;
      x = Math.round(tf.x + tf.w / 2 - 2);
      y = tf.y - 9;
    }
    const plates = Math.min(5, Math.ceil(n));
    for (let i = 0; i < plates; i++) {
      rect(g, x - (i % 2), y - 1 - i, 5, 1, i % 2 ? '#e8e4da' : '#f8f6f0');
    }
    if (n >= 3) {
      rect(g, x - 7, y - 4, 5, 4, '#7a7d84'); // кастрюля
      rect(g, x - 8, y - 4, 7, 1, '#9aa0a8');
    }
    if (n >= 2) rect(g, x + 5, y - 3, 2, 3, '#d8e8f0'); // стакан
  }

  private drawUnmade(g: CanvasRenderingContext2D, key: string) {
    const slot = this.sim.slotIndex.get(key);
    if (!slot) return;
    // кто-то лежит — одеяло на нём
    const who = this.sim.state.slots[key];
    if (who && this.sim.state.residents[who]?.pose === 'lie') return;
    const f = this.furnByUid.get(slot.furnitureUid);
    if (!f || !f.def.draw.startsWith('bed') && f.def.draw !== 'cot') return;
    const apt = this.defs.layout.aptById.get(slot.aptId)!;
    const color = apt.def?.palette.textile ?? '#9a948a';
    const top = f.y - f.h;
    const footX = f.flip ? f.x + f.w - 3 : f.x + 1;
    const dir = f.flip ? -1 : 1;
    // скомканное одеяло горкой ближе к ногам и свисающий край
    for (let i = 0; i < 12; i++) {
      const h = Math.round(3 + Math.sin(i * 0.8) * 1.5 + (i < 6 ? 1 : 0));
      rect(g, footX + dir * (2 + i), f.y - 7 - h, 1, h, i % 3 ? color : shade(color, 0.18));
    }
    rect(g, footX, f.y - 7, 2, 5, shade(color, -0.12));
    rect(g, footX + dir * 1, f.y - 3, 1, 2, shade(color, -0.2));
    // подушка сбилась
    const px = f.flip ? f.x + 4 : f.x + f.w - 10;
    rect(g, px, top + 1, 6, 2, '#fbfaf5');
    rect(g, px + 1, top, 4, 1, '#e9e6dc');
  }

  /** Что жилец несёт в руках */
  drawCarry(g: CanvasRenderingContext2D, carrying: 'bags' | 'trash' | 'gift' | 'flowers' | 'suitcase' | 'plate' | 'box', x: number, y: number, facing: 1 | -1) {
    const hx = x + facing * 3;
    if (carrying === 'box') {
      // картонная коробка перед собой: несёт вещи в подвал
      rect(g, hx - 4, y - 15, 9, 7, '#b8925a');
      rect(g, hx - 4, y - 15, 9, 1, '#d0aa70');
      rect(g, hx, y - 15, 1, 7, '#9a7444');
      rect(g, hx - 3, y - 12, 2, 1, '#8a6434');
      return;
    }
    if (carrying === 'plate') {
      // тарелка с угощением перед собой, накрыта салфеткой
      rect(g, hx - 3, y - 11, 7, 1, '#f4f2ec');
      rect(g, hx - 2, y - 13, 5, 2, '#d89a4a');
      rect(g, hx - 1, y - 14, 3, 1, '#e8c070');
      rect(g, hx - 2, y - 10, 5, 1, '#c8c4bc');
      return;
    }
    if (carrying === 'suitcase') {
      // чемодан на колёсиках катят за собой: ручка тянется к руке
      const bx = x - facing * 5 - 3;
      rect(g, bx, y - 9, 7, 8, '#5a6a7a');
      rect(g, bx, y - 9, 7, 1, '#6e8090');
      rect(g, bx + 1, y - 6, 5, 1, '#46535f');
      rect(g, bx + 1, y - 1, 1, 1, '#222');
      rect(g, bx + 5, y - 1, 1, 1, '#222');
      const tx = facing > 0 ? bx + 6 : bx;
      rect(g, tx, y - 12, 1, 3, '#2e2e32'); // выдвижная ручка
      rect(g, Math.min(tx, x - facing), y - 12, Math.abs(tx - (x - facing)) + 1, 1, '#2e2e32');
      return;
    }
    if (carrying === 'flowers') {
      // букет: стебли и головки цветов
      rect(g, hx, y - 12, 1, 6, '#4a8a3a');
      rect(g, hx + facing, y - 11, 1, 5, '#4a8a3a');
      rect(g, hx - 1, y - 15, 2, 2, '#e8506a');
      rect(g, hx + facing * 2, y - 14, 2, 2, '#ffb3c0');
      rect(g, hx + facing, y - 16, 1, 1, '#e8c040');
      rect(g, hx - 1, y - 8, 3, 2, '#f4f2ec'); // обёртка
    } else if (carrying === 'gift') {
      rect(g, hx - 2, y - 10, 5, 4, '#3a6ab0');
      rect(g, hx, y - 10, 1, 4, '#e8c040');
      rect(g, hx - 2, y - 8, 5, 1, '#e8c040');
      rect(g, hx - 1, y - 11, 3, 1, '#e8c040'); // бантик
    } else if (carrying === 'bags') {
      drawShoppingBag(g, hx - 2, y - 2, '#f4f2ec', '#c8402e');
      drawShoppingBag(g, hx - 2 - facing * 6, y - 2, '#f0e8d0', '#3f6e9e');
    } else drawTrashBag(g, hx - 3, y - 2, false);
  }

  // ─────────────── ремонт

  /** Мастера работают в будни днём */
  workersOn(apt: ApartmentModel): boolean {
    return !!apt.def?.renovation && workersAt(this.sim, apt.id).length > 0;
  }

  /** Мастера в пути: идут через двор и подъезд, здороваются с консьержкой */
  private drawWalkingWorkers(g: CanvasRenderingContext2D, nowMs: number): void {
    for (const w of this.sim.state.workers) {
      if (w.away || w.phase === 'working') continue;
      const app = w.idx % 2 ? WORKER_B : WORKER_A;
      const key = `npc:worker${w.idx % 2}`;
      const x = Math.round(w.x);
      const y = Math.round(w.y);
      let frame: number = FRAME.walk0 + (Math.floor(w.walkDist / 3) % 4);
      let facing = w.facing;
      let bob = 0;
      if (w.gesture) {
        facing = w.gesture.toX < w.x ? -1 : 1;
        if (w.gesture.kind === 'wave') frame = Math.floor(nowMs / 250) % 2 ? FRAME.frontWave : FRAME.frontStand;
        else {
          frame = FRAME.stand;
          bob = Math.floor(nowMs / 220) % 2; // кивает
        }
      } else if (!w.path.length) frame = FRAME.stand;
      this.drawWorker(g, key, app, x, y + bob, frame, facing);
      // в руке: ящик с инструментом или пакет; на стройку — мешок цемента на плече
      const hx = x + facing * 3;
      if (w.carry) {
        rect(g, x - 4, y - 23, 8, 4, '#c8c2b0');
        rect(g, x - 4, y - 23, 8, 1, '#e0dccc');
        rect(g, x - 1, y - 22, 3, 1, '#8a8478');
      } else if (w.idx % 2) {
        rect(g, hx - 3, y - 7, 6, 4, '#c8402e');
        rect(g, hx - 1, y - 8, 2, 1, '#3a3a3a');
      } else {
        rect(g, hx - 2, y - 8, 5, 6, '#e8e4d8');
        rect(g, hx - 1, y - 9, 1, 1, '#c8c2b0');
      }
    }
  }

  /** Стройка этажа: кладка, раствор, кирпичи в руках; потом штукатурка и проводка */
  private drawConstructionCrew(g: CanvasRenderingContext2D, nowMs: number): void {
    const c = this.sim.state.construction;
    if (!c || c.done) return;
    const site = sitesOf(this.sim).find((x) => x.kind === 'construction');
    if (!site) return;
    const crew = workersAt(this.sim, site.id);
    if (!crew.length) return;
    const L = this.defs.layout;
    const fy = L.floorY(site.level);
    const p = c.progress;
    const right = L.coreX + CORE_W;
    const left = L.buildingX0 + 4;
    type Spot = { kind: 'lay' | 'mix' | 'carry' | 'plaster' | 'wire' | 'pour'; x: number };
    const spots: Spot[] = [];
    if (p < 0.5) {
      for (const x of [left + 40, left + 120, left + 200, right + 50, right + 140, right + 220]) spots.push({ kind: p < 0.15 ? 'pour' : 'lay', x });
      spots.push({ kind: 'mix', x: right + 40 }, { kind: 'carry', x: left + 60 }, { kind: 'carry', x: right + 100 });
    } else {
      for (const x of [left + 30, left + 150, right + 60, right + 180]) spots.push({ kind: 'plaster', x });
      spots.push({ kind: 'wire', x: right + 124 }, { kind: 'carry', x: left + 90 }, { kind: 'mix', x: left + 36 });
    }
    const seed = hashString(site.id);
    const tMin = this.sim.time / 60;
    const SEG = 11;
    const seg = Math.floor(tMin / SEG);
    const inSeg = tMin - seg * SEG;
    const t = nowMs / 1000;
    for (const w of crew) {
      const wi = w.idx % 2;
      const app = wi ? WORKER_B : WORKER_A;
      const key = `npc:worker${wi}`;
      const choose = (sg: number) => spots[((Math.imul(sg + 31 * wi, 2654435761) ^ seed) >>> 0) % spots.length];
      const cur = choose(seg);
      const prevSp = choose(seg - 1);
      if (inSeg < 2 && prevSp.x !== cur.x) {
        // переходит, несёт кирпичи или ведро
        const k = inSeg / 2;
        const x = Math.round(prevSp.x + (cur.x - prevSp.x) * k);
        this.drawWorker(g, key, app, x, fy, FRAME.walk0 + (Math.floor(x / 3) % 4), cur.x >= prevSp.x ? 1 : -1);
        if (p < 0.5) {
          rect(g, x - 3, fy - 14, 6, 3, '#a85a4a');
          rect(g, x - 3, fy - 14, 6, 1, '#c8b8a0');
        } else rect(g, x + 2, fy - 9, 4, 4, '#e8e4dc');
        continue;
      }
      const alt = Math.floor(t * 2.2 + wi) % 2;
      switch (cur.kind) {
        case 'lay': {
          // спиной к нам: мастерок, кирпич в стену
          this.drawWorker(g, key, app, cur.x, fy, alt ? FRAME.backWork : FRAME.backStand, 1);
          if (alt) rect(g, cur.x + 3, fy - 16, 3, 2, '#a85a4a');
          break;
        }
        case 'pour':
          this.drawWorker(g, key, app, cur.x, fy, alt ? FRAME.work : FRAME.workUp, 1);
          if (alt) rect(g, cur.x + 5, fy - 3, 2, 2, '#9a968c');
          break;
        case 'mix':
          this.drawWorker(g, key, app, cur.x, fy, alt ? FRAME.work : FRAME.stand, -1);
          if (Math.floor(t * 6) % 4 === 0) rect(g, cur.x - 8, fy - 7, 1, 1, '#d8d2c6');
          break;
        case 'carry':
          this.drawWorker(g, key, app, cur.x, fy, FRAME.frontStand, 1);
          rect(g, cur.x - 3, fy - 13, 6, 3, p < 0.5 ? '#a85a4a' : '#e8e4dc');
          break;
        case 'plaster':
          this.drawWorker(g, key, app, cur.x, fy, alt ? FRAME.backWork : FRAME.backStand, 1);
          rect(g, cur.x - 2 + alt * 3, fy - 22 - alt * 4, 4, 1, '#9aa0a8'); // правило/шпатель
          break;
        case 'wire':
          // на стремянке тянет проводку
          this.drawWorker(g, key, app, cur.x, fy - 10, alt ? FRAME.workUp : FRAME.backWork, 1);
          rect(g, cur.x + 2, L.levelTop(site.level) + 6, 1, 3, '#333');
          break;
      }
      // стук и пыль
      if (Math.floor(t * 3 + wi * 5) % 9 === 0) rect(g, cur.x + (wi ? -6 : 6), fy - 20, 1, 1, '#ffffff');
    }
  }

  drawWorkers(g: CanvasRenderingContext2D, nowMs: number): void {
    this.drawWalkingWorkers(g, nowMs);
    this.drawConstructionCrew(g, nowMs);
    for (const apt of this.defs.layout.apartments) {
      if (!this.workersOn(apt)) continue;
      const present = new Set(workersAt(this.sim, apt.id).map((w) => w.idx % 2));
      const fy = this.defs.layout.floorY(apt.level);
      const lt = this.defs.layout.levelTop(apt.level);
      const furn = apt.rooms.flatMap((r) => r.furniture);
      const ladder = furn.find((f) => f.def.draw === 'ladder');
      const saw = furn.find((f) => f.def.draw === 'sawhorse');
      const bucket = furn.find((f) => f.def.draw === 'bucket' || f.def.draw === 'cement_bags');
      // места работы: стремянка, козлы, стена (штукатурка), ведро (раствор), «несёт доску»
      type Spot = { kind: 'ladder' | 'saw' | 'wall' | 'mix' | 'carry'; x: number };
      const spots: Spot[] = [];
      if (ladder) spots.push({ kind: 'ladder', x: ladder.x + 3 });
      if (saw) spots.push({ kind: 'saw', x: saw.x + saw.w + 5 });
      if (bucket) spots.push({ kind: 'mix', x: bucket.x + bucket.w + 4 });
      for (const r of apt.rooms) spots.push({ kind: 'wall', x: Math.round(r.x0 + (r.x1 - r.x0) * 0.3) });
      spots.push({ kind: 'carry', x: Math.round((apt.x0 + apt.x1) / 2) });
      const seed = hashString(apt.id);
      const tMin = this.sim.time / 60;
      const SEG = 9;
      const seg = Math.floor(tMin / SEG);
      const inSeg = tMin - seg * SEG;
      const taken = new Set<string>();
      [WORKER_A, WORKER_B].forEach((app, wi) => {
        if (!present.has(wi)) return;
        const choose = (sg: number) => {
          let k = (Math.imul(sg + 17 * wi, 2654435761) ^ seed) >>> 0;
          let sp = spots[k % spots.length];
          for (let tries = 0; taken.has(sp.kind + sp.x) && tries < spots.length; tries++) sp = spots[++k % spots.length];
          return sp;
        };
        const cur = choose(seg);
        taken.add(cur.kind + cur.x);
        const prevSp = choose(seg - 1);
        const key = `npc:worker${wi}`;
        const t = nowMs / 1000;
        // первые полторы минуты отрезка — переходит на новое место
        if (inSeg < 1.5 && prevSp.x !== cur.x) {
          const k = inSeg / 1.5;
          const x = Math.round(prevSp.x + (cur.x - prevSp.x) * k);
          const frame = FRAME.walk0 + (Math.floor(x / 3) % 4);
          this.drawWorker(g, key, app, x, fy, frame, cur.x >= prevSp.x ? 1 : -1);
          if (cur.kind === 'carry' || prevSp.kind === 'saw') rect(g, x - 9, fy - 22, 18, 2, '#c49a62'); // доска на плече
          return;
        }
        const alt = Math.floor(t * (cur.kind === 'saw' ? 4 : 2) + wi) % 2;
        switch (cur.kind) {
          case 'ladder': {
            const y = fy - 12;
            this.drawWorker(g, key, app, cur.x, y, alt ? FRAME.work : FRAME.workUp, -1);
            const ry = y - 20 - alt * 3;
            rect(g, cur.x - 6, ry, 1, 5, '#888'); // валик
            rect(g, cur.x - 8, ry - 2, 4, 2, mix(apt.def!.palette.accent, '#ffffff', 0.5));
            break;
          }
          case 'saw':
            this.drawWorker(g, key, app, cur.x, fy, alt ? FRAME.work : FRAME.workUp, -1);
            if (alt) rect(g, cur.x - 6 - (Math.floor(t * 8) % 3), fy - 12 + (Math.floor(t * 8) % 4), 1, 1, '#e8d8b0'); // опилки
            break;
          case 'mix':
            this.drawWorker(g, key, app, cur.x, fy, alt ? FRAME.work : FRAME.stand, -1);
            if (Math.floor(t * 6) % 4 === 0) rect(g, cur.x - 8, fy - 9, 1, 1, '#d8d2c6');
            break;
          case 'wall': {
            this.drawWorker(g, key, app, cur.x, fy, alt ? FRAME.workUp : FRAME.work, 1);
            rect(g, cur.x + 5, fy - 17 - alt * 3, 3, 1, '#9aa0a8'); // шпатель
            // свежая шпаклёвка на стене — растёт за отрезок
            const done = Math.min(1, inSeg / SEG);
            rect(g, cur.x + 6, fy - 30, 8, Math.round(18 * done), 'rgba(236,232,222,0.9)');
            break;
          }
          case 'carry':
            this.drawWorker(g, key, app, cur.x, fy, FRAME.frontStand, 1);
            rect(g, cur.x - 3, fy - 13, 6, 1, '#e8c040'); // меряет рулеткой
            break;
        }
        // стук: иногда из стены вылетает пыль
        if (Math.floor(t * 3 + wi * 7) % 11 === 0) rect(g, cur.x + (wi ? -10 : 10), fy - 26, 1, 1, '#ffffff');
      });
      // строительная пыль в воздухе
      const dustSeed = Math.floor(nowMs / 120);
      for (let i = 0; i < 10; i++) {
        const k = (Math.imul(i + 1, 2246822519) ^ seed) >>> 0;
        const x = apt.x0 + (k % (apt.x1 - apt.x0));
        const y = lt + 6 + ((k >>> 8) % (fy - lt - 10)) - ((dustSeed + i * 5) % 20);
        if (y > lt + 2) rect(g, x, y, 1, 1, 'rgba(230,224,210,0.6)');
      }
    }
  }

  private drawWorker(g: CanvasRenderingContext2D, key: string, app: Appearance, x: number, feetY: number, frame: number, facing: 1 | -1) {
    const sheet = this.sprites.get(key, () => generateCharacterSheet(app));
    g.save();
    const top = feetY - CELL_H;
    if (facing < 0) {
      g.translate(x + CELL_W / 2, top);
      g.scale(-1, 1);
      g.drawImage(sheet, frame * CELL_W, 0, CELL_W, CELL_H, 0, 0, CELL_W, CELL_H);
    } else g.drawImage(sheet, frame * CELL_W, 0, CELL_W, CELL_H, x - CELL_W / 2, top, CELL_W, CELL_H);
    g.restore();
  }
}

const WORKER_A: Appearance = {
  skin: '#e0b090',
  hair: { style: 'short', color: '#3a2a20' },
  height: 'average',
  build: 'average',
  outfit: { top: '#3a5f8a', bottom: '#3a5f8a', shoes: '#2a2a2a', style: 'casual', pattern: 'plain', variants: [], variantChance: 0 },
  accessories: ['cap', 'stubble'],
};
const WORKER_B: Appearance = {
  skin: '#d8a880',
  hair: { style: 'buzz', color: '#2a2018' },
  height: 'tall',
  build: 'heavy',
  outfit: { top: '#e08a2a', bottom: '#4a4a52', shoes: '#2a2a2a', style: 'casual', pattern: 'plain', variants: [], variantChance: 0 },
  accessories: ['mustache'],
};

function drawShoppingBag(g: CanvasRenderingContext2D, x: number, floorY: number, color: string, logo: string) {
  rect(g, x, floorY - 8, 6, 8, color);
  rect(g, x, floorY - 8, 6, 1, shade(color, -0.1));
  rect(g, x + 1, floorY - 10, 1, 2, shade(color, -0.25));
  rect(g, x + 4, floorY - 10, 1, 2, shade(color, -0.25));
  rect(g, x + 2, floorY - 5, 2, 2, logo);
  rect(g, x + 1, floorY - 9, 2, 1, '#5f9e52'); // торчит зелень
}

function drawPaperBag(g: CanvasRenderingContext2D, x: number, floorY: number) {
  rect(g, x, floorY - 9, 6, 9, '#c8a070');
  rect(g, x, floorY - 9, 6, 1, '#b08a5a');
  rect(g, x + 1, floorY - 11, 2, 2, '#e8c040'); // багет
  rect(g, x + 3, floorY - 12, 1, 3, '#d8b060');
}

function drawTrashBag(g: CanvasRenderingContext2D, x: number, floorY: number, big: boolean) {
  const w = big ? 8 : 6;
  const h = big ? 8 : 6;
  rect(g, x, floorY - h, w, h, '#26262c');
  rect(g, x + 1, floorY - h - 1, w - 2, 1, '#26262c');
  rect(g, x + Math.floor(w / 2) - 1, floorY - h - 3, 2, 2, '#3a3a42'); // узелок
  rect(g, x + 1, floorY - h + 1, 1, h - 3, '#3e3e48');
}
