import { z } from 'zod';
import { hashString } from '../core/rng';
import { parseEpoch } from '../core/time';
import { BuildingLayout } from '../world/layout';
import {
  ApartmentSchema, FurnitureCatalogSchema, ResidentSchema, WorldConfigSchema,
  type ApartmentDef, type FurnitureDef, type RelationKind, type ResidentDef, type WorldConfig,
} from './schemas';

export interface RawFile {
  file: string; // имя файла без расширения
  data: unknown;
}

export interface RawData {
  world: unknown;
  catalog: unknown;
  residents: RawFile[];
  /** арендаторы съёмных квартир (data/tenants/): живут по очереди, меняются сами */
  tenants?: RawFile[];
  apartments: RawFile[];
}

export interface WorldDefs {
  config: WorldConfig;
  epochMs: number;
  catalog: Map<string, FurnitureDef>;
  apartments: ApartmentDef[];
  /** кто сейчас живёт в доме (постоянные жильцы + нынешние арендаторы; арендаторов добавляет/убирает sim/tenants.ts) */
  residents: ResidentDef[];
  residentById: Map<string, ResidentDef>;
  /** все арендаторы из data/tenants/ (и те, кто сейчас не живёт) */
  tenants: ResidentDef[];
  layout: BuildingLayout;
  dataHash: string;
}

export interface BuildResult {
  defs?: WorldDefs;
  errors: string[];
  warnings: string[];
}

const FAMILY_INVERSE: Partial<Record<RelationKind, RelationKind>> = {
  spouse: 'spouse',
  partner: 'partner',
  parent: 'child',
  child: 'parent',
  sibling: 'sibling',
  grandparent: 'grandchild',
  grandchild: 'grandparent',
  relative: 'relative',
};
export const FAMILY_KINDS = new Set(Object.keys(FAMILY_INVERSE) as RelationKind[]);
export function inverseRelation(kind: RelationKind): RelationKind {
  return FAMILY_INVERSE[kind] ?? (kind === 'crush' ? 'neighbor' : kind);
}

function fmtZod(prefix: string, err: z.ZodError): string[] {
  return err.issues.map((i) => `${prefix}: ${i.path.join('.') || '(корень)'} — ${i.message}`);
}

export function buildDefs(raw: RawData): BuildResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const worldR = WorldConfigSchema.safeParse(raw.world);
  if (!worldR.success) errors.push(...fmtZod('data/world.json', worldR.error));
  const catR = FurnitureCatalogSchema.safeParse(raw.catalog);
  if (!catR.success) errors.push(...fmtZod('data/catalog/furniture.json', catR.error));

  const apartments: ApartmentDef[] = [];
  for (const f of raw.apartments) {
    const r = ApartmentSchema.safeParse(f.data);
    if (!r.success) {
      errors.push(...fmtZod(`data/apartments/${f.file}.json`, r.error));
      continue;
    }
    if (r.data.id !== f.file) errors.push(`data/apartments/${f.file}.json: id "${r.data.id}" не совпадает с именем файла`);
    if (r.data.id !== `apt-${r.data.floor}-${r.data.side}`)
      errors.push(`data/apartments/${f.file}.json: id должен быть apt-${r.data.floor}-${r.data.side}`);
    apartments.push(r.data);
  }

  const residents: ResidentDef[] = [];
  for (const f of raw.residents) {
    const r = ResidentSchema.safeParse(f.data);
    if (!r.success) {
      errors.push(...fmtZod(`data/residents/${f.file}.json`, r.error));
      continue;
    }
    if (r.data.id !== f.file) errors.push(`data/residents/${f.file}.json: id "${r.data.id}" не совпадает с именем файла`);
    residents.push(r.data);
  }

  const tenants: ResidentDef[] = [];
  for (const f of raw.tenants ?? []) {
    const r = ResidentSchema.safeParse(f.data);
    if (!r.success) {
      errors.push(...fmtZod(`data/tenants/${f.file}.json`, r.error));
      continue;
    }
    if (r.data.id !== f.file) errors.push(`data/tenants/${f.file}.json: id "${r.data.id}" не совпадает с именем файла`);
    tenants.push(r.data);
  }

  if (!worldR.success || !catR.success) return { errors, warnings };
  const config = worldR.data;
  const catalog = new Map(catR.data.items.map((i) => [i.id, i]));
  if (catalog.size !== catR.data.items.length) errors.push('furniture.json: повторяющиеся id');

  // ── арендаторы: только в сдаваемых квартирах; их вещи — в квартиру (видны, пока хозяин живёт)
  for (const t of tenants) {
    const apt = apartments.find((a) => a.id === t.apartment);
    if (!apt) {
      errors.push(`арендатор ${t.id}: квартира "${t.apartment}" не описана в data/apartments/`);
      continue;
    }
    if (!apt.rental) errors.push(`арендатор ${t.id}: квартира ${apt.id} не сдаётся (нет "rental": true)`);
    if (residents.some((r) => r.id === t.id)) errors.push(`${t.id}: и постоянный жилец, и арендатор`);
    if (t.lease && t.lease.maxDays < t.lease.minDays) errors.push(`арендатор ${t.id}: lease.maxDays меньше minDays`);
    for (const b of t.belongings) {
      const room = apt.rooms[b.room];
      if (!room) {
        errors.push(`арендатор ${t.id}: в ${apt.id} нет комнаты ${b.room}`);
        continue;
      }
      room.furniture.push({ item: b.item, x: b.x, elevation: b.elevation, flip: b.flip, color: b.color, owner: t.id, tenant: t.id });
    }
  }
  for (const r of residents)
    if (apartments.find((a) => a.id === r.apartment)?.rental) errors.push(`${r.id}: квартира ${r.apartment} сдаётся — жильцов туда описывают в data/tenants/`);

  // ── квартиры
  const aptIds = new Set<string>();
  for (const a of apartments) {
    if (aptIds.has(a.id)) errors.push(`квартира ${a.id} описана дважды`);
    aptIds.add(a.id);
    if (a.floor === 1 && a.side === 'right')
      errors.push(`${a.id}: на первом этаже справа — колясочная и выход во двор, квартиры там нет`);
    const total = a.rooms.reduce((s, r) => s + r.width, 0);
    if (total !== config.building.apartmentWidthTiles)
      errors.push(`${a.id}: сумма ширин комнат ${total} ≠ ${config.building.apartmentWidthTiles} тайлов`);
    const entrance = a.side === 'left' ? a.rooms[a.rooms.length - 1] : a.rooms[0];
    if (entrance && ['bedroom', 'kitchen', 'bathroom'].includes(entrance.type))
      warnings.push(`${a.id}: у лестницы обычно прихожая (hall), а тут ${entrance.type}`);
    a.rooms.forEach((room, ri) => {
      const roomW = room.width * 16;
      for (const fp of room.furniture) {
        const fd = catalog.get(fp.item);
        if (!fd) {
          errors.push(`${a.id}, комната ${ri} (${room.type}): нет предмета "${fp.item}" в каталоге`);
          continue;
        }
        if (fp.x + fd.w > roomW)
          errors.push(`${a.id}, комната ${ri} (${room.type}): ${fp.item} (x=${fp.x}, w=${fd.w}) не влезает в ${roomW}px`);
      }
    });
  }

  // ── жильцы
  const residentById = new Map<string, ResidentDef>();
  for (const r of residents) {
    if (residentById.has(r.id)) errors.push(`жилец ${r.id} описан дважды`);
    residentById.set(r.id, r);
    if (!aptIds.has(r.apartment))
      errors.push(`${r.id}: квартира "${r.apartment}" не описана в data/apartments/`);
    const needsSchedule = ['office', 'shift', 'remote', 'student', 'school', 'onsite'].includes(r.occupation.kind);
    if (needsSchedule && !r.occupation.schedule)
      errors.push(`${r.id}: для занятости "${r.occupation.kind}" нужен occupation.schedule`);
    if (r.occupation.schedule && r.occupation.schedule.days.length === 0)
      warnings.push(`${r.id}: в расписании нет рабочих дней`);
    if (!r.name.cases.dat || !r.name.cases.gen || !r.name.cases.ins || !r.name.cases.acc)
      warnings.push(`${r.id}: не все падежи имени заполнены — хроника подставит автоматические формы`);
  }
  for (const r of residents) {
    for (const rel of r.relationships) {
      if (rel.with === r.id) errors.push(`${r.id}: отношение с самим собой`);
      const other = residentById.get(rel.with);
      if (!other) {
        errors.push(`${r.id}: отношение с несуществующим жильцом "${rel.with}"`);
        continue;
      }
      if (FAMILY_KINDS.has(rel.kind)) {
        const inv = inverseRelation(rel.kind);
        const back = other.relationships.find((x) => x.with === r.id);
        if (!back) warnings.push(`${rel.with}: нет обратной семейной связи (${inv}) с ${r.id}`);
        else if (back.kind !== inv)
          warnings.push(`${r.id}→${rel.with} = ${rel.kind}, а обратно ${back.kind} (ожидалось ${inv})`);
      }
    }
  }

  // ── квартира vs жильцы
  for (const a of apartments) {
    const people = [...residents, ...tenants].filter((r) => r.apartment === a.id);
    if (a.entranceWindow && a.side !== 'right') warnings.push(`${a.id}: окно над входом бывает только у правых квартир (вход в подъезд справа)`);
    for (const room of a.rooms)
      for (const fp of room.furniture)
        if (fp.owner && !people.some((p) => p.id === fp.owner)) warnings.push(`${a.id}: хозяин вещи ${fp.item} «${fp.owner}» тут не живёт`);
    const slots = a.rooms.flatMap((room) =>
      room.furniture.flatMap((fp) => catalog.get(fp.item)?.slots ?? []),
    );
    const has = (u: string) => slots.filter((s) => s.use.includes(u as never)).length;
    if (people.length === 0 && !a.renovation && !a.rental) warnings.push(`${a.id}: квартира пустая — ждёт жильца (опиши его, и квартиру обставим под него)`);
    if (people.length > 0 && a.renovation) errors.push(`${a.id}: в квартире идёт ремонт — заселить нельзя (renovation: true)`);
    if (people.length > 0 || a.rental) {
      if (has('sleep') < (a.rental ? 1 : people.length)) warnings.push(`${a.id}: спальных мест ${has('sleep')}, жильцов ${people.length}`);
      if (!has('cook')) warnings.push(`${a.id}: нет плиты (cook)`);
      if (!has('fridge')) warnings.push(`${a.id}: нет холодильника (fridge)`);
      if (!has('toilet')) warnings.push(`${a.id}: нет туалета (toilet)`);
      if (!has('eat') && !has('sit')) warnings.push(`${a.id}: негде сесть поесть`);
    }
  }

  if (errors.length) return { errors, warnings };

  const layout = new BuildingLayout(config, apartments, catalog);
  const dataHash = hashString(
    JSON.stringify([raw.world, raw.catalog, raw.residents.map((r) => r.data), raw.apartments.map((a) => a.data), (raw.tenants ?? []).map((t) => t.data)]),
  ).toString(36);

  return {
    errors,
    warnings,
    defs: {
      config,
      epochMs: parseEpoch(config.startDate),
      catalog,
      apartments,
      residents,
      residentById,
      tenants,
      layout,
      dataHash,
    },
  };
}
