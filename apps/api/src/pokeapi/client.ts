import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { config } from "../config";

const BASE = "https://pokeapi.co/api/v2";

export class PokeApiError extends Error {
  constructor(public kind: "not_found" | "unavailable", message: string) {
    super(message);
  }
}

// PokéAPI bloque les caractères exotiques dans l'URL : on n'envoie que des slugs sûrs.
const SAFE_PATH = /^[a-z0-9-]+(\/[a-z0-9-]+)?(\?limit=\d+)?$/;

const mem = new Map<string, unknown>();
const inflight = new Map<string, Promise<unknown>>();
const fileFor = (path: string) => join(config.cacheDir, path.replace(/[/?=]/g, "_") + ".json");

/**
 * GET avec cache mémoire + disque (exigé par la politique d'usage de PokéAPI).
 * Les données sont statiques : pas d'expiration, et un cache disque permet de
 * continuer à répondre si l'API est indisponible.
 */
export async function pokeGet<T>(path: string): Promise<T> {
  if (!SAFE_PATH.test(path)) throw new PokeApiError("not_found", `Requête invalide : ${path}`);
  if (mem.has(path)) return mem.get(path) as T;
  const pending = inflight.get(path);
  if (pending) return pending as Promise<T>;
  const p = load<T>(path).finally(() => inflight.delete(path));
  inflight.set(path, p);
  return p;
}

async function load<T>(path: string): Promise<T> {
  const file = Bun.file(fileFor(path));
  if (await file.exists()) {
    try {
      const data = await file.json();
      mem.set(path, data);
      return data as T;
    } catch {
      /* fichier corrompu : on retélécharge */
    }
  }
  const data = await fetchWithRetry(path);
  mem.set(path, data);
  mkdir(config.cacheDir, { recursive: true })
    .then(() => Bun.write(fileFor(path), JSON.stringify(data)))
    .catch(() => {});
  return data as T;
}

async function fetchWithRetry(path: string): Promise<unknown> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${BASE}/${path}`, { signal: AbortSignal.timeout(8000) });
      if (res.status === 404) throw new PokeApiError("not_found", `Ressource introuvable : ${path}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (e instanceof PokeApiError) throw e;
      if (attempt < 2) await Bun.sleep(300 * 2 ** attempt);
    }
  }
  throw new PokeApiError("unavailable", "PokéAPI est injoignable.");
}
