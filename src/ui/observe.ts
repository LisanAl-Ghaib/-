import type { ResidentState } from '../sim/state';

/**
 * Что видно со стороны. Жилец «за кадром» (на работе, в магазине, у друзей) —
 * для наблюдателя просто «нет дома»; уходящий — «уходит из дома» или «идёт к остановке».
 * О причинах пользователь догадывается сам: по времени, по пакетам в руках, по привычкам.
 */
export function observedLabel(r: ResidentState | undefined): string {
  if (!r) return '';
  if (r.away) return 'нет дома';
  const a = r.action;
  if (!a) return 'стоит, задумавшись';
  if (a.target.away && a.phase === 'travel') {
    if (r.path.some((s) => s.k === 'bus')) return r.path[0]?.k === 'bus' ? 'ждёт автобус' : 'идёт к остановке';
    return 'уходит из дома';
  }
  return a.label;
}
