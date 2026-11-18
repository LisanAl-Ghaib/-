import { nameCase } from '../../chronicle/russian';
import { chronicle } from '../../chronicle/chronicle';
import { addMoodlet } from '../../needs';
import { endInteraction, findInteraction, startVisit } from '../../social/interactions';
import { rel } from '../../social/relations';
import { APOLOGY_GIFTS, CARE_GIFTS, GIFTS, reconcile, warmth } from '../../social/social';
import type { ResidentDef } from '../../../data/schemas';
import { daytime, minutesToBed, minutesToLeave, novelty, sleepTime, urgency } from '../helpers';
import type { ActionDef, AgentCtx } from '../types';

const SOCIABILITY = { homebody: 0.45, balanced: 1, outgoing: 1.6 } as const;
const INTENT_BONUS: Record<string, number> = { congratulate: 9, care: 7, apologize: 6, treat: 5.5 };

/** Дома ли сосед и может ли открыть дверь */
export function hostAvailable(ctx: AgentCtx, host: string): boolean {
  const { sim } = ctx;
  const rh = sim.state.residents[host];
  if (!rh || rh.away || rh.interaction !== null) return false;
  const hdef = sim.defs.residentById.get(host)!;
  const apt = sim.defs.layout.aptById.get(hdef.apartment)!;
  if (rh.level !== apt.level || rh.x < apt.x0 || rh.x >= apt.x1) return false;
  const a = rh.action;
  if (a && (a.id === 'sleep' || a.id === 'nap' || a.id === 'wash') && a.phase === 'perform') return false;
  return true;
}

/** Со стороны видно только, к кому идёт и несёт ли что-то в руках */
function intentLabel(kind: string, h: ResidentDef): string {
  if (kind === 'congratulate' || kind === 'care' || kind === 'treat' || kind === 'apologize') return `несёт что-то ${nameCase(h, 'dat')}`;
  return `идёт к ${nameCase(h, 'dat')}`;
}

/** Зайти к соседу */
export const visit: ActionDef = {
  id: 'visit',
  icon: 'talk',
  plan(ctx) {
    const { r, def, sim } = ctx;
    if (sleepTime(ctx) || !daytime(ctx, 10, 21.5) || minutesToLeave(ctx) < 120 || minutesToBed(ctx) < 60) return null;
    if (r.sick && r.sick.until > ctx.now) return null;
    if (r.interaction !== null) return null;
    r.intents = r.intents.filter((i) => i.until > ctx.now);
    const want = (urgency(r.needs.social, 85) + 1.2) * SOCIABILITY[def.traits.sociability];
    const nov = novelty(ctx, 'visit', 14 * 3600);
    let best: { host: string; score: number; intent: string } | null = null;
    for (const other of sim.defs.residents) {
      if (other.id === r.id || other.apartment === def.apartment) continue;
      // «дома стараются быть только вдвоём» — в гости к ним не ходят
      if (other.traits.tags.some((t) => /только вдвоём/i.test(t))) continue;
      let intent = r.intents.find((i) => i.target === other.id);
      // уже помирились — извиняться не нужно
      if (intent?.kind === 'apologize' && !rel(sim, r.id, other.id).conflict) {
        r.intents = r.intents.filter((i) => i !== intent);
        intent = undefined;
      }
      let score: number;
      if (intent) score = INTENT_BONUS[intent.kind] ?? 4;
      else {
        const w = warmth(sim, r.id, other.id);
        if (w <= 0.05) continue;
        score = want * w * nov;
      }
      // примерно знает, дома ли сосед (окна горят, слышно)
      score *= hostAvailable(ctx, other.id) ? 1 : 0.25;
      score *= sim.rng.range(0.85, 1.15);
      if (!best || score > best.score) best = { host: other.id, score, intent: intent?.kind ?? 'chat' };
    }
    if (!best) return null;
    const hdef = sim.defs.residentById.get(best.host)!;
    const apt = sim.defs.layout.aptById.get(hdef.apartment)!;
    return {
      score: best.score,
      target: { level: apt.level, x: apt.landingX },
      duration: 75,
      label: intentLabel(best.intent, hdef),
      data: { host: best.host, intent: best.intent },
    };
  },
  onArrive(ctx, a) {
    a.label = 'стучит в дверь';
    ctx.r.front = false;
    const host = String(a.data.host);
    const hdef = ctx.sim.defs.residentById.get(host)!;
    const apt = ctx.sim.defs.layout.aptById.get(hdef.apartment)!;
    ctx.r.facing = apt.doorX > ctx.r.x ? 1 : -1;
    return true;
  },
  perform(ctx, a) {
    if (ctx.now < a.endsAt || a.data.resolved) return;
    a.data.resolved = true;
    resolveVisit(ctx, String(a.data.host), String(a.data.intent));
  },
};

function resolveVisit(ctx: AgentCtx, host: string, intent: string): void {
  const { sim, r } = ctx;
  const hdef = sim.defs.residentById.get(host)!;
  r.intents = r.intents.filter((i) => !(i.target === host && i.kind === intent));
  if (!hostAvailable(ctx, host)) {
    if (sim.rng.chance(intent === 'chat' ? 0.4 : 0.9)) chronicle(sim, 'visit.nobody', [r.id, host], 1);
    if (intent !== 'chat') r.intents.push({ target: host, kind: intent, until: ctx.now + 20 * 3600 });
    return;
  }
  const rh = sim.state.residents[host];
  const hostRel = rel(sim, host, r.id);
  const hour = ctx.cal.hourOfDay;
  let p = 0.6 + hostRel.affinity / 220 + (100 - rh.needs.social) / 320 + (rh.needs.mood - 50) / 260 - (hour >= 21 ? 0.2 : 0);
  if (intent === 'congratulate' || intent === 'care' || intent === 'treat') p += 0.3;
  if (intent === 'apologize') {
    const days = hostRel.conflict ? (ctx.now - hostRel.conflict.since) / 86400 : 1;
    const temper = { calm: 0.15, even: 0, hot: -0.12 }[hdef.traits.temper];
    p = 0.4 + days * 0.18 + temper + hostRel.affinity / 300 + (rh.needs.mood - 50) / 250;
    if (!sim.rng.chance(p)) {
      chronicle(sim, 'visit.unforgiven', [r.id, host], 2);
      addMoodlet(ctx, `rejected:${host}`, 'Не удалось помириться', -5, 8);
      return;
    }
    reconcile(sim, r.id, host);
    const gift = sim.rng.pick(APOLOGY_GIFTS);
    startVisit(sim, r.id, host, intent, { gift });
    return;
  }
  if (hostRel.conflict) p -= 0.5;
  if (!sim.rng.chance(Math.max(0.05, Math.min(0.97, p)))) {
    chronicle(sim, 'visit.refused', [r.id, host], 1);
    addMoodlet(ctx, `refused:${host}`, 'Не пустили в гости', -3, 4);
    return;
  }
  const meta: Record<string, string> = {};
  if (intent === 'congratulate') meta.gift = sim.rng.pick(GIFTS);
  if (intent === 'care') meta.gift = sim.rng.pick(CARE_GIFTS);
  if (intent === 'treat') meta.gift = sim.rng.pick(['кусок пирога', 'тарелку пирожков', 'полпирога ещё тёплым']);
  startVisit(sim, r.id, host, intent, meta);
}

/** Принимает гостя (назначается только взаимодействием) */
export const host: ActionDef = {
  id: 'host',
  icon: 'talk',
  plan: () => null,
  shouldEnd(ctx, a) {
    return !!a.data.done || !findInteraction(ctx.sim, Number(a.data.interaction));
  },
  onEnd(ctx, a, interrupted) {
    const it = findInteraction(ctx.sim, Number(a.data.interaction));
    if (it && interrupted) endInteraction(ctx.sim, it);
  },
};

/** В гостях (назначается только взаимодействием) */
export const guest: ActionDef = { ...host, id: 'guest' };

/** Болтает с соседом там, где встретились */
export const chat: ActionDef = {
  ...host,
  id: 'chat',
  onArrive(ctx, a) {
    const p = ctx.sim.state.residents[String(a.data.partner)];
    if (p) ctx.r.facing = p.x >= ctx.r.x ? 1 : -1;
    return true;
  },
};
