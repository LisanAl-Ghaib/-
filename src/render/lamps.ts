import { hashString } from '../core/rng';
import type { WorldDefs } from '../data/defs';
import type { Simulation } from '../sim/simulation';
import type { ResidentState } from '../sim/state';
import type { ApartmentModel, FurnitureInstance, RoomModel } from '../world/layout';

/**
 * Светильники (косметика рендера): торшеры, бра, настольные лампы, лампа на письменном столе,
 * фонарь на балконе. Горят тёплым пятном вокруг себя, а не на всю комнату:
 *  • в темноте, если рядом кто-то сидит, читает, ест, вышивает;
 *  • если в комнате кто-то спит — второй включит лампу, а не верхний свет;
 *  • кто «почти не включает свет» — иногда всё-таки зажигает лампу у кресла.
 * Фонарь на балконе включают, когда выходят на балкон в темноте (кто хочет — Павел курит и без него).
 */
export interface Lamp {
  apt: ApartmentModel;
  room: RoomModel;
  f: FurnitureInstance;
  /** где горит лампочка (мировые координаты) */
  x: number;
  y: number;
  /** радиус светового пятна */
  r: number;
  /** насколько далеко от лампы человек ещё «под ней» */
  reach: number;
}

/** где у предмета лампочка: смещение от левого верхнего угла, радиус пятна, досягаемость */
const HEAD: Record<string, { dx: (w: number) => number; dy: number; r: number; reach: number }> = {
  floor_lamp: { dx: (w) => Math.floor(w / 2), dy: 6, r: 26, reach: 28 },
  sconce: { dx: (w) => Math.floor(w / 2), dy: 4, r: 22, reach: 24 },
  table_lamp: { dx: (w) => Math.floor(w / 2), dy: 4, r: 18, reach: 22 },
  desk: { dx: (w) => w - 5, dy: -5, r: 18, reach: 20 },
};

const cache = new WeakMap<WorldDefs, Lamp[]>();

export function lampsOf(defs: WorldDefs): Lamp[] {
  let out = cache.get(defs);
  if (out) return out;
  out = [];
  for (const apt of defs.layout.apartments) {
    for (const room of apt.rooms) {
      for (const f of room.furniture) {
        const h = HEAD[f.def.draw];
        if (!h) continue;
        const lx = h.dx(f.w);
        const x = f.flip ? f.x + f.w - 1 - lx : f.x + lx;
        out.push({ apt, room, f, x, y: f.y - f.h + h.dy, r: h.r, reach: h.reach });
      }
    }
  }
  cache.set(defs, out);
  return out;
}

const DIM = /не включает свет/i;
/** за чем сидят под лампой */
const UNDER_LAMP = new Set(['read', 'eat', 'tea', 'crafts', 'idle', 'watch_tv', 'phone', 'work', 'computer', 'side_work', 'chess', 'night_watch', 'music', 'host', 'guest', 'family_visit', 'nightmare', 'circle']);

function asleep(r: ResidentState): boolean {
  return r.action?.id === 'sleep' && r.action.phase === 'perform';
}

function residentsIn(sim: Simulation, apt: ApartmentModel, room: RoomModel): ResidentState[] {
  return Object.values(sim.state.residents).filter((r) => !r.away && r.level === apt.level && r.x >= room.x0 && r.x < room.x1);
}

/** Кто-то из жильцов квартиры «почти не включает свет» */
function dimHome(sim: Simulation, apt: ApartmentModel): boolean {
  return sim.defs.residents.some((d) => d.apartment === apt.id && d.traits.tags.some((t) => DIM.test(t)));
}

/** Есть ли лампа рядом с этим местом */
export function lampNear(defs: WorldDefs, apt: ApartmentModel, roomIndex: number, x: number): Lamp | null {
  for (const l of lampsOf(defs)) if (l.apt === apt && l.room.index === roomIndex && Math.abs(l.x - x) <= l.reach) return l;
  return null;
}

/** Горит ли лампа (dark — уже стемнело для комнат) */
export function lampOn(sim: Simulation, l: Lamp, dark: boolean): boolean {
  if (!dark || l.apt.vacant) return false;
  const people = residentsIn(sim, l.apt, l.room).filter((r) => !asleep(r) && r.action?.phase === 'perform' && Math.abs(r.x - l.x) <= l.reach && UNDER_LAMP.has(r.action.id));
  if (!people.length) return false;
  if (dimHome(sim, l.apt)) {
    // «почти не включает свет»: изредка всё же зажигает лампу — почитать, поесть, посмотреть сериал
    const cal = sim.calendar();
    return hashString(`${l.f.uid}:${cal.dayIndex}:${Math.floor(cal.hourOfDay / 2)}`) % 3 === 0;
  }
  return true;
}

/**
 * Верхний свет не нужен: в комнате кто-то спит, а бодрствующий сидит под лампой
 * (или «почти не включает свет»). Тогда горит только лампа.
 */
export function lampInstead(sim: Simulation, apt: ApartmentModel, roomIndex: number, r: ResidentState): boolean {
  const room = apt.rooms[roomIndex];
  if (!lampNear(sim.defs, apt, roomIndex, r.x)) return false;
  return residentsIn(sim, apt, room).some((o) => o !== r && asleep(o));
}

/** Фонарь на балконе: включают, выйдя на балкон в темноте (кто «не включает свет» — редко) */
export function balconyLampOn(sim: Simulation, apt: ApartmentModel, dark: boolean): boolean {
  const b = apt.balcony;
  if (!b || !dark || apt.vacant) return false;
  const out = Object.values(sim.state.residents).find(
    (r) => !r.away && r.level === apt.level && r.x >= b.x0 - 1 && r.x <= b.x1 + 1 && r.action?.phase === 'perform',
  );
  if (!out) return false;
  if (dimHome(sim, apt)) return hashString(`${apt.id}:balcony:${sim.calendar().dayIndex}:${sim.calendar().hour}`) % 4 === 0;
  return true;
}

/** Где на стене висит фонарь балкона */
export function balconyLampPos(defs: WorldDefs, apt: ApartmentModel): [number, number] | null {
  const b = apt.balcony;
  if (!b) return null;
  const fy = defs.layout.floorY(apt.level);
  return [apt.side === 'left' ? defs.layout.buildingX0 - 2 : defs.layout.buildingX1 + 1, fy - 31];
}
