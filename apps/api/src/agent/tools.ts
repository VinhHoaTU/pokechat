import { z } from "zod";
import { PokeApiError, pokeGet } from "../pokeapi/client";
import { resolveMove } from "../pokeapi/moves";
import { baseStats, loadPokemon, speciesFrName } from "../pokeapi/pokemon";
import { getFrName, resolveSpecies } from "../pokeapi/resolve";
import { resolveType, TYPE_SLUGS, typeFr, type MoveRaw, type TypeRaw } from "../pokeapi/types";
import { cleanText } from "../util";

interface ToolDef {
  description: string;
  parameters: Record<string, unknown>;
  schema: z.ZodTypeAny;
  run: (args: any) => Promise<unknown>;
}

const nameParam = (what: string) => ({
  type: "object",
  properties: { name: { type: "string", description: what } },
  required: ["name"],
});

const fr = <T extends { language: { name: string } }>(list: T[]) => list.find((x) => x.language.name === "fr");

export const tools: Record<string, ToolDef> = {
  get_pokemon: {
    description: "Fiche d'un Pokémon : types, stats de base, taille, poids, talents, description. Accepte le nom français ou anglais.",
    parameters: nameParam("Nom du Pokémon, ex. Salamèche ou charmander"),
    schema: z.object({ name: z.string().min(1).max(60) }),
    run: async ({ name }: { name: string }) => {
      const r = await resolveSpecies(name);
      if (!r.ok) return { error: "pokemon_not_found", query: name, suggestions: r.suggestions };
      const { species, pokemon } = await loadPokemon(r.slug);
      const s = baseStats(pokemon);
      return {
        numero_pokedex: species.id,
        nom_fr: speciesFrName(species),
        nom_en: species.name,
        categorie: fr(species.genera)?.genus,
        types: pokemon.types.map((t) => typeFr(t.type.name)),
        stats_de_base: { pv: s.hp, attaque: s.attack, defense: s.defense, attaque_spe: s.spAttack, defense_spe: s.spDefense, vitesse: s.speed },
        taille_m: pokemon.height / 10,
        poids_kg: pokemon.weight / 10,
        talents_noms_anglais: pokemon.abilities.map((a) => a.ability.name + (a.is_hidden ? " (caché)" : "")),
        description: cleanText(fr(species.flavor_text_entries)?.flavor_text ?? ""),
      };
    },
  },

  get_move: {
    description: "Détails d'une attaque : type, catégorie, puissance, précision, PP, effet. Le nom doit être en ANGLAIS (ex. thunderbolt, flamethrower).",
    parameters: nameParam("Nom anglais de l'attaque, ex. thunderbolt"),
    schema: z.object({ name: z.string().min(1).max(60) }),
    run: async ({ name }: { name: string }) => {
      const r = await resolveMove(name);
      if (!r.ok) return { error: "move_not_found", query: name, suggestions: r.suggestions, note: "Le nom doit être anglais." };
      const m = await pokeGet<MoveRaw>(`move/${r.slug}`);
      return {
        nom_fr: fr(m.names)?.name ?? m.name,
        nom_en: m.name,
        type: typeFr(m.type.name),
        categorie: { physical: "physique", special: "spéciale", status: "statut" }[m.damage_class.name] ?? m.damage_class.name,
        puissance: m.power,
        precision: m.accuracy,
        pp: m.pp,
        description: cleanText(fr(m.flavor_text_entries)?.flavor_text ?? m.effect_entries.find((e) => e.language.name === "en")?.short_effect ?? ""),
      };
    },
  },

  get_type_matchups: {
    description: "Forces et faiblesses d'un type (feu, eau, électrik, plante…), en attaque et en défense.",
    parameters: { type: "object", properties: { type: { type: "string", description: "Nom du type, ex. feu ou electric" } }, required: ["type"] },
    schema: z.object({ type: z.string().min(1).max(30) }),
    run: async ({ type }: { type: string }) => {
      const slug = resolveType(type);
      if (!slug) return { error: "type_not_found", query: type, types_valides: TYPE_SLUGS.map(typeFr) };
      const t = await pokeGet<TypeRaw>(`type/${slug}`);
      const names = (l: { name: string }[]) => l.map((x) => typeFr(x.name));
      const d = t.damage_relations;
      return {
        type: typeFr(slug),
        en_attaque: {
          super_efficace_contre: names(d.double_damage_to),
          peu_efficace_contre: names(d.half_damage_to),
          sans_effet_sur: names(d.no_damage_to),
        },
        en_defense: {
          subit_x2_de: names(d.double_damage_from),
          resiste_a: names(d.half_damage_from),
          immunise_contre: names(d.no_damage_from),
        },
      };
    },
  },

  get_evolution_chain: {
    description: "Chaîne d'évolution complète d'un Pokémon avec les conditions (niveau, objet…).",
    parameters: nameParam("Nom d'un Pokémon de la famille, ex. Salamèche"),
    schema: z.object({ name: z.string().min(1).max(60) }),
    run: async ({ name }: { name: string }) => {
      const r = await resolveSpecies(name);
      if (!r.ok) return { error: "pokemon_not_found", query: name, suggestions: r.suggestions };
      const species = await pokeGet<{ evolution_chain: { url: string } }>(`pokemon-species/${r.slug}`);
      const id = species.evolution_chain.url.split("/").filter(Boolean).pop();
      const chain = await pokeGet<{ chain: ChainLink }>(`evolution-chain/${id}`);
      return flatten(chain.chain);
    },
  },
};

interface ChainLink {
  species: { name: string };
  evolution_details: { trigger: { name: string }; min_level: number | null; item: { name: string } | null; min_happiness: number | null; time_of_day: string }[];
  evolves_to: ChainLink[];
}

function condition(d: ChainLink["evolution_details"][number]): string {
  const parts: string[] = [];
  if (d.min_level) parts.push(`niveau ${d.min_level}`);
  if (d.item) parts.push(`objet : ${d.item.name}`);
  if (d.min_happiness) parts.push(`bonheur ≥ ${d.min_happiness}`);
  if (d.time_of_day) parts.push(d.time_of_day === "day" ? "de jour" : d.time_of_day === "night" ? "de nuit" : d.time_of_day);
  if (d.trigger.name === "trade") parts.push("par échange");
  return parts.length ? parts.join(", ") : d.trigger.name;
}

function flatten(l: ChainLink): unknown {
  return {
    pokemon: getFrName(l.species.name) ?? l.species.name,
    conditions: l.evolution_details.length ? l.evolution_details.map(condition) : undefined,
    evolutions: l.evolves_to.map(flatten),
  };
}

export const toolSchemas = Object.entries(tools).map(([name, t]) => ({
  type: "function",
  function: { name, description: t.description, parameters: t.parameters },
}));

/** Exécute un outil demandé par le modèle. Ne lève jamais : toute erreur devient un résultat lisible par le modèle. */
export async function executeTool(name: string, rawArgs: unknown): Promise<unknown> {
  const tool = tools[name];
  if (!tool) return { error: "unknown_tool", tools_disponibles: Object.keys(tools) };
  let args = rawArgs;
  if (typeof args === "string") {
    try { args = JSON.parse(args); } catch { /* validé juste après */ }
  }
  const parsed = tool.schema.safeParse(args);
  if (!parsed.success) return { error: "invalid_arguments", details: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  try {
    return await tool.run(parsed.data);
  } catch (e) {
    if (e instanceof PokeApiError) {
      return e.kind === "not_found"
        ? { error: "not_found", message: e.message }
        : { error: "api_unavailable", message: "PokéAPI est indisponible. Dis à l'utilisateur de réessayer plus tard." };
    }
    console.error(`Outil ${name} :`, e);
    return { error: "tool_failed" };
  }
}
