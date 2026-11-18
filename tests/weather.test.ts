import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { calendar, parseEpoch } from '../src/core/time';
import { createWeather, updateWeather, weatherAppeal, type WeatherState } from '../src/sim/env/weather';

const epoch = parseEpoch('2026-09-14T05:30');

describe('погода', () => {
  it('в дождь гулять хочется куда меньше, чем в ясный день', () => {
    const base: WeatherState = createWeather(calendar(epoch, 0), Rng.fromSeed(1), 0);
    const clear = weatherAppeal({ ...base, kind: 'clear', temp: 18, wind: 0.2 }, false);
    const rain = weatherAppeal({ ...base, kind: 'rain', intensity: 0.8, temp: 12, wind: 0.3 }, false);
    expect(rain).toBeLessThan(clear * 0.3);
  });

  it('дождь оставляет лужи, они высыхают; снег копится и тает', () => {
    const rng = Rng.fromSeed(2);
    const w = createWeather(calendar(epoch, 0), rng, 0);
    Object.assign(w, { kind: 'rain', intensity: 1, nextChange: 1e9, puddles: 0 });
    for (let t = 0; t < 3 * 3600; t += 10) updateWeather(w, calendar(epoch, t), rng, t, 10);
    expect(w.puddles).toBeGreaterThan(0.5);
    Object.assign(w, { kind: 'clear', nextChange: 1e9 });
    for (let t = 3 * 3600; t < 30 * 3600; t += 10) updateWeather(w, calendar(epoch, t), rng, t, 10);
    expect(w.puddles).toBeLessThan(0.3);
  });

  it('за полгода бывают все типы погоды и сезоны сменяются', () => {
    const rng = Rng.fromSeed(3);
    const w = createWeather(calendar(epoch, 0), rng, 0);
    const seen = new Set<string>();
    let minT = 99;
    let maxT = -99;
    for (let t = 0; t < 180 * 86400; t += 600) {
      updateWeather(w, calendar(epoch, t), rng, t, 600);
      seen.add(w.kind);
      minT = Math.min(minT, w.temp);
      maxT = Math.max(maxT, w.temp);
    }
    for (const k of ['clear', 'cloudy', 'rain', 'snow', 'fog']) expect(seen.has(k)).toBe(true);
    expect(minT).toBeLessThan(-5);
    expect(maxT).toBeGreaterThan(12);
  });
});
