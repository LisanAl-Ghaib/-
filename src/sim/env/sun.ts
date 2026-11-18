import { smoothstep } from '../../core/math';
import type { CalendarInfo } from '../../core/time';

/** Широта города (≈ Москва) — длинные летние дни и короткие зимние. */
const LAT = (55.7 * Math.PI) / 180;

/** Высота солнца над горизонтом, градусы */
export function sunAltitude(c: CalendarInfo): number {
  const decl = ((23.44 * Math.PI) / 180) * Math.sin((2 * Math.PI * (284 + c.dayOfYear + 1)) / 365);
  const hourAngle = ((c.hourOfDay - 12.5) * 15 * Math.PI) / 180; // местный полдень ~12:30
  const sinAlt = Math.sin(LAT) * Math.sin(decl) + Math.cos(LAT) * Math.cos(decl) * Math.cos(hourAngle);
  return (Math.asin(sinAlt) * 180) / Math.PI;
}

/** Уровень дневного света 0 (ночь) … 1 (день), с сумерками */
export function daylight(c: CalendarInfo): number {
  return smoothstep(-7, 8, sunAltitude(c));
}

/** Положение солнца по дуге: 0 — восход (слева), 1 — закат (справа) */
export function sunArc(c: CalendarInfo): number {
  return (c.hourOfDay - 4) / 17;
}
