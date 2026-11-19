import { planPath } from '../../world/navigation';
import { advanceMovement } from '../movement';
import type { ActiveAction } from '../state';
import type { ActionDef, ActionPlan, AgentCtx } from './types';

const REEVAL_EVERY = 10 * 60; // игровых секунд

export interface ScoredPlan {
  def: ActionDef;
  plan: ActionPlan;
}

export function evaluate(ctx: AgentCtx, actions: readonly ActionDef[]): ScoredPlan[] {
  const out: ScoredPlan[] = [];
  const sick = !!(ctx.r.sick && ctx.r.sick.until > ctx.now);
  const L = ctx.sim.defs.layout;
  for (const def of actions) {
    const plan = def.plan(ctx);
    if (!plan || !(plan.score > 0) || !Number.isFinite(plan.score)) continue;
    // больные не выходят из дома
    if (sick && (plan.target.away || (plan.target.level === 0 && plan.target.x >= L.buildingX1))) continue;
    out.push({ def, plan });
  }
  out.sort((a, b) => b.plan.score - a.plan.score || (a.def.id < b.def.id ? -1 : 1));
  return out;
}

/** Взвешенный выбор среди лучших вариантов: разумно, но не механически. */
export function pickPlan(ctx: AgentCtx, scored: ScoredPlan[]): ScoredPlan | undefined {
  if (scored.length === 0) return undefined;
  const best = scored[0].plan.score;
  const top = scored.filter((s) => s.plan.score >= best * 0.72).slice(0, 4);
  return ctx.sim.rng.weighted(top, (s) => s.plan.score * s.plan.score);
}

export function startAction(ctx: AgentCtx, def: ActionDef, plan: ActionPlan): void {
  const { r, sim, now } = ctx;
  const a: ActiveAction = {
    id: def.id,
    label: plan.label,
    phase: 'travel',
    target: plan.target,
    startedAt: now,
    performStart: 0,
    endsAt: 0,
    interruptible: plan.interruptible ?? true,
    lastEval: now,
    data: { ...(plan.data ?? {}), score: plan.score, duration: plan.duration },
  };
  r.action = a;
  if (plan.target.slot) sim.reserveSlot(plan.target.slot, r.id);
  // пересчитать маршрут из текущей точки
  r.path = planPath(sim.defs.layout, r, plan.target, {
    elevatorFrom: sim.elevatorThreshold(ctx.def, r),
    via: plan.via,
    returnVia: r.via,
  });
  if (r.away && !plan.target.away) r.via = 'walk';
  if (plan.target.away && plan.via) r.via = plan.via;
  def.onStart?.(ctx, a);
  r.pose = 'stand';
  r.front = false;
  sim.emit({ type: 'action.start', t: now, residentId: r.id, actionId: def.id, label: plan.label });
}

export function endAction(ctx: AgentCtx, interrupted: boolean): void {
  const { r, sim } = ctx;
  const a = r.action;
  if (!a) return;
  const def = sim.actionById.get(a.id);
  def?.onEnd?.(ctx, a, interrupted);
  if (a.target.slot) sim.releaseSlot(a.target.slot, r.id);
  r.recent[a.id] = ctx.now;
  sim.emit({ type: 'action.end', t: ctx.now, residentId: r.id, actionId: a.id, interrupted });
  r.action = null;
  if (r.pose !== 'stand') {
    r.pose = 'stand';
    if (!r.away) r.y = sim.defs.layout.floorY(r.level);
  }
  r.front = false;
  r.bubble = null;
}

function arrive(ctx: AgentCtx, a: ActiveAction, def: ActionDef): boolean {
  const { r, sim, now } = ctx;
  if (def.onArrive && def.onArrive(ctx, a) === false) return false;
  a.phase = 'perform';
  a.performStart = now;
  a.endsAt = now + Number(a.data.duration ?? 600);
  const slot = a.target.slot ? sim.slotIndex.get(a.target.slot) : undefined;
  if (slot) {
    r.x = slot.x;
    r.y = sim.defs.layout.floorY(r.level) - slot.dy;
    r.pose = slot.pose;
    r.front = slot.face === 0 && slot.pose !== 'lie';
    if (slot.face !== 0) r.facing = slot.face;
  }
  if (def.icon) r.bubble = { icon: def.icon, until: a.endsAt };
  return true;
}

export function updateAgent(ctx: AgentCtx, dt: number): void {
  const { r, sim, now } = ctx;
  if (!r.action) {
    const choice = pickPlan(ctx, evaluate(ctx, sim.actions));
    if (!choice) return;
    startAction(ctx, choice.def, choice.plan);
  }
  const a = r.action!;
  const def = sim.actionById.get(a.id);
  if (!def) {
    endAction(ctx, true);
    return;
  }

  if (a.phase === 'travel') {
    // остановился по дороге: одевается в прихожей, машет на прощание
    if (Number(a.data.pauseUntil ?? 0) > now) return;
    const done = advanceMovement(sim, r, dt);
    if (done) {
      if (!arrive(ctx, a, def)) endAction(ctx, true);
    }
    return;
  }

  // выполнение
  def.perform?.(ctx, a, dt);
  if (r.action !== a) return; // perform мог сам завершить/заменить действие
  const ended = def.shouldEnd ? def.shouldEnd(ctx, a) : now >= a.endsAt;
  if (ended) {
    endAction(ctx, false);
    return;
  }

  // периодическая переоценка
  if (a.interruptible && now - a.lastEval >= REEVAL_EVERY) {
    a.lastEval = now;
    const cont = def.continueScore ? def.continueScore(ctx, a) : Number(a.data.score ?? 1);
    const alts = evaluate(ctx, sim.actions).filter((s) => s.def.id !== a.id);
    const best = alts[0];
    if (best && best.plan.score > cont * 1.3 + 1) {
      endAction(ctx, true);
      startAction(ctx, best.def, best.plan);
    }
  }
}
