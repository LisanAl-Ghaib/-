import type { ApartmentModel, SlotInstance } from '../world/layout';
import { commonRoomReady } from './commonBuild';
import { aptState, fitDuration, gv, habit, householdIds, minutesToBed, minutesToLeave, novelty, sleepTime } from './ai/helpers';
import type { ActionDef, ActionPlan, AgentCtx } from './ai/types';
import { chronicle, chronicleAt } from './chronicle/chronicle';
import { nameCase, withPrep } from './chronicle/russian';
import { bump, gain } from './needs';
import { goodTalk, warmth } from './social/social';
import type { ResidentState } from './state';
import type { Simulation } from './simulation';

/**
 * Комната отдыха жильцов в подвале (квартира с `common: true` на этаже 0, уровень -1).
 * Сюда спускаются вечером и в выходные: попить чаю за общим столом, почитать на диване,
 * сыграть в шахматы, принести угощение. Кто там уже сидит — тянет спуститься и других.
 * Шахматист, которому не с кем играть, зовёт другого шахматиста из дома («спустишься на партию?»).
 * Разговоры там — обычные встречи (encounters: место «в комнате отдыха в подвале»).
 */

type Kind = 'tea' | 'read' | 'chess' | 'treat';
/** чем человек не готов пожертвовать ради партии в подвале */
const BUSY = new Set(['sleep', 'nap', 'toilet', 'wash', 'cook', 'eat', 'go_to_work', 'work', 'side_work', 'shopping', 'unpack', 'together', 'visit', 'host', 'guest', 'chat', 'common_room', 'family_visit', 'circle', 'move_out', 'smoke', 'smoke_window']);

function roomOf(sim: Simulation): ApartmentModel | null {
  return sim.defs.layout.commonRoom;
}

/** кто сейчас сидит в комнате отдыха */
export function inCommonRoom(sim: Simulation, except?: string): ResidentState[] {
  return Object.values(sim.state.residents).filter((r) => r.id !== except && !r.away && r.action?.id === 'common_room' && r.action.phase === 'perform');
}

function habitOf(sim: Simulation, id: string, kind: 'chess' | 'reading'): number {
  return sim.defs.residentById.get(id)?.habits.find((h) => h.kind === kind)?.strength ?? 0;
}

/** место по занятию: шахматный столик, общий стол, диван/кресло */
function seatFor(sim: Simulation, room: ApartmentModel, kind: Kind, rid: string): SlotInstance | null {
  const free = (s: SlotInstance) => sim.isSlotFree(s.key, rid);
  const furn = (draw: string) => room.rooms.flatMap((rm) => rm.furniture.filter((f) => f.def.draw === draw));
  const chessTable = furn('kitchen_table')[0];
  const bigTable = furn('dining_table')[0];
  const soft = [...furn('sofa'), ...furn('armchair')];
  const slotsOf = (fs: typeof soft) => fs.flatMap((f) => room.slots.filter((s) => s.furnitureUid === f.uid));
  const pick = (ss: SlotInstance[]) => ss.find(free) ?? null;
  if (kind === 'chess') return chessTable ? pick(slotsOf([chessTable])) : null;
  if (kind === 'read') return pick(slotsOf(soft)) ?? (bigTable ? pick(slotsOf([bigTable])) : null);
  return (bigTable ? pick(slotsOf([bigTable])) : null) ?? pick(slotsOf(soft));
}

function planFor(ctx: AgentCtx, kind: Kind, slot: SlotInstance, score: number): ActionPlan {
  const room = roomOf(ctx.sim)!;
  const minutes = kind === 'chess' ? ctx.sim.rng.int(45, 90) : ctx.sim.rng.int(35, 90);
  return {
    score,
    target: { level: room.level, x: slot.x, slot: slot.key },
    duration: fitDuration(ctx, minutes * 60),
    label: kind === 'chess' ? 'идёт в подвал играть в шахматы' : kind === 'treat' ? 'несёт угощение в комнату отдыха' : gv(ctx.def, 'спустился в комнату отдыха', 'спустилась в комнату отдыха'),
    data: { kind, scene: `common_room:${kind}` },
  };
}

export const commonRoomAction: ActionDef = {
  id: 'common_room',
  icon: 'cup',
  plan(ctx) {
    const { sim, r, def, cal } = ctx;
    const room = roomOf(sim);
    if (!room || !commonRoomReady(sim) || r.sick || sleepTime(ctx) || minutesToLeave(ctx) < 60 || minutesToBed(ctx) < 45) return null;
    const h = cal.hourOfDay;
    const weekend = cal.weekday >= 6;
    if (h < (weekend ? 11 : 16.5) || h >= 22.5) return null;
    const there = inCommonRoom(sim, r.id);
    const chessH = habit(ctx, 'chess');
    const mate = there.find((o) => o.action?.data.kind === 'chess' && !o.action.data.vs);
    const meals = aptState(ctx).meals;
    const sweet = def.traits.tags.some((t) => /угощает|печёт|дарить/i.test(t));
    let kind: Kind;
    // дома есть с кем сыграть (пара) — в подвал за партией ходит пореже
    const homeMate = householdIds(ctx).some((id) => id !== r.id && habitOf(sim, id, 'chess') > 0 && !sim.state.residents[id]?.away);
    if (chessH > 0 && (mate || sim.rng.chance((0.45 + chessH * 0.4) * (homeMate ? 0.4 : 1)))) kind = 'chess';
    else if (meals >= 4 || (sweet && sim.rng.chance(0.25))) kind = 'treat';
    else if (habit(ctx, 'reading') > 0.3 && sim.rng.chance(0.4)) kind = 'read';
    else kind = 'tea';
    const slot = seatFor(sim, room, kind, r.id) ?? (kind === 'chess' ? null : seatFor(sim, room, 'tea', r.id));
    if (!slot) return null;
    const soc = { homebody: -0.7, balanced: 0.3, outgoing: 1.3 }[def.traits.sociability];
    const score =
      (1.5 + soc + (100 - r.needs.social) / 22 + (100 - r.needs.mood) / 40 + there.length * 1.8 + (kind === 'chess' ? chessH * 3 + (mate ? 4 : 0) : 0) + (kind === 'treat' ? 1.5 : 0)) *
      novelty(ctx, 'common_room', 20 * 3600);
    return planFor(ctx, kind, slot, Math.max(0, score));
  },
  onStart(ctx, a) {
    // угощение: берёт из дома тарелку с едой
    if (a.data.kind === 'treat') {
      const st = aptState(ctx);
      if (st.meals >= 2) st.meals -= 2;
      ctx.r.carrying = 'plate';
    }
  },
  onArrive(ctx, a) {
    if (a.data.kind === 'treat') ctx.r.carrying = null;
    a.label =
      a.data.kind === 'chess'
        ? 'расставляет шахматы в комнате отдыха'
        : a.data.kind === 'read'
          ? 'читает в комнате отдыха'
          : a.data.kind === 'treat'
            ? 'угощает соседей в комнате отдыха'
            : 'пьёт чай в комнате отдыха';
    return true;
  },
  perform(ctx, a, dt) {
    const company = inCommonRoom(ctx.sim, ctx.r.id).length;
    gain(ctx.r, 'social', company ? 14 : 3, dt);
    gain(ctx.r, 'mood', a.data.vs ? 8 : 4, dt);
  },
};

/** Каждый шаг: шахматные пары, приглашение на партию, угощение, вечерние посиделки */
export function updateCommonRoom(sim: Simulation): void {
  const room = roomOf(sim);
  if (!room) return;
  const there = inCommonRoom(sim);
  if (!there.length) return;
  const now = sim.time;
  // шахматы: двое за доской — играют
  const waiting = there.filter((r) => r.action!.data.kind === 'chess' && !r.action!.data.vs);
  while (waiting.length >= 2) {
    const a = waiting.shift()!;
    const b = waiting.shift()!;
    startGame(sim, a, b);
  }
  // один за доской — зовёт кого-нибудь из шахматистов (раз за вечер)
  for (const r of waiting) {
    const a = r.action!;
    if (a.data.invited || now - a.performStart < 5 * 60) continue;
    a.data.invited = true;
    invite(sim, r);
  }
  // угощение: кто принёс — угощает всех, кто рядом (каждого — один раз)
  for (const r of there) {
    const a = r.action!;
    if (a.data.kind !== 'treat') continue;
    const fed = String(a.data.fed ?? '').split(',').filter(Boolean);
    const fresh = there.filter((o) => o !== r && !fed.includes(o.id));
    if (!fresh.length) continue;
    for (const o of fresh) {
      goodTalk(sim, r.id, o.id, 20);
      bump(o, 'mood', 4);
      bump(o, 'food', 8);
    }
    const all = [...fed, ...fresh.map((o) => o.id)];
    a.data.fed = all.join(',');
    const home = sim.defs.residentById.get(r.id)?.apartment;
    const neighbours = fresh.filter((o) => sim.defs.residentById.get(o.id)?.apartment !== home);
    const key = `commontreat:${r.id}:${sim.calendar().dayIndex}`;
    if (neighbours.length && !sim.state.flags[key]) {
      sim.state.flags[key] = now;
      chronicle(sim, 'common.treat', [r.id, ...neighbours.map((o) => o.id).slice(0, 3)], 2, { dish: dishOf(sim, r.id), v: sim.rng.int(0, 2) });
    }
  }
  // посиделки: собрались трое и больше
  if (there.length >= 3) {
    const key = `commonmeet:${sim.calendar().dayIndex}`;
    if (!sim.state.flags[key]) {
      sim.state.flags[key] = now;
      chronicle(sim, 'common.gathering', there.map((r) => r.id).slice(0, 5), 2, { n: there.length });
    }
  }
}

function dishOf(sim: Simulation, id: string): string {
  const def = sim.defs.residentById.get(id);
  if (def?.traits.tags.some((t) => /шарлотк/i.test(t))) return 'шарлотку';
  if (def?.traits.tags.some((t) => /конфет/i.test(t))) return 'коробку конфет';
  if (def?.habits.some((h) => h.kind === 'cooking' && /пирож/i.test(h.note))) return 'пирожки';
  return sim.rng.pick(['пирожки', 'печенье', 'блины', 'нарезанный пирог', 'варенье к чаю', 'бутерброды']);
}

function startGame(sim: Simulation, a: ResidentState, b: ResidentState): void {
  const da = sim.defs.residentById.get(a.id)!;
  const db = sim.defs.residentById.get(b.id)!;
  const minutes = sim.rng.int(35, 70);
  for (const [r, o, d] of [[a, b, db], [b, a, da]] as const) {
    r.action!.data.vs = o.id;
    r.action!.label = `играет в шахматы ${withPrep(nameCase(d, 'ins'))}`;
    r.action!.endsAt = Math.max(r.action!.endsAt, sim.time + minutes * 60);
  }
  goodTalk(sim, a.id, b.id, minutes);
  // кто выиграл — слышно ближе к концу партии («мат!»), иногда ничья
  const ha = habitOf(sim, a.id, 'chess');
  const hb = habitOf(sim, b.id, 'chess');
  const draw = sim.rng.chance(0.12);
  const win = draw ? null : sim.rng.chance(0.5 + (ha - hb) * 0.5) ? a.id : b.id;
  const key = `commonchess:${[a.id, b.id].sort().join(':')}:${sim.calendar().dayIndex}`;
  if (sim.state.flags[key]) return;
  sim.state.flags[key] = sim.time;
  chronicleAt(sim, sim.time + Math.round(minutes * 0.8) * 60, 'common.chess', [a.id, b.id], 1, { win, v: sim.rng.int(0, 2) });
}

/** Сидит один за доской — зовёт шахматиста из дома (по телефону, с лестницы) */
function invite(sim: Simulation, host: ResidentState): void {
  const room = roomOf(sim)!;
  const hostDef = sim.defs.residentById.get(host.id)!;
  let best: { r: ResidentState; w: number } | null = null;
  for (const r of Object.values(sim.state.residents)) {
    if (r.id === host.id || r.away || r.sick) continue;
    const d = sim.defs.residentById.get(r.id);
    if (!d || d.apartment === hostDef.apartment) continue;
    const h = habitOf(sim, r.id, 'chess');
    if (h <= 0) continue;
    if (r.action && (BUSY.has(r.action.id) || !r.action.interruptible)) continue;
    const ctx = sim.ctx(r);
    if (sleepTime(ctx) || minutesToLeave(ctx) < 60 || minutesToBed(ctx) < 50) continue;
    const w = h * (0.4 + warmth(sim, r.id, host.id));
    if (!best || w > best.w) best = { r, w };
  }
  if (!best || !sim.rng.chance(Math.min(0.9, 0.5 + best.w))) return;
  const ctx = sim.ctx(best.r);
  const slot = seatFor(sim, room, 'chess', best.r.id);
  if (!slot) return;
  const plan = planFor(ctx, 'chess', slot, 60);
  plan.label = 'спускается в подвал на партию в шахматы';
  sim.forceAction(best.r.id, 'common_room', plan);
}
