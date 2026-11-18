import { clamp } from '../../core/math';
import type { CalendarInfo } from '../../core/time';
import type { Rng } from '../../core/rng';

export type WeatherKind = 'clear' | 'cloudy' | 'rain' | 'snow' | 'fog';
export type Season = 'winter' | 'spring' | 'summer' | 'autumn';

export interface WeatherState {
  kind: WeatherKind;
  /** сила осадков/тумана 0..1 */
  intensity: number;
  /** ветер 0..1 */
  wind: number;
  windTarget: number;
  /** температура, °C */
  temp: number;
  /** устойчивое отклонение от нормы (тёплая/холодная неделя) */
  anomaly: number;
  nextChange: number;
  /** лужи 0..1 */
  puddles: number;
  /** снежный покров 0..1 */
  snowCover: number;
  /** когда выпал первый снег в этом сезоне (для хроники) */
  firstSnowYear: number;
}

export function seasonOf(month: number): Season {
  if (month === 12 || month <= 2) return 'winter';
  if (month <= 5) return 'spring';
  if (month <= 8) return 'summer';
  return 'autumn';
}

export const SEASON_NAME: Record<Season, string> = { winter: 'зима', spring: 'весна', summer: 'лето', autumn: 'осень' };
export const WEATHER_NAME: Record<WeatherKind, string> = { clear: 'ясно', cloudy: 'облачно', rain: 'дождь', snow: 'снег', fog: 'туман' };

/** Средняя температура дня (≈ средняя полоса России) */
function seasonalMean(c: CalendarInfo): number {
  return 5.5 + 13.5 * Math.sin((2 * Math.PI * (c.dayOfYear - 110)) / 365);
}

function diurnal(c: CalendarInfo, kind: WeatherKind): number {
  const amp = kind === 'clear' ? 4.5 : kind === 'fog' ? 1.5 : 2.2;
  return amp * Math.cos((2 * Math.PI * (c.hourOfDay - 15)) / 24);
}

const WEIGHTS: Record<Season, Record<WeatherKind, number>> = {
  winter: { clear: 2, cloudy: 4, rain: 0.3, snow: 3.2, fog: 0.8 },
  spring: { clear: 3.2, cloudy: 3, rain: 2, snow: 0.5, fog: 0.6 },
  summer: { clear: 5, cloudy: 2.5, rain: 1.8, snow: 0, fog: 0.2 },
  autumn: { clear: 2, cloudy: 4, rain: 3, snow: 0.4, fog: 1.4 },
};

export function createWeather(c: CalendarInfo, rng: Rng, now: number): WeatherState {
  const w: WeatherState = {
    kind: 'clear',
    intensity: 0,
    wind: 0.2,
    windTarget: 0.2,
    temp: 10,
    anomaly: rng.gauss(0, 2),
    nextChange: now,
    puddles: 0,
    snowCover: seasonOf(c.month) === 'winter' ? 0.8 : 0,
    firstSnowYear: seasonOf(c.month) === 'winter' ? c.year : -1,
  };
  rollWeather(w, c, rng, now);
  w.temp = seasonalMean(c) + diurnal(c, w.kind) + w.anomaly;
  return w;
}

function rollWeather(w: WeatherState, c: CalendarInfo, rng: Rng, now: number) {
  const season = seasonOf(c.month);
  const base = { ...WEIGHTS[season] };
  base[w.kind] *= 1.6; // погода держится
  if (c.hourOfDay >= 3 && c.hourOfDay <= 8) base.fog *= 3;
  else base.fog *= 0.4;
  const kinds = Object.keys(base) as WeatherKind[];
  let kind = rng.weighted(kinds, (k) => base[k]) ?? 'cloudy';
  // осадки по температуре
  const t = seasonalMean(c) + w.anomaly;
  if (kind === 'rain' && t < 0) kind = 'snow';
  if (kind === 'snow' && t > 3) kind = 'rain';
  w.kind = kind;
  w.intensity = kind === 'rain' || kind === 'snow' ? rng.range(0.25, 1) : kind === 'fog' ? rng.range(0.4, 1) : 0;
  const hours = kind === 'fog' ? rng.range(1.5, 4) : kind === 'rain' && season === 'summer' ? rng.range(0.7, 3) : rng.range(2.5, 9);
  w.nextChange = now + Math.round(hours * 3600);
  w.windTarget = clamp(rng.range(0.05, 0.5) + (kind === 'rain' ? rng.range(0, 0.4) : 0) + (season === 'autumn' ? 0.12 : 0), 0, 1);
  // аномалия медленно дрейфует: то оттепель, то похолодание
  w.anomaly = clamp(w.anomaly * 0.85 + rng.gauss(0, 1.6), -9, 9);
}

/** Обновить погоду на dt секунд. Возвращает true, если тип погоды сменился. */
export function updateWeather(w: WeatherState, c: CalendarInfo, rng: Rng, now: number, dt: number): boolean {
  let changed = false;
  if (now >= w.nextChange) {
    const before = w.kind;
    rollWeather(w, c, rng, now);
    changed = before !== w.kind;
  }
  const h = dt / 3600;
  // температура плавно идёт к целевой
  let target = seasonalMean(c) + diurnal(c, w.kind) + w.anomaly;
  if (w.kind === 'rain') target -= 2;
  if (w.kind === 'snow') target = Math.min(target, 0.5);
  w.temp += (target - w.temp) * Math.min(1, h * 0.8);
  // снег ↔ дождь по факту
  if (w.kind === 'rain' && w.temp < -0.5) w.kind = 'snow';
  if (w.kind === 'snow' && w.temp > 2.5) w.kind = 'rain';
  w.wind += (w.windTarget - w.wind) * Math.min(1, h * 1.5);
  // лужи и снег
  if (w.kind === 'rain') w.puddles = clamp(w.puddles + 0.35 * w.intensity * h, 0, 1);
  else w.puddles = clamp(w.puddles - (w.temp > 15 ? 0.14 : w.temp > 3 ? 0.06 : 0.02) * h, 0, 1);
  if (w.kind === 'snow' && w.temp < 1.5) w.snowCover = clamp(w.snowCover + 0.22 * w.intensity * h, 0, 1);
  else if (w.temp > 0.5) w.snowCover = clamp(w.snowCover - 0.025 * w.temp * h, 0, 1);
  return changed;
}

/** Облачность для неба 0..1 */
export function overcastOf(w: WeatherState): number {
  switch (w.kind) {
    case 'clear':
      return 0.1;
    case 'cloudy':
      return 0.65;
    case 'fog':
      return 0.55;
    case 'rain':
      return 0.75 + 0.2 * w.intensity;
    case 'snow':
      return 0.7 + 0.2 * w.intensity;
  }
}

/** Насколько погода располагает к прогулке 0..1 */
export function weatherAppeal(w: WeatherState, cheerful: boolean): number {
  let k = 1;
  switch (w.kind) {
    case 'cloudy':
      k = 0.85;
      break;
    case 'fog':
      k = 0.6;
      break;
    case 'rain':
      k = 0.22 - 0.14 * w.intensity;
      break;
    case 'snow':
      k = cheerful ? 0.75 : 0.45;
      break;
  }
  if (w.wind > 0.65) k *= 0.6;
  if (w.temp < -15) k *= 0.3;
  else if (w.temp < -5) k *= 0.7;
  if (w.temp > 30) k *= 0.6;
  if (w.kind === 'clear' && w.temp >= 15 && w.temp <= 27) k *= 1.2;
  return clamp(k, 0, 1.2);
}

export function windMs(w: WeatherState): number {
  return Math.round(w.wind * 14);
}
