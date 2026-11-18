import { hashString } from '../core/rng';
import type { ResidentDef } from '../data/schemas';
import type { ResidentState } from '../sim/state';
import { FRAME } from './sprites/character';

/**
 * Мини-анимации занятий. Чисто косметика рендера (симуляцию не трогает):
 * за долгим занятием человек меняет позу каждые несколько минут, берёт в руки
 * чашку или телефон, перелистывает книгу, печатает, мешает в кастрюле.
 */
export type PropKind =
  | 'phone' | 'cup' | 'book' | 'remote' | 'fork' | 'pen' | 'knitting' | 'guitar'
  | 'spoon' | 'rag' | 'can' | 'sponge' | 'paper';

/** где реквизит: в руках перед собой, у уха, у рта, в вытянутой руке, в поднятой руке, в опущенной */
export type PropAt = 'hands' | 'ear' | 'mouth' | 'fwd' | 'up' | 'low';

export interface Pose {
  frame: number;
  prop?: { kind: PropKind; at: PropAt };
  /** перевернуться во сне */
  turn?: boolean;
  /** подпрыгивание (спорт) */
  bob?: number;
}

interface Variant {
  front?: number;
  side?: number;
  prop?: { kind: PropKind; at: PropAt };
  /** чередовать с этим кадром (печатает, мешает, жестикулирует) */
  alt?: { front?: number; side?: number; ms: number };
}

const SEG_MIN = 6; // поза меняется каждые ~6 игровых минут (≈ 6 секунд на ×1)

function mixHash(a: number, b: number): number {
  let h = (a ^ Math.imul(b + 0x9e3779b9, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

const SIT_IDLE: Variant[] = [
  { front: FRAME.frontSit, side: FRAME.sit },
  { front: FRAME.frontSitSlouch, side: FRAME.sitLean },
  { front: FRAME.frontSitHandUp, side: FRAME.sitArmUp, prop: { kind: 'cup', at: 'mouth' } },
  { front: FRAME.frontSitHands, side: FRAME.sitArm, prop: { kind: 'phone', at: 'hands' } },
];

const BY_ACTION: Record<string, Variant[]> = {
  watch_tv: [
    { front: FRAME.frontSit, side: FRAME.sit, prop: { kind: 'remote', at: 'low' } },
    { front: FRAME.frontSitSlouch, side: FRAME.sitLean },
    { front: FRAME.frontSitHandUp, side: FRAME.sitArmUp, prop: { kind: 'cup', at: 'mouth' } },
    { front: FRAME.frontSitHands, side: FRAME.sitArm, prop: { kind: 'phone', at: 'hands' } },
    { front: FRAME.frontSitSlouch, side: FRAME.sitLean, prop: { kind: 'remote', at: 'low' } },
  ],
  read: [
    { front: FRAME.frontSitHands, side: FRAME.sitArm, prop: { kind: 'book', at: 'hands' } },
    { front: FRAME.frontSitHands, side: FRAME.sitArm, prop: { kind: 'book', at: 'hands' } },
    { front: FRAME.frontSitSlouch, side: FRAME.sitLean, prop: { kind: 'book', at: 'low' } },
    { front: FRAME.frontSitHandUp, side: FRAME.sitArmUp, prop: { kind: 'cup', at: 'mouth' } },
  ],
  work: [
    { side: FRAME.sitArm, front: FRAME.frontSitHands, alt: { side: FRAME.sit, front: FRAME.frontSit, ms: 260 } },
    { side: FRAME.sitArm, front: FRAME.frontSitHands, alt: { side: FRAME.sit, front: FRAME.frontSit, ms: 300 } },
    { side: FRAME.sitLean, front: FRAME.frontSitSlouch },
    { side: FRAME.sitArmUp, front: FRAME.frontSitHandUp, prop: { kind: 'cup', at: 'mouth' } },
    { side: FRAME.sitArmUp, front: FRAME.frontSitHandUp, prop: { kind: 'phone', at: 'ear' } },
    { side: FRAME.sit, front: FRAME.frontSitHands, prop: { kind: 'phone', at: 'hands' } },
  ],
  gaming: [
    { side: FRAME.sitArm, front: FRAME.frontSitHands, alt: { side: FRAME.sit, ms: 160 } },
    { side: FRAME.sitArm, front: FRAME.frontSitHands, alt: { side: FRAME.sitLean, ms: 220 } },
    { side: FRAME.sitLean, front: FRAME.frontSitSlouch },
    { side: FRAME.sitArmUp, front: FRAME.frontSitHandUp, prop: { kind: 'cup', at: 'mouth' } },
  ],
  computer: [
    { side: FRAME.sitArm, front: FRAME.frontSitHands, alt: { side: FRAME.sit, ms: 700 } },
    { side: FRAME.sitLean, front: FRAME.frontSitSlouch },
    { side: FRAME.sit, front: FRAME.frontSitHands, prop: { kind: 'phone', at: 'hands' } },
  ],
  phone: [
    { front: FRAME.frontSitHandUp, side: FRAME.sitArmUp, prop: { kind: 'phone', at: 'ear' } },
    { front: FRAME.frontSitHandUp, side: FRAME.sitArmUp, prop: { kind: 'phone', at: 'ear' }, alt: { front: FRAME.frontSitSlouch, ms: 2600 } },
    { front: FRAME.frontSitHands, side: FRAME.sitArm, prop: { kind: 'phone', at: 'hands' } },
  ],
  eat: [
    { side: FRAME.sitArm, front: FRAME.frontSitHands, prop: { kind: 'fork', at: 'fwd' }, alt: { side: FRAME.sitArmUp, front: FRAME.frontSitHandUp, ms: 700 } },
    { side: FRAME.sit, front: FRAME.frontSit },
    { side: FRAME.sitArmUp, front: FRAME.frontSitHandUp, prop: { kind: 'cup', at: 'mouth' } },
  ],
  tea: [
    { side: FRAME.sitArmUp, front: FRAME.frontSitHandUp, prop: { kind: 'cup', at: 'mouth' }, alt: { side: FRAME.sit, front: FRAME.frontSit, ms: 2200 } },
    { side: FRAME.sitLean, front: FRAME.frontSitSlouch, prop: { kind: 'cup', at: 'low' } },
    { side: FRAME.sit, front: FRAME.frontSitHands, prop: { kind: 'paper', at: 'hands' } },
  ],
  crafts: [
    { front: FRAME.frontSitHands, side: FRAME.sitArm, prop: { kind: 'knitting', at: 'hands' }, alt: { front: FRAME.frontSitHands, side: FRAME.sit, ms: 400 } },
    { front: FRAME.frontSitHands, side: FRAME.sitArm, prop: { kind: 'knitting', at: 'hands' } },
    { front: FRAME.frontSitHandUp, side: FRAME.sitArmUp, prop: { kind: 'cup', at: 'mouth' } },
  ],
  music: [
    { front: FRAME.frontSitHands, side: FRAME.sitArm, prop: { kind: 'guitar', at: 'hands' }, alt: { front: FRAME.frontSit, side: FRAME.sit, ms: 330 } },
    { front: FRAME.frontSitHands, side: FRAME.sitArm, prop: { kind: 'guitar', at: 'hands' }, alt: { front: FRAME.frontSitHandUp, side: FRAME.sitArmUp, ms: 500 } },
  ],
  bench: SIT_IDLE.concat([{ front: FRAME.frontSitHands, side: FRAME.sitArm, prop: { kind: 'paper', at: 'hands' } }]),
  idle: SIT_IDLE,
  host: SIT_IDLE,
  guest: SIT_IDLE,
};

const STAND_WORK: Record<string, Variant[]> = {
  cook: [
    { side: FRAME.workUp, prop: { kind: 'spoon', at: 'up' }, alt: { side: FRAME.work, ms: 350 } },
    { side: FRAME.work, prop: { kind: 'spoon', at: 'fwd' }, alt: { side: FRAME.stand, ms: 600 } },
    { side: FRAME.stand },
  ],
  wash: [{ side: FRAME.work, prop: { kind: 'sponge', at: 'fwd' }, alt: { side: FRAME.workUp, ms: 280 } }],
  wash_dishes: [{ side: FRAME.work, prop: { kind: 'sponge', at: 'fwd' }, alt: { side: FRAME.workUp, ms: 280 } }],
  plants: [{ side: FRAME.workUp, prop: { kind: 'can', at: 'up' } }, { side: FRAME.work, prop: { kind: 'can', at: 'fwd' } }],
  chores: [{ side: FRAME.work, prop: { kind: 'rag', at: 'fwd' }, alt: { side: FRAME.workUp, ms: 400 } }, { front: FRAME.frontStand, side: FRAME.stand }],
  make_bed: [{ side: FRAME.workUp, alt: { side: FRAME.work, ms: 450 } }],
  unpack: [{ side: FRAME.work, alt: { side: FRAME.stand, ms: 700 } }],
  snack: [{ side: FRAME.work, alt: { side: FRAME.workUp, ms: 900 } }],
  phone: [{ front: FRAME.standHandUp, side: FRAME.standHandUp, prop: { kind: 'phone', at: 'ear' } }],
};

/** Поза жильца прямо сейчас */
export function animatePose(r: ResidentState, def: ResidentDef, tGame: number, nowMs: number): Pose {
  const h = hashString(r.id);
  const a = r.action;
  const id = a?.phase === 'perform' ? a.id : '';
  const seg = Math.floor((tGame / 60 + (h % 13)) / SEG_MIN);
  const pick = <T,>(list: T[]) => list[mixHash(seg, h) % list.length];
  const talking = a?.data.talking === true || r.interaction !== null;

  if (r.pose === 'lie') {
    // во сне иногда переворачивается
    const turn = id === 'sleep' && mixHash(Math.floor(seg / 4), h) % 3 === 0;
    return { frame: FRAME.lie, turn };
  }

  if (r.pose === 'sit') {
    if (talking) {
      const gesture = Math.floor(nowMs / 900 + h) % 4 === 0;
      const v = pick(SIT_IDLE.slice(0, 3));
      if (gesture) return { frame: r.front ? FRAME.frontSitHandUp : FRAME.sitArmUp };
      return { frame: (r.front ? v.front : v.side) ?? FRAME.frontSit, prop: v.prop?.kind === 'cup' ? v.prop : undefined };
    }
    if (id === 'sleep' || id === 'nap') return { frame: r.front ? FRAME.frontSitSlouch : FRAME.sitLean };
    if (id === 'fitness') return { frame: FRAME.sit, bob: Math.floor(nowMs / 250) % 2 };
    const list = BY_ACTION[id] ?? SIT_IDLE;
    const v = pick(list);
    let frame = (r.front ? v.front : v.side) ?? (r.front ? FRAME.frontSit : FRAME.sit);
    if (v.alt && Math.floor(nowMs / v.alt.ms + h) % 2 === 1) frame = (r.front ? v.alt.front : v.alt.side) ?? frame;
    // книгу иногда перелистывает
    return { frame, prop: v.prop };
  }

  // стоит
  if (r.path.length > 0) return { frame: FRAME.stand };
  if (talking) return { frame: Math.floor(nowMs / 700 + h) % 3 === 0 ? FRAME.frontTalk : FRAME.frontStand };
  if (id === 'fitness') {
    const k = Math.floor(nowMs / 300) % 2;
    return { frame: k ? FRAME.frontWave : FRAME.frontStand, bob: k };
  }
  const list = STAND_WORK[id];
  if (list) {
    const v = pick(list);
    let frame = (r.front ? v.front : v.side) ?? (r.front ? FRAME.frontStand : FRAME.stand);
    if (v.alt && Math.floor(nowMs / v.alt.ms + h) % 2 === 1) frame = (r.front ? v.alt.front : v.alt.side) ?? frame;
    return { frame, prop: v.prop };
  }
  if (id === 'window' || id === 'look') return { frame: FRAME.frontStand };
  // просто стоит: изредка поворачивается к зрителю
  if (!a || a.phase === 'perform') return { frame: mixHash(seg, h) % 3 === 0 ? FRAME.frontStand : r.front ? FRAME.frontStand : FRAME.stand };
  void def;
  return { frame: r.front ? FRAME.frontStand : FRAME.stand };
}
