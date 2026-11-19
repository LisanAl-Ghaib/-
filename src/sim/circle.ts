import { dayStartTime, parseHHMM } from '../core/time';
import { gain } from './needs';
import { chronicle } from './chronicle/chronicle';
import { conciergeDesk } from './workers';
import type { ActionDef } from './ai/types';
import type { VisitorState } from './state';
import type { Simulation } from './simulation';

/**
 * Кружок у жильца дома (`circle` в данных): в свои дни дети из соседних домов приходят
 * к нему в квартиру, рассаживаются вокруг доски, он ведёт занятие, потом дети уходят.
 * Дети — гости (VisitorState с `kid`), их встречает консьержка.
 */

/** Сегодня день кружка и сейчас его время? Возвращает начало/конец в мировом времени */
export function circleWindow(sim: Simulation, hostId: string): { start: number; end: number } | null {
  const def = sim.defs.residentById.get(hostId);
  const c = def?.circle;
  if (!c) return null;
  const cal = sim.calendar();
  if (!c.days.includes(cal.weekday)) return null;
  const dayStart = dayStartTime(sim.defs.epochMs, cal.dayIndex);
  return { start: dayStart + parseHHMM(c.start) * 60, end: dayStart + parseHHMM(c.end) * 60 };
}

/** Каждый шаг: не пора ли детям идти на кружок */
export function updateCircles(sim: Simulation): void {
  const s = sim.state;
  for (const def of sim.defs.residents) {
    if (!def.circle) continue;
    const w = circleWindow(sim, def.id);
    if (!w) continue;
    const key = `circle:${def.id}:${sim.calendar().dayIndex}`;
    if (s.flags[key] || sim.time < w.start - 30 * 60 || sim.time >= w.start) continue;
    s.flags[key] = sim.time;
    // хозяин заболел или уехал — кружка нет
    const host = s.residents[def.id];
    if (!host || (host.sick && host.sick.until > sim.time)) continue;
    const L = sim.defs.layout;
    for (let k = 0; k < def.circle.kids; k++) {
      // каждую неделю приходят почти все (кто-то иногда пропускает)
      if (k > 0 && !sim.rng.chance(0.85)) continue;
      s.visitors.push({
        id: `vis${s.nextId++}`, owner: def.id, contact: -1, kid: k, phase: 'scheduled',
        startAt: w.start - sim.rng.int(4, 22) * 60, until: w.end,
        x: sim.rng.chance(0.5) ? L.yard.busStop - 4 : L.yard.offscreenX, y: L.floorY(0), level: 0, away: true, facing: -1,
        path: [], walkDist: 0, seat: null, carrying: false,
      });
    }
  }
  // консьержка видит детей, идущих на кружок: конфеты и «не шуметь на лестнице»
  for (const v of s.visitors) {
    if (v.kid === undefined || v.away || v.level !== 0 || v.phase !== 'arriving') continue;
    const key = `circle-candy:${v.owner}:${sim.calendar().dayIndex}`;
    if (s.flags[key]) continue;
    for (const d of sim.defs.residents) {
      const r = s.residents[d.id];
      const desk = r && conciergeDesk(sim, r);
      if (!desk || Math.abs(v.x - (desk.x + desk.w)) > 40) continue;
      s.flags[key] = sim.time;
      r.gesture = { kind: 'wave', until: sim.time + 90, toX: v.x };
      const kids = d.traits.tags.some((t) => /дет|конфет/i.test(t));
      chronicle(sim, 'circle.concierge', [d.id, v.owner], 1, { candy: kids });
      break;
    }
  }
}

/** Ребёнок дошёл до квартиры: занять место у стола (или встать рядом) */
export function seatKid(sim: Simulation, v: VisitorState): void {
  const def = sim.defs.residentById.get(v.owner)!;
  const apt = sim.defs.layout.aptById.get(def.apartment)!;
  const host = sim.state.residents[v.owner];
  const taken = new Set(sim.state.visitors.filter((o) => o !== v && o.owner === v.owner && o.seat).map((o) => o.seat!.x));
  const board = apt.rooms.find((rm) => rm.furniture.some((f) => f.def.draw === 'chessboard')) ?? apt.rooms[apt.rooms.length - 1];
  const seats = apt.slots
    .filter((sl) => sl.roomIndex === board.index && (sl.use.includes('sit') || sl.use.includes('eat')) && sim.isSlotFree(sl.key, host.id) && sim.state.slots[sl.key] !== host.id && !taken.has(sl.x))
    .sort((a, b) => Math.abs(a.x - host.x) - Math.abs(b.x - host.x));
  const sl = seats[0];
  if (sl) {
    v.seat = { x: sl.x, dy: sl.dy, front: sl.face === 0 };
    v.facing = sl.face === -1 ? -1 : 1;
  } else {
    v.seat = null;
  }
}

/** Ведёт кружок: сидит у стола с шахматной доской, объясняет, дети вокруг */
export const circleAction: ActionDef = {
  id: 'circle',
  icon: 'chess',
  plan(ctx) {
    const { def, sim, r } = ctx;
    if (!def.circle) return null;
    const w = circleWindow(sim, def.id);
    if (!w || ctx.now < w.start - 12 * 60 || ctx.now >= w.end - 10 * 60) return null;
    const kids = sim.state.visitors.filter((v) => v.owner === def.id && v.kid !== undefined && v.phase !== 'gone' && v.phase !== 'leaving');
    if (!kids.length) return null;
    const room = ctx.home.rooms.find((rm) => rm.furniture.some((f) => f.def.draw === 'chessboard'));
    const sl = room ? sim.findSlot(ctx.home, 'eat', r.id, room.index) ?? sim.findSlot(ctx.home, 'sit', r.id, room.index) : undefined;
    return {
      score: 80,
      target: sl ? { level: ctx.home.level, x: sl.x, slot: sl.key } : { level: ctx.home.level, x: ctx.home.insideX },
      duration: Math.max(600, w.end - ctx.now),
      label: `ведёт ${def.circle.title}`,
      interruptible: false,
      data: { talking: true, end: w.end },
    };
  },
  onArrive(ctx) {
    const key = `circle-start:${ctx.r.id}:${ctx.cal.dayIndex}`;
    if (!ctx.sim.state.flags[key]) {
      ctx.sim.state.flags[key] = ctx.now;
      const n = ctx.sim.state.visitors.filter((v) => v.owner === ctx.r.id && v.kid !== undefined && v.phase !== 'gone').length;
      chronicle(ctx.sim, 'circle.start', [ctx.r.id], 2, { kids: n, title: ctx.def.circle?.title ?? 'кружок' });
    }
    return true;
  },
  perform(ctx, a, dt) {
    gain(ctx.r, 'mood', 8, dt);
    gain(ctx.r, 'social', 20, dt);
    // через полчаса из-за двери слышно, как он объясняет
    if (!a.data.heard && ctx.now - a.performStart > 35 * 60) {
      a.data.heard = true;
      if (ctx.sim.rng.chance(0.6)) chronicle(ctx.sim, 'circle.heard', [ctx.r.id], 1, { saying: ctx.def.sayings.length ? ctx.sim.rng.pick(ctx.def.sayings) : null });
    }
  },
  shouldEnd(ctx, a) {
    if (ctx.now >= Number(a.data.end ?? 0)) return true;
    return !ctx.sim.state.visitors.some((v) => v.owner === ctx.r.id && v.kid !== undefined && (v.phase === 'visiting' || v.phase === 'arriving' || v.phase === 'scheduled' || v.phase === 'waiting'));
  },
  onEnd(ctx) {
    const key = `circle-end:${ctx.r.id}:${ctx.cal.dayIndex}`;
    if (ctx.sim.state.flags[key]) return;
    ctx.sim.state.flags[key] = ctx.now;
    // дети расходятся
    for (const v of ctx.sim.state.visitors) if (v.owner === ctx.r.id && v.kid !== undefined && v.phase === 'visiting') v.until = ctx.now;
    chronicle(ctx.sim, 'circle.end', [ctx.r.id], 1, {});
  },
};
