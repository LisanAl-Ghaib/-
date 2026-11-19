import type { SlotInstance } from '../world/layout';
import { endAction } from './ai/brain';
import { minutesToBed, minutesToLeave, sleepTime } from './ai/helpers';
import type { ActionDef, AgentCtx } from './ai/types';
import { chronicle } from './chronicle/chronicle';
import { addMoodlet, gain } from './needs';
import { adjust, inConflict } from './social/relations';
import type { ResidentState } from './state';
import type { Simulation } from './simulation';

/**
 * Пара, живущая вместе: совместные занятия, которые видно со стороны.
 * Гуляют вдвоём, смотрят кино на кровати с ноутбуком, играют в шахматы, готовят вдвоём,
 * уединяются перед сном (свет гаснет, больше ничего не видно), дарят друг другу подарки.
 * Оба получают действие `together` с одним и тем же `kind` и ссылкой друг на друга.
 */
export type TogetherKind = 'walk' | 'film' | 'chess' | 'help_cook' | 'intimacy' | 'gift' | 'talk';

const LABEL: Record<TogetherKind, string> = {
  walk: 'гуляют вдвоём',
  film: 'смотрят кино вдвоём',
  chess: 'играют в шахматы',
  help_cook: 'помогает готовить',
  intimacy: 'уединились',
  gift: 'подарок',
  talk: 'болтают',
};

/** Чего не прерывают ради времени вдвоём (всё остальное — можно) */
const BUSY = new Set(['sleep', 'nap', 'toilet', 'wash', 'cook', 'eat', 'snack', 'go_to_work', 'work', 'shopping', 'unpack', 'together', 'visit', 'host', 'guest', 'chat', 'take_out_trash', 'feed_pets', 'family_visit']);

let pairsCache: { defs: unknown; pairs: [string, string][] } | null = null;

/** Пары (супруги/партнёры), живущие в одной квартире */
export function couples(sim: Simulation): [string, string][] {
  if (pairsCache?.defs === sim.defs) return pairsCache.pairs;
  const pairs: [string, string][] = [];
  for (const d of sim.defs.residents)
    for (const rl of d.relationships) {
      if (rl.kind !== 'partner' && rl.kind !== 'spouse') continue;
      const o = sim.defs.residentById.get(rl.with);
      if (!o || o.apartment !== d.apartment || d.id > o.id) continue;
      pairs.push([d.id, o.id]);
    }
  pairsCache = { defs: sim.defs, pairs };
  return pairs;
}

export function partnerOf(sim: Simulation, id: string): string | null {
  for (const [a, b] of couples(sim)) {
    if (a === id) return b;
    if (b === id) return a;
  }
  return null;
}

function atHome(sim: Simulation, r: ResidentState): boolean {
  const def = sim.defs.residentById.get(r.id)!;
  const apt = sim.defs.layout.aptById.get(def.apartment)!;
  return !r.away && r.level === apt.level && r.x >= apt.x0 && r.x < apt.x1;
}

function free(ctx: AgentCtx): boolean {
  const { r } = ctx;
  if (r.interaction !== null || !atHome(ctx.sim, r) || r.path.length) return false;
  if (sleepTime(ctx) || (r.sick && r.sick.until > ctx.now)) return false;
  const a = r.action;
  if (!a) return true;
  if (a.id === 'gaming' && r.plan?.allNighter) return false;
  // подработку не бросают, пока не доделано больше половины
  if (a.id === 'side_work' && (r.today.side ?? 0) < (ctx.def.occupation.sideJob?.hours ?? 0) * 30) return false;
  return a.interruptible && !BUSY.has(a.id);
}

/** Действие «вместе» (назначается только из этого модуля) */
export const together: ActionDef = {
  id: 'together',
  plan: () => null,
  onArrive(ctx, a) {
    const kind = a.data.kind as TogetherKind;
    const { r, sim } = ctx;
    if (kind === 'film') {
      // сидят на кровати лицом к нам, ноутбук на коленях
      const slot = a.target.slot ? sim.slotIndex.get(a.target.slot) : undefined;
      r.pose = 'sit';
      r.front = true;
      r.y = sim.defs.layout.floorY(r.level) - (slot?.dy ?? 6);
      if (slot) r.x = slot.x + (a.data.lead ? -5 : 5); // плечом к плечу
      return true;
    }
    if (kind === 'gift' || kind === 'help_cook') {
      const p = sim.state.residents[String(a.data.with)];
      if (p) r.facing = p.x >= r.x ? 1 : -1;
    }
    return true;
  },
  perform(ctx, a, dt) {
    const kind = a.data.kind as TogetherKind;
    if (kind === 'film' && ctx.r.pose !== 'sit') {
      // слот кровати — «лёжа», а кино смотрят сидя: садятся плечом к плечу
      const slot = a.target.slot ? ctx.sim.slotIndex.get(a.target.slot) : undefined;
      ctx.r.pose = 'sit';
      ctx.r.front = true;
      ctx.r.y = ctx.sim.defs.layout.floorY(ctx.r.level) - (slot?.dy ?? 6);
      if (slot) ctx.r.x = slot.x + (a.data.lead ? -6 : 6);
    }
    gain(ctx.r, 'mood', kind === 'help_cook' ? 4 : 9, dt);
    gain(ctx.r, 'social', 16, dt);
    if (kind === 'walk') gain(ctx.r, 'energy', -2, dt);
  },
  shouldEnd(ctx, a) {
    if (ctx.now >= a.endsAt) return true;
    const kind = a.data.kind as TogetherKind;
    if (kind === 'walk') return false;
    const p = ctx.sim.state.residents[String(a.data.with)];
    if (!p) return true;
    const pa = p.action;
    // отошёл на минуту — подождём; ушёл совсем — занятие закончилось
    if (pa?.id === 'toilet') return false;
    if (kind === 'help_cook') return pa?.id !== 'cook';
    return pa?.id !== 'together' || pa.data.kind !== kind;
  },
  continueScore: () => 12,
  onEnd(ctx, a) {
    const kind = a.data.kind as TogetherKind;
    const other = String(a.data.with);
    if (kind === 'gift' && a.data.giver === true) {
      ctx.r.carrying = null;
      delete ctx.sim.state.flags[`gift:${ctx.r.id}`];
      delete ctx.sim.state.flags[`giftKind:${ctx.r.id}`];
    }
    if (ctx.sim.state.residents[other]) {
      adjust(ctx.sim, ctx.r.id, other, kind === 'gift' ? 3 : 0.6, 0.5);
      addMoodlet(ctx, `together:${kind}`, 'Провели время вдвоём', kind === 'gift' ? 10 : 5, kind === 'gift' ? 24 : 6);
    }
  },
};

interface Plan2 {
  kind: TogetherKind;
  minutes: number;
  targets: [{ level: number; x: number; slot?: string; away?: boolean }, { level: number; x: number; slot?: string; away?: boolean }];
  via?: 'walk';
  extra?: Record<string, string | number | boolean>;
}

function start(sim: Simulation, a: string, b: string, p: Plan2): void {
  [a, b].forEach((id, i) => {
    const other = i === 0 ? b : a;
    sim.forceAction(id, 'together', {
      score: 30,
      target: p.targets[i],
      duration: p.minutes * 60,
      label: LABEL[p.kind],
      via: p.via,
      interruptible: p.kind !== 'gift' && p.kind !== 'intimacy',
      data: { kind: p.kind, with: other, lead: i === 0, talking: p.kind === 'gift' || p.kind === 'help_cook' || p.kind === 'talk', out: p.kind === 'walk', ...(i === 0 ? p.extra ?? {} : {}) },
    });
  });
  // начали в одну секунду — пусть и закончат вместе
  const ea = sim.state.residents[a].action;
  const eb = sim.state.residents[b].action;
  if (ea && eb) eb.data.duration = ea.data.duration;
}

/** Два свободных места одного назначения рядом (кровать на двоих, стол на кухне) */
function twoSlots(sim: Simulation, ctx: AgentCtx, use: string, a: string, b: string, filter: (s: SlotInstance) => boolean): [SlotInstance, SlotInstance] | null {
  const list = ctx.home.slots.filter((s) => s.use.includes(use as never) && filter(s) && sim.isSlotFree(s.key, a) && sim.isSlotFree(s.key, b));
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++)
      if (list[i].roomIndex === list[j].roomIndex && Math.abs(list[i].x - list[j].x) < 30) return [list[i], list[j]];
  return null;
}

const GIFTS = [
  { what: 'с букетом тюльпанов', what2: 'вынес(ла) из-за спины букет тюльпанов', carry: 'flowers' as const },
  { what: 'с маленькой коробкой, перевязанной лентой', what2: 'маленькая коробка с лентой, спрятанная на полке', carry: 'gift' as const },
  { what: 'с новой книгой в подарочной бумаге', what2: 'книга в подарочной бумаге, подсунутая под подушку', carry: 'gift' as const },
  { what: 'с горшком смешного кактуса', what2: 'горшок с кактусом, тайком поставленный на стол', carry: 'gift' as const },
  { what: 'с пачкой редкого кофе из кофейни', what2: 'пачка редкого кофе с запиской', carry: 'gift' as const },
  { what: 'с охапкой хризантем', what2: 'вынес(ла) из-за спины охапку хризантем', carry: 'flowers' as const },
];

/** Раз в 10 минут: не заняться ли чем-нибудь вдвоём */
export function planTogether(sim: Simulation): void {
  const s = sim.state;
  const cal = sim.calendar();
  const h = cal.hourOfDay;
  const weekend = cal.weekday >= 6;
  for (const [a, b] of couples(sim)) {
    const ra = s.residents[a];
    const rb = s.residents[b];
    if (!ra || !rb) continue;
    const ca = sim.ctx(ra);
    const cb = sim.ctx(rb);

    // подарок: собирается без повода, нечасто (примерно раз в две-три недели на пару)
    for (const [giver, recv] of [[ra, rb], [rb, ra]] as const) {
      const key = `gift:${giver.id}`;
      const loves = sim.defs.residentById.get(giver.id)!.traits.tags.some((t) => /подар/i.test(t));
      if (!loves) continue;
      if (!s.flags[key] && sim.rng.chance(1 / (6 * 24 * 36))) {
        s.flags[key] = sim.time;
        s.flags[`giftKind:${giver.id}`] = sim.rng.int(0, GIFTS.length - 1);
      }
      if (!s.flags[key]) continue;
      const g = GIFTS[s.flags[`giftKind:${giver.id}`] ?? 0];
      // несёт с улицы
      if (giver.away && !giver.carrying) {
        giver.carrying = g.carry;
        s.flags[`giftOut:${giver.id}`] = 1;
      }
      if (inConflict(sim, giver.id, recv.id)) continue;
      const cg = sim.ctx(giver);
      const cr = sim.ctx(recv);
      const justCame = giver.action?.phase === 'travel' && atHome(sim, giver) && !giver.away;
      if ((justCame || free(cg)) && atHome(sim, recv) && (free(cr) || recv.action?.id === 'cook' || recv.action?.id === 'side_work')) {
        if (giver.action && !free(cg)) endAction(cg, true);
        const dir = giver.x <= recv.x ? -1 : 1;
        const fromOutside = !!s.flags[`giftOut:${giver.id}`];
        delete s.flags[`giftOut:${giver.id}`];
        if (!giver.carrying) giver.carrying = g.carry;
        start(sim, giver.id, recv.id, {
          kind: 'gift',
          minutes: 4,
          targets: [{ level: recv.level, x: Math.round(recv.x + dir * 8) }, { level: recv.level, x: Math.round(recv.x) }],
          extra: { giver: true },
        });
        const what2 = g.what2.replace('вынес(ла)', sim.defs.residentById.get(giver.id)!.gender === 'f' ? 'вынесла' : 'вынес');
        chronicle(sim, 'gift', [giver.id, recv.id], 2, { what: g.what, what2, out: fromOutside });
        // на один шаг кто-то из них занят подарком — остальное подождёт
        return;
      }
      // дома, а вручить пока некому — положил(а) и ждёт момента
      if (atHome(sim, giver) && !giver.path.length && (giver.carrying === 'gift' || giver.carrying === 'flowers')) giver.carrying = null;
    }

    // один только что лёг, второй ещё не спит — может и не уснуть сразу
    {
      const apt0 = ca.home;
      const nk = `intim:${apt0.id}:${cal.dayIndex - (h < 4 ? 1 : 0)}`;
      const justLay = (x: ResidentState) => x.action?.id === 'sleep' && x.action.phase === 'perform' && sim.time - x.action.performStart < 25 * 60;
      const ready = (x: ResidentState, cx: AgentCtx) => justLay(x) || (free(cx) && minutesToBed(cx) < 40);
      if (!s.flags[nk] && (justLay(ra) || justLay(rb)) && ready(ra, ca) && ready(rb, cb) && !inConflict(sim, a, b) && sim.rng.chance(0.2)) {
        s.flags[nk] = sim.time;
        const beds = twoSlots(sim, ca, 'sleep', a, b, (sl) => sl.pose === 'lie') ?? bedOf(sim, ca, ra, rb);
        if (beds) {
          start(sim, a, b, {
            kind: 'intimacy',
            minutes: sim.rng.int(25, 45),
            targets: [{ level: apt0.level, x: beds[0].x, slot: beds[0].key }, { level: apt0.level, x: beds[1].x, slot: beds[1].key }],
          });
          continue;
        }
      }
    }
    if (!free(ca) || !free(cb) || inConflict(sim, a, b)) continue;
    const leave = Math.min(minutesToLeave(ca), minutesToLeave(cb));
    const toBed = Math.min(minutesToBed(ca), minutesToBed(cb));
    const opts: { w: number; go: () => boolean }[] = [];
    const apt = ca.home;

    // уединиться перед сном: свет гаснет, остальное — их дело
    const nightKey = `intim:${apt.id}:${cal.dayIndex - (h < 4 ? 1 : 0)}`;
    if (!s.flags[nightKey] && (toBed < 75 || h >= 22) && h >= 20 || (!s.flags[nightKey] && h < 1)) {
      if (sim.rng.chance(0.09)) {
        s.flags[nightKey] = sim.time;
        const beds = twoSlots(sim, ca, 'sleep', a, b, (sl) => sl.pose === 'lie');
        if (beds) {
          start(sim, a, b, {
            kind: 'intimacy',
            minutes: sim.rng.int(25, 45),
            targets: [{ level: apt.level, x: beds[0].x, slot: beds[0].key }, { level: apt.level, x: beds[1].x, slot: beds[1].key }],
          });
          continue;
        }
      }
    }

    // прогулка вдвоём: в выходные — почти обязательно, в будни — вечером
    const outside = Math.min(sim.outdoorAppeal(ca.def), sim.outdoorAppeal(cb.def));
    const walkHours = weekend ? h >= 11 && h < 19 : h >= 17 && h < 20.5;
    if (walkHours && outside > 0.15 && leave > 150 && toBed > 150) {
      const key = `cwalk:${apt.id}:${cal.dayIndex}`;
      opts.push({
        w: (s.flags[key] ? 0.4 : weekend ? 20 : 2.4) * outside,
        go: () => {
          s.flags[key] = sim.time;
          const off = { level: 0, x: sim.defs.layout.yard.offscreenX, away: true };
          start(sim, a, b, { kind: 'walk', minutes: sim.rng.int(weekend ? 90 : 50, weekend ? 200 : 100), targets: [off, off], via: 'walk' });
          chronicle(sim, 'couple.walk', [a, b], 1, { weekend });
          // одинокий сосед курит у подъезда и смотрит им вслед
          for (const d of sim.defs.residents) {
            const o = s.residents[d.id];
            if (!o || o.id === a || o.id === b || !d.traits.tags.some((t) => /одинок/i.test(t))) continue;
            if (o.action?.id === 'smoke' && o.action.phase === 'perform' && sim.rng.chance(0.7)) {
              o.bubble = { icon: 'gloom', until: sim.time + 600 };
              chronicle(sim, 'lonely.watch', [o.id, a], 1, { c: b });
            }
          }
          return true;
        },
      });
    }
    // кино или сериал на кровати с ноутбуком
    const filmHours = weekend ? h >= 14 && h < 23.5 : h >= 19.5 && h < 23.5;
    if (filmHours && toBed > 45) {
      opts.push({
        w: weekend ? 2 : 2.6,
        go: () => {
          const beds = twoSlots(sim, ca, 'sleep', a, b, () => true);
          if (!beds) return false;
          const series = sim.rng.chance(0.55);
          const mins = series ? sim.rng.int(40, 100) : sim.rng.int(95, 140);
          start(sim, a, b, {
            kind: 'film',
            minutes: Math.max(30, Math.min(mins, toBed - 10)),
            targets: [{ level: apt.level, x: beds[0].x, slot: beds[0].key }, { level: apt.level, x: beds[1].x, slot: beds[1].key }],
            extra: { series },
          });
          const key = `cfilm:${apt.id}`;
          if (sim.time - (s.flags[key] ?? -1e9) > 3 * 86400) {
            s.flags[key] = sim.time;
            chronicle(sim, 'couple.film', [a, b], 1, { series });
          }
          return true;
        },
      });
    }
    // шахматы: Иван часто один, вдвоём — изредка
    const board = apt.rooms.find((rm) => rm.furniture.some((f) => f.def.draw === 'chessboard'));
    if (board && (weekend ? h >= 12 : h >= 18.5) && h < 23 && toBed > 50) {
      opts.push({
        w: 0.9,
        go: () => {
          const seats = twoSlots(sim, ca, 'eat', a, b, (sl) => sl.roomIndex === board.index);
          if (!seats) return false;
          start(sim, a, b, {
            kind: 'chess',
            minutes: sim.rng.int(30, 70),
            targets: [{ level: apt.level, x: seats[0].x, slot: seats[0].key }, { level: apt.level, x: seats[1].x, slot: seats[1].key }],
          });
          const key = `cchess:${apt.id}`;
          if (sim.time - (s.flags[key] ?? -1e9) > 5 * 86400) {
            s.flags[key] = sim.time;
            chronicle(sim, 'couple.chess', [a, b], 1, { win: sim.rng.chance(0.5) ? a : b });
          }
          return true;
        },
      });
    }
    // просто поболтать — чаще всего: в одной комнате почти всегда, из разных — один подойдёт к другому
    if (toBed > 20 && leave > 30) {
      const same = ca.home === cb.home && sim.defs.layout.roomAt(ca.home, ra.x).index === sim.defs.layout.roomAt(cb.home, rb.x).index;
      opts.push({
        w: same ? 14 : 5,
        go: () => {
          // тот, кто сидит (или кто первый), остаётся на месте; второй подходит
          const [stay, come] = rb.pose === 'sit' && ra.pose !== 'sit' ? [rb, ra] : [ra, rb];
          const stayTarget = stay.action?.target.slot && stay.pose === 'sit'
            ? { level: stay.level, x: stay.x, slot: stay.action.target.slot }
            : { level: stay.level, x: Math.round(stay.x) };
          const room = sim.defs.layout.roomAt(ca.home, stay.x);
          // присесть рядом, если есть свободное место поблизости, иначе встать рядом
          const seat = ca.home.slots.find((sl) => sl.roomIndex === room.index && (sl.use.includes('sit') || sl.use.includes('eat')) && sl.pose === 'sit' && sl.key !== stayTarget.slot && Math.abs(sl.x - stay.x) < 30 && sim.isSlotFree(sl.key, come.id));
          const side = stay.x - room.x0 > 14 ? -1 : 1;
          const comeTarget = seat ? { level: stay.level, x: seat.x, slot: seat.key } : { level: stay.level, x: Math.round(Math.max(room.x0 + 4, Math.min(room.x1 - 4, stay.x + side * 9))) };
          const ids: [string, string] = stay === ra ? [a, b] : [b, a];
          start(sim, ids[0], ids[1], { kind: 'talk', minutes: sim.rng.int(12, 40), targets: [stayTarget, comeTarget] });
          // иногда соседям слышно, о чём болтают (не чаще раза в пару часов)
          const key = `coupletalk:${[a, b].sort().join(':')}`;
          if (sim.time - (sim.state.flags[key] ?? -1e9) > 1.5 * 3600 && sim.rng.chance(0.85)) {
            sim.state.flags[key] = sim.time;
            chronicle(sim, 'couple.talk', ids, 1, { room: room.name });
          }
          return true;
        },
      });
    }
    const total = opts.reduce((x, o) => x + o.w, 0);
    if (!total || !sim.rng.chance(Math.min(0.75, total * 0.035))) continue;
    const choice = sim.rng.weighted(opts, (o) => o.w);
    choice?.go();
  }
}

/** Один начал готовить — второй иногда присоединяется */
export function joinCooking(sim: Simulation, cookId: string): void {
  const other = partnerOf(sim, cookId);
  if (!other) return;
  const r = sim.state.residents[other];
  const c = sim.state.residents[cookId];
  if (!r || !c?.action || inConflict(sim, cookId, other)) return;
  const ctx = sim.ctx(r);
  if (!free(ctx)) return;
  const weekend = sim.calendar().weekday >= 6;
  if (!sim.rng.chance(weekend ? 0.7 : 0.4)) return;
  const x = Math.round(c.action.target.x + (c.x < ctx.home.x0 + 40 ? 10 : -10));
  sim.forceAction(other, 'together', {
    score: 30,
    target: { level: ctx.home.level, x },
    duration: Math.max(300, Number(c.action.data.duration ?? 1800)),
    label: LABEL.help_cook,
    data: { kind: 'help_cook', with: cookId, talking: true },
  });
}

/** Кровать, в которой один из них уже лежит: его место и соседнее */
function bedOf(sim: Simulation, ctx: AgentCtx, ra: ResidentState, rb: ResidentState): [SlotInstance, SlotInstance] | null {
  const lying = [ra, rb].find((x) => x.action?.id === 'sleep' && x.action.target.slot);
  const key = lying?.action?.target.slot;
  const mine = key ? sim.slotIndex.get(key) : undefined;
  if (!mine) return null;
  const other = ctx.home.slots.find((sl) => sl !== mine && sl.furnitureUid === mine.furnitureUid && sl.use.includes('sleep'));
  if (!other) return null;
  return lying === ra ? [mine, other] : [other, mine];
}

// ───────────────────────────── проводы из окна

/**
 * Один уходит из дома (на пары, в магазин, на пробежку) — второй, если дома и не спит,
 * подходит к окну над входом в подъезд. Уходящий, выйдя на улицу, оборачивается,
 * они машут друг другу, и только потом он идёт дальше.
 */
const FAREWELL_WAVE_S = 150; // ≈ 2,5 секунды на экране
const FAREWELL_WAIT_S = 240; // сколько ждать у подъезда, пока второй дойдёт до окна

/** Где стоять у окна над входом (или null, если такого окна нет) */
export function entranceWindowSpot(sim: Simulation, aptId: string): { level: number; x: number } | null {
  const apt = sim.defs.layout.aptById.get(aptId);
  if (!apt?.def?.entranceWindow || apt.side !== 'right') return null;
  return { level: apt.level, x: apt.x1 - 4 };
}

/** Стоит у окна и машет вслед (назначается только проводами) */
export const waveWindow: ActionDef = {
  id: 'wave_window',
  plan: () => null,
  onArrive(ctx) {
    ctx.r.facing = 1; // к окну в торцевой стене
    return true;
  },
  perform(ctx, _a, dt) {
    gain(ctx.r, 'mood', 6, dt);
  },
  shouldEnd(ctx, a) {
    if (ctx.now >= a.endsAt) return true;
    const l = ctx.sim.state.residents[String(a.data.leaver)];
    if (!l || l.away) return true;
    const la = l.action;
    // передумал уходить или уже помахали и он скрылся из виду
    if (!la || !la.target.away) return true;
    return la.data.farewell === 'done' && !l.gesture;
  },
};

const NOT_NOW = new Set(['sleep', 'nap', 'toilet', 'wash', 'go_to_work', 'shopping', 'together', 'visit', 'guest', 'host', 'chat']);

export function updateFarewells(sim: Simulation): void {
  const s = sim.state;
  const L = sim.defs.layout;
  for (const [a, b] of couples(sim)) {
    for (const [lid, pid] of [[a, b], [b, a]] as const) {
      const l = s.residents[lid];
      const p = s.residents[pid];
      const la = l?.action;
      if (!l || !p || !la || !la.target.away || la.id === 'together' || la.data.farewell === 'done' || la.data.farewell === 'none') continue;
      const spot = entranceWindowSpot(sim, sim.defs.residentById.get(lid)!.apartment);
      if (!spot) {
        la.data.farewell = 'none';
        continue;
      }
      // уходящий спустился в холл первого этажа — второй идёт к окну (раньше звать незачем: долго стоять)
      if (la.data.farewell === undefined) {
        const inLobby = l.level === 0 && !atHome(sim, l) && l.x < L.buildingX1 && l.x >= L.buildingX0;
        if (!inLobby) {
          // ушёл не из дома (со двора, от соседей) — без проводов
          if (!atHome(sim, l) && !(l.level > 0 && l.x >= L.coreX && l.x < L.coreX + 64)) la.data.farewell = 'none';
          continue;
        }
        const pa = p.action;
        const can =
          atHome(sim, p) && p.interaction === null && !(pa && NOT_NOW.has(pa.id)) && !(pa?.target.away) &&
          !(p.sick && p.sick.until > sim.time && p.pose === 'lie');
        if (!can) {
          la.data.farewell = 'none';
          continue;
        }
        la.data.farewell = 'sent';
        sim.forceAction(pid, 'wave_window', {
          score: 30,
          target: spot,
          duration: 25 * 60,
          label: 'машет из окна',
          interruptible: false,
          data: { leaver: lid },
        });
        continue;
      }
      // вышел из подъезда: обернуться, найти окно глазами, помахать
      if (la.data.farewell === 'sent' && la.phase === 'travel' && !l.away && l.level === 0 && l.x >= L.buildingX1 + 26) {
        const pw = p.action?.id === 'wave_window' && p.action.data.leaver === lid ? p.action : null;
        l.facing = -1;
        if (pw && pw.phase === 'perform') {
          l.gesture = { kind: 'wave', until: sim.time + FAREWELL_WAVE_S, toX: spot.x, side: true };
          p.gesture = { kind: 'wave', until: sim.time + FAREWELL_WAVE_S + 20, toX: l.x, side: true };
          la.data.pauseUntil = sim.time + FAREWELL_WAVE_S;
          la.data.farewell = 'done';
          const key = `farewell:${lid}:${sim.calendar().dayIndex}`;
          if (!s.flags[key] && sim.rng.chance(0.5)) {
            s.flags[key] = sim.time;
            chronicle(sim, 'farewell.window', [lid, pid], 1);
          }
        } else if (pw) {
          // второй ещё идёт к окну — подождать
          la.data.waitSince ??= sim.time;
          if (sim.time - Number(la.data.waitSince) > FAREWELL_WAIT_S) la.data.farewell = 'done';
          else la.data.pauseUntil = sim.time + 10;
        } else la.data.farewell = 'done';
      }
    }
  }
}
