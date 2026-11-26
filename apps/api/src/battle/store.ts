import type { BattleState } from "./engine";

const TTL_MS = 2 * 60 * 60 * 1000;
const MAX = 200;
const battles = new Map<string, { state: BattleState; touched: number }>();
const locks = new Set<string>();

export function saveBattle(state: BattleState) {
  const now = Date.now();
  battles.set(state.id, { state, touched: now });
  if (battles.size > MAX) {
    for (const [id, b] of battles) if (now - b.touched > TTL_MS) battles.delete(id);
    while (battles.size > MAX) battles.delete(battles.keys().next().value!);
  }
}

export function getBattle(id: string): BattleState | undefined {
  return battles.get(id)?.state;
}

/** Empêche deux requêtes simultanées de jouer le même combat (double clic, appels en parallèle). */
export async function withLock<T>(id: string, fn: () => Promise<T>): Promise<T | "busy"> {
  if (locks.has(id)) return "busy";
  locks.add(id);
  try {
    return await fn();
  } finally {
    locks.delete(id);
  }
}
