/**
 * Игровой календарь. Время мира — целые игровые секунды от `epoch`
 * (дата старта из data/world.json, трактуется как «местное» время, считаем в UTC).
 */
export const MINUTE = 60;
export const HOUR = 3600;
export const DAY = 86400;

export interface CalendarInfo {
  year: number;
  month: number; // 1..12
  day: number; // 1..31
  weekday: number; // 1=пн … 7=вс
  hour: number;
  minute: number;
  /** минуты от полуночи, дробные */
  minuteOfDay: number;
  /** часы от полуночи, дробные */
  hourOfDay: number;
  /** номер дня от полуночи даты старта */
  dayIndex: number;
  dayOfYear: number; // 0..365
}

export function parseEpoch(startDate: string): number {
  // "2026-09-01T06:00" → мс UTC
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(startDate);
  if (!m) throw new Error(`Bad startDate: ${startDate}`);
  return Date.UTC(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);
}

/** Начало суток даты старта (мс) */
function epochMidnight(epochMs: number): number {
  return epochMs - (epochMs % (DAY * 1000));
}

export function calendar(epochMs: number, t: number): CalendarInfo {
  const ms = epochMs + t * 1000;
  const d = new Date(ms);
  const year = d.getUTCFullYear();
  const jsDay = d.getUTCDay();
  const startOfYear = Date.UTC(year, 0, 1);
  const secOfDay = (ms / 1000) % DAY;
  return {
    year,
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    weekday: jsDay === 0 ? 7 : jsDay,
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    minuteOfDay: secOfDay / 60,
    hourOfDay: secOfDay / 3600,
    dayIndex: Math.floor((ms - epochMidnight(epochMs)) / (DAY * 1000)),
    dayOfYear: Math.floor((ms - startOfYear) / (DAY * 1000)),
  };
}

/** Игровое время (сек) начала суток с номером dayIndex */
export function dayStartTime(epochMs: number, dayIndex: number): number {
  return (epochMidnight(epochMs) - epochMs) / 1000 + dayIndex * DAY;
}

export function hhmm(minuteOfDay: number): string {
  const m = Math.floor(minuteOfDay) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** "08:30" → 510 минут */
export function parseHHMM(s: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) throw new Error(`Bad time: ${s}`);
  return +m[1] * 60 + +m[2];
}

const MONTHS_GEN = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];
const MONTHS_NOM = [
  'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
];
const WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
const WEEKDAYS_FULL = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];

export function formatDate(c: CalendarInfo): string {
  return `${c.day} ${MONTHS_GEN[c.month - 1]}, ${WEEKDAYS[c.weekday - 1]}`;
}
export function formatDateLong(c: CalendarInfo): string {
  return `${WEEKDAYS_FULL[c.weekday - 1]}, ${c.day} ${MONTHS_GEN[c.month - 1]} ${c.year}`;
}
export function monthName(m: number): string {
  return MONTHS_NOM[m - 1];
}

/** Попадает ли минута суток в интервал [start, end) с переходом через полночь */
export function inDailyWindow(minute: number, start: number, end: number): boolean {
  if (start <= end) return minute >= start && minute < end;
  return minute >= start || minute < end;
}

/** Сколько минут от a до b вперёд по кругу суток */
export function minutesUntil(from: number, to: number): number {
  return (((to - from) % 1440) + 1440) % 1440;
}
