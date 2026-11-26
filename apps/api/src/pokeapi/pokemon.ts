import type { Stats } from "../battle/engine";
import { pokeGet } from "./client";
import type { PokemonRaw, SpeciesRaw } from "./types";

export async function loadPokemon(speciesSlug: string) {
  const species = await pokeGet<SpeciesRaw>(`pokemon-species/${speciesSlug}`);
  const defaultName = species.varieties.find((v) => v.is_default)?.pokemon.name ?? speciesSlug;
  const pokemon = await pokeGet<PokemonRaw>(`pokemon/${defaultName}`);
  return { species, pokemon };
}

export const speciesFrName = (s: SpeciesRaw) => s.names.find((n) => n.language.name === "fr")?.name ?? s.name;

export function baseStats(p: PokemonRaw): Stats {
  const get = (name: string) => p.stats.find((s) => s.stat.name === name)?.base_stat ?? 1;
  return {
    hp: get("hp"),
    attack: get("attack"),
    defense: get("defense"),
    spAttack: get("special-attack"),
    spDefense: get("special-defense"),
    speed: get("speed"),
  };
}
