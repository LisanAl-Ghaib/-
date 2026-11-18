import { mix } from '../core/math';
import { overcastOf, seasonOf } from '../sim/env/weather';
import type { Simulation } from '../sim/simulation';
import { DEFAULT_LOOK, type OutdoorLook } from './outdoor';
import type { Environment } from './renderer';

const SPRING_BUDS = ['#a8d880', '#b8e08a', '#94cc6c'];
const MAY = ['#7cc45e', '#8fd06a', '#6ab452', '#a8dc80'];
const SEPT = ['#6aa04a', '#a8b048', '#d4b040', '#5f9e52'];
const OCT = ['#e0a030', '#d07028', '#c04a28', '#e8c040'];
const NOV = ['#a07038', '#8a5a30', '#b08040'];

/** Как выглядит улица в этот день: листва, трава, снег, лужи */
export function seasonLook(sim: Simulation): OutdoorLook {
  const c = sim.calendar();
  const w = sim.weather;
  const t = (c.day - 1) / 30; // доля месяца
  let foliage: string[] = [];
  let leafAmount = 0;
  let blossom = 0;
  let grass = DEFAULT_LOOK.grass;
  switch (c.month) {
    case 12:
    case 1:
    case 2:
      grass = '#8a8a6a';
      break;
    case 3:
      grass = '#8a8a5a';
      break;
    case 4:
      foliage = SPRING_BUDS;
      leafAmount = 0.1 + 0.45 * t;
      grass = '#7aa850';
      break;
    case 5:
      foliage = MAY;
      leafAmount = 0.6 + 0.4 * t;
      blossom = Math.max(0, 1 - t * 1.6);
      grass = '#6fae4a';
      break;
    case 6:
    case 7:
    case 8:
      foliage = DEFAULT_LOOK.foliage;
      leafAmount = 1;
      grass = c.month === 8 ? '#7a9a48' : DEFAULT_LOOK.grass;
      break;
    case 9:
      foliage = t < 0.5 ? [...DEFAULT_LOOK.foliage.slice(0, 3), SEPT[2]] : SEPT;
      leafAmount = 0.98;
      grass = '#7a9a48';
      break;
    case 10:
      foliage = OCT;
      leafAmount = 0.85 - 0.5 * t;
      grass = mix('#8a9a4a', '#9a8a50', t);
      break;
    case 11:
      foliage = NOV;
      leafAmount = Math.max(0, 0.3 - 0.35 * t);
      grass = '#8a8458';
      break;
  }
  return { foliage, leafAmount, blossom, grass, snow: w.snowCover, puddles: w.puddles, wind: w.wind };
}

export function computeEnvironment(sim: Simulation): Environment {
  const w = sim.weather;
  return {
    overcast: overcastOf(w),
    rain: w.kind === 'rain' ? 0.25 + 0.75 * w.intensity : 0,
    snow: w.kind === 'snow' ? 0.25 + 0.75 * w.intensity : 0,
    fog: w.kind === 'fog' ? w.intensity : 0,
    wind: w.wind,
    look: seasonLook(sim),
    coats: w.temp < 10,
  };
}

export function isAutumnLeafFall(sim: Simulation): boolean {
  const c = sim.calendar();
  return seasonOf(c.month) === 'autumn' && c.month >= 9 && c.month <= 11;
}
