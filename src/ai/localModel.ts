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
    return {
      server: c.server,
      base: c.base,
      model: id,
      async chat(messages, opts = {}) {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 90_000);
        opts.signal?.addEventListener('abort', () => ctl.abort());
        try {
          const res = await fetchImpl(`${c.base}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: id,
              messages,
              temperature: opts.temperature ?? 0.85,
              max_tokens: opts.maxTokens ?? 500,
              stream: false,
            }),
            signal: ctl.signal,
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
          const text = j.choices?.[0]?.message?.content ?? '';
          // «думающие» модели (Qwen3 и др.) присылают размышления в <think>…</think> — их выкидываем
          return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
        } finally {
          clearTimeout(timer);
        }
      },
    };
  }
  return null;
}
