/**
 * Типы системы анимаций (чистая косметика рендера, симуляцию не трогает).
 *
 * Устройство — в docs/ANIMATIONS.md. Коротко:
 *  • БАЗА (library.ts): у каждого занятия в каждом месте — одна стандартная сцена,
 *    одинаковая для всех жильцов: поза, ракурс, вещи в руках, такты, мелкие движения.
 *  • ЛИЧНОЕ (personal.ts): поверх базы — только добавки (свои такты, своя вещь вместо
 *    похожей, темп, свои мелкие движения). Движок (animation.ts) не даёт личному слою
 *    менять позу и ракурсы базовой сцены.
 */

export type PropKind =
  | 'phone' | 'cup' | 'book' | 'remote' | 'fork' | 'pen' | 'knitting' | 'guitar'
  | 'spoon' | 'rag' | 'can' | 'sponge' | 'paper' | 'hoop' | 'laptop' | 'headset' | 'eguitar' | 'cigarette'
  | 'toothbrush' | 'towel' | 'knife' | 'plate' | 'shirt' | 'bag' | 'food';

export type PropAt = 'hands' | 'ear' | 'mouth' | 'fwd' | 'up' | 'low';

/** Чем прикрыт / где спрятан человек — рисует рендер */
export type Cover = 'blanket' | 'blanketHalf' | 'water';

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
  /** одеяло (целиком / до пояса) или вода в ванне */
  cover?: Cover;
  /** за закрытой дверью (туалет): самого не видно */
  hidden?: 'door';
  /** за запотевшим стеклом душа: только силуэт */
  glass?: boolean;
}

/**
 * Место занятия. Одно и то же занятие в разных местах выглядит по-разному
 * (читать в кресле, за столом, в кровати), но в одном месте — у всех одинаково.
 */
export type Place =
  | 'bed' | 'bath' | 'shower' | 'basin' | 'toilet'
  | 'table' | 'desk' | 'seat' | 'recliner'
  | 'stove' | 'sink' | 'fridge'
  | 'window' | 'plant' | 'aquarium' | 'bowls'
  | 'piano' | 'amp' | 'bar' | 'mat' | 'bike' | 'easel'
  | 'outdoor' | 'floor';

/** Что известно об окружении (считает рендер) */
export interface AnimEnv {
  /** где он сейчас (по предмету мебели слота) */
  place?: Place;
  /** на что смотреть боком: телевизор, собеседник */
  faceToX?: number;
  /** сидит за столом лицом к стене — со спины */
  tableBack?: boolean;
  /** подтягивается на турнике: y перекладины в мире */
  pullup?: number;
  /** переговаривается с тем, кто рядом (пара в одной комнате) */
  chatter?: boolean;
}

export type Orient = 'front' | 'side' | 'back';
export type Posture = 'sit' | 'stand' | 'lie';
export type Gesture =
  | 'rest' | 'slouch' | 'hands' | 'handUp' | 'cross'
  | 'stand' | 'work' | 'workUp' | 'phoneStand' | 'talk' | 'wave';

/** Один такт сцены: держится несколько игровых минут, потом выбирается следующий */
export interface Beat {
  g: Gesture;
  /** ракурс такта (иначе — базовый ракурс места) */
  o?: Orient;
  prop?: { kind: PropKind; at: PropAt };
  /** быстрое чередование внутри такта: печатает, мешает, жуёт */
  alt?: { g: Gesture; ms: number };
  /** вес при выборе такта (по умолчанию 1) */
  w?: number;
}

/** Мелкие движения поверх такта (каждые пару секунд) */
export type Micro =
  | 'look'      // повернул голову, огляделся
  | 'hand'      // почесал затылок, поднёс руку к лицу
  | 'slouch'    // ссутулился, откинулся
  | 'shift'     // поёрзал, переступил
  | 'turn'      // стоя — обернулся
  | 'stretch'   // потянулся
  | 'glasses'   // поправил очки (у кого они есть)
  | 'shawl'     // поправил шаль на плечах
  | 'beard';    // потёр бороду

/** Контекст для сценария сцены */
export interface ScriptCtx {
  nowMs: number;
  tGame: number;
  /** личное зерно (от id жильца) — чтобы у соседей циклы не шли в ногу */
  seed: number;
  /** номер текущего такта (меняется каждые ~5 игровых минут) */
  seg: number;
  /** текущее мелкое движение (или null) */
  micro: Micro | null;
  /** в какую сторону объект внимания (телевизор, собеседник) */
  faceTo?: 1 | -1;
  blink: boolean;
  breathe: number;
  env: AnimEnv;
  /** рост фигуры (для турника) и пр. */
  figH: number;
  /** y ступней жильца в мире */
  y: number;
  /** личный темп (1 — обычный) */
  tempo: number;
  /** данные действия (lead, kind…) */
  data: Record<string, unknown>;
}

/** Базовая сцена: занятие в конкретном месте */
export interface Scene {
  /** как это выглядит — для атласа и docs/ANIMATIONS.md */
  note: string;
  posture: Posture;
  /** базовый ракурс (иначе — по слоту: лицом или боком) */
  orient?: Orient;
  /** такты (сидя/стоя) */
  beats?: Beat[];
  /** процедурный цикл вместо тактов: курение, турник, душ, сон */
  script?: (c: ScriptCtx) => Pose;
  /** какие мелкие движения уместны (по умолчанию — все для позы) */
  micro?: Micro[];
  /** может ли при этом переговариваться/жестикулировать */
  talk?: boolean;
}

/** Занятие: сцены по местам; `sit`/`stand`/`lie` — запасные, если место не описано */
export type ActivityAnim = Partial<Record<Place | Posture, Scene>>;
