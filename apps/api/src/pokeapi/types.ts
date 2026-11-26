import { normalize } from "../util";

export interface PokemonRaw {
  id: number;
  name: string;
  height: number;
  weight: number;
  types: { slot: number; type: { name: string } }[];
  stats: { base_stat: number; stat: { name: string } }[];
  abilities: { ability: { name: string }; is_hidden: boolean }[];
  moves: { move: { name: string }; version_group_details: { move_learn_method: { name: string } }[] }[];
}

export interface SpeciesRaw {
  id: number;
  name: string;
  names: { name: string; language: { name: string } }[];
  varieties: { is_default: boolean; pokemon: { name: string } }[];
  genera: { genus: string; language: { name: string } }[];
  flavor_text_entries: { flavor_text: string; language: { name: string } }[];
  evolution_chain: { url: string };
}

export interface MoveRaw {
  id: number;
  name: string;
  power: number | null;
  accuracy: number | null;
  pp: number | null;
  type: { name: string };
  damage_class: { name: string };
  names: { name: string; language: { name: string } }[];
  flavor_text_entries: { flavor_text: string; language: { name: string } }[];
  effect_entries: { short_effect: string; language: { name: string } }[];
}

export interface TypeRaw {
  name: string;
  damage_relations: Record<
    | "double_damage_to" | "half_damage_to" | "no_damage_to"
    | "double_damage_from" | "half_damage_from" | "no_damage_from",
    { name: string }[]
  >;
}

export const TYPE_FR: Record<string, string> = {
  normal: "normal", fire: "feu", water: "eau", electric: "électrik", grass: "plante",
  ice: "glace", fighting: "combat", poison: "poison", ground: "sol", flying: "vol",
  psychic: "psy", bug: "insecte", rock: "roche", ghost: "spectre", dragon: "dragon",
  dark: "ténèbres", steel: "acier", fairy: "fée",
};
export const TYPE_SLUGS = Object.keys(TYPE_FR);
export const typeFr = (slug: string) => TYPE_FR[slug] ?? slug;

/** "Électrik", "electric", "FEU" -> slug anglais, ou null. */
export function resolveType(input: string): string | null {
  const key = normalize(input);
  for (const [en, fr] of Object.entries(TYPE_FR)) {
    if (normalize(en) === key || normalize(fr) === key) return en;
  }
  return null;
}
