import { WALK_SPEED } from '../config';
import { planPath } from '../world/navigation';
import { endAction, startAction } from './ai/brain';
import { chronicle } from './chronicle/chronicle';
import { addMoodlet } from './needs';
import type { VisitorState } from './state';
import type { Simulation } from './simulation';

/**
 * Гости «из города»: родня и друзья жильцов, которые в доме не живут.
 * Приезжают на автобусе, идут к хозяину, сидят несколько часов и уезжают.
 */

/** Раз в сутки: не пора ли кому-то приехать */
export function scheduleVisits(sim: Simulation, who: string): void {
  const def = sim.defs.residentById.get(who)!;
  const cal = sim.calendar();
  def.contacts.forEach((c, idx) => {
    if (!c.visitEveryDays) return;
    if (sim.state.visitors.some((v) => v.owner === who && v.contact === idx && v.phase !== 'gone')) return;
    const weekend = cal.weekday >= 6 ? 2.2 : 0.7;
    if (!sim.rng.chance(Math.min(0.9, weekend / c.visitEveryDays))) return;
    const start = sim.time + sim.rng.int(8 * 60, 12 * 60) * 60; // планирование в 4 утра → приедет с 12 до 16
    sim.state.visitors.push({
      id: `vis${sim.state.nextId++}`, owner: who, contact: idx, phase: 'scheduled', startAt: start, until: 0,
      x: sim.defs.layout.yard.busStop - 4, y: sim.defs.layout.floorY(0), level: 0, away: true, facing: -1,
      path: [], walkDist: 0, seat: null, carrying: true,
    });
  });
}

function hostHome(sim: Simulation, v: VisitorState): boolean {
  const def = sim.defs.residentById.get(v.owner)!;
  const apt = sim.defs.layout.aptById.get(def.apartment)!;
  const r = sim.state.residents[v.owner];
  if (!r || r.away || r.level !== apt.level || r.x < apt.x0 || r.x >= apt.x1) return false;
  return !(r.action?.id === 'sleep' && r.action.phase === 'perform') && r.interaction === null;
}

function walk(sim: Simulation, v: VisitorState, dt: number): boolean {
  let budget = (WALK_SPEED * 0.9 * dt) / 60;
  while (v.path.length && budget > 0) {
    const s = v.path[0];
    if (s.k === 'appear') {
      v.away = false;
      v.x = s.x;
      v.y = s.y;
      v.level = s.level;
      v.path.shift();
      continue;
    }
    if (s.k === 'leave') {
      v.away = true;
      v.path.shift();
      continue;
    }
    if (s.k !== 'walk') {
      v.path.shift();
      continue;
    }
    const dx = s.x - v.x;
    const dy = s.y - v.y;
    const dist = Math.hypot(dx, dy);
    if (Math.abs(dx) > 0.01) v.facing = dx > 0 ? 1 : -1;
    if (dist <= budget) {
      v.x = s.x;
      v.y = s.y;
      if (s.level !== undefined) v.level = s.level;
      v.walkDist += dist;
      budget -= dist;
      v.path.shift();
    } else {
      v.x += (dx / dist) * budget;
      v.y += (dy / dist) * budget;
      v.walkDist += budget;
      v.level = sim.defs.layout.levelAtY(v.y + 2);
      budget = 0;
    }
  }
  return v.path.length === 0;
}

function pathTo(sim: Simulation, v: VisitorState, target: { level: number; x: number; away?: boolean }) {
  v.path = planPath(sim.defs.layout, v, target, { elevatorFrom: Infinity, returnVia: 'bus' });
}

export function updateVisitors(sim: Simulation, dt: number): void {
  const s = sim.state;
  for (const v of s.visitors) {
    const def = sim.defs.residentById.get(v.owner);
    if (!def) {
      v.phase = 'gone';
      continue;
    }
    const apt = sim.defs.layout.aptById.get(def.apartment)!;
    switch (v.phase) {
      case 'scheduled':
        if (sim.time < v.startAt) break;
        v.phase = 'arriving';
        pathTo(sim, v, { level: apt.level, x: apt.landingX });
        break;
      case 'arriving':
        if (!walk(sim, v, dt)) break;
        if (hostHome(sim, v)) beginVisit(sim, v);
        else {
          v.phase = 'waiting';
          v.until = sim.time + 20 * 60;
        }
        break;
      case 'waiting':
        if (hostHome(sim, v)) beginVisit(sim, v);
        else if (sim.time >= v.until) {
          chronicle(sim, 'relative.missed', [v.owner], 2, contactData(sim, v));
          v.phase = 'leaving';
          pathTo(sim, v, { level: 0, x: 0, away: true });
        }
        break;
      case 'visiting': {
        const host = s.residents[v.owner];
        // если гость ещё идёт к стулу — дошагать
        if (v.path.length) walk(sim, v, dt);
        else if (v.seat) {
          v.x = v.seat.x;
          v.y = sim.defs.layout.floorY(apt.level) - v.seat.dy;
        }
        const late = sim.calendar().hourOfDay >= 21;
        if (sim.time >= v.until || late || !host || host.away) endVisit(sim, v);
        break;
      }
      case 'leaving':
        if (walk(sim, v, dt) && v.away) v.phase = 'gone';
        break;
    }
  }
  if (s.visitors.some((v) => v.phase === 'gone')) s.visitors = s.visitors.filter((v) => v.phase !== 'gone');
}

function contactData(sim: Simulation, v: VisitorState) {
  const def = sim.defs.residentById.get(v.owner)!;
  const c = def.contacts[v.contact];
  const seenKey = `seen:${v.owner}:${v.contact}`;
  return { kind: c.kind, gender: c.gender, age: c.age ?? 40, name: c.name ?? null, first: !sim.state.flags[seenKey] };
}

function beginVisit(sim: Simulation, v: VisitorState): void {
  const def = sim.defs.residentById.get(v.owner)!;
  const apt = sim.defs.layout.aptById.get(def.apartment)!;
  const host = sim.state.residents[v.owner];
  const data = contactData(sim, v);
  sim.state.flags[`seen:${v.owner}:${v.contact}`] = sim.time;
  chronicle(sim, 'relative.arrive', [v.owner], 2, data);
  v.phase = 'visiting';
  v.carrying = false;
  v.until = sim.time + sim.rng.int(90, 240) * 60;
  // хозяйка усаживает гостя: два места рядом (стол на кухне или диван)
  const order = ['kitchen', 'living', 'studio', 'bedroom', 'study'];
  const seats = apt.slots
    .filter((sl) => (sl.use.includes('eat') || sl.use.includes('sit')) && sim.isSlotFree(sl.key, host.id))
    .sort((a, b) => order.indexOf(apt.rooms[a.roomIndex].type) - order.indexOf(apt.rooms[b.roomIndex].type));
  const hs = seats[0];
  const gs = seats.find((x) => x !== hs && x.roomIndex === hs?.roomIndex) ?? seats.find((x) => x !== hs);
  if (gs) {
    v.seat = { x: gs.x, dy: gs.dy, front: gs.face === 0 };
    v.facing = gs.face === -1 ? -1 : 1;
    pathTo(sim, v, { level: apt.level, x: gs.x });
  } else {
    v.seat = null;
    pathTo(sim, v, { level: apt.level, x: apt.insideX });
  }
  const ctx = sim.ctx(host);
  const actDef = sim.actionById.get('family_visit')!;
  if (host.action) endAction(ctx, true);
  startAction(ctx, actDef, {
    score: 60,
    target: hs ? { level: apt.level, x: hs.x, slot: hs.key } : { level: apt.level, x: apt.insideX - 10 },
    duration: 12 * 3600,
    label: 'у неё гости',
    data: { visitor: v.id, talking: true },
    interruptible: false,
  });
}

function endVisit(sim: Simulation, v: VisitorState): void {
  chronicle(sim, 'relative.leave', [v.owner], 1, contactData(sim, v));
  const host = sim.state.residents[v.owner];
  if (host) addMoodlet({ r: host, now: sim.time }, `visit:${v.contact}`, 'Приезжали родные', 12, 48, 8);
  v.phase = 'leaving';
  v.seat = null;
  pathTo(sim, v, { level: 0, x: 0, away: true });
}

/** Гость сейчас у хозяина? (для действия хозяина) */
export function visitorPresent(sim: Simulation, id: string): boolean {
  return sim.state.visitors.some((v) => v.id === id && v.phase === 'visiting');
}
