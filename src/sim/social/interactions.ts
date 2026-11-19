import { calendar } from '../../core/time';
import type { SlotInstance } from '../../world/layout';
import { minutesToLeave, sleepTime } from '../ai/helpers';
import { nameCase } from '../chronicle/russian';
import { chronicle } from '../chronicle/chronicle';
import { runExclusive } from '../events/engine';
import type { PlaceKind } from '../events/types';
import { gain } from '../needs';
import type { Interaction, ResidentState } from '../state';
import type { Simulation } from '../simulation';
import { goodTalk } from './social';
import { remember } from './relations';

export function findInteraction(sim: Simulation, id: number | null): Interaction | undefined {
  if (id === null) return undefined;
  return sim.state.interactions.find((i) => i.id === id && !i.ended);
}

function seatsFor(sim: Simulation, aptId: string): SlotInstance[] {
  const apt = sim.defs.layout.aptById.get(aptId)!;
  const order = ['living', 'studio', 'kitchen', 'bedroom'];
  const slots = apt.slots.filter((s) => s.use.includes('sit') || s.use.includes('eat'));
  return slots.sort((a, b) => order.indexOf(apt.rooms[a.roomIndex].type) - order.indexOf(apt.rooms[b.roomIndex].type));
}

/** Визит: гость и хозяин садятся в гостиной и разговаривают */
export function startVisit(sim: Simulation, visitor: string, host: string, intent: string, meta: Record<string, string> = {}): Interaction {
  const s = sim.state;
  const hostDef = sim.defs.residentById.get(host)!;
  const visDef = sim.defs.residentById.get(visitor)!;
  const rh = s.residents[host];
  const warmthMin = 20 + Math.max(0, (sim.state.relations[visitor]?.[host]?.affinity ?? 0)) * 0.8;
  const social = { homebody: 0.7, balanced: 1, outgoing: 1.35 }[visDef.traits.sociability];
  let minutes = Math.round(sim.rng.range(0.6, 1.3) * warmthMin * social);
  if (intent === 'care' || intent === 'treat') minutes = Math.min(minutes, sim.rng.int(15, 40));
  if (intent === 'congratulate') minutes = Math.max(minutes, 40);
  minutes = Math.max(12, Math.min(minutes, 240));
  const it: Interaction = {
    id: s.nextId++,
    kind: 'visit',
    host,
    members: [visitor, host],
    aptId: hostDef.apartment,
    place: 'в гостях',
    intent,
    startedAt: sim.time,
    endsAt: sim.time + minutes * 60,
    nextTalk: sim.time + sim.rng.int(10, 20) * 60,
    notes: Object.entries(meta).map(([k, v]) => `${k}=${v}`),
    quarrel: false,
    dinner: false,
    ended: false,
  };
  s.interactions.push(it);
  s.residents[visitor].interaction = it.id;
  rh.interaction = it.id;
  const seats = seatsFor(sim, hostDef.apartment).filter((sl) => sim.isSlotFree(sl.key, host) || sim.isSlotFree(sl.key, visitor));
  const apt = sim.defs.layout.aptById.get(hostDef.apartment)!;
  const fallback = (dx: number) => ({ level: apt.level, x: Math.round((apt.x0 + apt.x1) / 2 + dx) });
  const hs = seats[0];
  const vs = seats.find((x) => x !== hs);
  sim.forceAction(host, 'host', {
    score: 50,
    target: hs ? { level: apt.level, x: hs.x, slot: hs.key } : fallback(-6),
    duration: minutes * 60 + 3600,
    label: `принимает гостя: ${visDef.name.short ?? visDef.name.first}`.replace('гостя', visDef.gender === 'f' ? 'гостью' : 'гостя'),
    data: { interaction: it.id, talking: true, partner: visitor },
    interruptible: false,
  });
  sim.forceAction(visitor, 'guest', {
    score: 50,
    target: vs ? { level: apt.level, x: vs.x, slot: vs.key } : fallback(8),
    duration: minutes * 60 + 3600,
    label: `в гостях у ${nameCase(hostDef, 'gen')}`,
    data: { interaction: it.id, talking: true, partner: host },
    interruptible: false,
  });
  remember(sim, visitor, host, 'visit');
  return it;
}

/** Разговор там, где встретились (лестница, двор, лавочка) */
export function startChat(sim: Simulation, a: string, b: string, place: string, placeKind: PlaceKind, minutes: number): Interaction {
  const s = sim.state;
  const it: Interaction = {
    id: s.nextId++,
    kind: 'chat',
    host: null,
    members: [a, b],
    aptId: null,
    place,
    intent: placeKind,
    startedAt: sim.time,
    endsAt: sim.time + Math.round(minutes * 60),
    nextTalk: sim.time + Math.min(minutes * 60 - 60, sim.rng.int(4, 9) * 60),
    notes: [],
    quarrel: false,
    dinner: false,
    ended: false,
  };
  s.interactions.push(it);
  const ra = s.residents[a];
  const rb = s.residents[b];
  ra.interaction = it.id;
  rb.interaction = it.id;
  const inPlace = ra.action?.id === 'bench' && rb.action?.id === 'bench';
  if (!inPlace) {
    // встали друг напротив друга
    const mid = (ra.x + rb.x) / 2;
    const level = ra.level;
    const ax = Math.round(mid + (ra.x <= rb.x ? -5 : 5));
    const bx = Math.round(mid + (ra.x <= rb.x ? 5 : -5));
    for (const [id, x, partner] of [[a, ax, b], [b, bx, a]] as const) {
      const r = s.residents[id];
      const onStairs = Math.abs(r.y - sim.defs.layout.floorY(r.level)) > 1;
      sim.forceAction(id, 'chat', {
        score: 50,
        target: { level, x: onStairs ? Math.round(r.x) : x },
        duration: minutes * 60 + 600,
        label: 'болтает с соседом',
        data: { interaction: it.id, talking: true, partner, keepY: onStairs },
        interruptible: false,
      });
      const pdef = sim.defs.residentById.get(partner)!;
      r.action!.label = `болтает с ${nameCase(pdef, 'ins')}`;
    }
  }
  return it;
}

function placeOf(sim: Simulation, it: Interaction): string {
  return it.place;
}

/** Каждый тик: разговоры, окончание, хроника */
export function updateInteractions(sim: Simulation, dt: number): void {
  const s = sim.state;
  for (const it of s.interactions) {
    if (it.ended) continue;
    const members = it.members.map((id) => s.residents[id]).filter(Boolean) as ResidentState[];
    // кто-то ушёл/уснул/занят другим — расходимся
    let stop = members.length < 2 || members.some((r) => r.interaction !== it.id || r.away);
    for (const r of members) {
      const ctx = sim.ctx(r);
      if (r.needs.energy < 10) stop = true;
      if (sleepTime(ctx) && r.plan && sim.time > r.plan.bedAt + 40 * 60) stop = true;
      if (minutesToLeave(ctx) < 25) stop = true;
    }
    // ещё идут к местам — разговор не начался
    const seated = members.every((r) => r.action?.phase === 'perform' || r.action?.id === 'bench');
    if (!stop && seated) {
      for (const r of members) {
        gain(r, 'social', 24, dt);
        gain(r, 'mood', 2, dt);
      }
      if (sim.time >= it.nextTalk) {
        it.nextTalk = sim.time + sim.rng.int(18, 32) * 60;
        const [a, b] = sim.rng.chance(0.5) ? [it.members[0], it.members[1]] : [it.members[1], it.members[0]];
        const ev = runExclusive('conversation', { sim, now: sim.time, a, b, interaction: it, place: placeOf(sim, it) }, 0.5);
        if (!ev) goodTalk(sim, a, b, 25);
      }
    } else if (!stop && sim.time > it.startedAt + 40 * 60) stop = true; // так и не дошли
    if (stop || it.quarrel || sim.time >= it.endsAt) endInteraction(sim, it);
  }
  if (s.interactions.some((i) => i.ended)) s.interactions = s.interactions.filter((i) => !i.ended);
}

export function endInteraction(sim: Simulation, it: Interaction): void {
  if (it.ended) return;
  it.ended = true;
  const s = sim.state;
  const minutes = Math.max(1, Math.round((sim.time - it.startedAt) / 60));
  for (const id of it.members) {
    const r = s.residents[id];
    if (!r) continue;
    if (r.interaction === it.id) r.interaction = null;
    if (r.action && (r.action.id === 'host' || r.action.id === 'guest' || r.action.id === 'chat') && r.action.data.interaction === it.id) {
      r.action.endsAt = sim.time; // brain завершит действие на этом же шаге
      r.action.data.done = true;
    }
  }
  const startCal = calendar(sim.defs.epochMs, it.startedAt);
  const endCal = calendar(sim.defs.epochMs, sim.time);
  const meta = Object.fromEntries(it.notes.filter((n) => n.includes('=')).map((n) => n.split('=') as [string, string]));
  const [a, b] = it.members;
  if (it.kind === 'visit') {
    chronicle(sim, 'visit', [a, it.host!], it.quarrel || it.intent === 'apologize' ? 3 : 2, {
      intent: it.intent,
      minutes,
      startMin: startCal.minuteOfDay,
      endMin: endCal.minuteOfDay + (endCal.dayIndex - startCal.dayIndex) * 1440,
      dinner: it.dinner,
      quarrel: it.quarrel,
      cause: meta.cause ?? null,
      gift: meta.gift ?? null,
      music: it.notes.includes('music'),
      meal: meta.meal ?? 'ужин',
    }, it.startedAt);
  } else if ((minutes >= 6 || it.quarrel) && !it.notes.includes('help')) {
    chronicle(sim, 'chat', [a, b], it.quarrel ? 3 : minutes >= 15 ? 2 : 1, {
      place: it.place,
      minutes,
      startMin: startCal.minuteOfDay,
      endMin: endCal.minuteOfDay,
      quarrel: it.quarrel,
      cause: meta.cause ?? null,
      topic: meta.topic ?? chatTopic(sim, a, b, minutes),
    }, it.startedAt);
  }
  // кто всё записывает — после разговора достаёт блокнот (и пишет на ходу)
  for (const id of it.members) {
    const d = sim.defs.residentById.get(id);
    const r = s.residents[id];
    if (d?.mannerisms?.includes('notebook') && r && !r.away) r.gesture = { kind: 'write', until: sim.time + 150, toX: r.x };
  }
}

/** О чём был разговор (что слышно со стороны) */
function chatTopic(sim: Simulation, a: string, b: string, minutes: number): string | null {
  // давний добродушный спор
  const dispute = disputeOf(sim, a, b);
  if (dispute && sim.rng.chance(0.55)) return `снова заспорили, ${dispute}, — и разошлись, кажется, довольные друг другом`;
  for (const id of sim.rng.chance(0.5) ? [a, b] : [b, a]) {
    const d = sim.defs.residentById.get(id);
    if (!d) continue;
    const who = nameCase(d, 'nom');
    // «Если коротко…» — и дальше длинно
    if (minutes >= 12 && d.traits.tags.some((t) => /лекци/i.test(t)) && sim.rng.chance(0.4)) {
      const say = d.sayings.length ? sim.rng.pick(d.sayings) : 'Если коротко…';
      return `на простой вопрос ${who} ответил${v(d)} «${say.replace(/[.…!]+$/, '')}…» — и объяснял ещё минут двадцать, рисуя в воздухе схемы`;
    }
    if (d.traits.tags.some((t) => /политик/i.test(t)) && sim.rng.chance(0.15)) return `о политике ${who} выслушал${v(d)} всё и своё мнение навязывать не стал${v(d)}`;
  }
  return quitTopic(sim, a, b);
}

const v = (d: { gender: string }) => (d.gender === 'f' ? 'а' : '');

/** О чём двое давно и добродушно спорят (из relationships любой стороны) */
export function disputeOf(sim: Simulation, a: string, b: string): string | null {
  const da = sim.defs.residentById.get(a);
  const db = sim.defs.residentById.get(b);
  return da?.relationships.find((x) => x.with === b)?.dispute ?? db?.relationships.find((x) => x.with === a)?.dispute ?? null;
}

/** «Уже пятый год говорит, что уволится» — слышно в разговорах с соседями */
function quitTopic(sim: Simulation, a: string, b: string): string | null {
  for (const id of [a, b]) {
    const d = sim.defs.residentById.get(id);
    if (!d?.traits.tags.some((t) => /уволит/i.test(t)) || !sim.rng.chance(0.4)) continue;
    const who = nameCase(d, 'nom');
    return sim.rng.pick([
      `${who} опять сказал, что с завода уволится, «вот только премию дадут»`,
      `${who} снова собирается писать заявление — «теперь уже точно, после праздников»`,
      `${who} в который раз ругал свой станок и обещал уволиться`,
    ]);
  }
  return null;
}
