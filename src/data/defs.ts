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
  apartments: RawFile[];
}

export interface WorldDefs {
  config: WorldConfig;
  epochMs: number;
  catalog: Map<string, FurnitureDef>;
  apartments: ApartmentDef[];
  residents: ResidentDef[];
  residentById: Map<string, ResidentDef>;
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

  if (!worldR.success || !catR.success) return { errors, warnings };
  const config = worldR.data;
  const catalog = new Map(catR.data.items.map((i) => [i.id, i]));
  if (catalog.size !== catR.data.items.length) errors.push('furniture.json: повторяющиеся id');

  // ── квартиры
  const aptIds = new Set<string>();
  for (const a of apartments) {
    if (aptIds.has(a.id)) errors.push(`квартира ${a.id} описана дважды`);
    aptIds.add(a.id);
    if (a.floor > config.building.residentialFloors)
      errors.push(`${a.id}: этаж ${a.floor} выше последнего (${config.building.residentialFloors})`);
    const total = a.rooms.reduce((s, r) => s + r.width, 0);
    if (total !== config.building.apartmentWidthTiles)
      errors.push(`${a.id}: сумма ширин комнат ${total} ≠ ${config.building.apartmentWidthTiles} тайлов`);
    const entrance = a.side === 'left' ? a.rooms[a.rooms.length - 1] : a.rooms[0];
    if (entrance && entrance.type !== 'hall' && entrance.type !== 'studio')
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
    const needsSchedule = ['office', 'shift', 'remote', 'student', 'school'].includes(r.occupation.kind);
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
    const people = residents.filter((r) => r.apartment === a.id);
    const slots = a.rooms.flatMap((room) =>
      room.furniture.flatMap((fp) => catalog.get(fp.item)?.slots ?? []),
    );
    const has = (u: string) => slots.filter((s) => s.use.includes(u as never)).length;
    if (people.length === 0) warnings.push(`${a.id}: квартира описана, но в ней никто не живёт`);
    if (people.length > 0) {
      if (has('sleep') < people.length) warnings.push(`${a.id}: спальных мест ${has('sleep')}, жильцов ${people.length}`);
      if (!has('cook')) warnings.push(`${a.id}: нет плиты (cook)`);
      if (!has('fridge')) warnings.push(`${a.id}: нет холодильника (fridge)`);
      if (!has('eat') && !has('sit')) warnings.push(`${a.id}: негде сесть поесть`);
    }
  }

  if (errors.length) return { errors, warnings };

  const layout = new BuildingLayout(config, apartments, catalog);
  const dataHash = hashString(
    JSON.stringify([raw.world, raw.catalog, raw.residents.map((r) => r.data), raw.apartments.map((a) => a.data)]),
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
      layout,
      dataHash,
    },
  };
}
