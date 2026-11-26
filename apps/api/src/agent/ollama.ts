import { config } from "../config";

export interface ToolCall { function: { name: string; arguments: unknown } }
export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCall[];
  tool_name?: string;
}

export class OllamaError extends Error {}

export async function ollamaChat(messages: ChatMessage[], tools?: unknown[], timeoutMs = 120_000): Promise<ChatMessage> {
  let res: Response;
  try {
    res = await fetch(`${config.ollamaUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: config.model, messages, tools, stream: false, options: { temperature: 0.2 } }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new OllamaError(`Ollama est injoignable (${config.ollamaUrl}). Lance « ollama serve » et réessaie.`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new OllamaError(
      res.status === 404
        ? `Le modèle « ${config.model} » n'est pas installé. Lance : ollama pull ${config.model}`
        : `Erreur Ollama (${res.status}) : ${body.slice(0, 200)}`,
    );
  }
  const data = (await res.json()) as { message?: ChatMessage };
  if (!data.message) throw new OllamaError("Réponse Ollama vide.");
  return { ...data.message, content: data.message.content ?? "" };
}

export async function checkOllama(): Promise<{ ollamaReachable: boolean; modelInstalled: boolean }> {
  try {
    const res = await fetch(`${config.ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(2000) });
    const data = (await res.json()) as { models?: { name: string }[] };
    const names = (data.models ?? []).map((m) => m.name);
    return { ollamaReachable: true, modelInstalled: names.some((n) => n === config.model || n === `${config.model}:latest`) };
  } catch {
    return { ollamaReachable: false, modelInstalled: false };
  }
}
