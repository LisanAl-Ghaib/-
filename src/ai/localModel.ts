/**
 * Локальная нейросеть на компьютере пользователя: LM Studio (порт 1234) или Ollama (11434).
 * Обе отдают OpenAI-совместимый API: GET /v1/models, POST /v1/chat/completions.
 * Браузер обращается к ним напрямую — в LM Studio для этого включают CORS
 * (Developer → Settings → Enable CORS), в Ollama — OLLAMA_ORIGINS=*.
 *
 * Ничего не настраивается в игре: если сервер с моделью запущен — жильцы «говорят» через него,
 * если нет — хроника пишется по-старому, шаблонами.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LocalModel {
  /** «LM Studio» / «Ollama» */
  server: string;
  base: string;
  model: string;
  chat(messages: ChatMessage[], opts?: { maxTokens?: number; temperature?: number; signal?: AbortSignal }): Promise<string>;
}

/** Ошибка модели: network — сервер пропал (поищем заново), answer — ответ не получился */
export class ModelError extends Error {
  constructor(
    readonly kind: 'network' | 'answer',
    message: string,
  ) {
    super(message);
  }
}

const CANDIDATES = [
  { server: 'LM Studio', base: 'http://localhost:1234' },
  { server: 'LM Studio', base: 'http://127.0.0.1:1234' },
  { server: 'Ollama', base: 'http://localhost:11434' },
  { server: 'Ollama', base: 'http://127.0.0.1:11434' },
];

async function getJson(url: string, ms: number, fetchImpl: typeof fetch): Promise<unknown> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetchImpl(url, { signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Модели, которые не умеют говорить (эмбеддинги и т. п.) */
const NOT_CHAT = /embed|bge|e5-|nomic|rerank|whisper|clip/i;

/** Какую модель взять: загруженную в LM Studio, иначе первую подходящую */
async function pickModel(base: string, fetchImpl: typeof fetch): Promise<string | null> {
  // LM Studio знает, какая модель сейчас загружена в память
  try {
    const v0 = (await getJson(`${base}/api/v0/models`, 1500, fetchImpl)) as { data?: { id: string; state?: string; type?: string }[] };
    const loaded = v0.data?.find((m) => m.state === 'loaded' && m.type !== 'embeddings' && !NOT_CHAT.test(m.id));
    if (loaded) return loaded.id;
  } catch {
    /* не LM Studio или старая версия */
  }
  const v1 = (await getJson(`${base}/v1/models`, 1500, fetchImpl)) as { data?: { id: string }[] };
  return v1.data?.map((m) => m.id).find((id) => !NOT_CHAT.test(id)) ?? null;
}

/** Найти запущенную локальную модель (или null) */
export async function detectLocalModel(fetchImpl: typeof fetch = fetch): Promise<LocalModel | null> {
  for (const c of CANDIDATES) {
    let model: string | null = null;
    try {
      model = await pickModel(c.base, fetchImpl);
    } catch {
      continue;
    }
    if (!model) continue;
    const id = model;
    // модели, которые сначала «думают» (Qwen3 и новее, R1, QwQ): просим не думать вслух
    // и оставляем запас токенов на случай, если всё-таки подумают
    const thinker = /qwen3|qwq|deepseek-r1|reason|think/i.test(id);
    let noExtras = false;
    return {
      server: c.server,
      base: c.base,
      model: id,
      async chat(messages, opts = {}) {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), thinker ? 180_000 : 90_000);
        opts.signal?.addEventListener('abort', () => ctl.abort());
        const send = (extras: boolean) =>
          fetchImpl(`${c.base}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: id,
              messages,
              temperature: opts.temperature ?? 0.85,
              // если всё-таки «подумает» — пусть хватит места и на ответ
              max_tokens: thinker ? Math.max(3000, opts.maxTokens ?? 500) : opts.maxTokens ?? 500,
              stream: false,
              ...(extras && thinker && !noExtras ? { chat_template_kwargs: { enable_thinking: false } } : {}),
            }),
            signal: ctl.signal,
          });
        try {
          let res = await send(true);
          // сервер не понял лишних параметров — повторим без них и больше их не шлём
          if (res.status === 400 && thinker && !noExtras) {
            noExtras = true;
            res = await send(false);
          }
          if (!res.ok) throw new ModelError(res.status >= 500 || res.status === 404 ? 'network' : 'answer', `сервер ответил ${res.status}`);
          const j = (await res.json()) as { choices?: { finish_reason?: string; message?: { content?: string; reasoning_content?: string; reasoning?: string } }[] };
          const ch = j.choices?.[0];
          const msg = ch?.message;
          // «думающие» модели присылают размышления в <think>…</think> или отдельным полем — их выкидываем
          let text = (msg?.content ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/^[\s\S]*<\/think>/, '').trim();
          // ответ целиком ушёл в размышления — поищем JSON хотя бы там
          if (!text) text = (msg?.reasoning_content ?? msg?.reasoning ?? '').trim();
          if (!text && ch?.finish_reason === 'length') throw new ModelError('answer', 'модель слишком долго думала');
          return text;
        } catch (e) {
          if (e instanceof ModelError) throw e;
          if ((e as Error).name === 'AbortError') throw new ModelError('answer', 'модель не успела ответить');
          throw new ModelError('network', 'нет связи с моделью');
        } finally {
          clearTimeout(timer);
        }
      },
    };
  }
  return null;
}
