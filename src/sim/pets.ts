import { FLOOR_H, SLAB } from '../config';
import { chronicle } from './chronicle/chronicle';
import type { PetState } from './state';
import type { Simulation } from './simulation';

/**
 * Домашние животные. Живут в квартире хозяина и своей кошачьей жизнью:
 * много спят, сидят на подоконнике, едят из миски, носятся, умываются,
 * забираются хозяину на колени. Из квартиры не выходят.
 */
interface Spot {
  kind: 'sleep' | 'window' | 'bowl' | 'tray' | 'tree' | 'floor';
  x: number;
  h: number;
}

const SILL_H = FLOOR_H - SLAB - 37; // высота подоконника над полом

const cache = new Map<string, Spot[]>();

function spotsOf(sim: Simulation, aptId: string): Spot[] {
  let spots = cache.get(aptId);
  if (spots) return spots;
  const apt = sim.defs.layout.aptById.get(aptId)!;
  spots = [];
  for (const room of apt.rooms) {
    if (room.def.window) spots.push({ kind: 'window', x: Math.round((room.x0 + room.x1) / 2), h: SILL_H });
    for (const f of room.furniture) {
      if (f.def.draw === 'cat_tree') {
        spots.push({ kind: 'tree', x: f.x + 6, h: f.h - 3 });
        spots.push({ kind: 'tree', x: f.x + 6, h: Math.round(f.h / 2) });
      }
      if (f.def.draw === 'cat_bowls') spots.push({ kind: 'bowl', x: f.x + 4, h: 0 });
      if (f.def.draw === 'cat_tray') spots.push({ kind: 'tray', x: f.x + 6, h: 1 });
      if (f.def.draw === 'cat_bed') spots.push({ kind: 'sleep', x: f.x + 6, h: 2 });
      for (const sl of f.slots) {
        if (sl.use.includes('sleep') || sl.use.includes('nap') || (sl.use.includes('sit') && sl.pose === 'sit' && f.def.draw !== 'chair' && f.def.draw !== 'concierge_desk'))
          spots.push({ kind: 'sleep', x: sl.x + (sl.pose === 'lie' ? -6 : 0), h: sl.dy + 2 });
      }
    }
    spots.push({ kind: 'floor', x: Math.round(room.x0 + (room.x1 - room.x0) / 3), h: 0 });
    spots.push({ kind: 'floor', x: Math.round(room.x0 + ((room.x1 - room.x0) * 2) / 3), h: 0 });
  }
  cache.set(aptId, spots);
  return spots;
}

export function syncPets(sim: Simulation): void {
  const s = sim.state;
  s.pets ??= {};
  s.petFood ??= {};
  const alive = new Set<string>();
  for (const def of sim.defs.residents) {
    def.pets.forEach((p, idx) => {
      if (p.species === 'fish') return; // рыбка живёт в аквариуме — рисуется вместе с ним
      const id = `${def.id}:${idx}`;
      alive.add(id);
      if (s.pets[id]) return;
      const apt = sim.defs.layout.aptById.get(def.apartment)!;
      const spots = spotsOf(sim, apt.id);
      const sp = spots[Math.floor(sim.rng.next() * spots.length)];
      s.pets[id] = {
        id, owner: def.id, aptId: apt.id, idx, x: sp.x, h: sp.h, level: apt.level, facing: 1,
        mode: 'sleep', tx: sp.x, th: sp.h, next: 'sleep', until: s.time + 3600, food: 70, walkDist: 0,
      };
      void p;
    });
  }
  for (const id of Object.keys(s.pets)) if (!alive.has(id)) delete s.pets[id];
}

export function petName(sim: Simulation, p: PetState): string {
  const def = sim.defs.residentById.get(p.owner)!;
  const pet = def.pets[p.idx];
  if (pet.name) return pet.name;
  const same = def.pets.filter((x) => x.species === pet.species);
  const word = pet.species === 'cat' ? 'кошка' : pet.species === 'fish' ? 'рыбка' : 'собака';
  if (same.length < 2) return word;
  const older = same.every((x) => x === pet || x.born >= pet.born);
  return `${older ? 'старшая' : 'младшая'} ${word}`;
}

function ageOf(sim: Simulation, p: PetState): number {
  const def = sim.defs.residentById.get(p.owner)!;
  return sim.calendar().year - def.pets[p.idx].born;
}

/** Выбрать новое занятие */
function decide(sim: Simulation, p: PetState): void {
  const rng = sim.rng;
  const spots = spotsOf(sim, p.aptId);
  const owner = sim.state.residents[p.owner];
  const young = ageOf(sim, p) <= 3;
  const h = sim.calendar().hourOfDay;
  const dawn = h >= 4.5 && h < 6.5;
  const food = sim.state.petFood[p.aptId] ?? 0;
  const ownerHome = owner && !owner.away && owner.level === p.level && Math.abs(owner.x - p.x) < 400;
  const ownerSitting = ownerHome && owner.pose === 'sit' && owner.action?.phase === 'perform' && owner.action.id !== 'work';
  const lapTaken = Object.values(sim.state.pets).some((o) => o.id !== p.id && o.aptId === p.aptId && (o.mode === 'lap' || o.next === 'lap'));
  const cooking = ownerHome && owner.action?.id === 'cook' && owner.action.phase === 'perform';

  type Opt = { w: number; go: () => void };
  // места, где сидит или лежит человек, заняты (для этого есть колени)
  const people = Object.values(sim.state.residents).filter((r) => !r.away && r.level === p.level && r.pose !== 'stand');
  const pick = (kind: Spot['kind']) => {
    const list = spots.filter((s) => s.kind === kind && !(s.h > 0 && people.some((r) => Math.abs(r.x - s.x) < 7)));
    return list.length ? list[Math.floor(rng.next() * list.length)] : null;
  };
  const goTo = (x: number, th: number, next: PetState['mode'], minutes: [number, number]) => {
    p.tx = x;
    p.th = th;
    p.next = next;
    p.mode = 'walk';
    p.until = sim.time + rng.int(minutes[0], minutes[1]) * 60;
  };
  const opts: Opt[] = [
    { w: dawn ? 1 : 6, go: () => { const s = pick('sleep') ?? pick('floor')!; goTo(s.x, s.h, 'sleep', [40, 150]); } },
    { w: 2.2, go: () => { const s = pick('window'); if (s) goTo(s.x, s.h, 'window', [15, 60]); else goTo(p.x, p.h, 'groom', [5, 10]); } },
    { w: 1.5, go: () => goTo(p.x, p.h, 'groom', [5, 15]) },
    { w: young ? (dawn ? 6 : 2.5) : dawn ? 2 : 0.5, go: () => { const s = pick('floor')!; goTo(s.x, 0, 'play', [5, 15]); } },
    { w: food > 0 && p.food < 60 ? 6 : 0, go: () => { const s = pick('bowl'); if (s) goTo(s.x, 0, 'eat', [3, 6]); } },
    { w: 0.35, go: () => { const s = pick('tray'); if (s) goTo(s.x, s.h, 'tray', [2, 3]); } },
    { w: spots.some((s) => s.kind === 'tree') ? 1.2 : 0, go: () => { const s = pick('tree')!; goTo(s.x, s.h, young ? 'play' : 'sleep', [10, 50]); } },
    { w: ownerSitting && !lapTaken ? (young ? 2 : 5) : 0, go: () => goTo(owner!.x, 0, 'lap', [20, 90]) },
    { w: cooking ? 6 : 0, go: () => goTo(owner!.x + (rng.chance(0.5) ? -8 : 8), 0, 'watch', [5, 15]) },
    // голодная кошка ходит за хозяином и «просит»
    { w: food <= 0 && p.food < 40 && ownerHome ? 5 : 0, go: () => goTo(owner!.x + 6, 0, 'watch', [3, 8]) },
  ];
  const choice = rng.weighted(opts, (o) => o.w);
  choice?.go();
}

export function updatePets(sim: Simulation, dt: number): void {
  const s = sim.state;
  for (const id of Object.keys(s.pets).sort()) {
    const p = s.pets[id];
    p.food = Math.max(0, p.food - (dt / 3600) * 4);
    const owner = s.residents[p.owner];
    if (p.mode === 'walk') {
      if (p.h > 0 && Math.abs(p.tx - p.x) > 2) p.h = 0; // спрыгнула
      const speed = (p.next === 'play' ? 70 : 28) * (dt / 60);
      const d = p.tx - p.x;
      if (Math.abs(d) <= speed) {
        p.x = p.tx;
        p.walkDist += Math.abs(d);
        p.mode = p.next;
        if (p.next === 'lap' && owner) p.h = 0;
        else p.h = p.th; // запрыгнула
      } else {
        p.x += Math.sign(d) * speed;
        p.facing = d > 0 ? 1 : -1;
        p.walkDist += speed;
      }
      continue;
    }
    if (p.mode === 'lap') {
      // сидит у хозяина на коленях, пока тот сидит
      const sitting = owner && !owner.away && owner.pose === 'sit' && owner.action?.phase === 'perform';
      if (!sitting) {
        p.until = s.time;
      } else {
        const slot = owner.action?.target.slot ? sim.slotIndex.get(owner.action.target.slot) : undefined;
        p.x = owner.x + 1;
        p.h = (slot?.dy ?? 4) + 5;
      }
    }
    if (p.mode === 'play' && sim.rng.chance(dt / 40)) {
      // носится туда-сюда
      const apt = sim.defs.layout.aptById.get(p.aptId)!;
      p.tx = Math.round(sim.rng.range(apt.x0 + 6, apt.x1 - 6));
      p.th = 0;
      p.next = 'play';
      p.mode = 'walk';
      continue;
    }
    if (p.mode === 'eat') {
      const left = s.petFood[p.aptId] ?? 0;
      if (left > 0) {
        p.food = Math.min(100, p.food + (dt / 60) * 12);
        s.petFood[p.aptId] = Math.max(0, left - (dt / 60) * 0.06);
      } else p.until = s.time;
    }
    if (s.time >= p.until) decide(sim, p);
  }
}

/** Изредка в хронику попадает что-нибудь кошачье (не чаще раза в день на квартиру) */
export function petNotes(sim: Simulation): void {
  const s = sim.state;
  const cal = sim.calendar();
  for (const p of Object.values(s.pets)) {
    const key = `petnote:${p.aptId}:${cal.dayIndex}`;
    if (s.flags[key] || !sim.rng.chance(0.06)) continue;
    let kind: string | null = null;
    if (p.mode === 'window' && cal.hourOfDay > 8 && cal.hourOfDay < 19) kind = 'window';
    else if (p.mode === 'lap') kind = 'lap';
    else if (p.mode === 'play' && (cal.hourOfDay < 6 || cal.hourOfDay >= 23)) kind = 'night-run';
    else if (p.mode === 'watch') kind = 'beg';
    if (!kind) continue;
    s.flags[key] = s.time;
    chronicle(sim, 'pet', [p.owner], 1, { pet: petName(sim, p), what: kind, species: sim.defs.residentById.get(p.owner)!.pets[p.idx].species });
  }
}

export function petsSleepingCount(sim: Simulation, aptId: string): number {
  return Object.values(sim.state.pets).filter((p) => p.aptId === aptId && p.mode === 'sleep').length;
}
