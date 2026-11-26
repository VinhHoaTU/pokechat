import { pokeGet, PokeApiError } from "../pokeapi/client";
import { baseStats, loadPokemon, speciesFrName } from "../pokeapi/pokemon";
import { resolveSpecies } from "../pokeapi/resolve";
import type { MoveRaw } from "../pokeapi/types";
import { mapLimit, normalize } from "../util";
import { computeStats, type Fighter, type Move } from "./engine";

export type LoadResult = { ok: true; fighter: Fighter } | { ok: false; error: string; suggestions: string[] };

const FALLBACK_MOVE: Move = { slug: "struggle", name: "Lutte", type: "normal", power: 50, damageClass: "physical", accuracy: null };

/**
 * Construit un combattant à partir de PokéAPI : stats au niveau 50 et ses 4 meilleures
 * attaques offensives parmi celles apprises par montée de niveau (max 60 examinées).
 * Score = puissance × STAB × précision.
 */
export async function loadFighter(name: string): Promise<LoadResult> {
  const r = await resolveSpecies(name);
  if (!r.ok) return { ok: false, error: `Pokémon inconnu : « ${name} ».`, suggestions: r.suggestions };
  const { species, pokemon } = await loadPokemon(r.slug);
  const stats = computeStats(baseStats(pokemon));
  const types = pokemon.types.sort((a, b) => a.slot - b.slot).map((t) => t.type.name);

  const candidates = pokemon.moves
    .filter((m) => m.version_group_details.some((d) => d.move_learn_method.name === "level-up"))
    .slice(0, 60)
    .map((m) => m.move.name);

  const fetched = await mapLimit(candidates, 8, async (slug) => {
    try {
      return await pokeGet<MoveRaw>(`move/${slug}`);
    } catch (e) {
      if (e instanceof PokeApiError && e.kind === "unavailable") throw e;
      return null;
    }
  });

  const moves: Move[] = [];
  for (const m of fetched) {
    if (!m || m.power === null || m.power <= 0) continue;
    if (m.damage_class.name !== "physical" && m.damage_class.name !== "special") continue;
    moves.push({
      slug: m.name,
      name: m.names.find((n) => n.language.name === "fr")?.name ?? m.name,
      type: m.type.name,
      power: m.power,
      damageClass: m.damage_class.name,
      accuracy: m.accuracy,
    });
  }
  const score = (m: Move) => m.power * (types.includes(m.type) ? 1.5 : 1) * ((m.accuracy ?? 100) / 100);
  const best = moves.sort((a, b) => score(b) - score(a)).slice(0, 4);

  return {
    ok: true,
    fighter: {
      id: pokemon.id,
      slug: r.slug,
      name: speciesFrName(species),
      types,
      stats,
      moves: best.length ? best : [FALLBACK_MOVE],
      hp: stats.hp,
      maxHp: stats.hp,
    },
  };
}

/** Associe un texte libre ("Tonnerre", "2", "j'utilise vive-attaque") à une attaque légale. -1 si ambigu. */
export function matchMove(text: string, moves: Move[]): number {
  const trimmed = text.trim();
  if (/^[1-9]$/.test(trimmed)) {
    const i = Number(trimmed) - 1;
    return i < moves.length ? i : -1;
  }
  const t = normalize(text);
  const hits = moves
    .map((m, i) => ({ i, len: Math.max(t.includes(normalize(m.name)) ? normalize(m.name).length : 0, t.includes(normalize(m.slug)) ? normalize(m.slug).length : 0) }))
    .filter((h) => h.len > 0)
    .sort((a, b) => b.len - a.len);
  if (hits.length === 0) return -1;
  if (hits.length > 1 && hits[0]!.len === hits[1]!.len) return -1;
  return hits[0]!.i;
}

