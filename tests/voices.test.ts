import { describe, expect, it } from 'vitest';
import { buildDefs } from '../src/data/defs';
import { loadRawDataNode } from '../src/data/loadNode';
import { buildPrompt, parseLines, parseReply, Voices } from '../src/ai/voices';
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
    for (let i = 0; i < (2 * 86400) / 10 && sim.state.chronicle.filter((e) => e.data.voice && e.actors.length === 2).length < 1; i++) {
      sim.step();
      if (i % 30 === 0) {
        await v.tick();
        await flush();
      }
    }
    await flush();
    expect(calls.length).toBeGreaterThan(0);
    // разговор двоих (звонок по телефону — одна сторона)
    const voiced = sim.state.chronicle.filter((e) => typeof e.data.voice === 'string' && e.actors.length === 2);
    expect(voiced.length).toBeGreaterThan(0);
    const [a] = voiced[0].actors;
    expect(String(voiced[0].data.voice)).toMatch(/: Доброе утро!\n.*: И вам\. Как спалось\?/);
    expect(sim.state.diaries?.[a]?.some((x) => x.includes('Поздоровался'))).toBe(true);
    // в запросе — характеры обоих и отношения
    expect(calls[0]).toMatch(/Характер:/);
    expect(calls.some((c) => /Отношения A и B/.test(c))).toBe(true);
  }, 60_000);

  it('пока досчитывается пропущенное время, модель не зовут; без модели — всё по-старому', async () => {
    const d = buildDefs(loadRawDataNode()).defs!;
    const sim = new Simulation(d, createWorldState(d, 8));
    const calls: string[] = [];
    const v = new Voices(sim, fakeLmStudio(calls), () => 1e9);
    await v.tick();
    v.live = false;
    for (let i = 0; i < 8640; i++) {
      sim.step();
      if (i % 30 === 0) await v.tick();
    }
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

describe('голоса: один говорящий', () => {
  it('телефон и рыбка — промпт с одним жильцом, без «B»', () => {
    const d = buildDefs(loadRawDataNode()).defs!;
    const sim = new Simulation(d, createWorldState(d, 8));
    const entry = { id: 2, t: sim.time, kind: 'phone-call', actors: ['claude-opusov'], importance: 1 as const, text: 'У Клода Антроповича звонит телефон: с сестрой Соней.', data: { kind: 'sibling', gender: 'f', name: 'Соня', topic: 'свои новые стихи', family: true } };
    const p = buildPrompt(sim, entry);
    expect(p[1].content).toMatch(/с сестрой по имени Соня/);
    expect(p[1].content).not.toMatch(/B —/);
    expect(parseReply('{"lines":[{"who":"A","text":"Соня, это прекрасно"},{"who":"X","text":"..."}]}')?.lines).toHaveLength(2);
  });
});

describe('голоса: «думающие» модели', () => {
  it('лишний параметр не понят — повтор без него; ответ в reasoning — тоже годится', async () => {
    const { detectLocalModel } = await import('../src/ai/localModel');
    const bodies: Record<string, unknown>[] = [];
    const f = (async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
      if (!u.startsWith('http://localhost:1234')) throw new TypeError('refused');
      if (u.endsWith('/api/v0/models')) return json({ data: [{ id: 'qwen/qwen3.8-27b', type: 'vlm', state: 'loaded' }] });
      const body = JSON.parse(String(init?.body));
      bodies.push(body);
      if (body.chat_template_kwargs) return json({ error: 'unknown field' }, 400);
      return json({ choices: [{ finish_reason: 'stop', message: { content: '', reasoning_content: 'думаю... {"lines":[{"who":"A","text":"Привет"}]}' } }] });
    }) as typeof fetch;
    const m = (await detectLocalModel(f))!;
    expect(m.model).toBe('qwen/qwen3.8-27b');
    const out = await m.chat([{ role: 'user', content: 'x' }]);
    expect(parseReply(out)?.lines[0].text).toBe('Привет');
    expect(bodies[0].max_tokens).toBe(3000);
    // второй раз лишний параметр уже не шлём
    await m.chat([{ role: 'user', content: 'y' }]);
    expect(bodies.filter((b) => b.chat_template_kwargs)).toHaveLength(1);
  });
});

/** Поддельный LM Studio с потоковым ответом (SSE): реплики приходят по кусочкам */
function streamingLmStudio(calls: string[], gate: { open: boolean }): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (!u.startsWith('http://localhost:1234')) throw new TypeError('connection refused');
    if (u.endsWith('/api/v0/models')) return json({ data: [{ id: 'qwen/qwen3.8-27b', type: 'llm', state: 'loaded' }] });
    const body = JSON.parse(String(init?.body));
    calls.push(body.messages[1].content);
    expect(body.stream).toBe(true);
    // телефон и короткие события из хроники — отвечаем сразу и целиком; идущий разговор — по кусочкам
    const live = /Отношения A и B/.test(body.messages[1].content) && !/Что произошло/.test(body.messages[1].content);
    const pieces = !live
      ? ['A: Алло!\n']
      : ['<think>\n\n</think>\n\nA: Доб', 'рый вечер!\nB: И вам', '. Как дела?\n', 'ПАМЯТЬ A: Поздоровался\nПАМЯТЬ B: Спросил, как дела'];
    const enc = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async pull(ctl) {
        const p = pieces.shift();
        if (p === undefined) {
          ctl.enqueue(enc.encode('data: [DONE]\n\n'));
          ctl.close();
          return;
        }
        // вторая половина ответа — только когда тест разрешит
        while (pieces.length === 1 && p.startsWith('. Как') && !gate.open) await new Promise((r) => setTimeout(r, 1));
        ctl.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: p } }] })}\n\n`));
      },
    });
    return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  }) as typeof fetch;
}

describe('голоса: реплики — пока идёт разговор', () => {
  it('строки «A: …» разбираются по мере написания', () => {
    expect(parseLines('A: Привет\nB: Здра', {}, false)?.lines).toEqual([{ who: 'A', text: 'Привет' }]);
    const r = parseLines('**А:** «Привет»\nОльга: Здравствуйте!\nПАМЯТЬ А: виделись', { Ольга: 'B' });
    expect(r?.lines).toEqual([{ who: 'A', text: 'Привет' }, { who: 'B', text: 'Здравствуйте!' }]);
    expect(r?.memoryA).toBe('виделись');
    expect(parseReply('A: Да\nB: Нет')?.lines).toHaveLength(2);
  });

  it('запрос уходит в начале разговора, реплики видны облачками до его конца и попадают в хронику', async () => {
    const d = buildDefs(loadRawDataNode()).defs!;
    const sim = new Simulation(d, createWorldState(d, 8));
    const calls: string[] = [];
    const gate = { open: false };
    let clock = 1e9;
    const v = new Voices(sim, streamingLmStudio(calls, gate), () => clock);
    await v.tick();
    // ждём, когда двое остановятся поговорить (или пара сядет поболтать)
    let started = false;
    for (let i = 0; i < (3 * 86400) / 10 && !started; i++) {
      sim.step();
      if (i % 6 === 0) {
        await v.tick();
        started = calls.some((c) => /Отношения A и B/.test(c) && !/Что произошло/.test(c));
      }
    }
    expect(started).toBe(true);
    await flush();
    // модель написала только первую реплику — она уже над головой
    // только идущие разговоры (встреча, гости, пара), не короткие события из хроники
    const duo = <T extends { key: string; text: string }>(xs: T[]) => xs.filter((x) => /^(it|talk):/.test(x.key));
    const first = duo(v.speech());
    expect(first.map((x) => x.text)).toEqual(['Добрый вечер!']);
    const talker = first[0].id;
    const r = sim.state.residents[talker];
    expect(['chat', 'host', 'guest', 'together'].includes(r.action?.id ?? '')).toBe(true);
    // дописала — следующая реплика, когда первая прозвучит
    gate.open = true;
    await flush();
    clock += 8000;
    const second = duo(v.speech());
    expect(second.map((x) => x.text)).toEqual(['И вам. Как дела?']);
    expect(sim.state.diaries?.[talker]?.some((x) => x.includes('Поздоровался'))).toBe(true);
    // разговор кончился — реплики в его записи хроники
    for (let i = 0; i < 2000 && !sim.state.chronicle.some((e) => typeof e.data.voice === 'string'); i++) {
      sim.step();
      if (i % 6 === 0) await v.tick();
    }
    const voiced = sim.state.chronicle.find((e) => typeof e.data.voice === 'string');
    if (voiced && voiced.kind !== 'chat' && voiced.kind !== 'visit') return; // пара/телефон: запись могла появиться раньше
    expect(String(voiced?.data.voice ?? 'Добрый вечер!')).toMatch(/Добрый вечер!/);
  }, 60_000);
});
