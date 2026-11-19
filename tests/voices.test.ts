import { describe, expect, it } from 'vitest';
import { buildDefs } from '../src/data/defs';
import { loadRawDataNode } from '../src/data/loadNode';
import { buildPrompt, parseReply, Voices } from '../src/ai/voices';
import { Simulation } from '../src/sim/simulation';
import { createWorldState } from '../src/sim/state';

/** Поддельный LM Studio: одна загруженная модель, на любой разговор — две реплики */
function fakeLmStudio(calls: string[]): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (!u.startsWith('http://localhost:1234')) throw new TypeError('connection refused');
    if (u.endsWith('/api/v0/models')) return json({ data: [{ id: 'text-embedding-x', type: 'embeddings', state: 'loaded' }, { id: 'gemma-3-27b', type: 'llm', state: 'loaded' }] });
    if (u.endsWith('/v1/chat/completions')) {
      const body = JSON.parse(String(init?.body));
      calls.push(body.messages[1].content);
      return json({ choices: [{ message: { content: '<think>хм</think>Вот: {"lines":[{"who":"A","text":"«Доброе утро!»"},{"who":"B","text":"И вам. Как спалось?"}],"memoryA":"Поздоровался с соседом","memoryB":"Спросил, как спалось"}' } }] });
    }
    return new Response('', { status: 404 });
  }) as typeof fetch;
}

const flush = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
};

describe('голоса жильцов (локальная нейросеть)', () => {
  it('разбирает ответ модели с мусором вокруг JSON', () => {
    const r = parseReply('Конечно! ```json\n{"lines":[{"who":"A","text":" — Привет "},{"who":"C","text":"чужой"},{"who":"B","text":"Привет!"}],"memoryA":"x"}\n```');
    expect(r?.lines).toEqual([{ who: 'A', text: 'Привет' }, { who: 'B', text: 'Привет!' }]);
    expect(r?.memoryA).toBe('x');
    expect(parseReply('нет json')).toBeNull();
  });

  it('находит LM Studio, дописывает реплики к разговорам и ведёт дневники', async () => {
    const d = buildDefs(loadRawDataNode()).defs!;
    const sim = new Simulation(d, createWorldState(d, 8));
    const calls: string[] = [];
    const v = new Voices(sim, fakeLmStudio(calls), () => 1e9);
    await v.tick();
    expect(v.status()?.model).toBe('gemma-3-27b'); // эмбеддинги пропущены
    for (let i = 0; i < (2 * 86400) / 10 && calls.length < 3; i++) {
      sim.step();
      if (i % 30 === 0) await flush();
    }
    await flush();
    expect(calls.length).toBeGreaterThan(0);
    const voiced = sim.state.chronicle.filter((e) => typeof e.data.voice === 'string');
    expect(voiced.length).toBeGreaterThan(0);
    const [a] = voiced[0].actors;
    expect(String(voiced[0].data.voice)).toMatch(/: Доброе утро!\n.*: И вам\. Как спалось\?/);
    expect(sim.state.diaries?.[a]?.some((x) => x.includes('Поздоровался'))).toBe(true);
    // в запросе — характеры обоих и отношения
    expect(calls[0]).toMatch(/Характер:/);
    expect(calls[0]).toMatch(/Отношения A и B/);
  }, 60_000);

  it('пока досчитывается пропущенное время, модель не зовут; без модели — всё по-старому', async () => {
    const d = buildDefs(loadRawDataNode()).defs!;
    const sim = new Simulation(d, createWorldState(d, 8));
    const calls: string[] = [];
    const v = new Voices(sim, fakeLmStudio(calls), () => 1e9);
    await v.tick();
    v.live = false;
    for (let i = 0; i < 8640; i++) sim.step();
    await flush();
    expect(calls).toHaveLength(0);
    // нет сервера — нет и голосов
    const off = new Voices(new Simulation(d, createWorldState(d, 9)), (async () => {
      throw new TypeError('refused');
    }) as typeof fetch, () => 1e9);
    await off.tick();
    expect(off.status()).toBeNull();
  }, 60_000);

  it('промпт: время, погода, сцена и запрет на «мысли»', () => {
    const d = buildDefs(loadRawDataNode()).defs!;
    const sim = new Simulation(d, createWorldState(d, 8));
    const entry = { id: 1, t: sim.time, kind: 'chat', actors: ['olga-shpak', 'claude-opusov'], importance: 2 as const, text: 'Ольга Дмитриевна и Клод Антропович встретились у почтовых ящиков.', data: { place: 'у почтовых ящиков', minutes: 15 } };
    const p = buildPrompt(sim, entry, 'qwen3-14b');
    expect(p[0].content).toMatch(/Никаких мыслей/);
    expect(p[1].content).toMatch(/как правильно заваривать чай/);
    expect(p[1].content).toMatch(/\/no_think$/);
  });
});
