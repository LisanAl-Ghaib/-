/** Автобус ходит каждые 15 игровых минут и стоит на остановке полторы минуты. */
export const BUS_INTERVAL = 15 * 60;
export const BUS_STAND = 90;

export function busAtStop(time: number): boolean {
  return ((time % BUS_INTERVAL) + BUS_INTERVAL) % BUS_INTERVAL < BUS_STAND;
}

/** 0..1 — фаза подъезда/отъезда автобуса (для анимации), null — автобуса не видно */
export function busPhase(time: number): number | null {
  const m = ((time % BUS_INTERVAL) + BUS_INTERVAL) % BUS_INTERVAL;
  const approach = 40;
  if (m < BUS_STAND) return 0.5;
  if (m < BUS_STAND + approach) return 0.5 + (0.5 * (m - BUS_STAND)) / approach;
  if (m > BUS_INTERVAL - approach) return (0.5 * (m - (BUS_INTERVAL - approach))) / approach;
  return null;
}
