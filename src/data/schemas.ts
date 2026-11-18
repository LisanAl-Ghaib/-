import { z } from 'zod';

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'цвет в формате #rrggbb');
const hhmm = z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/, 'время в формате ЧЧ:ММ');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'дата в формате ГГГГ-ММ-ДД');

// ───────────────────────────── мир ─────────────────────────────

export const WorldConfigSchema = z.object({
  seed: z.union([z.number().int(), z.string()]),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/),
  address: z.string().default('ул. Тополиная, 7'),
  building: z
    .object({
      /** дом растёт с жильцами: этажей = max(minFloors, самый высокий описанный этаж) */
      minFloors: z.number().int().min(2).max(16).default(2),
      apartmentWidthTiles: z.number().int().min(8).max(24).default(16),
    })
    .default({ minFloors: 2, apartmentWidthTiles: 16 }),
});
export type WorldConfig = z.infer<typeof WorldConfigSchema>;

// ─────────────────────────── каталог мебели ───────────────────────────

export const SlotUseSchema = z.enum([
  'sleep', 'nap', 'sit', 'eat', 'cook', 'tv', 'read', 'work', 'music', 'wash',
  'fridge', 'plants', 'exercise', 'crafts', 'gaming', 'look',
]);
export type SlotUse = z.infer<typeof SlotUseSchema>;

export const PoseSchema = z.enum(['stand', 'sit', 'lie']);
export type Pose = z.infer<typeof PoseSchema>;

export const FurnitureDefSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  name: z.string(),
  /** вид процедурной отрисовки (см. src/render/sprites/furniture.ts) */
  draw: z.string(),
  w: z.number().int().min(2).max(64),
  h: z.number().int().min(1).max(36),
  /** на какой высоте над полом висит (картины, полки, телевизор на стене) */
  elevation: z.number().int().min(0).max(48).default(0),
  /** рисовать позади жильцов (по умолчанию) или перед ними (одеяло, стол) */
  layer: z.enum(['back', 'front']).default('back'),
  slots: z
    .array(
      z.object({
        use: z.array(SlotUseSchema).min(1),
        /** смещение от левого края предмета до точки, где стоит/сидит жилец */
        dx: z.number().int(),
        pose: PoseSchema.default('stand'),
        /** высота сиденья/лежанки над полом */
        dy: z.number().int().default(0),
        /** куда смотрит жилец: 1 вправо, -1 влево, 0 — как пришёл */
        face: z.union([z.literal(1), z.literal(-1), z.literal(0)]).default(0),
      }),
    )
    .default([]),
  /** где уместно ставить (для подсказок и валидации) */
  rooms: z.array(z.string()).optional(),
  /** основной цвет по умолчанию; иначе берётся из палитры квартиры */
  color: hexColor.optional(),
  /** какой цвет палитры квартиры использовать как основной */
  paletteKey: z.enum(['wood', 'textile', 'accent', 'metal', 'wall']).default('wood'),
});
export type FurnitureDef = z.infer<typeof FurnitureDefSchema>;

export const FurnitureCatalogSchema = z.object({ items: z.array(FurnitureDefSchema) });

// ───────────────────────────── квартиры ─────────────────────────────

export const RoomTypeSchema = z.enum(['hall', 'kitchen', 'living', 'bedroom', 'bathroom', 'study', 'kids', 'studio']);
export type RoomType = z.infer<typeof RoomTypeSchema>;

export const ApartmentStyleSchema = z.enum([
  'soviet', 'scandi', 'loft', 'boho', 'classic', 'minimal', 'student', 'cozy', 'retro',
]);

export const WallpaperSchema = z.enum(['plain', 'stripes', 'dots', 'diamonds', 'brick', 'tiles', 'damask', 'panels', 'flowers']);
export const FlooringSchema = z.enum(['parquet', 'boards', 'linoleum', 'tiles', 'carpet', 'concrete', 'herringbone']);

export const PaletteSchema = z.object({
  wall: hexColor,
  floor: hexColor,
  wood: hexColor,
  textile: hexColor,
  accent: hexColor,
  metal: hexColor.default('#9aa4ad'),
  light: hexColor.default('#ffd98a'),
});
export type Palette = z.infer<typeof PaletteSchema>;

export const FurniturePlacementSchema = z.object({
  item: z.string(),
  /** пиксели от левого края комнаты */
  x: z.number().int().min(0),
  flip: z.boolean().default(false),
  color: hexColor.optional(),
  /** поднять над полом (радио на столе, телевизор на комоде) */
  elevation: z.number().int().min(0).max(48).optional(),
});

export const RoomSchema = z.object({
  type: RoomTypeSchema,
  /** ширина в тайлах (16 px) */
  width: z.number().int().min(1).max(12),
  name: z.string().optional(),
  wall: hexColor.optional(),
  wallpaper: WallpaperSchema.optional(),
  flooring: FlooringSchema.optional(),
  window: z.boolean().default(true),
  furniture: z.array(FurniturePlacementSchema).default([]),
});
export type RoomDef = z.infer<typeof RoomSchema>;

export const ApartmentSchema = z.object({
  id: z.string().regex(/^apt-\d+-(left|right)$/, 'id вида apt-<этаж>-<left|right>'),
  /** этаж по-человечески: 1 — первый (подъезд; слева там комната консьержки), 2 — второй… */
  floor: z.number().int().min(1),
  side: z.enum(['left', 'right']),
  /** в квартире идёт ремонт (жить нельзя, днём работают мастера) */
  renovation: z.boolean().default(false),
  number: z.number().int().optional(),
  style: ApartmentStyleSchema,
  description: z.string().default(''),
  palette: PaletteSchema,
  wallpaper: WallpaperSchema.default('plain'),
  flooring: FlooringSchema.default('boards'),
  /** комнаты слева направо, как на экране */
  rooms: z.array(RoomSchema).min(1),
});
export type ApartmentDef = z.infer<typeof ApartmentSchema>;

// ───────────────────────────── жильцы ─────────────────────────────

export const HabitKindSchema = z.enum([
  'reading', 'tv', 'cooking', 'walking', 'jogging', 'music', 'gaming', 'crafts',
  'plants', 'phone', 'smoking', 'bench', 'fitness', 'computer',
]);
export type HabitKind = z.infer<typeof HabitKindSchema>;

export const RelationKindSchema = z.enum([
  'spouse', 'partner', 'parent', 'child', 'sibling', 'grandparent', 'grandchild', 'relative',
  'ex', 'friend', 'colleague', 'neighbor', 'rival', 'crush',
]);
export type RelationKind = z.infer<typeof RelationKindSchema>;

export const OccupationKindSchema = z.enum([
  'office', 'shift', 'remote', 'freelance', 'student', 'school', 'retired', 'unemployed', 'homemaker',
  /** работает прямо в доме (консьержка, дворник) — рабочее место — слот work в своей квартире */
  'onsite',
]);
export type OccupationKind = z.infer<typeof OccupationKindSchema>;

export const HairStyleSchema = z.enum([
  'short', 'buzz', 'long', 'bob', 'ponytail', 'bun', 'curly', 'bald', 'balding', 'mohawk', 'braid', 'pigtails',
]);

export const AccessorySchema = z.enum([
  'glasses', 'sunglasses', 'beard', 'mustache', 'stubble', 'hat', 'cap', 'beret', 'scarf', 'earrings', 'headphones', 'bag', 'tie', 'apron',
]);

export const ResidentSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'id — латиница, цифры, дефис'),
  name: z.object({
    first: z.string().min(1),
    last: z.string().default(''),
    patronymic: z.string().optional(),
    /** как его/её зовут в быту (в хронике) */
    short: z.string().optional(),
    /** падежи короткого имени: родительный, дательный, винительный, творительный, предложный */
    cases: z
      .object({
        gen: z.string(),
        dat: z.string(),
        acc: z.string(),
        ins: z.string(),
        pre: z.string(),
      })
      .partial()
      .default({}),
  }),
  gender: z.enum(['m', 'f']),
  birthday: isoDate,
  apartment: z.string(),
  occupation: z.object({
    kind: OccupationKindSchema,
    title: z.string(),
    workplace: z.string().default(''),
    schedule: z
      .object({
        days: z.array(z.number().int().min(1).max(7)),
        start: hhmm,
        end: hhmm,
      })
      .optional(),
    commuteMinutes: z.number().int().min(0).max(180).default(30),
    commute: z.enum(['bus', 'walk']).default('bus'),
  }),
  traits: z.object({
    chronotype: z.enum(['lark', 'neutral', 'owl']),
    sociability: z.enum(['homebody', 'balanced', 'outgoing']),
    temper: z.enum(['calm', 'even', 'hot']).default('even'),
    outlook: z.enum(['gloomy', 'neutral', 'cheerful']).default('neutral'),
    activity: z.enum(['lazy', 'normal', 'active']).default('normal'),
    tags: z.array(z.string()).default([]),
  }),
  habits: z
    .array(
      z.object({
        kind: HabitKindSchema,
        strength: z.number().min(0).max(1).default(0.5),
        note: z.string().default(''),
      }),
    )
    .default([]),
  backstory: z.string().default(''),
  appearance: z.object({
    skin: hexColor,
    hair: z.object({ style: HairStyleSchema, color: hexColor }),
    height: z.enum(['short', 'average', 'tall']).default('average'),
    build: z.enum(['slim', 'average', 'heavy']).default('average'),
    outfit: z.object({
      top: hexColor,
      bottom: hexColor,
      shoes: hexColor.default('#3a2a20'),
      style: z.enum(['casual', 'formal', 'sport', 'dress', 'robe']).default('casual'),
      /** верхняя одежда для холодной погоды */
      coat: hexColor.optional(),
    }),
    accessories: z.array(AccessorySchema).default([]),
  }),
  relationships: z
    .array(
      z.object({
        with: z.string(),
        kind: RelationKindSchema,
        affinity: z.number().min(-100).max(100).default(20),
        familiarity: z.number().min(0).max(100).default(50),
        note: z.string().default(''),
      }),
    )
    .default([]),
  /** путь к PNG-спрайту в public/sprites (необязательно) */
  sprite: z.string().optional(),
});
export type ResidentDef = z.infer<typeof ResidentSchema>;
export type ResidentInput = z.input<typeof ResidentSchema>;
