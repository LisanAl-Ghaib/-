import type { ApartmentModel, RoomModel } from '../../world/layout';
import type { AgentCtx } from './types';

export function randomXInRoom(ctx: AgentCtx, room: RoomModel): number {
  return Math.round(ctx.sim.rng.range(room.x0 + 5, room.x1 - 5));
}

export function randomRoom(ctx: AgentCtx, apt: ApartmentModel, exceptIndex?: number): RoomModel {
  const rooms = apt.rooms.filter((r) => r.index !== exceptIndex && r.type !== 'bathroom');
  return ctx.sim.rng.pick(rooms.length ? rooms : apt.rooms);
}

export function isHome(ctx: AgentCtx): boolean {
  const { r, home } = ctx;
  return !r.away && r.level === home.level && r.x >= home.x0 && r.x < home.x1;
}

/** Сколько секунд прошло с последнего выполнения действия (Infinity — никогда) */
export function since(ctx: AgentCtx, actionId: string): number {
  const t = ctx.r.recent[actionId];
  return t === undefined ? Infinity : ctx.now - t;
}

/** Множитель «надоело»: только что делал — меньше хочется */
export function novelty(ctx: AgentCtx, actionId: string, cooldown: number): number {
  const s = since(ctx, actionId);
  if (s === Infinity) return 1;
  return Math.min(1, 0.25 + (0.75 * s) / cooldown);
}
