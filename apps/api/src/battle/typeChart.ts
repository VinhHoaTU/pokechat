import { pokeGet } from "../pokeapi/client";
import { TYPE_SLUGS, type TypeRaw } from "../pokeapi/types";
import type { TypeChart } from "./engine";

let chart: Promise<TypeChart> | null = null;

export function getTypeChart(): Promise<TypeChart> {
  chart ??= (async () => {
    try {
      const types = await Promise.all(TYPE_SLUGS.map((t) => pokeGet<TypeRaw>(`type/${t}`)));
      const out: TypeChart = {};
      for (const t of types) {
        const row: Record<string, number> = {};
        for (const d of t.damage_relations.double_damage_to) row[d.name] = 2;
        for (const d of t.damage_relations.half_damage_to) row[d.name] = 0.5;
        for (const d of t.damage_relations.no_damage_to) row[d.name] = 0;
        out[t.name] = row;
      }
      return out;
    } catch (e) {
      chart = null; // ne pas mémoriser un échec
      throw e;
    }
  })();
  return chart;
}
