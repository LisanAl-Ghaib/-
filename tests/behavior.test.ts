import { describe, expect, it } from 'vitest';
import { DT } from '../src/config';
import { calendar, DAY } from '../src/core/time';
import { buildDefs } from '../src/data/defs';
import { loadRawDataNode } from '../src/data/loadNode';

/** тестовый дом с пятью жильцами (tests/fixtures/data) + общий каталог мебели */
const FIXTURE = (): ReturnType<typeof loadRawDataNode> => loadRawDataNode('tests/fixtures/data', 'data');
/** настоящий дом до сдачи третьего этажа: стройка идёт, Клода Антроповича ещё нет */
const beforeClaude = (): ReturnType<typeof loadRawDataNode> => {
  const raw = loadRawDataNode();
  (raw.world as { building: { construction: { finished: boolean } } }).building.construction.finished = false;
  raw.residents = raw.residents.filter((r) => r.file !== 'claude-opusov');
  raw.apartments = raw.apartments.filter((a) => a.file !== 'apt-3-right');
  return raw;
};
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
    expect(Object.keys(sim.state.pets).filter((k) => k.startsWith('olga-shpak:'))).toHaveLength(2);
    const xs = new Set<number>();
    for (let i = 0; i < (150 * 86400) / 10; i++) {
      sim.step();
      if (i % 360 === 0) xs.add(Math.round(sim.state.pets['olga-shpak:0'].x));
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
    const d = build(beforeClaude()).defs!;
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
    const d = build(beforeClaude()).defs!;
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
    const d = build(beforeClaude()).defs!;
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

describe('Павел Муров (настоящий дом)', () => {
  it('завод 5/2, курит в окно и у подъезда, кормит рыбку, бессонница и кошмары, «уволюсь», свет не включает', async () => {
    const { buildDefs: build } = await import('../src/data/defs');
    const { Simulation: Sim } = await import('../src/sim/simulation');
    const { createWorldState: create } = await import('../src/sim/state');
    const d = build(loadRawDataNode()).defs!;
    const sim = new Sim(d, create(d, 13));
    const started: Record<string, number> = {};
    sim.bus.on('action.start', (e) => {
      if (e.residentId === 'pavel-murov') started[e.actionId] = (started[e.actionId] ?? 0) + 1;
    });
    let streetOutside = 0;
    for (let i = 0; i < (21 * 86400) / 10; i++) {
      sim.step();
      const r = sim.state.residents['pavel-murov'];
      if (!r.away && r.level === 0 && r.x > d.layout.buildingX1 && r.dressed) streetOutside++;
    }
    expect(started.go_to_work).toBeGreaterThanOrEqual(11); // три рабочие недели (минус больничный)
    expect(started.smoke_window).toBeGreaterThan(20);
    expect(started.smoke).toBeGreaterThan(5);
    expect(started.feed_fish).toBeGreaterThan(10);
    expect(started.night_watch).toBeGreaterThan(3);
    expect(started.phone ?? 0).toBe(0); // звонить некому
    expect(started.read ?? 0).toBe(0); // не читает
    expect(streetOutside).toBeGreaterThan(0); // на улице — в уличной одежде
    const kinds = new Set(sim.state.chronicle.filter((e) => e.actors.includes('pavel-murov')).map((e) => e.kind));
    expect(kinds.has('nightmare') || started.nightmare > 0).toBe(true);
    expect(Object.keys(sim.state.pets).some((id) => id.startsWith('pavel'))).toBe(false); // рыбка живёт в аквариуме
  }, 60_000);
});

describe('сохранение со старой геометрией', () => {
  it('небо стало выше — люди, гости, мастера и лифт сдвигаются на свои полы', async () => {
    const { buildDefs: build } = await import('../src/data/defs');
    const { Simulation: Sim } = await import('../src/sim/simulation');
    const { createWorldState: create } = await import('../src/sim/state');
    const d = build(loadRawDataNode()).defs!;
    const a = new Sim(d, create(d, 4));
    for (let i = 0; i < 3000; i++) a.step();
    const st = JSON.parse(JSON.stringify(a.state));
    // как будто сохранено при прежней геометрии: всё на 324 пикселя выше, groundY не записан
    const old = 324;
    delete st.groundY;
    for (const r of Object.values(st.residents) as { y: number }[]) r.y -= old;
    for (const w of st.workers as { y: number }[]) w.y -= old;
    st.elevator.y -= old;
    const b = new Sim(d, st);
    for (const id of Object.keys(a.state.residents)) expect(b.state.residents[id].y).toBeCloseTo(a.state.residents[id].y, 5);
    expect(b.state.elevator.y).toBeCloseTo(a.state.elevator.y, 5);
    expect(b.state.groundY).toBe(d.layout.groundY);
  });
});

describe('Клод Антропович (настоящий дом)', () => {
  it('кружок по субботам, вопросы соседей, шарлотка, сестра звонит, блокнот, ни с кем не ссорится', async () => {
    const { buildDefs: build } = await import('../src/data/defs');
    const { Simulation: Sim } = await import('../src/sim/simulation');
    const { createWorldState: create } = await import('../src/sim/state');
    const d = build(loadRawDataNode()).defs!;
    const sim = new Sim(d, create(d, 8));
    // этаж сдан сразу: ни крана, ни бригады
    expect(sim.state.construction?.done).toBe(true);
    expect(sim.state.workers).toHaveLength(0);
    const started: Record<string, number> = {};
    const labels: string[] = [];
    sim.bus.on('action.start', (e) => {
      if (e.residentId !== 'claude-opusov') return;
      started[e.actionId] = (started[e.actionId] ?? 0) + 1;
      labels.push(e.label);
    });
    let kidsAtHost = 0;
    const wakes: number[] = [];
    let wasAsleep = false;
    for (let i = 0; i < (28 * 86400) / 10; i++) {
      sim.step();
      if (sim.state.visitors.some((v) => v.kid !== undefined && v.phase === 'visiting' && !v.path.length)) kidsAtHost++;
      const r = sim.state.residents['claude-opusov'];
      const asleep = r.action?.id === 'sleep' && r.action.phase === 'perform';
      if (wasAsleep && !asleep) wakes.push(sim.calendar().hourOfDay);
      wasAsleep = asleep;
    }
    const kinds = (k: string) => sim.state.chronicle.filter((e) => e.kind === k && e.actors.includes('claude-opusov'));
    expect(started.circle).toBeGreaterThanOrEqual(3); // четыре субботы
    expect(kidsAtHost).toBeGreaterThan(500);
    expect(kinds('circle.start').length).toBeGreaterThanOrEqual(3);
    expect(kinds('ask-help').length).toBeGreaterThan(0);
    expect(kinds('baked').length).toBeGreaterThanOrEqual(2); // воскресная шарлотка
    expect(sim.state.chronicle.some((e) => e.kind === 'visit' && e.actors[0] === 'claude-opusov' && String(e.data.gift).includes('шарлотк'))).toBe(true);
    expect(labels.some((l) => l.includes('с сестрой'))).toBe(true);
    expect(labels.some((l) => /библиотек|букинист|гулять по городу/.test(l))).toBe(true);
    expect(started.board).toBeGreaterThan(0);
    // встаёт около 6:30
    const morning = wakes.filter((h) => h >= 5 && h < 9);
    expect(morning.length).toBeGreaterThan(15);
    expect(morning.reduce((a, b) => a + b, 0) / morning.length).toBeLessThan(7.2);
    // ни грубости, ни ссор, ни сплетен
    expect(kinds('quarrel').length + kinds('gossip').length).toBe(0);
    expect(sim.state.chronicle.some((e) => e.kind === 'chat' && e.actors.includes('claude-opusov') && e.data.quarrel)).toBe(false);
  }, 120_000);
});

describe('сохранение со стройкой в разгаре', () => {
  it('этаж сдают сразу, бригада уходит, Клод Антропович въезжает', async () => {
    const { buildDefs: build } = await import('../src/data/defs');
    const { Simulation: Sim } = await import('../src/sim/simulation');
    const { createWorldState: create } = await import('../src/sim/state');
    const before = build(beforeClaude()).defs!;
    const old = new Sim(before, create(before, 21));
    for (let i = 0; i < (3 * 86400) / 10; i++) old.step();
    expect(old.state.construction?.done).toBe(false);
    const st = JSON.parse(JSON.stringify(old.state));
    const d = build(loadRawDataNode()).defs!;
    const sim = new Sim(d, st);
    expect(sim.state.construction?.done).toBe(true);
    expect(sim.state.residents['claude-opusov']).toBeDefined();
    expect(sim.state.chronicle.some((e) => e.kind === 'moved-in' && e.actors[0] === 'claude-opusov')).toBe(true);
    expect(sim.state.chronicle.filter((e) => e.kind === 'construction').map((e) => e.data.stage)).toContain('done');
    for (let i = 0; i < 8640; i++) sim.step();
    expect(sim.state.workers).toHaveLength(0);
  }, 60_000);
});

describe('балконы', () => {
  it('у квартир выше первого этажа есть балкон, жильцы на него выходят', async () => {
    const { buildDefs: build } = await import('../src/data/defs');
    const { Simulation: Sim } = await import('../src/sim/simulation');
    const { createWorldState: create } = await import('../src/sim/state');
    const d = build(loadRawDataNode()).defs!;
    for (const apt of d.layout.apartments) expect(!!apt.balcony).toBe(apt.level > 0);
    const sim = new Sim(d, create(d, 42));
    const who = new Set<string>();
    let outside = 0;
    sim.bus.on('action.start', (e) => {
      if (e.actionId === 'balcony') who.add(e.residentId);
    });
    for (let i = 0; i < (14 * 86400) / 10; i++) {
      sim.step();
      for (const r of Object.values(sim.state.residents)) {
        if (r.action?.id !== 'balcony' || r.action.phase !== 'perform') continue;
        const b = d.layout.apartments.find((a) => a.balcony && a.level === r.level && r.x >= a.balcony.x0 && r.x <= a.balcony.x1);
        if (b) outside++;
      }
    }
    expect(who.size).toBeGreaterThanOrEqual(3);
    expect(outside).toBeGreaterThan(50);
    expect(who.has('olga-shpak')).toBe(false); // на первом этаже балкона нет
  }, 60_000);
});
