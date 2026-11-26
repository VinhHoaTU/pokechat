import { describe, expect, test } from "bun:test";
import { executeTool } from "./tools";

// Ces cas échouent avant tout accès réseau : on teste la robustesse face aux appels incorrects du modèle.
describe("executeTool : erreurs du modèle", () => {
  test("outil inexistant", async () => {
    const r: any = await executeTool("get_pokedex", { name: "x" });
    expect(r.error).toBe("unknown_tool");
    expect(r.tools_disponibles).toContain("get_pokemon");
  });
  test("arguments invalides", async () => {
    const r: any = await executeTool("get_pokemon", {});
    expect(r.error).toBe("invalid_arguments");
  });
  test("arguments en chaîne JSON", async () => {
    const r: any = await executeTool("get_type_matchups", '{"type":"inconnu"}');
    expect(r.error).toBe("type_not_found");
  });
  test("type inconnu : liste des types valides", async () => {
    const r: any = await executeTool("get_type_matchups", { type: "lumière" });
    expect(r.types_valides).toContain("feu");
  });
});
