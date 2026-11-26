import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { config } from "../config";
import { levenshtein, mapLimit, normalize } from "../util";
import { pokeGet } from "./client";

interface NamedList { results: { name: string }[] }
interface SpeciesNames { names: { name: string; language: { name: string } }[] }

const keys = new Map<string, string>(); // nom normalisé (EN ou FR) -> slug d'espèce
const frNames = new Map<string, string>(); // slug -> nom français
let slugs: string[] = [];
let loading: Promise<void> | null = null;
let frState: "idle" | "running" | "done" = "idle";

export function loadIndex(): Promise<void> {
  loading ??= (async () => {
    try {
      const list = await pokeGet<NamedList>("pokemon-species?limit=2000");
      slugs = list.results.map((r) => r.name);
      for (const s of slugs) keys.set(normalize(s), s);
    } catch (e) {
      loading = null;
      throw e;
    }
  })();
  return loading;
}

export const getFrName = (slug: string) => frNames.get(slug);

/**
 * Construit (une seule fois, en arrière-plan) l'index des noms français.
 * ~1000 requêtes la première fois, puis un petit fichier .cache/fr-names.json.
 * Tant que l'index n'est pas prêt, les noms anglais fonctionnent déjà.
 */
export async function warmFrenchNames(): Promise<void> {
  if (frState !== "idle") return;
  frState = "running";
  try {
    await loadIndex();
    const file = Bun.file(join(config.cacheDir, "fr-names.json"));
    let data: Record<string, string> | null = (await file.exists()) ? await file.json() : null;
    if (!data) {
      const built: Record<string, string> = {};
      await mapLimit(slugs, 6, async (slug) => {
        try {
          const sp = await pokeGet<SpeciesNames>(`pokemon-species/${slug}`);
          const fr = sp.names.find((n) => n.language.name === "fr")?.name;
          if (fr) built[slug] = fr;
        } catch {
          /* on continue : un nom manquant n'est pas bloquant */
        }
      });
      data = built;
      if (Object.keys(built).length > slugs.length * 0.9) {
        await mkdir(config.cacheDir, { recursive: true });
        await Bun.write(file, JSON.stringify(built));
      }
    }
    for (const [slug, fr] of Object.entries(data)) {
      frNames.set(slug, fr);
      const k = normalize(fr);
      if (!keys.has(k)) keys.set(k, slug);
    }
    frState = "done";
  } catch (e) {
    console.warn("Index des noms français indisponible pour l'instant :", (e as Error).message);
    frState = "idle";
  }
}

export type Resolution = { ok: true; slug: string } | { ok: false; suggestions: string[] };

/**
 * Nom FR ou EN -> slug d'espèce. Aucune correspondance approximative n'est
 * acceptée automatiquement (risque de répondre sur le mauvais Pokémon) :
 * on renvoie seulement des suggestions.
 */
export async function resolveSpecies(input: string): Promise<Resolution> {
  await loadIndex();
  const key = normalize(input);
  if (!key) return { ok: false, suggestions: [] };
  const hit = keys.get(key);
  if (hit) return { ok: true, slug: hit };
  const max = Math.max(2, Math.floor(key.length / 3));
  const near = [...keys.entries()]
    .map(([k, slug]) => ({ slug, d: levenshtein(key, k) }))
    .filter((x) => x.d <= max)
    .sort((a, b) => a.d - b.d);
  const uniq = [...new Set(near.map((n) => n.slug))].slice(0, 3);
  return { ok: false, suggestions: uniq.map((s) => frNames.get(s) ?? s) };
}
