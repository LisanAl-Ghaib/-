import { planPath } from '../world/navigation';
import type { FurnitureInstance } from '../world/layout';
import { dayStartTime } from '../core/time';
import { chronicle } from './chronicle/chronicle';
import type { ResidentState, WorkerState } from './state';
import type { Simulation } from './simulation';
import { walk } from './visitors';

/**
 * Мастера на ремонте. Это не жильцы: у них нет потребностей, только распорядок.
 * В будни и субботу утром приходят с улицы через подъезд, поднимаются в квартиру,
 * в час уходят перекусить, к двум возвращаются, вечером уходят. В воскресенье — выходной.
 * Консьержка видит их из окошка и здоровается жестом, они отвечают.
 */
const CREW = 2;
const GESTURE_S = 150; // ≈ 2,5 секунды на экране

export function syncWorkers(sim: Simulation): void {
  const s = sim.state;
  s.workers ??= [];
  const want = new Set<string>();
  for (const apt of sim.defs.layout.apartments) {
    if (!apt.def?.renovation) continue;
    for (let i = 0; i < CREW; i++) {
      const id = `${apt.id}:${i}`;
      want.add(id);
      if (s.workers.some((w) => w.id === id)) continue;
      s.workers.push({
        id, aptId: apt.id, idx: i, phase: 'off', day: -1, arriveAt: 0, lunchAt: 0, backAt: 0, leaveAt: 0, lunchDone: false,
        x: sim.defs.layout.yard.offscreenX, y: sim.defs.layout.floorY(0), level: 0, away: true, facing: -1, path: [], walkDist: 0,
        greetedAt: -1e9, gesture: null,
      });
    }
  }
  s.workers = s.workers.filter((w) => want.has(w.id));
}

/** Распорядок на сегодня (в 4 утра) */
function planDay(sim: Simulation, w: WorkerState): void {
  const cal = sim.calendar();
  w.day = cal.dayIndex;
  w.lunchDone = false;
  if (cal.weekday === 7) {
    w.arriveAt = w.leaveAt = w.lunchAt = w.backAt = Infinity;
    return;
  }
  const mid = dayStartTime(sim.defs.epochMs, cal.dayIndex);
  const rng = sim.rng;
  // бригада ходит вместе: второй — на несколько шагов позади
  const crewLag = w.idx * rng.int(8, 30);
  const sat = cal.weekday === 6;
  const lead = sim.state.workers.find((o) => o.aptId === w.aptId && o.idx === 0 && o !== w && o.day === w.day);
  if (lead) {
    // напарник идёт следом за бригадиром
    w.arriveAt = lead.arriveAt + crewLag;
    w.lunchAt = lead.lunchAt + crewLag;
    w.backAt = lead.backAt + crewLag;
    w.leaveAt = lead.leaveAt + crewLag;
    w.lunchDone = lead.lunchDone;
    return;
  }
  w.arriveAt = mid + (8 * 60 + 35) * 60 + rng.int(0, 20) * 60 + crewLag;
  w.lunchAt = mid + 13 * 3600 + rng.int(0, 6) * 60 + crewLag;
  w.backAt = mid + (13 * 60 + 50) * 60 + rng.int(0, 10) * 60;
  w.leaveAt = mid + (sat ? 15 : 18) * 3600 + rng.int(0, 20) * 60 + crewLag;
  if (sat) w.lunchDone = true; // в субботу короткий день, без обеда
}

function go(sim: Simulation, w: WorkerState, target: { level: number; x: number; away?: boolean }): void {
  w.path = planPath(sim.defs.layout, w, target, { elevatorFrom: Infinity, returnVia: 'walk' });
}

function workPoint(sim: Simulation, w: WorkerState) {
  const apt = sim.defs.layout.aptById.get(w.aptId)!;
  return { level: apt.level, x: Math.round(apt.x0 + (apt.x1 - apt.x0) * (0.35 + w.idx * 0.3)) };
}

export function updateWorkers(sim: Simulation, dt: number): void {
  const s = sim.state;
  const now = s.time;
  const today = sim.calendar().dayIndex;
  for (const w of s.workers) {
    if (w.gesture && w.gesture.until <= now) w.gesture = null;
    if (w.day !== today && sim.calendar().hourOfDay >= 4 && (w.phase === 'off' || w.away)) planDay(sim, w);
    // пока здоровается — стоит на месте
    const paused = w.gesture !== null;
    switch (w.phase) {
      case 'off':
        if (now >= w.arriveAt && now < w.leaveAt - 3600) {
          w.phase = 'arriving';
          go(sim, w, workPoint(sim, w));
        }
        break;
      case 'arriving':
        if (!paused && walk(sim, w, dt) && !w.away) w.phase = 'working';
        break;
      case 'working':
        if (now >= w.leaveAt) {
          w.phase = 'leaving';
          go(sim, w, { level: 0, x: 0, away: true });
        } else if (!w.lunchDone && now >= w.lunchAt) {
          w.phase = 'lunch';
          w.lunchDone = true;
          go(sim, w, { level: 0, x: 0, away: true });
        }
        break;
      case 'lunch':
        if (!paused && w.path.length) walk(sim, w, dt);
        else if (w.away && now >= w.backAt) {
          w.phase = 'arriving';
          go(sim, w, workPoint(sim, w));
        }
        break;
      case 'leaving':
        if (!paused && walk(sim, w, dt) && w.away) w.phase = 'off';
        break;
    }
    if (!w.away && w.level === 0 && w.phase !== 'working') noticeByConcierge(sim, w);
  }
}

/** Мастера сейчас в квартире? (свет, стук, пыль) */
export function workersAt(sim: Simulation, aptId: string): WorkerState[] {
  return sim.state.workers.filter((w) => w.aptId === aptId && w.phase === 'working' && !w.away);
}

// ───────────────────────────── консьержка

const deskCache = new Map<string, FurnitureInstance | null>();

/** Стол консьержки, за которым жилец сейчас сидит (или null) */
export function conciergeDesk(sim: Simulation, r: ResidentState): FurnitureInstance | null {
  const a = r.action;
  if (!a || a.phase !== 'perform' || r.away || !a.target.slot) return null;
  const key = a.target.slot;
  if (!deskCache.has(key)) {
    const slot = sim.slotIndex.get(key);
    let found: FurnitureInstance | null = null;
    if (slot) {
      const apt = sim.defs.layout.aptById.get(slot.aptId);
      const f = apt?.rooms[slot.roomIndex].furniture.find((x) => x.uid === slot.furnitureUid);
      if (f?.def.draw === 'concierge_desk') found = f;
    }
    deskCache.set(key, found);
  }
  return deskCache.get(key) ?? null;
}

function noticeByConcierge(sim: Simulation, w: WorkerState): void {
  const now = sim.time;
  if (now - w.greetedAt < 40 * 60) return;
  for (const def of sim.defs.residents) {
    const r = sim.state.residents[def.id];
    if (!r || r.level !== 0 || r.action?.id === 'sleep') continue;
    const desk = conciergeDesk(sim, r);
    if (!desk) continue;
    const winX = desk.x + desk.w;
    if (w.x < winX - 4 || w.x > winX + 70) continue;
    // заметила: кивнула или помахала; мастер отвечает тем же
    w.greetedAt = now;
    // напарник рядом — здороваются оба
    const crew = sim.state.workers.filter((o) => o.aptId === w.aptId && !o.away && o.level === 0 && Math.abs(o.x - w.x) < 30);
    for (const o of crew) o.greetedAt = now;
    const morning = w.phase === 'arriving' && !w.lunchDone;
    const back = w.phase === 'arriving' && w.lunchDone;
    const kind: 'wave' | 'nod' = morning || w.phase === 'leaving' ? (sim.rng.chance(0.5) ? 'wave' : 'nod') : 'nod';
    r.gesture = { kind, until: now + GESTURE_S, toX: w.x };
    crew.forEach((o, i) => {
      o.gesture = { kind: i === 0 ? 'wave' : sim.rng.chance(0.5) ? 'wave' : 'nod', until: now + GESTURE_S + i * 30, toX: winX };
      o.facing = winX < o.x ? -1 : 1;
    });
    const when = morning ? 'morning' : back ? 'back' : w.phase === 'leaving' ? 'evening' : 'lunch';
    const key = `workers:${when}:${sim.calendar().dayIndex}`;
    if (!sim.state.flags[key] && (when === 'morning' || sim.rng.chance(0.35))) {
      sim.state.flags[key] = now;
      chronicle(sim, 'workers.greet', [r.id], 1, { when, gesture: kind, crew: crew.length });
    }
    return;
  }
}
