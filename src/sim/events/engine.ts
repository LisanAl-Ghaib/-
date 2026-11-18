import type { EventCtx, EventDef, Trigger } from './types';
import { EVENTS } from './index';

const byTrigger = new Map<Trigger, EventDef[]>();
function list(trigger: Trigger): EventDef[] {
  let l = byTrigger.get(trigger);
  if (!l) {
    l = EVENTS.filter((e) => e.trigger === trigger);
    byTrigger.set(trigger, l);
  }
  return l;
}

/** Выбрать одно событие по весам (или ничего — с весом noneWeight) */
export function runExclusive(trigger: Trigger, ctx: EventCtx, noneWeight = 0): EventDef | null {
  const cands = list(trigger)
    .map((def) => ({ def, w: Math.max(0, def.weight?.(ctx) ?? 0) }))
    .filter((c) => c.w > 0);
  const total = cands.reduce((s, c) => s + c.w, 0) + noneWeight;
  if (total <= 0) return null;
  let r = ctx.sim.rng.next() * total;
  for (const c of cands) {
    if (r < c.w) {
      c.def.apply(ctx);
      return c.def;
    }
    r -= c.w;
  }
  return null;
}

/** Каждое событие срабатывает независимо со своей вероятностью */
export function runIndependent(trigger: Trigger, ctx: EventCtx): void {
  for (const def of list(trigger)) {
    const p = def.chance?.(ctx) ?? 0;
    if (p > 0 && ctx.sim.rng.chance(p)) def.apply(ctx);
  }
}
