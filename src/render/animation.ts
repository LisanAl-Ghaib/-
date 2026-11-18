import { hashString } from '../core/rng';
import type { ResidentDef } from '../data/schemas';
import type { ResidentState } from '../sim/state';
import { FRAME } from './sprites/character';

/**
 * Живые позы (чистая косметика рендера, симуляцию не трогает).
 *
 * Три уровня движения:
 *  1. Поза занятия меняется каждые несколько игровых минут: откинулся, закинул ногу на ногу,
 *     взял чашку, уткнулся в телефон.
 *  2. Ракурс: человек сидит лицом, боком (к телевизору, к собеседнику) или спиной
 *     (за столом, у плиты, у окна) — мир не плоский.
 *  3. Мелкие движения каждые пару секунд: дышит, моргает, поворачивает голову,
 *     поправляет очки, ёрзает на месте.
 */
export type PropKind =
  | 'phone' | 'cup' | 'book' | 'remote' | 'fork' | 'pen' | 'knitting' | 'guitar'
  | 'spoon' | 'rag' | 'can' | 'sponge' | 'paper' | 'hoop';

export type PropAt = 'hands' | 'ear' | 'mouth' | 'fwd' | 'up' | 'low';

export interface Pose {
  frame: number;
  prop?: { kind: PropKind; at: PropAt };
  /** перевернуться во сне */
  turn?: boolean;
  /** приподнять спрайт (дыхание, подпрыгивание) */
  bob?: number;
  /** сдвиг по горизонтали — поёрзал на месте */
  dx?: number;
  /** куда смотрит в боковом ракурсе (переопределяет facing жильца) */
  facing?: 1 | -1;
  /** моргнул */
  blink?: boolean;
}

/** Что известно об окружении (считает рендер) */
export interface AnimEnv {
  /** на что смотреть боком: телевизор, собеседник */
  faceToX?: number;
  /** сидит за столом лицом к стене — со спины */
  tableBack?: boolean;
  /** окно/плита/мойка перед ним у стены — стоит спиной */
  wallWork?: boolean;
}

type Orient = 'front' | 'side' | 'back';
type Gesture = 'rest' | 'slouch' | 'hands' | 'handUp' | 'cross' | 'stand' | 'work' | 'workUp' | 'phoneStand' | 'talk' | 'wave';

interface Variant {
  g: Gesture;
  o?: Orient;
  prop?: { kind: PropKind; at: PropAt };
  alt?: { g: Gesture; ms: number };
}

const SIT_FRAMES: Record<Orient, Partial<Record<Gesture, number>>> = {
  front: { rest: FRAME.frontSit, slouch: FRAME.frontSitSlouch, hands: FRAME.frontSitHands, handUp: FRAME.frontSitHandUp, cross: FRAME.frontSitCross },
  side: { rest: FRAME.sit, slouch: FRAME.sitLean, hands: FRAME.sitArm, handUp: FRAME.sitArmUp, cross: FRAME.sitLean },
  back: { rest: FRAME.backSit, slouch: FRAME.backSit, hands: FRAME.backSitWork, handUp: FRAME.backSitWork, cross: FRAME.backSit },
};
const STAND_FRAMES: Record<Orient, Partial<Record<Gesture, number>>> = {
  front: { stand: FRAME.frontStand, work: FRAME.frontStand, workUp: FRAME.frontWave, phoneStand: FRAME.standHandUp, talk: FRAME.frontTalk, wave: FRAME.frontWave },
  side: { stand: FRAME.stand, work: FRAME.work, workUp: FRAME.workUp, phoneStand: FRAME.standHandUp, talk: FRAME.frontTalk, wave: FRAME.workUp },
  back: { stand: FRAME.backStand, work: FRAME.backWork, workUp: FRAME.backWork, phoneStand: FRAME.backStand, talk: FRAME.backStand, wave: FRAME.backWork },
};

const SEG_MIN = 5; // поза меняется каждые ~5 игровых минут (≈ 5 секунд)

function mixHash(a: number, b: number): number {
  let h = (a ^ Math.imul(b + 0x9e3779b9, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

const CUP = { kind: 'cup', at: 'mouth' } as const;
const SIT_IDLE: Variant[] = [
  { g: 'rest' },
  { g: 'slouch' },
  { g: 'cross' },
  { g: 'handUp', prop: CUP },
  { g: 'hands', prop: { kind: 'phone', at: 'hands' } },
  { g: 'rest', o: 'side' },
];

const SIT: Record<string, Variant[]> = {
  watch_tv: [
    { g: 'rest', prop: { kind: 'remote', at: 'low' } },
    { g: 'slouch' },
    { g: 'cross' },
    { g: 'handUp', prop: CUP },
    { g: 'hands', prop: { kind: 'phone', at: 'hands' } },
    { g: 'slouch', prop: { kind: 'remote', at: 'low' } },
    { g: 'rest', o: 'front' },
  ],
  read: [
    { g: 'hands', prop: { kind: 'book', at: 'hands' } },
    { g: 'hands', prop: { kind: 'book', at: 'hands' }, o: 'side' },
    { g: 'slouch', prop: { kind: 'book', at: 'low' } },
    { g: 'handUp', prop: CUP },
    { g: 'cross', prop: { kind: 'book', at: 'low' } },
  ],
  work: [
    { g: 'hands', alt: { g: 'rest', ms: 260 } },
    { g: 'hands', alt: { g: 'rest', ms: 320 } },
    { g: 'slouch' },
    { g: 'handUp', prop: CUP },
    { g: 'handUp', prop: { kind: 'phone', at: 'ear' } },
    { g: 'rest', prop: { kind: 'paper', at: 'hands' }, o: 'front' },
    { g: 'hands', prop: { kind: 'pen', at: 'fwd' }, alt: { g: 'rest', ms: 700 } },
  ],
  gaming: [
    { g: 'hands', alt: { g: 'rest', ms: 160 } },
    { g: 'hands', alt: { g: 'slouch', ms: 220 } },
    { g: 'slouch' },
    { g: 'handUp', prop: CUP },
  ],
  computer: [
    { g: 'hands', alt: { g: 'rest', ms: 700 } },
    { g: 'slouch' },
    { g: 'rest', prop: { kind: 'phone', at: 'hands' } },
  ],
  phone: [
    { g: 'handUp', prop: { kind: 'phone', at: 'ear' } },
    { g: 'handUp', prop: { kind: 'phone', at: 'ear' }, o: 'side' },
    { g: 'handUp', prop: { kind: 'phone', at: 'ear' }, alt: { g: 'slouch', ms: 2600 } },
    { g: 'hands', prop: { kind: 'phone', at: 'hands' } },
  ],
  eat: [
    { g: 'hands', prop: { kind: 'fork', at: 'fwd' }, alt: { g: 'handUp', ms: 700 } },
    { g: 'hands', alt: { g: 'handUp', ms: 900 } },
    { g: 'rest' },
    { g: 'handUp', prop: CUP },
  ],
  tea: [
    { g: 'handUp', prop: CUP, alt: { g: 'rest', ms: 2200 } },
    { g: 'slouch', prop: { kind: 'cup', at: 'low' } },
    { g: 'hands', prop: { kind: 'paper', at: 'hands' } },
    { g: 'cross', prop: { kind: 'cup', at: 'low' } },
  ],
  crafts: [
    { g: 'hands', prop: { kind: 'knitting', at: 'hands' }, alt: { g: 'hands', ms: 400 } },
    { g: 'hands', prop: { kind: 'knitting', at: 'hands' }, o: 'side' },
    { g: 'handUp', prop: CUP },
    { g: 'slouch' },
  ],
  music: [
    { g: 'hands', prop: { kind: 'guitar', at: 'hands' }, alt: { g: 'rest', ms: 330 } },
    { g: 'hands', prop: { kind: 'guitar', at: 'hands' }, alt: { g: 'handUp', ms: 500 } },
  ],
  bench: SIT_IDLE.concat([{ g: 'hands', prop: { kind: 'paper', at: 'hands' } }]),
  night_watch: [
    { g: 'slouch' },
    { g: 'handUp', prop: CUP },
    { g: 'rest' },
    { g: 'hands', prop: { kind: 'paper', at: 'hands' } },
    { g: 'rest', o: 'front' },
  ],
  idle: SIT_IDLE,
  host: SIT_IDLE,
  guest: SIT_IDLE,
  family_visit: SIT_IDLE,
};

const STAND: Record<string, Variant[]> = {
  cook: [
    { g: 'workUp', o: 'back', alt: { g: 'work', ms: 350 } },
    { g: 'work', o: 'back', alt: { g: 'stand', ms: 600 } },
    { g: 'workUp', o: 'side', prop: { kind: 'spoon', at: 'up' }, alt: { g: 'work', ms: 400 } },
    { g: 'stand', o: 'side' },
  ],
  wash: [{ g: 'work', o: 'back', alt: { g: 'workUp', ms: 280 } }, { g: 'work', o: 'side', prop: { kind: 'sponge', at: 'fwd' }, alt: { g: 'workUp', ms: 280 } }],
  wash_dishes: [{ g: 'work', o: 'back', alt: { g: 'workUp', ms: 280 } }, { g: 'work', o: 'side', prop: { kind: 'sponge', at: 'fwd' }, alt: { g: 'workUp', ms: 280 } }],
  plants: [{ g: 'workUp', o: 'side', prop: { kind: 'can', at: 'up' } }, { g: 'work', o: 'back' }],
  chores: [{ g: 'work', o: 'side', prop: { kind: 'rag', at: 'fwd' }, alt: { g: 'workUp', ms: 400 } }, { g: 'work', o: 'back', alt: { g: 'workUp', ms: 380 } }, { g: 'stand', o: 'front' }],
  make_bed: [{ g: 'workUp', o: 'side', alt: { g: 'work', ms: 450 } }, { g: 'work', o: 'back', alt: { g: 'workUp', ms: 450 } }],
  unpack: [{ g: 'work', o: 'side', alt: { g: 'stand', ms: 700 } }, { g: 'work', o: 'back', alt: { g: 'workUp', ms: 600 } }],
  snack: [{ g: 'work', o: 'back', alt: { g: 'workUp', ms: 900 } }],
  feed_pets: [{ g: 'work', o: 'side', alt: { g: 'workUp', ms: 500 } }],
  phone: [{ g: 'phoneStand', o: 'front', prop: { kind: 'phone', at: 'ear' } }, { g: 'phoneStand', o: 'side', prop: { kind: 'phone', at: 'ear' } }],
  window: [{ g: 'stand', o: 'back' }, { g: 'stand', o: 'back' }, { g: 'stand', o: 'front' }],
  look: [{ g: 'stand', o: 'back' }],
  idle: [{ g: 'stand', o: 'front' }, { g: 'stand', o: 'side' }, { g: 'stand', o: 'back' }],
};

/** Поза жильца прямо сейчас */
export function animatePose(r: ResidentState, def: ResidentDef, tGame: number, nowMs: number, env: AnimEnv = {}): Pose {
  const h = hashString(r.id);
  const a = r.action;
  const id = a?.phase === 'perform' ? a.id : '';
  const seg = Math.floor((tGame / 60 + (h % 13)) / SEG_MIN);
  const pick = <T,>(list: T[]) => list[mixHash(seg, h) % list.length];
  const talking = a?.data.talking === true || r.interaction !== null;
  // мелкие движения: окно ~2.6 с, активная часть — первые ~1.1 с
  const win = Math.floor((nowMs + (h % 2600)) / 2600);
  const inWin = (nowMs + (h % 2600)) % 2600;
  const micro = inWin < 1100 ? mixHash(win, h ^ 0x55) % 12 : -1;
  const blink = (nowMs + h * 53) % 3700 < 140;
  const faceTo: 1 | -1 | undefined = env.faceToX !== undefined ? (env.faceToX >= r.x ? 1 : -1) : undefined;

  if (r.pose === 'lie') {
    // во сне иногда переворачивается, одеяло поднимается от дыхания
    const turn = id === 'sleep' && mixHash(Math.floor(seg / 4), h) % 3 === 0;
    return { frame: FRAME.lie, turn, bob: Math.floor((nowMs + h) / 2200) % 2 };
  }

  // жест: кивнула или помахала кому-то (мастерам из окошка)
  const gest = r.gesture && r.gesture.until > tGame ? r.gesture : null;
  if (gest) {
    const toward: 1 | -1 = gest.toX >= r.x ? 1 : -1;
    const k = Math.floor(nowMs / (gest.kind === 'wave' ? 260 : 220)) % 2;
    if (r.pose === 'sit') {
      if (gest.kind === 'wave') return { frame: k ? FRAME.sitArmUp : FRAME.sitArm, facing: toward };
      return { frame: k ? FRAME.sitLean : FRAME.sit, bob: k, facing: toward };
    }
    if (gest.kind === 'wave') return { frame: k ? FRAME.frontWave : FRAME.frontStand };
    return { frame: FRAME.stand, bob: k, facing: toward };
  }

  if (r.pose === 'sit') {
    let base: Orient = env.tableBack ? 'back' : r.front ? 'front' : 'side';
    if (faceTo !== undefined && !env.tableBack) base = 'side';
    const breathe = Math.floor((nowMs + h) / 1900) % 2;
    const dx = (mixHash(seg, h ^ 0x33) % 3) - 1; // поёрзал
    if (id === 'sleep' || id === 'nap') return { frame: SIT_FRAMES[base].slouch!, bob: breathe };
    if (id === 'fitness') return { frame: FRAME.sit, bob: Math.floor(nowMs / 250) % 2 };
    const list = talking ? SIT_IDLE.slice(0, 4) : SIT[id] ?? SIT_IDLE;
    const v = pick(list);
    let o: Orient = v.o && !env.tableBack ? v.o : base;
    let g: Gesture = v.g;
    if (v.alt && Math.floor(nowMs / v.alt.ms + h) % 2 === 1) g = v.alt.g;
    // в разговоре — жестикулирует
    if (talking && Math.floor(nowMs / 900 + h) % 4 === 0) g = 'handUp';
    // мелкие движения
    if (micro === 0 || micro === 1) o = o === 'front' ? 'side' : o === 'side' ? 'front' : 'side'; // повернул голову
    else if (micro === 2 && o !== 'back') g = 'handUp'; // поправил очки, почесал затылок
    else if (micro === 3) g = 'slouch';
    let frame = SIT_FRAMES[o][g] ?? SIT_FRAMES[o].rest!;
    let prop = v.prop;
    if (g !== v.g && !(v.alt && g === v.alt.g)) prop = undefined;
    if (o === 'back') prop = undefined;
    // вышивальщица держит пяльцы, а не спицы
    if (prop?.kind === 'knitting' && def.habits.some((hb) => hb.kind === 'crafts' && /выши/i.test(hb.note))) prop = { kind: 'hoop', at: prop.at };
    if (frame === FRAME.frontSitCross && prop?.at === 'hands') frame = FRAME.frontSitHands;
    const facing = o === 'side' ? faceTo ?? (micro === 0 ? (-r.facing as 1 | -1) : undefined) : undefined;
    return { frame, prop, bob: breathe, dx, facing, blink: blink && o !== 'back' };
  }

  // стоит
  if (r.path.length > 0) return { frame: FRAME.stand };
  if (talking) {
    const g: Gesture = Math.floor(nowMs / 700 + h) % 3 === 0 ? 'talk' : 'stand';
    const o: Orient = micro === 0 ? 'side' : 'front';
    return { frame: STAND_FRAMES[o][g]!, facing: faceTo, blink };
  }
  if (id === 'fitness') {
    const k = Math.floor(nowMs / 300) % 2;
    return { frame: k ? FRAME.frontWave : FRAME.frontStand, bob: k };
  }
  const list = STAND[id] ?? STAND.idle;
  const v = pick(list);
  let o: Orient = v.o ?? (r.front ? 'front' : 'side');
  if (env.wallWork && (id === 'cook' || id === 'wash' || id === 'wash_dishes') && v.o === 'side' && mixHash(seg, h) % 2) o = 'back';
  let g: Gesture = v.g;
  if (v.alt && Math.floor(nowMs / v.alt.ms + h) % 2 === 1) g = v.alt.g;
  // постоял — переступил, обернулся
  if (micro === 0 && !id) o = o === 'back' ? 'side' : 'back';
  else if (micro === 1 && o === 'back') o = 'side';
  else if (micro === 2 && (!id || id === 'window')) g = 'wave'; // потянулся
  const frame = STAND_FRAMES[o][g] ?? STAND_FRAMES[o].stand!;
  const prop = o === 'back' ? undefined : v.prop;
  return { frame, prop, blink: blink && o !== 'back' };
}
