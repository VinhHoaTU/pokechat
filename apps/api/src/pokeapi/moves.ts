import { levenshtein, normalize } from "../util";
import { pokeGet } from "./client";

interface NamedList { results: { name: string }[] }

let keys: Map<string, string> | null = null;

async function moveIndex() {
  if (!keys) {
    const list = await pokeGet<NamedList>("move?limit=2000");
    keys = new Map(list.results.map((r) => [normalize(r.name), r.name]));
  }
  return keys;
}

/** Nom d'attaque (slug ou nom anglais) -> slug, ou suggestions. */
export async function resolveMove(input: string): Promise<{ ok: true; slug: string } | { ok: false; suggestions: string[] }> {
  const idx = await moveIndex();
  const key = normalize(input);
  const hit = idx.get(key);
  if (hit) return { ok: true, slug: hit };
  const max = Math.max(2, Math.floor(key.length / 3));
  const near = [...idx.entries()]
    .map(([k, slug]) => ({ slug, d: levenshtein(key, k) }))
    .filter((x) => x.d <= max)
    .sort((a, b) => a.d - b.d)
    .slice(0, 3)
    .map((x) => x.slug);
  return { ok: false, suggestions: near };
}
