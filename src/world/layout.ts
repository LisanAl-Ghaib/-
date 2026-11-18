import {
  ALLEY_W, CORE_W, FLOOR_H, GROUND_H, INNER_WALL, OUTER_WALL, ROOF_H, SKY_MARGIN, SLAB, TILE, YARD_W,
} from '../config';
import type {
  ApartmentDef, FurnitureDef, Pose, RoomDef, RoomType, SlotUse, WorldConfig,
} from '../data/schemas';

export interface SlotInstance {
  key: string;
  use: SlotUse[];
  x: number;
  pose: Pose;
  dy: number;
  face: 1 | -1 | 0;
  furnitureUid: string;
  aptId: string;
  roomIndex: number;
}

export interface FurnitureInstance {
  uid: string;
  def: FurnitureDef;
  /** левый край в мире */
  x: number;
  /** нижний край в мире */
  y: number;
  w: number;
  h: number;
  flip: boolean;
  color?: string;
  slots: SlotInstance[];
  roomIndex: number;
}

export interface RoomModel {
  index: number;
  type: RoomType;
  name: string;
  x0: number;
  x1: number;
  def: RoomDef;
  furniture: FurnitureInstance[];
}

export interface ApartmentModel {
  id: string;
  def: ApartmentDef | null; // null — пустая квартира
  level: number;
  side: 'left' | 'right';
  number: number;
  x0: number;
  x1: number;
  /** x входной двери (граница с ядром) */
  doorX: number;
  /** точка сразу за дверью внутри */
  insideX: number;
  /** точка на площадке перед дверью */
  landingX: number;
  rooms: RoomModel[];
  slots: SlotInstance[];
  vacant: boolean;
}

export type Zone =
  | { kind: 'apt'; aptId: string; room: number }
  | { kind: 'core'; level: number }
  | { kind: 'ground-left' }
  | { kind: 'ground-right' }
  | { kind: 'yard' }
  | { kind: 'alley' }
  | { kind: 'away' };

const ROOM_NAMES: Record<RoomType, string> = {
  hall: 'прихожая',
  kitchen: 'кухня',
  living: 'гостиная',
  bedroom: 'спальня',
  bathroom: 'ванная',
  study: 'кабинет',
  kids: 'детская',
  studio: 'комната',
};

/** Этаж по-человечески (уровень 0 — первый этаж) */
export function floorNo(level: number): number {
  return level + 1;
}

export class BuildingLayout {
  /** индекс верхнего уровня (уровень 0 — первый этаж с подъездом) */
  readonly floors: number;
  /** всего уровней = этажей в доме */
  readonly levels: number;
  readonly aptW: number;
  readonly buildingX0: number;
  readonly buildingX1: number;
  readonly coreX: number;
  readonly worldW: number;
  readonly worldH: number;
  readonly roofY: number;
  readonly groundY: number;
  readonly exteriorDoorX: number;
  readonly apartments: ApartmentModel[] = [];
  readonly aptById = new Map<string, ApartmentModel>();
  /** точки интереса во дворе */
  readonly yard: {
    x0: number;
    x1: number;
    bench: { x: number; seats: number[] };
    trees: number[];
    swing: number;
    busStop: number;
    offscreenX: number;
    lamp: number;
    bins: number;
  };
  readonly stairs: { footX: number; landingX: number; x0: number; x1: number };
  readonly elevator: { x0: number; x1: number; doorX: number };

  constructor(cfg: WorldConfig, aptDefs: ApartmentDef[], catalog: Map<string, FurnitureDef>) {
    // дом растёт вместе с жильцами
    const maxFloor = Math.max(cfg.building.minFloors, ...aptDefs.map((a) => a.floor));
    this.levels = maxFloor;
    this.floors = maxFloor - 1;
    this.aptW = cfg.building.apartmentWidthTiles * TILE;
    this.buildingX0 = ALLEY_W;
    const bw = OUTER_WALL * 2 + this.aptW * 2 + CORE_W;
    this.buildingX1 = this.buildingX0 + bw;
    this.coreX = this.buildingX0 + OUTER_WALL + this.aptW;
    this.worldW = this.buildingX1 + YARD_W;
    this.roofY = SKY_MARGIN;
    this.groundY = this.floorY(0);
    this.worldH = this.levelTop(0) + FLOOR_H + GROUND_H;
    this.exteriorDoorX = this.buildingX1 - OUTER_WALL - 6;

    const yx = this.buildingX1;
    this.yard = {
      x0: yx,
      x1: this.worldW,
      bench: { x: yx + 72, seats: [yx + 76, yx + 84, yx + 92] },
      trees: [yx + 36, yx + 132, yx + 196],
      swing: yx + 160,
      busStop: this.worldW - 28,
      offscreenX: this.worldW + 24,
      lamp: yx + 112,
      bins: yx + 14,
    };
    this.stairs = { footX: this.coreX + 8, landingX: this.coreX + 34, x0: this.coreX + 2, x1: this.coreX + 40 };
    this.elevator = { x0: this.coreX + 42, x1: this.coreX + 62, doorX: this.coreX + 52 };

    const byKey = new Map(aptDefs.map((a) => [`${a.floor - 1}-${a.side}`, a]));
    // на первом этаже слева может быть комната консьержки
    const ground = byKey.get('0-left');
    if (ground) {
      const apt = this.buildApartment(0, 'left', ground, catalog);
      this.apartments.push(apt);
      this.aptById.set(apt.id, apt);
    }
    for (let level = 1; level <= this.floors; level++) {
      for (const side of ['left', 'right'] as const) {
        const def = byKey.get(`${level}-${side}`) ?? null;
        const apt = this.buildApartment(level, side, def, catalog);
        this.apartments.push(apt);
        this.aptById.set(apt.id, apt);
      }
    }
  }

  levelTop(level: number): number {
    return SKY_MARGIN + ROOF_H + (this.floors - level) * FLOOR_H;
  }

  /** y линии пола уровня (на ней стоят ноги) */
  floorY(level: number): number {
    return this.levelTop(level) + FLOOR_H - SLAB;
  }

  levelAtY(y: number): number {
    const l = this.floors - Math.floor((y - SKY_MARGIN - ROOF_H) / FLOOR_H);
    return Math.max(0, Math.min(this.floors, l));
  }

  /** id квартиры по уровню: этаж в id — человеческий (уровень + 1) */
  static aptId(level: number, side: 'left' | 'right'): string {
    return `apt-${level + 1}-${side}`;
  }

  private buildApartment(
    level: number,
    side: 'left' | 'right',
    def: ApartmentDef | null,
    catalog: Map<string, FurnitureDef>,
  ): ApartmentModel {
    const id = BuildingLayout.aptId(level, side);
    const x0 = side === 'left' ? this.buildingX0 + OUTER_WALL : this.coreX + CORE_W;
    const x1 = x0 + this.aptW;
    const doorX = side === 'left' ? x1 : x0;
    const apt: ApartmentModel = {
      id,
      def,
      level,
      side,
      number: def?.number ?? (level === 0 ? 0 : (level - 1) * 2 + (side === 'left' ? 1 : 2)),
      x0,
      x1,
      doorX,
      insideX: side === 'left' ? x1 - 8 : x0 + 8,
      landingX: side === 'left' ? x1 + 6 : x0 - 6,
      rooms: [],
      slots: [],
      vacant: !def,
    };
    const fy = this.floorY(level);
    const roomDefs: RoomDef[] = def
      ? def.rooms
      : [{ type: 'studio', width: this.aptW / TILE, window: true, furniture: [] }];
    let cx = x0;
    roomDefs.forEach((rd, index) => {
      const rx0 = cx;
      const rx1 = cx + rd.width * TILE;
      cx = rx1;
      const room: RoomModel = {
        index,
        type: rd.type,
        name: rd.name ?? ROOM_NAMES[rd.type],
        x0: rx0,
        x1: rx1,
        def: rd,
        furniture: [],
      };
      rd.furniture.forEach((fp, fi) => {
        const fd = catalog.get(fp.item);
        if (!fd) return; // валидация сообщит отдельно
        const uid = `${id}:${index}:${fi}`;
        const fx = rx0 + fp.x;
        const inst: FurnitureInstance = {
          uid,
          def: fd,
          x: fx,
          y: fy - (fp.elevation ?? fd.elevation),
          w: fd.w,
          h: fd.h,
          flip: fp.flip,
          color: fp.color,
          slots: [],
          roomIndex: index,
        };
        fd.slots.forEach((s, si) => {
          const sx = fp.flip ? fx + fd.w - s.dx : fx + s.dx;
          const face = (fp.flip ? -s.face : s.face) as 1 | -1 | 0;
          const slot: SlotInstance = {
            key: `${uid}#${si}`,
            use: s.use,
            x: sx,
            pose: s.pose,
            dy: s.dy,
            face,
            furnitureUid: uid,
            aptId: id,
            roomIndex: index,
          };
          inst.slots.push(slot);
          apt.slots.push(slot);
        });
        room.furniture.push(inst);
      });
      apt.rooms.push(room);
    });
    return apt;
  }

  roomAt(apt: ApartmentModel, x: number): RoomModel {
    for (const r of apt.rooms) if (x >= r.x0 && x < r.x1) return r;
    return x < apt.x0 ? apt.rooms[0] : apt.rooms[apt.rooms.length - 1];
  }

  zoneAt(level: number, x: number, away = false): Zone {
    if (away) return { kind: 'away' };
    if (x < this.buildingX0) return { kind: 'alley' };
    if (x >= this.buildingX1) return { kind: 'yard' };
    if (x >= this.coreX && x < this.coreX + CORE_W) return { kind: 'core', level };
    const side = x < this.coreX ? 'left' : 'right';
    const apt = this.aptById.get(BuildingLayout.aptId(level, side));
    if (!apt) return side === 'left' ? { kind: 'ground-left' } : { kind: 'ground-right' };
    return { kind: 'apt', aptId: apt.id, room: this.roomAt(apt, x).index };
  }

  apartmentAt(level: number, x: number): ApartmentModel | undefined {
    if (level < 0) return undefined;
    if (x < this.buildingX0 + OUTER_WALL || x >= this.buildingX1 - OUTER_WALL) return undefined;
    if (x >= this.coreX && x < this.coreX + CORE_W) return undefined;
    const side = x < this.coreX ? 'left' : 'right';
    return this.aptById.get(BuildingLayout.aptId(level, side));
  }

  /** Границы внутренних стен квартиры (x стен между комнатами) */
  innerWalls(apt: ApartmentModel): number[] {
    return apt.rooms.slice(1).map((r) => r.x0 - INNER_WALL / 2);
  }
}
