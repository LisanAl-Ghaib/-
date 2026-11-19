import { describe, expect, it } from 'vitest';
import { buildDefs } from '../src/data/defs';
import { loadRawDataNode } from '../src/data/loadNode';
import { MANNERISMS, type ResidentDef } from '../src/data/schemas';
import { LIBRARY, sceneFor } from '../src/render/anim/library';
import { personalOf, SWAPPABLE } from '../src/render/anim/personal';
import type { Gesture, Orient } from '../src/render/anim/types';
import { animatePose, mergedBeats, SIT_FRAMES, STAND_FRAMES } from '../src/render/animation';
import { ACTIONS } from '../src/sim/ai/actions';
import type { ResidentState } from '../src/sim/state';

const SIT_G: Gesture[] = ['rest', 'slouch', 'hands', 'handUp', 'cross'];
const STAND_G: Gesture[] = ['stand', 'work', 'workUp', 'phoneStand', 'talk', 'wave'];
const COUPLE_KINDS = ['walk', 'film', 'chess', 'help_cook', 'intimacy', 'gift', 'talk'];

function allResidents(): ResidentDef[] {
  const real = buildDefs(loadRawDataNode('data')).defs!.residents;
  const fx = buildDefs(loadRawDataNode('tests/fixtures/data', 'data')).defs!.residents;
  return [...real, ...fx];
}

describe('базовая библиотека анимаций', () => {
  it('у каждого действия жильца есть базовая сцена', () => {
    const missing: string[] = [];
    for (const a of ACTIONS) {
      if (a.id === 'together') {
        for (const k of COUPLE_KINDS) if (!LIBRARY[`together:${k}`]) missing.push(`together:${k}`);
      } else if (!LIBRARY[a.id]) missing.push(a.id);
    }
    expect(missing).toEqual([]);
  });

  it('каждая сцена описана и собрана из допустимых для позы жестов', () => {
    for (const [id, act] of Object.entries(LIBRARY)) {
      for (const [place, s] of Object.entries(act)) {
        expect(s!.note.length, `${id}@${place}`).toBeGreaterThan(2);
        expect(!!s!.script || (s!.beats?.length ?? 0) > 0, `${id}@${place}: ни тактов, ни сценария`).toBe(true);
        const ok = s!.posture === 'sit' ? SIT_G : STAND_G;
        for (const b of s!.beats ?? []) {
          expect(ok, `${id}@${place}: ${b.g}`).toContain(b.g);
          if (b.alt) expect(ok, `${id}@${place}: ${b.alt.g}`).toContain(b.alt.g);
        }
      }
    }
  });

  it('место выбирается по позе: читать в кровати — лёжа, в кресле — сидя', () => {
    expect(sceneFor('read', 'bed', 'lie').posture).toBe('lie');
    expect(sceneFor('read', 'seat', 'sit')).toBe(LIBRARY.read.seat);
    expect(sceneFor('wash', 'shower', 'stand')).toBe(LIBRARY.wash.shower);
    expect(sceneFor('wash', 'basin', 'stand')).toBe(LIBRARY.wash.basin);
    // кошмар: сидит на кровати (место — кровать, поза — сидя)
    expect(sceneFor('nightmare', 'bed', 'sit').posture).toBe('sit');
    expect(sceneFor('нет-такого', undefined, 'stand').posture).toBe('stand');
  });
});

describe('личный слой только добавляет', () => {
  const residents = allResidents();

  it('базовые такты остаются у всех, добавки — той же позы и тех же ракурсов', () => {
    for (const def of residents) {
      const p = personalOf(def);
      for (const [id, act] of Object.entries(LIBRARY)) {
        for (const [place, s] of Object.entries(act)) {
          if (!s!.beats) continue;
          for (const base of ['front', 'side', 'back'] as Orient[]) {
            const merged = mergedBeats(s!, p, id, place, base);
            expect(merged.slice(0, s!.beats.length)).toEqual(s!.beats);
            const orients = new Set([s!.orient ?? base, ...s!.beats.map((b) => b.o ?? s!.orient ?? base)]);
            const ok = s!.posture === 'sit' ? SIT_G : STAND_G;
            for (const b of merged.slice(s!.beats.length)) {
              expect(ok).toContain(b.g);
              expect(orients.has(b.o ?? s!.orient ?? base)).toBe(true);
            }
          }
        }
      }
    }
  });

  it('все манеры сразу: темп в пределах, замены вещей — только на похожие', () => {
    const def = { ...residents[0], mannerisms: [...MANNERISMS] } as ResidentDef;
    const p = personalOf(def);
    expect(p.tempo).toBeGreaterThanOrEqual(0.75);
    expect(p.tempo).toBeLessThanOrEqual(1.3);
    for (const [from, to] of Object.entries(p.swaps)) expect(SWAPPABLE[from as keyof typeof SWAPPABLE]).toContain(to);
  });

  it('манеры выводятся из описания: очки, шаль, борода, вышивка', () => {
    const byId = new Map(residents.map((d) => [d.id, personalOf(d).mannerisms]));
    expect(byId.get('olga-shpak')).toEqual(expect.arrayContaining(['adjusts_glasses', 'adjusts_shawl', 'embroiders']));
    expect(byId.get('pavel-murov')).toEqual(expect.arrayContaining(['strokes_beard', 'unhurried']));
    expect(byId.get('ivan-muravyev')).toContain('fidgety');
  });

  it('поза в сцене — всегда из рамок базы (кадры позы, без чужих поз)', () => {
    const sitFrames = new Set(Object.values(SIT_FRAMES).flatMap((o) => Object.values(o)));
    const standFrames = new Set(Object.values(STAND_FRAMES).flatMap((o) => Object.values(o)));
    for (const def of residents) {
      for (const [id, place, posture] of [['read', 'seat', 'sit'], ['work', 'desk', 'sit'], ['cook', 'stove', 'stand'], ['wash_dishes', 'sink', 'stand'], ['idle', 'floor', 'stand']] as const) {
        const r = { id: def.id, x: 100, y: 100, facing: 1, front: posture === 'sit', pose: posture, path: [], interaction: null, gesture: null, action: { id, phase: 'perform', data: {}, target: { level: 1, x: 100 } } } as unknown as ResidentState;
        for (let t = 0; t < 400; t++) {
          const pose = animatePose(r, def, t * 97, t * 431, { place });
          expect((posture === 'sit' ? sitFrames : standFrames).has(pose.frame), `${def.id} ${id}: кадр ${pose.frame}`).toBe(true);
        }
      }
    }
  });
});
