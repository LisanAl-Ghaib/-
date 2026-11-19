import { FRAME } from '../sprites/character';
import type { ActivityAnim, Beat, Micro, Pose, Scene, ScriptCtx } from './types';

/**
 * БАЗОВАЯ БИБЛИОТЕКА АНИМАЦИЙ — одинаковая для всех жильцов.
 *
 * Ключ — id действия (для пары — `together:<kind>`), внутри — сцены по месту
 * (`bed`, `desk`, `stove`…) и запасные по позе (`sit`/`stand`/`lie`).
 * Личные особенности сюда НЕ пишутся — только в personal.ts, и они лишь добавляют.
 *
 * Новое действие — добавь сюда сцену (тест проверит, что у каждого действия она есть),
 * опиши её в docs/ANIMATIONS.md и посмотри в атласе (?atlas=1).
 */

const CUP = { kind: 'cup', at: 'mouth' } as const;
const CUP_LOW = { kind: 'cup', at: 'low' } as const;
const PHONE = { kind: 'phone', at: 'hands' } as const;
const PHONE_EAR = { kind: 'phone', at: 'ear' } as const;
const BOOK = { kind: 'book', at: 'hands' } as const;
const PAPER = { kind: 'paper', at: 'hands' } as const;

const SIT_MICRO: Micro[] = ['look', 'look', 'hand', 'slouch', 'shift'];
const STAND_MICRO: Micro[] = ['look', 'turn', 'stretch', 'hand', 'shift'];
/** занят руками у стены (плита, мойка): только обернуться и переступить */
const BUSY_MICRO: Micro[] = ['turn', 'shift'];

// ── общие наборы тактов ───────────────────────────────────────────────

const SIT_IDLE: Beat[] = [
  { g: 'rest' },
  { g: 'slouch' },
  { g: 'cross' },
  { g: 'handUp', prop: CUP },
  { g: 'hands', prop: PHONE },
];
const STAND_IDLE: Beat[] = [{ g: 'stand', o: 'front' }, { g: 'stand', o: 'side' }, { g: 'stand', o: 'back' }];

const DESK_TYPING: Beat[] = [
  { g: 'hands', alt: { g: 'rest', ms: 260 }, w: 2 },
  { g: 'hands', alt: { g: 'rest', ms: 400 } },
  { g: 'slouch' },
  { g: 'handUp', prop: CUP },
];

const sit = (note: string, beats: Beat[], extra: Partial<Scene> = {}): Scene => ({ note, posture: 'sit', beats, micro: SIT_MICRO, talk: true, ...extra });
const stand = (note: string, beats: Beat[], extra: Partial<Scene> = {}): Scene => ({ note, posture: 'stand', beats, micro: STAND_MICRO, talk: true, ...extra });

// ── сценарии (процедурные циклы) ──────────────────────────────────────

const mix = (a: number, b: number) => {
  let h = (a ^ Math.imul(b + 0x9e3779b9, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
};

/** Сон: лежит под одеялом, одеяло поднимается от дыхания, иногда переворачивается */
function sleeping(cover: 'blanket' | 'blanketHalf') {
  return (c: ScriptCtx): Pose => ({
    frame: FRAME.lie,
    turn: mix(Math.floor(c.seg / 4), c.seed) % 3 === 0,
    bob: Math.floor((c.nowMs + c.seed) / 2200) % 2,
    cover,
  });
}

/** Развалился в кресле-реклайнере: откинулся, иногда тянется к пульту или подносит ко рту */
function reclining(prop?: Pose['prop'], alt?: Pose['prop']) {
  return (c: ScriptCtx): Pose => {
    const k = mix(c.seg, c.seed) % 5;
    const frame = k === 3 ? FRAME.sitArmUp : k === 4 ? FRAME.sitArm : FRAME.sitLean;
    return { frame, bob: c.breathe, facing: c.faceTo, prop: k === 4 ? alt ?? prop : prop };
  };
}

/** Курение по кругу: держит сигарету у груди → затяжка (рука у рта) → выдох облачком */
export type SmokePhase = 'hold' | 'drag' | 'exhale';
export function smokePhase(nowMs: number, seed: number): SmokePhase {
  const t = (nowMs + (seed % 997) * 37) % 6200;
  return t < 3700 ? 'hold' : t < 4700 ? 'drag' : 'exhale';
}
function smoking(where: 'yard' | 'window' | 'balcony') {
  const atWindow = where === 'window';
  return (c: ScriptCtx): Pose => {
    // у окна — чаще спиной (смотрит на улицу), у подъезда — лицом или боком,
    // на балконе — боком у перил, лицом наружу, иногда оборачивается
    const ph = smokePhase(c.nowMs, c.seed);
    const k = mix(c.seg, c.seed) % 4;
    const o = where === 'balcony' ? (k === 3 ? 'front' : 'side') : atWindow ? (k === 0 ? 'side' : 'back') : k === 3 ? 'side' : 'front';
    const cig = { kind: 'cigarette' as const, at: ph === 'drag' ? ('mouth' as const) : ('hands' as const) };
    if (o === 'back') return { frame: ph === 'drag' ? FRAME.backWork : FRAME.backStand };
    if (o === 'side') return { frame: ph === 'drag' ? FRAME.workUp : FRAME.work, prop: cig, facing: atWindow ? 1 : undefined, blink: c.blink };
    return { frame: ph === 'drag' ? FRAME.frontSmoke : FRAME.frontHold, prop: cig, blink: ph !== 'drag' && c.blink };
  };
}

// ── библиотека ─────────────────────────────────────────────────────────

export const LIBRARY: Record<string, ActivityAnim> = {
  // ─── сон и отдых
  sleep: {
    bed: { note: 'лежит под одеялом; одеяло поднимается от дыхания, раз в ~20 мин переворачивается на другой бок', posture: 'lie', script: sleeping('blanket') },
    sit: { note: 'уснул сидя: ссутулился, голова опущена, мерно дышит', posture: 'sit', script: (c) => ({ frame: c.env.tableBack ? FRAME.backSit : FRAME.frontSitSlouch, bob: c.breathe }) },
  },
  nap: {
    bed: { note: 'прилёг поверх постели, укрыт по пояс; дышит, иногда переворачивается', posture: 'lie', script: sleeping('blanketHalf') },
    sit: { note: 'дремлет сидя: ссутулился, клюёт носом', posture: 'sit', script: (c) => ({ frame: Math.floor((c.nowMs + c.seed) / 4200) % 5 === 0 ? FRAME.frontSit : FRAME.frontSitSlouch, bob: c.breathe }) },
  },
  nightmare: {
    sit: {
      note: 'проснулся от кошмара: сидит в кровати лицом к нам, часто дышит, трёт лицо, смотрит в темноту',
      posture: 'sit',
      script: (c) => {
        const k = Math.floor((c.nowMs + c.seed) / 1600) % 4;
        return { frame: k === 1 ? FRAME.frontSitHandUp : k === 3 ? FRAME.frontSitHands : FRAME.frontSitSlouch, bob: Math.floor(c.nowMs / 600) % 2, blink: c.blink };
      },
    },
  },

  // ─── гигиена
  toilet: {
    toilet: { note: 'дверь закрыта, в окошке над дверью горит свет — самого не видно', posture: 'sit', script: () => ({ frame: FRAME.frontSit, hidden: 'door' }) },
    sit: { note: 'дверь закрыта', posture: 'sit', script: () => ({ frame: FRAME.frontSit, hidden: 'door' }) },
    stand: { note: 'дверь закрыта', posture: 'stand', script: () => ({ frame: FRAME.frontStand, hidden: 'door' }) },
  },
  wash: {
    shower: {
      note: 'за запотевшим стеклом — силуэт: стоит под струёй, поднимает руки (моет голову), поворачивается спиной; одежда на дверце, идёт пар',
      posture: 'stand',
      script: (c) => {
        const k = Math.floor((c.nowMs + c.seed) / (1400 / c.tempo)) % 6;
        return { frame: k === 1 || k === 2 ? FRAME.frontWave : k === 4 ? FRAME.backStand : k === 5 ? FRAME.backWork : FRAME.frontStand, glass: true };
      },
    },
    bath: {
      note: 'лежит в ванне, видны голова и плечи над водой, по воде пузырьки; иногда приподнимается',
      posture: 'lie',
      script: (c) => ({ frame: FRAME.lie, bob: Math.floor((c.nowMs + c.seed) / 5200) % 4 === 0 ? 1 : 0, cover: 'water' }),
    },
    basin: stand(
      'у раковины спиной к нам: чистит зубы (щётка ходит у рта), умывается — пригоршни воды к лицу, вытирается полотенцем, смотрит в зеркало',
      [
        { g: 'workUp', o: 'side', prop: { kind: 'toothbrush', at: 'mouth' }, alt: { g: 'workUp', ms: 180 }, w: 2 },
        { g: 'work', o: 'back', alt: { g: 'workUp', ms: 300 }, w: 2 },
        { g: 'workUp', o: 'side', prop: { kind: 'towel', at: 'mouth' } },
        { g: 'stand', o: 'back' },
      ],
      { orient: 'back', micro: BUSY_MICRO, talk: false },
    ),
    stand: stand('собирается: стоит у зеркала в прихожей, приглаживает волосы', [{ g: 'phoneStand', o: 'front' }, { g: 'stand', o: 'back' }], { talk: false }),
  },

  // ─── еда
  eat: {
    table: sit('за столом: вилка — ко рту и обратно, жуёт, иногда отпивает из чашки; сидит боком или спиной к нам', [
      { g: 'hands', prop: { kind: 'fork', at: 'fwd' }, alt: { g: 'handUp', ms: 700 }, w: 2 },
      { g: 'hands', alt: { g: 'handUp', ms: 900 } },
      { g: 'rest' },
      { g: 'handUp', prop: CUP },
    ]),
    seat: sit('ест на диване, тарелка на коленях: вилка ко рту, жуёт', [
      { g: 'hands', prop: { kind: 'plate', at: 'hands' }, alt: { g: 'handUp', ms: 800 }, w: 2 },
      { g: 'rest', prop: { kind: 'plate', at: 'hands' } },
      { g: 'handUp', prop: CUP },
    ]),
    recliner: { note: 'ест, развалившись в кресле: вилка ко рту, тарелка на животе', posture: 'sit', script: reclining({ kind: 'fork', at: 'fwd' }) },
  },
  tea: {
    table: sit('чай/кофе за столом: держит чашку, отпивает, ставит; листает газету', [
      { g: 'handUp', prop: CUP, alt: { g: 'rest', ms: 2200 }, w: 2 },
      { g: 'slouch', prop: CUP_LOW },
      { g: 'hands', prop: PAPER },
      { g: 'cross', prop: CUP_LOW },
    ]),
    sit: sit('чай/кофе на диване: чашка в руках, отпивает', [
      { g: 'handUp', prop: CUP, alt: { g: 'rest', ms: 2200 }, w: 2 },
      { g: 'slouch', prop: CUP_LOW },
      { g: 'cross', prop: CUP_LOW },
    ]),
    stand: stand('пьёт чай стоя у стола', [{ g: 'phoneStand', o: 'front', prop: CUP }, { g: 'stand', o: 'side', prop: CUP }]),
  },
  snack: {
    fridge: stand('у холодильника: открыл дверцу и заглядывает (спиной), достаёт что-то, жуёт на ходу', [
      { g: 'work', o: 'back', alt: { g: 'workUp', ms: 900 }, w: 2 },
      { g: 'workUp', o: 'side', prop: { kind: 'food', at: 'mouth' }, alt: { g: 'work', ms: 700 } },
    ], { orient: 'back', micro: BUSY_MICRO }),
  },
  cook: {
    stove: stand('у плиты спиной/боком: мешает ложкой, режет (нож вверх-вниз), пробует с ложки, ждёт, глядя в кастрюлю', [
      { g: 'workUp', o: 'back', alt: { g: 'work', ms: 350 }, w: 2 },
      { g: 'work', o: 'side', prop: { kind: 'knife', at: 'fwd' }, alt: { g: 'workUp', ms: 200 } },
      { g: 'workUp', o: 'side', prop: { kind: 'spoon', at: 'up' }, alt: { g: 'work', ms: 400 } },
      { g: 'workUp', o: 'side', prop: { kind: 'spoon', at: 'mouth' } },
      { g: 'stand', o: 'side' },
    ], { orient: 'back', micro: BUSY_MICRO }),
  },
  wash_dishes: {
    sink: stand('у мойки: трёт тарелку губкой, ополаскивает, ставит в сушилку', [
      { g: 'work', o: 'back', alt: { g: 'workUp', ms: 280 }, w: 2 },
      { g: 'work', o: 'side', prop: { kind: 'sponge', at: 'fwd' }, alt: { g: 'workUp', ms: 280 } },
      { g: 'workUp', o: 'side', prop: { kind: 'plate', at: 'fwd' } },
    ], { orient: 'back', micro: BUSY_MICRO }),
  },
  unpack: {
    stand: stand('разбирает пакеты: достаёт из сумки, кладёт в холодильник и на полки', [
      { g: 'work', o: 'side', prop: { kind: 'bag', at: 'low' }, alt: { g: 'stand', ms: 700 } },
      { g: 'work', o: 'back', alt: { g: 'workUp', ms: 600 } },
    ], { micro: BUSY_MICRO }),
  },

  // ─── дом
  make_bed: { stand: stand('заправляет постель: встряхивает одеяло, разглаживает, взбивает подушку', [{ g: 'workUp', o: 'side', alt: { g: 'work', ms: 450 } }, { g: 'work', o: 'back', alt: { g: 'workUp', ms: 450 } }], { micro: BUSY_MICRO }) },
  chores: { stand: stand('прибирается: протирает тряпкой полки, раскладывает вещи, складывает одежду', [{ g: 'work', o: 'side', prop: { kind: 'rag', at: 'fwd' }, alt: { g: 'workUp', ms: 400 } }, { g: 'work', o: 'back', alt: { g: 'workUp', ms: 380 } }, { g: 'work', o: 'side', prop: { kind: 'shirt', at: 'fwd' } }, { g: 'stand', o: 'front' }], { micro: BUSY_MICRO }) },
  take_out_trash: { stand: stand('выносит мусор: пакет в руке', STAND_IDLE) },
  plants: {
    plant: stand('поливает цветы из лейки, щупает землю, обрывает сухой лист', [{ g: 'workUp', o: 'side', prop: { kind: 'can', at: 'up' }, w: 2 }, { g: 'work', o: 'back' }], { micro: BUSY_MICRO }),
    window: stand('поливает цветы на подоконнике', [{ g: 'workUp', o: 'side', prop: { kind: 'can', at: 'up' }, w: 2 }, { g: 'work', o: 'back' }], { micro: BUSY_MICRO }),
    stand: stand('поливает цветы', [{ g: 'workUp', o: 'side', prop: { kind: 'can', at: 'up' } }]),
  },
  window: {
    window: stand('смотрит в окно спиной к нам, иногда оборачивается в комнату', [{ g: 'stand', o: 'back', w: 3 }, { g: 'stand', o: 'front' }]),
    aquarium: stand('стоит у аквариума и смотрит на рыбку', [{ g: 'stand', o: 'side', w: 2 }, { g: 'work', o: 'side' }]),
    stand: stand('стоит у окна', [{ g: 'stand', o: 'back' }]),
  },
  feed_fish: { stand: stand('кормит рыбку: сыплет корм щепоткой, смотрит, как она ест, что-то ей говорит', [{ g: 'workUp', o: 'side', alt: { g: 'work', ms: 600 } }, { g: 'stand', o: 'side' }, { g: 'talk', o: 'side' }]) },
  feed_pets: { stand: stand('насыпает корм в миску, наклоняется', [{ g: 'work', o: 'side', alt: { g: 'workUp', ms: 500 } }]) },

  // ─── досуг
  read: {
    bed: {
      note: 'читает лёжа под одеялом по пояс: книга над лицом, иногда опускает её на грудь, перелистывает',
      posture: 'lie',
      script: (c) => ({ frame: FRAME.lie, cover: 'blanketHalf', prop: { kind: 'book', at: mix(c.seg, c.seed) % 4 === 0 ? 'low' : 'up' } }),
    },
    seat: sit('читает в кресле/на диване: книга в руках, перелистывает; опускает книгу на колени, задумывается; отпивает чай', [
      { g: 'hands', prop: BOOK, w: 3 },
      { g: 'hands', prop: BOOK, o: 'side' },
      { g: 'slouch', prop: { kind: 'book', at: 'low' } },
      { g: 'handUp', prop: CUP },
      { g: 'cross', prop: { kind: 'book', at: 'low' } },
    ]),
    desk: sit('читает за столом боком к нам: книга на столе, делает пометки ручкой, подпирает голову', [
      { g: 'hands', prop: BOOK, w: 3 },
      { g: 'hands', prop: { kind: 'pen', at: 'fwd' }, alt: { g: 'rest', ms: 900 } },
      { g: 'handUp' },
      { g: 'handUp', prop: CUP },
    ], { orient: 'side' }),
    recliner: { note: 'читает, развалившись в кресле', posture: 'sit', script: reclining({ kind: 'book', at: 'hands' }) },
  },
  watch_tv: {
    seat: sit('смотрит телевизор боком к нам (лицом к экрану): пульт в руке, откидывается, закидывает ногу на ногу, отпивает, иногда смотрит в телефон', [
      { g: 'rest', prop: { kind: 'remote', at: 'low' }, w: 2 },
      { g: 'slouch' },
      { g: 'cross' },
      { g: 'handUp', prop: CUP },
      { g: 'hands', prop: PHONE },
      { g: 'slouch', prop: { kind: 'remote', at: 'low' } },
    ]),
    recliner: { note: 'полулёжа в кресле-реклайнере смотрит в экран, тянется к пульту', posture: 'sit', script: reclining(undefined, { kind: 'remote', at: 'hands' }) },
  },
  phone: {
    sit: sit('говорит по телефону: трубка у уха, жестикулирует свободной рукой; или листает экран', [
      { g: 'handUp', prop: PHONE_EAR, w: 2 },
      { g: 'handUp', prop: PHONE_EAR, o: 'side' },
      { g: 'handUp', prop: PHONE_EAR, alt: { g: 'slouch', ms: 2600 } },
      { g: 'hands', prop: PHONE },
    ]),
    stand: stand('говорит по телефону стоя, переминается', [{ g: 'phoneStand', o: 'front', prop: PHONE_EAR }, { g: 'phoneStand', o: 'side', prop: PHONE_EAR }]),
  },
  computer: { desk: sit('за компьютером боком: печатает, водит мышкой, откидывается, листает телефон', [...DESK_TYPING, { g: 'rest', prop: PHONE }], { orient: 'side' }) },
  work: {
    desk: sit('работает за столом: печатает, пишет ручкой, читает бумаги, говорит по телефону, пьёт чай', [
      ...DESK_TYPING,
      { g: 'handUp', prop: PHONE_EAR },
      { g: 'rest', prop: PAPER, o: 'front' },
      { g: 'hands', prop: { kind: 'pen', at: 'fwd' }, alt: { g: 'rest', ms: 700 } },
    ], { orient: 'side' }),
    sit: sit('работает', DESK_TYPING),
    stand: stand('работает стоя', [{ g: 'work', o: 'side', alt: { g: 'workUp', ms: 500 } }]),
  },
  side_work: { desk: sit('подработка онлайн за ноутбуком: быстро печатает, отвлекается на телефон', [...DESK_TYPING, { g: 'rest', o: 'front', prop: PHONE }], { orient: 'side' }) },
  gaming: { desk: sit('играет: часто-часто жмёт кнопки, подаётся вперёд, откидывается после раунда', [{ g: 'hands', alt: { g: 'rest', ms: 160 }, w: 2 }, { g: 'hands', alt: { g: 'slouch', ms: 220 } }, { g: 'slouch' }, { g: 'handUp', prop: CUP }], { orient: 'side' }) },
  chess: {
    desk: sit('играет в шахматы сам с собой: долго смотрит на доску, двигает фигуру, подпирает подбородок', [{ g: 'hands', alt: { g: 'rest', ms: 1900 }, w: 2 }, { g: 'handUp' }, { g: 'slouch' }, { g: 'rest', o: 'front' }, { g: 'cross', o: 'front' }]),
    sit: sit('играет в шахматы', [{ g: 'hands', alt: { g: 'rest', ms: 1900 }, w: 2 }, { g: 'handUp' }, { g: 'slouch' }, { g: 'rest', o: 'front' }]),
  },
  crafts: {
    seat: sit('рукоделие: спицы ходят в руках (у вышивальщицы — пяльцы с иглой), клубок рядом; отпивает чай', [
      { g: 'hands', prop: { kind: 'knitting', at: 'hands' }, alt: { g: 'hands', ms: 400 }, w: 3 },
      { g: 'hands', prop: { kind: 'knitting', at: 'hands' }, o: 'side' },
      { g: 'handUp', prop: CUP },
      { g: 'slouch' },
    ]),
    desk: sit('рукоделие за столом', [{ g: 'hands', prop: { kind: 'knitting', at: 'hands' }, w: 3 }, { g: 'handUp', prop: CUP }], { orient: 'side' }),
    easel: stand('рисует у мольберта: кисть вверх-вниз, отходит посмотреть', [{ g: 'workUp', o: 'side', prop: { kind: 'pen', at: 'up' }, alt: { g: 'work', ms: 500 } }, { g: 'stand', o: 'side' }]),
  },
  music: {
    piano: {
      note: 'за пианино спиной к нам: руки бегают по клавишам, покачивается, иногда замирает',
      posture: 'sit',
      script: (c) => {
        const pause = c.micro === 'look' || c.micro === 'hand';
        return { frame: pause ? FRAME.backSit : Math.floor(c.nowMs / (230 / c.tempo) + c.seed) % 3 ? FRAME.backSitWork : FRAME.backSit, bob: c.breathe, dx: Math.floor(c.nowMs / 1700) % 2 };
      },
    },
    amp: {
      note: 'электрогитара: стоит лицом, гитара поперёк корпуса, бьёт по струнам и качает головой в такт; иногда подкручивает колок, поворачивается к комбику',
      posture: 'stand',
      script: (c) => {
        const beat = Math.floor((c.nowMs + c.seed) / (420 / c.tempo)) % 2;
        if (c.micro === 'look') return { frame: FRAME.stand, prop: { kind: 'eguitar', at: 'low' }, facing: 1 };
        return { frame: FRAME.frontStand, prop: { kind: 'eguitar', at: c.micro === 'hand' ? 'up' : 'hands' }, bob: c.micro === 'stretch' ? 0 : beat, blink: c.blink };
      },
    },
    seat: sit('играет на гитаре сидя: перебирает струны, отстукивает ритм', [{ g: 'hands', prop: { kind: 'guitar', at: 'hands' }, alt: { g: 'rest', ms: 330 } }, { g: 'hands', prop: { kind: 'guitar', at: 'hands' }, alt: { g: 'handUp', ms: 500 } }], { micro: ['look', 'shift'] }),
    stand: stand('играет на гитаре стоя', [{ g: 'work', o: 'side', prop: { kind: 'guitar', at: 'hands' }, alt: { g: 'workUp', ms: 330 } }]),
  },
  fitness: {
    bar: {
      note: 'подтягивается на турнике: висит на руках, подбородок к перекладине и вниз; между подходами стоит, переводит дух',
      posture: 'stand',
      script: (c) => {
        const cyc = (c.nowMs + c.seed) % 9000;
        if (cyc > 6800 || c.env.pullup === undefined) return { frame: FRAME.frontStand, blink: c.blink };
        const hang = Math.max(0, Math.round(c.y) - c.figH - 1 - c.env.pullup);
        const ph = [0, 1, 2, 3, 4, 4, 3, 2, 1, 0][Math.floor(cyc / (140 / c.tempo)) % 10];
        return { frame: FRAME.frontHang, bob: hang + ph };
      },
    },
    mat: {
      note: 'зарядка на коврике: приседания и прыжки с руками вверх, пауза отдышаться',
      posture: 'stand',
      script: (c) => {
        const cyc = (c.nowMs + c.seed) % 8000;
        if (cyc > 6400) return { frame: FRAME.frontStand, blink: c.blink };
        const k = Math.floor(c.nowMs / (300 / c.tempo)) % 2;
        return { frame: k ? FRAME.frontWave : FRAME.frontStand, bob: k };
      },
    },
    bike: { note: 'крутит педали велотренажёра', posture: 'sit', script: (c) => ({ frame: FRAME.sit, bob: Math.floor(c.nowMs / (250 / c.tempo)) % 2 }) },
    stand: { note: 'разминается', posture: 'stand', script: (c) => ({ frame: Math.floor(c.nowMs / 300) % 2 ? FRAME.frontWave : FRAME.frontStand }) },
  },
  night_watch: {
    seat: sit('не спится: сидит в темноте, смотрит перед собой, пьёт воду, листает газету', [{ g: 'slouch', w: 2 }, { g: 'handUp', prop: CUP }, { g: 'rest' }, { g: 'hands', prop: PAPER }, { g: 'rest', o: 'front' }]),
    desk: sit('не спится: сидит за столом в темноте', [{ g: 'slouch', w: 2 }, { g: 'handUp', prop: CUP }, { g: 'hands', prop: PAPER }]),
    recliner: {
      note: 'не спится: в кресле с телефоном, в наушниках — качает головой в такт',
      posture: 'sit',
      script: (c) => ({ frame: c.micro === 'hand' ? FRAME.sitArmUp : FRAME.sitArm, prop: PHONE, bob: Math.floor((c.nowMs + c.seed) / 520) % 2, blink: c.blink }),
    },
  },
  idle: {
    sit: sit('просто сидит: откинулся, нога на ногу, смотрит в телефон, отпивает', SIT_IDLE),
    recliner: { note: 'развалился в кресле', posture: 'sit', script: reclining() },
    stand: stand('стоит, оглядывается, потягивается', STAND_IDLE),
  },

  board: {
    board: stand('у грифельной доски спиной к нам: пишет мелом (рука ходит), отступает на шаг посмотреть, стирает, дописывает', [
      { g: 'workUp', o: 'back', alt: { g: 'work', ms: 320 }, w: 3 },
      { g: 'workUp', o: 'side', prop: { kind: 'chalk', at: 'up' }, alt: { g: 'work', ms: 380 }, w: 2 },
      { g: 'stand', o: 'back' },
      { g: 'stand', o: 'side' },
    ], { orient: 'back', micro: BUSY_MICRO, talk: false }),
    stand: stand('пишет на доске', [{ g: 'workUp', o: 'back', alt: { g: 'work', ms: 320 } }]),
  },
  circle: {
    table: sit('ведёт кружок за столом: двигает фигуру, объясняет, показывает на доску, слушает детей', [
      { g: 'hands', alt: { g: 'rest', ms: 1400 }, w: 2 },
      { g: 'handUp' },
      { g: 'rest' },
      { g: 'hands' },
    ]),
    sit: sit('ведёт кружок', [{ g: 'hands', alt: { g: 'rest', ms: 1400 } }, { g: 'handUp' }]),
    stand: stand('ведёт кружок стоя у доски', [{ g: 'talk', o: 'front' }, { g: 'workUp', o: 'back' }]),
  },

  // ─── балкон (сцена зависит от того, зачем вышел: data.scene)
  balcony: {
    balcony: stand('стоит на балконе лицом наружу, облокотившись на перила; оглядывается в комнату', [{ g: 'work', o: 'side', w: 3 }, { g: 'stand', o: 'side' }, { g: 'stand', o: 'front' }]),
    stand: stand('на балконе', [{ g: 'work', o: 'side' }]),
  },
  'balcony:air': {
    balcony: stand('вышел подышать: стоит у перил, потягивается, вдыхает поглубже, оборачивается в комнату', [{ g: 'stand', o: 'side', w: 2 }, { g: 'work', o: 'side', w: 2 }, { g: 'wave', o: 'front' }, { g: 'stand', o: 'front' }]),
  },
  'balcony:look': {
    balcony: stand('смотрит во двор: облокотился на перила, подолгу не двигается, иногда выпрямляется', [{ g: 'work', o: 'side', w: 4 }, { g: 'stand', o: 'side' }]),
  },
  'balcony:tea': {
    balcony: stand('с чашкой у перил: отпивает, держит чашку двумя руками, смотрит на двор', [{ g: 'workUp', o: 'side', prop: { kind: 'cup', at: 'mouth' }, alt: { g: 'work', ms: 2400 }, w: 3 }, { g: 'work', o: 'side', prop: { kind: 'cup', at: 'fwd' } }]),
  },
  'balcony:plants': {
    balcony: stand('поливает цветы на балконе из лейки, обрывает сухие листья', [{ g: 'workUp', o: 'side', prop: { kind: 'can', at: 'up' }, w: 2 }, { g: 'work', o: 'side' }]),
  },
  'balcony:laundry': {
    balcony: stand('развешивает бельё: тянется к верёвке с рубашкой, достаёт следующую из таза', [{ g: 'workUp', o: 'side', prop: { kind: 'shirt', at: 'up' }, alt: { g: 'work', ms: 900 }, w: 3 }, { g: 'work', o: 'side', prop: { kind: 'shirt', at: 'fwd' } }]),
  },
  'balcony:book': {
    balcony: stand('читает на балконе стоя: книга в руках, перелистывает, иногда поднимает глаза на двор', [{ g: 'work', o: 'front', prop: { kind: 'book', at: 'hands' }, w: 3 }, { g: 'work', o: 'side', prop: { kind: 'book', at: 'fwd' } }]),
  },

  // ─── люди
  host: { sit: sit('принимает гостей: сидит, разговаривает, жестикулирует', SIT_IDLE) },
  guest: { sit: sit('в гостях: сидит, разговаривает', SIT_IDLE), stand: stand('в гостях', STAND_IDLE) },
  family_visit: { sit: sit('с роднёй: сидит, разговаривает', SIT_IDLE), stand: stand('с роднёй', STAND_IDLE) },
  chat: { stand: stand('болтает с соседом: жестикулирует, кивает', [{ g: 'talk', o: 'front' }, { g: 'stand', o: 'front' }]) },
  visit: { stand: stand('стоит у двери, ждёт', STAND_IDLE), sit: sit('в гостях', SIT_IDLE) },

  // ─── улица
  bench: { outdoor: sit('на лавочке лицом к нам: сидит, нога на ногу, читает газету, смотрит в телефон', [...SIT_IDLE, { g: 'hands', prop: PAPER }]), sit: sit('на лавочке', SIT_IDLE) },
  smoke: { outdoor: { note: 'курит у подъезда: сигарета у груди → затяжка (рука ко рту, кончик ярче) → выдох облачком', posture: 'stand', script: smoking('yard') }, stand: { note: 'курит', posture: 'stand', script: smoking('yard') } },
  smoke_window: {
    window: { note: 'курит в открытое окно: чаще спиной к нам, рука с сигаретой в окне, дым уходит на улицу', posture: 'stand', script: smoking('window') },
    balcony: { note: 'курит на балконе: боком у перил, лицом наружу, рука с сигаретой над перилами; иногда оборачивается в комнату', posture: 'stand', script: smoking('balcony') },
    stand: { note: 'курит в окно', posture: 'stand', script: smoking('window') },
  },
  walk_yard: { stand: stand('гуляет: бродит по двору, останавливается, оглядывается', STAND_IDLE) },
  jog: { stand: stand('бегает', STAND_IDLE) },
  go_out: { stand: stand('уходит по делам', STAND_IDLE) },
  go_to_work: { stand: stand('уходит на работу', STAND_IDLE) },
  shopping: { stand: stand('в магазине / с пакетами', STAND_IDLE) },
  snowman: { stand: stand('лепит снеговика: наклоняется, катает ком', [{ g: 'work', o: 'side', alt: { g: 'workUp', ms: 600 } }, { g: 'work', o: 'front' }]) },

  // ─── вдвоём
  'together:talk': { sit: sit('болтают вдвоём: повернулись друг к другу, жестикулируют', SIT_IDLE.slice(0, 4)), stand: stand('болтают стоя', [{ g: 'talk', o: 'side' }, { g: 'stand', o: 'side' }]) },
  'together:walk': { stand: stand('гуляют вдвоём рядом', STAND_IDLE) },
  'together:film': {
    seat: sit('смотрят кино с ноутбука: ноутбук на коленях у одного, второй рядом — откинулся, нога на ногу, с чашкой', [
      { g: 'hands', o: 'front', prop: { kind: 'laptop', at: 'hands' } },
      { g: 'cross', o: 'front' },
      { g: 'slouch', o: 'front' },
      { g: 'handUp', o: 'front', prop: CUP },
      { g: 'rest', o: 'side' },
    ], { talk: false }),
  },
  'together:chess': { sit: sit('играют в шахматы друг против друга: думают, двигают фигуры', [{ g: 'hands', alt: { g: 'rest', ms: 2300 }, w: 2 }, { g: 'handUp' }, { g: 'rest' }, { g: 'slouch' }]) },
  'together:help_cook': { stand: stand('помогает готовить: режет рядом, держит чашку, болтает', [{ g: 'work', o: 'back', alt: { g: 'workUp', ms: 420 } }, { g: 'stand', o: 'side', prop: CUP }, { g: 'talk', o: 'front' }]) },
  'together:gift': { stand: stand('дарит подарок: протягивает, обнимает', [{ g: 'talk', o: 'side' }, { g: 'wave', o: 'side' }]), sit: sit('дарит подарок', SIT_IDLE.slice(0, 4)) },
  'together:intimacy': { stand: stand('вдвоём', STAND_IDLE), lie: { note: 'вдвоём под одеялом', posture: 'lie', script: sleeping('blanket') }, sit: sit('вдвоём', SIT_IDLE) },
  wave_window: { stand: stand('у окна над входом машет уходящему', [{ g: 'stand', o: 'side' }]), window: stand('у окна над входом машет уходящему', [{ g: 'stand', o: 'side' }]) },
};

/** Если для занятия нет сцены — общая по позе */
export const GENERIC: Record<'sit' | 'stand' | 'lie', Scene> = {
  sit: sit('сидит', SIT_IDLE),
  stand: stand('стоит', STAND_IDLE),
  lie: { note: 'лежит', posture: 'lie', script: sleeping('blanketHalf') },
};

/** Сцена для занятия в этом месте (с запасными вариантами) */
export function sceneFor(id: string, place: string | undefined, posture: 'sit' | 'stand' | 'lie'): Scene {
  // «занятие:вариант» (балкон: с чаем, с лейкой…) — если варианта нет, общая сцена занятия
  const act = LIBRARY[id] ?? (id.includes(':') && !id.startsWith('together:') ? LIBRARY[id.split(':')[0]] : undefined);
  if (act) {
    const byPlace = place ? act[place as keyof ActivityAnim] : undefined;
    if (byPlace && byPlace.posture === posture) return byPlace;
    const byPosture = act[posture];
    if (byPosture) return byPosture;
    // место описано, а поза другая (сел на кровать, а не лёг) — любая сцена с той же позой
    for (const s of Object.values(act)) if (s && s.posture === posture) return s;
  }
  return GENERIC[posture];
}
