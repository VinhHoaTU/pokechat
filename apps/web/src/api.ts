export class ApiError extends Error {
  constructor(message: string, public suggestions: string[] = []) {
    super(message);
  }
}

async function request<T>(url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, body === undefined ? undefined : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new ApiError("Impossible de joindre l'API. Est-elle lancée ?");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? `Erreur ${res.status}`, data.suggestions ?? []);
  return data as T;
}

export interface Health { model: string; ollamaReachable: boolean; modelInstalled: boolean }
export interface Msg { role: "user" | "assistant"; content: string; toolsUsed?: string[] }
export interface MoveView { index: number; name: string; type: string; power: number; accuracy: number | null; category: string }
export interface FighterView { id: number; name: string; types: string[]; hp: number; maxHp: number }
export interface BattleView {
  id: string; turn: number; status: "ongoing" | "won" | "lost";
  player: FighterView & { moves: MoveView[] }; foe: FighterView;
}
export interface TurnResult { battle: BattleView; lines?: string[]; narration?: string | null; understood?: boolean; message?: string }

export const api = {
  health: () => request<Health>("/api/health"),
  chat: (messages: Msg[]) =>
    request<{ reply: string; toolsUsed: string[] }>("/api/chat", { messages: messages.map(({ role, content }) => ({ role, content })) }),
  startBattle: (player: string, foe: string) => request<{ battle: BattleView }>("/api/battle", { player, foe }),
  move: (id: string, moveIndex: number) => request<TurnResult>(`/api/battle/${id}/move`, { moveIndex }),
  say: (id: string, text: string) => request<TurnResult>(`/api/battle/${id}/say`, { text }),
};
