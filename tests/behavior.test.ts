import { describe, expect, it } from 'vitest';
import { DT } from '../src/config';
import { calendar, DAY } from '../src/core/time';
import { buildDefs } from '../src/data/defs';
import { loadRawDataNode } from '../src/data/loadNode';

/** тестовый дом с пятью жильцами (tests/fixtures/data) + общий каталог мебели */
const FIXTURE = (): ReturnType<typeof loadRawDataNode> => loadRawDataNode('tests/fixtures/data', 'data');
import { Simulation } from '../src/sim/simulation';
import { createWorldState } from '../src/sim/state';

function makeSim(seed = 11) {
  const r = buildDefs(FIXTURE());
  if (!r.defs) throw new Error(r.errors.join('\n'));
  return new Simulation(r.defs, createWorldState(r.defs, seed));
}

/** собрать, кто что делал по часам */
function trace(sim: Simulation, days: number) {
  const log: { id: string; hour: number; weekday: number; action: string; away: boolean }[] = [];
  const steps = Math.round((days * DAY) / DT);
  for (let i = 0; i < steps; i++) {
    sim.step();
    if (sim.time % 600 === 0) {
      const c = calendar(sim.defs.epochMs, sim.time);
      for (const id of sim.residentIds()) {
        const r = sim.state.residents[id];
        log.push({ id, hour: c.hourOfDay, weekday: c.weekday, action: r.action?.id ?? '', away: r.away });
      }
    }
  }
  return log;
}

describe('поведение', () => {
  const sim = makeSim();
  const log = trace(sim, 4);

  it('ночью все спят', () => {
    const night = log.filter((l) => l.hour >= 3 && l.hour < 4.5);
    expect(night.length).toBeGreaterThan(0);
    expect(night.every((l) => l.action === 'sleep')).toBe(true);
  });

  it('Ольга в рабочий день уходит на смену и возвращается', () => {
    const work = log.filter((l) => l.id === 'olga' && l.weekday === 2 && l.hour >= 10 && l.hour < 16);
    expect(work.every((l) => l.away && l.action === 'go_to_work')).toBe(true);
    const evening = log.filter((l) => l.id === 'olga' && l.weekday === 2 && l.hour >= 21 && l.hour < 21.5);
    expect(evening.every((l) => !l.away)).toBe(true);
  });

  it('Марк работает из дома днём в будни', () => {
    const work = log.filter((l) => l.id === 'mark' && l.weekday <= 4 && l.hour >= 11 && l.hour < 19);
    const share = work.filter((l) => l.action === 'work').length / work.length;
    expect(share).toBeGreaterThan(0.4);
  });

  it('никто не голодает и не падает без сил надолго', () => {
    for (const id of sim.residentIds()) {
      const n = sim.state.residents[id].needs;
      expect(n.food).toBeGreaterThan(10);
      expect(n.energy).toBeGreaterThan(5);
    }
  });
});

describe('следы жизни в квартирах', () => {
  it('посуда копится после еды и потом моется, кровати заправляют', () => {
    const sim = makeSim(21);
    let maxDishes = 0;
    let washed = false;
    let madeBed = false;
    for (let i = 0; i < (3 * 86400) / 10; i++) {
      sim.step();
      for (const st of Object.values(sim.state.apartments)) maxDishes = Math.max(maxDishes, st.dishes);
      for (const r of Object.values(sim.state.residents)) {
        if (r.action?.id === 'wash_dishes') washed = true;
        if (r.action?.id === 'make_bed') madeBed = true;
      }
    }
    expect(maxDishes).toBeGreaterThan(0);
    expect(washed).toBe(true);
    expect(madeBed).toBe(true);
  });
});

describe('настоящий дом', () => {
  it('консьержная, квартира после ремонта, строится третий этаж', async () => {
    const { buildDefs: build } = await import('../src/data/defs');
    const r = build(loadRawDataNode());
    expect(r.errors).toEqual([]);
    const L = r.defs!.layout;
    expect(L.levels).toBe(3);
    expect(L.constructionLevel).toBe(2);
    expect(L.aptById.get('apt-1-left')).toBeTruthy();
    expect(L.aptById.get('apt-2-left')?.def?.renovation).toBe(false);
    expect(L.aptById.get('apt-2-right')?.vacant).toBe(false); // там живут Иван и Снежана
  });
});

describe('Ольга Дмитриевна (настоящий дом)', () => {
  it('кошки живут, дочь приезжает, бессонница видна по ночам', async () => {
    const { buildDefs: build } = await import('../src/data/defs');
    const { Simulation: Sim } = await import('../src/sim/simulation');
    const { createWorldState: create } = await import('../src/sim/state');
    const d = build(loadRawDataNode()).defs!;
    const sim = new Sim(d, create(d, 77));
    expect(Object.keys(sim.state.pets)).toHaveLength(2);
    const xs = new Set<number>();
    for (let i = 0; i < (150 * 86400) / 10; i++) {
      sim.step();
      if (i % 360 === 0) xs.add(Math.round(Object.values(sim.state.pets)[0].x));
    }
    expect(xs.size).toBeGreaterThan(5); // кошка не стоит на месте
    const kinds = new Set(sim.state.chronicle.map((e) => e.kind));
    expect(kinds.has('relative.arrive')).toBe(true);
    expect(kinds.has('insomnia')).toBe(true);
    expect(kinds.has('pet')).toBe(true);
    expect(kinds.has('phone-call')).toBe(true);
  }, 60_000);
});

describe('быт и мастера (настоящий дом)', () => {
  it('сумки разбирают сразу, в туалет ходят, мастера приходят и уходят, консьержка с ними здоровается', async () => {
    const { buildDefs: build } = await import('../src/data/defs');
    const { Simulation: Sim } = await import('../src/sim/simulation');
    const { createWorldState: create } = await import('../src/sim/state');
    const d = build(loadRawDataNode()).defs!;
    const sim = new Sim(d, create(d, 5));
    const started: Record<string, number> = {};
    sim.bus.on('action.start', (e) => (started[e.actionId] = (started[e.actionId] ?? 0) + 1));
    let bagsSince = -1;
    let maxBagsWait = 0;
    const phases = new Set<string>();
    let gestures = 0;
    for (let i = 0; i < (14 * 86400) / 10; i++) {
      sim.step();
      const st = sim.state.apartments['apt-1-left'];
      if (st.bags > 0 && bagsSince < 0) bagsSince = sim.time;
      if (st.bags === 0 && bagsSince >= 0) {
        maxBagsWait = Math.max(maxBagsWait, sim.time - bagsSince);
        bagsSince = -1;
      }
      for (const w of sim.state.workers) phases.add(w.phase);
      if (sim.state.residents['olga-shpak'].gesture) gestures++;
    }
    expect(started.shopping).toBeGreaterThan(0);
    expect(maxBagsWait).toBeLessThan(40 * 60); // продукты не стоят в прихожей часами
    expect(started.cook).toBeGreaterThan(10);
    expect(started.toilet).toBeGreaterThan(14 * 2.5); // несколько раз в день
    expect([...phases].sort()).toEqual(['arriving', 'leaving', 'lunch', 'off', 'working']);
    expect(gestures).toBeGreaterThan(0);
    expect(sim.state.chronicle.some((e) => e.kind === 'workers.greet')).toBe(true);
    // в воскресенье мастеров нет
    const sunday = sim.state.workers.every((w) => w.away || w.phase === 'off' || sim.calendar().weekday !== 7);
    expect(sunday).toBe(true);
  }, 60_000);
});

describe('старое сохранение', () => {
  it('мир версии 7 (без мастеров и туалета) дополняется и живёт дальше', async () => {
    const { buildDefs: build } = await import('../src/data/defs');
    const { Simulation: Sim } = await import('../src/sim/simulation');
    const { createWorldState: create, MIGRATABLE_VERSIONS } = await import('../src/sim/state');
    expect(MIGRATABLE_VERSIONS).toContain(7);
    const d = build(loadRawDataNode()).defs!;
    const old = new Sim(d, create(d, 3));
    for (let i = 0; i < 8640; i++) old.step();
    const st = JSON.parse(JSON.stringify(old.state));
    delete st.workers;
    for (const r of Object.values(st.residents) as { needs: Record<string, number> }[]) delete r.needs.bladder;
    const sim = new Sim(d, st);
    expect(sim.state.workers).toHaveLength(2);
    for (let i = 0; i < 8640; i++) sim.step();
    expect(Number.isFinite(sim.state.residents['olga-shpak'].needs.bladder)).toBe(true);
  });
});

describe('Иван и Снежана (настоящий дом)', () => {
  it('пара: пары и подработка, вдвоём гуляют, смотрят кино, шахматы; у каждого свой стол', async () => {
    const { buildDefs: build } = await import('../src/data/defs');
    const { Simulation: Sim } = await import('../src/sim/simulation');
    const { createWorldState: create } = await import('../src/sim/state');
    const d = build(loadRawDataNode()).defs!;
    const sim = new Sim(d, create(d, 11));
    const kinds: Record<string, number> = {};
    const started: Record<string, Record<string, number>> = {};
    const deskOf: Record<string, Set<string>> = {};
    sim.bus.on('action.start', (e) => {
      const m = (started[e.residentId] ??= {});
      m[e.actionId] = (m[e.actionId] ?? 0) + 1;
    });
    for (let i = 0; i < (21 * 86400) / 10; i++) {
      sim.step();
      for (const id of ['ivan-muravyev', 'snezhana-galimova']) {
        const a = sim.state.residents[id].action;
        if (a?.phase === 'perform' && a.id === 'together' && a.data.lead) kinds[String(a.data.kind)] = 1;
        if (a?.phase === 'perform' && (a.id === 'gaming' || a.id === 'side_work') && a.target.slot) (deskOf[id] ??= new Set()).add(sim.slotIndex.get(a.target.slot)!.furnitureUid);
      }
    }
    for (const id of ['ivan-muravyev', 'snezhana-galimova']) {
      expect(started[id].go_to_work).toBeGreaterThan(5); // пары
      expect(started[id].side_work).toBeGreaterThan(5); // работа онлайн
      expect(started[id].tea).toBeGreaterThan(10); // кофе по утрам
    }
    expect(started['ivan-muravyev'].gaming).toBeGreaterThan(5);
    expect(started['ivan-muravyev'].chess).toBeGreaterThan(started['snezhana-galimova'].chess ?? 0); // шахматы — в основном Иван
    expect(Object.keys(kinds)).toEqual(expect.arrayContaining(['walk', 'film', 'chess', 'intimacy']));
    // Ванин компьютер — только Ванин
    const [ivDesk] = [...deskOf['ivan-muravyev']];
    expect(deskOf['ivan-muravyev'].size).toBe(1);
    expect(deskOf['snezhana-galimova']?.has(ivDesk) ?? false).toBe(false);
  }, 60_000);
});

describe('одежда и проводы (настоящий дом)', () => {
  it('куртку надевают в прихожей, дома без неё; уходящего провожают из окна над входом', async () => {
    const { buildDefs: build } = await import('../src/data/defs');
    const { Simulation: Sim } = await import('../src/sim/simulation');
    const { createWorldState: create } = await import('../src/sim/state');
    const { hallOf } = await import('../src/sim/dressing');
    const d = build(loadRawDataNode()).defs!;
    const sim = new Sim(d, create(d, 21));
    let waves = 0;
    let dressings = 0;
    let coatAtHome = 0;
    for (let i = 0; i < (10 * 86400) / 10; i++) {
      sim.step();
      for (const def of d.residents) {
        const r = sim.state.residents[def.id];
        if (r.action?.data.dressing === 'on' && Number(r.action.data.pauseUntil) - sim.time === 100) dressings++;
        const apt = d.layout.aptById.get(def.apartment)!;
        const hall = hallOf(sim, apt.id);
        const deepInside = !r.away && r.level === apt.level && r.x >= apt.x0 && r.x < apt.x1 && !(r.x >= hall.x0 && r.x < hall.x1);
        if (r.dressed && deepInside && r.action?.phase === 'perform') coatAtHome++;
        if (r.action?.id === 'wave_window' && r.gesture) waves++;
      }
    }
    expect(dressings).toBeGreaterThan(5);
    expect(coatAtHome).toBe(0);
    expect(waves).toBeGreaterThan(3);
    expect(sim.state.chronicle.some((e) => e.kind === 'farewell.window')).toBe(true);
  }, 60_000);
});

describe('стройка третьего этажа (настоящий дом)', () => {
  it('бригада с ремонта переходит на стройку, возит цемент на лифте, этаж растёт и достраивается', async () => {
    const { buildDefs: build } = await import('../src/data/defs');
    const { Simulation: Sim } = await import('../src/sim/simulation');
    const { createWorldState: create } = await import('../src/sim/state');
    const d = build(loadRawDataNode()).defs!;
    // старое сохранение: бригада ещё числится на ремонте второго этажа и сейчас там работает
    const st = create(d, 9);
    st.workers = [0, 1].map((i) => ({
      id: `apt-2-left:${i}`, aptId: 'apt-2-left', idx: i, phase: 'working' as const, day: -1, arriveAt: 0, lunchAt: 0, backAt: 0, leaveAt: 0, lunchDone: false,
      x: 100 + i * 20, y: d.layout.floorY(1), level: 1, away: false, facing: 1 as const, path: [], walkDist: 0, greetedAt: -1e9, gesture: null,
    }));
    const sim = new Sim(d, st);
    expect(sim.state.workers.every((w) => w.aptId === 'build-3')).toBe(true);
    expect(sim.state.chronicle.some((e) => e.kind === 'renovation.done')).toBe(true);
    let rode = false;
    let maxLevel = 0;
    for (let i = 0; i < (70 * 86400) / 10 && !sim.state.construction?.done; i++) {
      sim.step();
      if (sim.state.elevator.riders.some((id) => id.startsWith('build-3'))) rode = true;
      for (const w of sim.state.workers) if (!w.away) maxLevel = Math.max(maxLevel, w.level);
    }
    expect(rode).toBe(true);
    expect(maxLevel).toBe(2);
    expect(sim.state.construction?.done).toBe(true);
    const stages = sim.state.chronicle.filter((e) => e.kind === 'construction').map((e) => e.data.stage);
    expect(stages).toEqual(['start', 'walls', 'roof', 'windows', 'done']);
    // бригада уходит насовсем
    for (let i = 0; i < 8640; i++) sim.step();
    expect(sim.state.workers).toHaveLength(0);
  }, 120_000);
});
