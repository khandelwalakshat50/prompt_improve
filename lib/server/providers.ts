import "server-only";
import type { GenerateRequest, GenerateResult, GenSettings, ProviderId } from "@/lib/types";

/* API keys are read here, on the server, and nowhere else. */

const ENV_KEYS: Record<ProviderId, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  gemini: "GEMINI_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  groq: "GROQ_API_KEY",
};

/** DeepSeek and Groq speak the OpenAI API, so they share one client with different base URLs. */
const DEFAULT_BASE: Record<ProviderId, string> = {
  openai: "https://api.openai.com/v1",
  deepseek: "https://api.deepseek.com/v1",
  groq: "https://api.groq.com/openai/v1",
  anthropic: "https://api.anthropic.com/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta",
};

/** Optional override, e.g. OPENAI_BASE_URL, for proxies or local mocks. */
function base(provider: ProviderId): string {
  const o = process.env[`${provider.toUpperCase()}_BASE_URL`];
  return (o && o.trim() ? o.trim() : DEFAULT_BASE[provider]).replace(/\/+$/, "");
}

export const ALL_PROVIDERS: ProviderId[] = ["openai", "anthropic", "gemini", "deepseek", "groq"];

export function isProvider(p: unknown): p is ProviderId {
  return typeof p === "string" && (ALL_PROVIDERS as string[]).includes(p);
}

function getKey(provider: ProviderId): string | null {
  const v = process.env[ENV_KEYS[provider]];
  return v && v.trim() ? v.trim() : null;
}

export function availableProviders(): ProviderId[] {
  return ALL_PROVIDERS.filter((p) => getKey(p) !== null);
}

export class ProviderError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
  }
}

function requireKey(provider: ProviderId): string {
  const key = getKey(provider);
  if (!key) throw new ProviderError(`No API key for ${provider}. Set ${ENV_KEYS[provider]} in .env.`, 400);
  return key;
}

/** Strip anything that looks like a key from an upstream error before it reaches the browser. */
function scrub(text: string, key: string): string {
  let t = text.split(key).join("[redacted]");
  t = t.replace(/(sk-[A-Za-z0-9_-]{6})[A-Za-z0-9_-]+/g, "$1…").replace(/(AIza[A-Za-z0-9_-]{4})[A-Za-z0-9_-]+/g, "$1…");
  return t;
}

async function readError(res: Response, key: string): Promise<string> {
  const body = await res.text().catch(() => "");
  let msg = body;
  try {
    const j = JSON.parse(body);
    msg = j?.error?.message ?? j?.error?.type ?? j?.message ?? (typeof j?.error === "string" ? j.error : body);
  } catch {
    /* keep raw body */
  }
  return scrub(`${res.status} ${res.statusText}: ${String(msg).slice(0, 1500)}`, key);
}

async function doFetch(url: string, init: RequestInit, key: string): Promise<Response> {
  try {
    return await fetch(url, { ...init, cache: "no-store" });
  } catch (e) {
    throw new ProviderError(scrub(`Network error: ${(e as Error).message}`, key));
  }
}

/* ---------------- list models ---------------- */

const NON_CHAT = /embed|whisper|tts|dall-e|moderation|davinci|babbage|image|transcribe|realtime|audio|search|sora|aqa|imagen|veo|guard|embedding|speech/i;

export async function listModels(provider: ProviderId): Promise<string[]> {
  const key = requireKey(provider);

  if (provider === "anthropic") {
    const res = await doFetch(`${base("anthropic")}/models?limit=1000`, {
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
    }, key);
    if (!res.ok) throw new ProviderError(await readError(res, key), res.status);
    const j = await res.json();
    return (j.data ?? []).map((m: { id: string }) => m.id);
  }

  if (provider === "gemini") {
    const ids: string[] = [];
    let pageToken = "";
    for (let page = 0; page < 10; page++) {
      const url = `${base("gemini")}/models?pageSize=1000${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`;
      const res = await doFetch(url, { headers: { "x-goog-api-key": key } }, key);
      if (!res.ok) throw new ProviderError(await readError(res, key), res.status);
      const j = await res.json();
      for (const m of j.models ?? []) {
        const methods: string[] = m.supportedGenerationMethods ?? [];
        const id = String(m.name ?? "").replace(/^models\//, "");
        if (id && methods.includes("generateContent") && !NON_CHAT.test(id)) ids.push(id);
      }
      if (!j.nextPageToken) break;
      pageToken = j.nextPageToken;
    }
    return ids;
  }

  const res = await doFetch(`${base(provider)}/models`, { headers: { Authorization: `Bearer ${key}` } }, key);
  if (!res.ok) throw new ProviderError(await readError(res, key), res.status);
  const j = await res.json();
  const data: { id: string; created?: number; active?: boolean }[] = j.data ?? [];
  return data
    .filter((m) => m.active !== false && !NON_CHAT.test(m.id))
    .sort((a, b) => (b.created ?? 0) - (a.created ?? 0) || a.id.localeCompare(b.id))
    .map((m) => m.id);
}

/* ---------------- generate ---------------- */

export async function generate(
  provider: ProviderId,
  model: string,
  system: string,
  user: string,
  settings: GenSettings,
): Promise<GenerateResult> {
  const key = requireKey(provider);
  if (!model) throw new ProviderError("No model selected.", 400);
  const started = Date.now();

  let text = "";
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  let finishReason: string | null = null;

  if (provider === "anthropic") {
    const body: Record<string, unknown> = {
      model,
      // Anthropic requires max_tokens.
      max_tokens: settings.maxTokens ?? 4096,
      messages: [{ role: "user", content: user }],
    };
    if (system.trim()) body.system = system;
    if (settings.temperature != null) body.temperature = settings.temperature;
    const res = await doFetch(`${base("anthropic")}/messages`, {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify(body),
    }, key);
    if (!res.ok) throw new ProviderError(await readError(res, key), res.status);
    const j = await res.json();
    text = (j.content ?? [])
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("");
    inputTokens = j.usage?.input_tokens ?? null;
    outputTokens = j.usage?.output_tokens ?? null;
    finishReason = j.stop_reason ?? null;
  } else if (provider === "gemini") {
    const generationConfig: Record<string, unknown> = {};
    if (settings.temperature != null) generationConfig.temperature = settings.temperature;
    if (settings.maxTokens != null) generationConfig.maxOutputTokens = settings.maxTokens;
    const body: Record<string, unknown> = {
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig,
    };
    if (system.trim()) body.systemInstruction = { parts: [{ text: system }] };
    const res = await doFetch(`${base("gemini")}/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": key, "content-type": "application/json" },
      body: JSON.stringify(body),
    }, key);
    if (!res.ok) throw new ProviderError(await readError(res, key), res.status);
    const j = await res.json();
    const cand = j.candidates?.[0];
    text = (cand?.content?.parts ?? [])
      .filter((p: { thought?: boolean }) => !p.thought)
      .map((p: { text?: string }) => p.text ?? "")
      .join("");
    inputTokens = j.usageMetadata?.promptTokenCount ?? null;
    outputTokens = j.usageMetadata?.candidatesTokenCount ?? null;
    finishReason = cand?.finishReason ?? j.promptFeedback?.blockReason ?? null;
  } else {
    const messages = [] as { role: string; content: string }[];
    if (system.trim()) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: user });
    const body: Record<string, unknown> = { model, messages };
    if (settings.temperature != null) body.temperature = settings.temperature;
    if (settings.maxTokens != null) {
      // OpenAI's current models only accept max_completion_tokens; DeepSeek/Groq use max_tokens.
      body[provider === "openai" ? "max_completion_tokens" : "max_tokens"] = settings.maxTokens;
    }
    const res = await doFetch(`${base(provider)}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    }, key);
    if (!res.ok) throw new ProviderError(await readError(res, key), res.status);
    const j = await res.json();
    const choice = j.choices?.[0];
    const content = choice?.message?.content;
    text = typeof content === "string" ? content : Array.isArray(content) ? content.map((c: { text?: string }) => c.text ?? "").join("") : "";
    inputTokens = j.usage?.prompt_tokens ?? null;
    outputTokens = j.usage?.completion_tokens ?? null;
    finishReason = choice?.finish_reason ?? null;
  }

  if (!text.trim()) {
    throw new ProviderError(
      `Model returned an empty output${finishReason ? ` (finish reason: ${finishReason})` : ""}.` +
        (/length|max_tokens|MAX_TOKENS/i.test(finishReason ?? "") ? " Raise max output tokens; reasoning models spend tokens before answering." : ""),
    );
  }

  return { text, inputTokens, outputTokens, latencyMs: Date.now() - started, finishReason };
}

export function parseGenerateRequest(body: unknown): GenerateRequest {
  const b = body as Partial<GenerateRequest>;
  if (!b || !isProvider(b.provider)) throw new ProviderError("Unknown provider.", 400);
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    provider: b.provider,
    model: String(b.model ?? ""),
    system: String(b.system ?? ""),
    user: String(b.user ?? ""),
    settings: { temperature: num(b.settings?.temperature), maxTokens: num(b.settings?.maxTokens) },
  };
}
