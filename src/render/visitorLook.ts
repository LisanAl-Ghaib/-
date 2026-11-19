import { hashString } from '../core/rng';
import type { ContactDef, ResidentDef } from '../data/schemas';

type Appearance = ResidentDef['appearance'];

/** Облик гостя «из города»: похож на хозяина (родня), остальное — от хеша */
export function visitorAppearance(owner: ResidentDef, c: ContactDef, key: string): Appearance {
  const h = hashString(key);
  const pick = <T,>(arr: readonly T[], k = 0) => arr[(h >>> k) % arr.length];
  const family = ['child', 'parent', 'sibling', 'grandchild', 'relative'].includes(c.kind);
  const age = c.age ?? 40;
  const hairColors = ['#3a2a20', '#5a3a24', '#7a4a2a', '#2a2420', '#8a6a4a', '#a8743a'];
  const hair = age >= 62 ? '#c4beb6' : pick(hairColors, 3);
  const tops = ['#3f6e9e', '#8a3a4a', '#4a6a4a', '#7a5a8a', '#c07a3a', '#3a4a5a'];
  const f = c.gender === 'f';
  return {
    skin: family ? owner.appearance.skin : pick(['#eac1a0', '#f0cfb4', '#e3b896', '#d8a880'], 5),
    hair: { style: f ? pick(['bob', 'long', 'ponytail', 'short', 'bun'] as const, 7) : pick(['short', 'buzz', 'balding'] as const, 7), color: hair },
    height: f ? pick(['short', 'average', 'average'] as const, 9) : pick(['average', 'tall'] as const, 9),
    build: pick(['slim', 'average', 'average', 'heavy'] as const, 11),
    outfit: { top: pick(tops, 13), bottom: pick(['#2d2f3d', '#3a3540', '#4a4a52', '#5a4a3a'], 15), shoes: '#3a2a20', style: f ? pick(['casual', 'dress'] as const, 17) : 'casual', coat: pick(['#4a4246', '#3b3f46', '#6d6152', '#7a2f3a'], 19), pattern: 'plain', variants: [], variantChance: 0 },
    accessories: f ? (h % 3 === 0 ? ['earrings'] : h % 3 === 1 ? ['glasses'] : []) : h % 2 ? ['stubble'] : [],
  };
}

/** Какой вариант одежды сегодня (−1 — основной). Косметика: от id и дня, без RNG симуляции */
export function outfitOfDay(def: ResidentDef, day: number): number {
  const v = def.appearance.outfit.variants;
  if (!v.length || day < 0) return -1;
  const h = hashString(`${def.id}:${day}`);
  if ((h % 1000) / 1000 >= def.appearance.outfit.variantChance) return -1;
  return (h >>> 10) % v.length;
}

export function withOutfitVariant(app: ResidentDef['appearance'], i: number): ResidentDef['appearance'] {
  const v = app.outfit.variants[i];
  return {
    ...app,
    outfit: { ...app.outfit, top: v.top, style: v.style ?? app.outfit.style, tie: v.tie ?? app.outfit.tie, pattern: 'plain' },
    accessories: [...app.accessories, ...v.accessories],
  };
}

/** Уличная одежда поверх домашней */
export function withStreet(app: ResidentDef['appearance']): ResidentDef['appearance'] {
  const st = app.street;
  if (!st) return app;
  return {
    ...app,
    outfit: { ...app.outfit, top: st.top ?? app.outfit.top, bottom: st.bottom ?? app.outfit.bottom, shoes: st.shoes ?? app.outfit.shoes },
    accessories: [...app.accessories, ...st.accessories],
  };
}

/** «Ночью всегда в наушниках» — с 22 до 6, пока не спит */
export function nightHeadphones(def: ResidentDef, r: { action: { id: string; phase: string } | null; pose: string }, hour: number): boolean {
  if (!(hour >= 22 || hour < 6)) return false;
  if (r.pose === 'lie' || (r.action?.id === 'sleep' && r.action.phase === 'perform')) return false;
  return def.traits.tags.some((t) => /ночью .*наушник|в наушниках ночью/i.test(t));
}
